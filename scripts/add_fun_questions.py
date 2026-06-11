#!/usr/bin/env python3
"""
add_fun_questions.py
--------------------
Adds 2 fun, playful multiple-choice questions per verse to public/bg/questions.json.
Uses google-genai SDK with gemini-2.5-flash.

Usage:
    GEMINI_API_KEY=<key> python3 scripts/add_fun_questions.py [--dry-run] [--chapter 1]
"""

import json
import os
import sys
import time
import argparse
import re
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("ERROR: google-genai not installed. Run: pip install google-genai")
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────────────
QUESTIONS_FILE = Path(__file__).parent.parent / "public" / "bg" / "questions.json"
PROGRESS_FILE  = Path(__file__).parent.parent / "scripts" / ".fun_questions_progress.json"
BATCH_SIZE     = 5          # verses per API call
SLEEP_BETWEEN  = 1.5        # seconds between batches
FUN_PER_VERSE  = 2          # how many fun questions to add per verse
MODEL          = "gemini-2.5-flash"

# ── Prompt ───────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are a creative quiz writer for a Bhagavad-gītā study app aimed at devotees and students who want to make learning fun. Your job is to write engaging, lively multiple-choice questions that are DRAMATICALLY different from dry academic questions.

STYLES you should alternate between:
1. 🎭 Dramatic voice – Put the reader IN the scene: "Duryodhana was sweating, sizing up the Pāṇḍava army. He ran to someone immediately. Who?"
2. 🕵️ Who Am I? – First-person riddle: "I am the son of Somadatta. I am always victorious in battle. Who am I?"
3. 😄 Emoji clue – Use emojis as hints in the question: "👴🏾 + 🏹 + 👑 = The Kaurava army was 'perfectly protected' by ___."
4. 🎬 Fill-the-blank dramatic – "Duryodhana said: 'O best of the ___, behold the great army!'"
5. 🤔 Scenario twist – "If you were Sañjaya, what would you be doing during the battle?"

RULES:
- Keep questions SHORT and punchy (max 2 sentences)
- Always have exactly 4 options
- The correct_answer MUST exactly match one of the options (character-for-character)
- Difficulty: "easy", "medium", or "hard"
- Explanations should be brief but vivid (1-2 sentences max)
- NEVER start with "According to the Bhagavad-gītā" or "Based on the Bhagavad-gītā" or "As per the Bhagavad-gītā" — those are the BORING phrasing you are replacing
- Use proper diacritical marks for Sanskrit names (copy from the verse text)

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct_answer": "...",
    "explanation": "...",
    "difficulty": "easy",
    "tags": ["Fun", "Characters"]
  },
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct_answer": "...",
    "explanation": "...",
    "difficulty": "medium",
    "tags": ["Fun", "Drama"]
  }
]"""

def build_user_prompt(verse_key: str, verse_text: str, existing_questions: list) -> str:
    existing_topics = [q["question"][:80] for q in existing_questions]
    return f"""Verse {verse_key}: "{verse_text}"

Existing questions already cover:
{chr(10).join(f"- {t}" for t in existing_topics)}

Write exactly {FUN_PER_VERSE} fun, engaging multiple-choice questions about this verse. Avoid repeating what's already covered. Make them dramatically different in style from the existing questions."""


def parse_json_response(text: str) -> list:
    """Try to extract a JSON array from the model's response."""
    text = text.strip()
    # Strip markdown fences if present
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    # Find the JSON array
    start = text.find('[')
    end   = text.rfind(']')
    if start == -1 or end == -1:
        raise ValueError(f"No JSON array found in response: {text[:200]}")
    return json.loads(text[start:end+1])


def validate_questions(questions: list) -> list:
    """Validate and fix up generated questions."""
    valid = []
    for q in questions:
        # Must have all required fields
        required = ["question", "options", "correct_answer", "explanation", "difficulty", "tags"]
        if not all(k in q for k in required):
            print(f"  ⚠ Skipping question missing fields: {q.get('question', '')[:50]}")
            continue
        # Options must be a list of 4
        if not isinstance(q["options"], list) or len(q["options"]) != 4:
            print(f"  ⚠ Skipping question with wrong options count")
            continue
        # correct_answer must be in options
        if q["correct_answer"] not in q["options"]:
            # Try to find a close match
            print(f"  ⚠ correct_answer not in options, skipping: {q['correct_answer'][:50]}")
            continue
        # Ensure "Fun" tag
        if "Fun" not in q.get("tags", []):
            q["tags"] = ["Fun"] + q.get("tags", [])
        # Ensure valid difficulty
        if q["difficulty"] not in ["easy", "medium", "hard"]:
            q["difficulty"] = "medium"
        valid.append(q)
    return valid


def load_progress() -> set:
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            data = json.load(f)
        return set(data.get("completed", []))
    return set()


def save_progress(completed: set):
    with open(PROGRESS_FILE, "w") as f:
        json.dump({"completed": list(completed)}, f)


def main():
    parser = argparse.ArgumentParser(description="Add fun questions to BG questions.json")
    parser.add_argument("--dry-run", action="store_true", help="Show sample output for first 3 verses only")
    parser.add_argument("--chapter", type=int, help="Only process a specific chapter (e.g. --chapter 1)")
    parser.add_argument("--reset", action="store_true", help="Reset progress and restart from scratch")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable not set.")
        print("Set it with: export GEMINI_API_KEY=<your-key>")
        sys.exit(1)

    # Load questions
    print(f"📖 Loading {QUESTIONS_FILE}...")
    with open(QUESTIONS_FILE) as f:
        data = json.load(f)

    all_verse_keys = list(data.keys())
    print(f"   Found {len(all_verse_keys)} verses")

    # Filter by chapter if specified
    if args.chapter:
        prefix = f"{args.chapter}."
        verse_keys = [k for k in all_verse_keys if k.startswith(prefix)]
        print(f"   Filtering to chapter {args.chapter}: {len(verse_keys)} verses")
    else:
        verse_keys = all_verse_keys

    # Dry-run: only first 3
    if args.dry_run:
        verse_keys = verse_keys[:3]
        print(f"🧪 DRY RUN: Processing first {len(verse_keys)} verses only\n")

    # Load progress
    if args.reset and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        print("🔄 Progress reset.")
    completed = load_progress()
    remaining = [k for k in verse_keys if k not in completed]
    print(f"📊 Progress: {len(completed)} done / {len(verse_keys)} total / {len(remaining)} remaining\n")

    if not remaining:
        print("✅ All verses already processed!")
        return

    # Init Gemini client
    client = genai.Client(api_key=api_key)

    # Process in batches
    total_added = 0
    errors = 0

    for batch_start in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[batch_start:batch_start + BATCH_SIZE]
        print(f"📦 Batch {batch_start//BATCH_SIZE + 1}: verses {batch[0]}–{batch[-1]}")

        for verse_key in batch:
            verse = data[verse_key]
            verse_text = verse.get("verse_text", "")
            existing_qs = verse.get("questions", [])

            print(f"  ✍  {verse_key}: {verse_text[:60]}...")

            user_prompt = build_user_prompt(verse_key, verse_text, existing_qs)

            try:
                response = client.models.generate_content(
                    model=MODEL,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.9,
                        max_output_tokens=1000,
                    )
                )
                raw = response.text
                new_questions = parse_json_response(raw)
                new_questions = validate_questions(new_questions)

                if not new_questions:
                    print(f"  ❌ No valid questions generated for {verse_key}")
                    errors += 1
                    continue

                # Append to verse
                data[verse_key]["questions"].extend(new_questions)
                completed.add(verse_key)
                total_added += len(new_questions)
                print(f"  ✅ Added {len(new_questions)} fun questions (total added: {total_added})")

                if args.dry_run:
                    for q in new_questions:
                        print(f"\n     Q: {q['question']}")
                        for i, opt in enumerate(q['options']):
                            marker = "✓" if opt == q["correct_answer"] else " "
                            print(f"     {marker} {chr(65+i)}. {opt}")
                        print(f"     💡 {q['explanation']}")
                        print(f"     🏷  {q['tags']} | {q['difficulty']}")

            except Exception as e:
                print(f"  ❌ Error for {verse_key}: {e}")
                errors += 1

        # Save after each batch
        if not args.dry_run:
            save_progress(completed)
            with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"  💾 Saved progress ({len(completed)}/{len(verse_keys)} verses done)\n")

        if not args.dry_run:
            time.sleep(SLEEP_BETWEEN)

    print(f"\n🎉 Done! Added {total_added} fun questions across {len(completed)} verses.")
    if errors:
        print(f"⚠  {errors} errors encountered (run again to retry).")

    if args.dry_run:
        print("\n💡 Run without --dry-run to process all verses.")


if __name__ == "__main__":
    main()
