"""
generate_crossword.py
━━━━━━━━━━━━━━━━━━━━
Generates crossword clue/answer pairs from scriptural verses using Gemini.

Output format (per book, e.g. public/bs/crosswords.json):
{
  "1": {
    "verse_text": "...",
    "clues": [
      { "word": "GOVINDA", "clue": "The primeval Lord who always revels in pastimes of love." },
      ...
    ]
  },
  "2": { ... }
}

Usage:
  ./venv/bin/python generate_crossword.py --book bs --rpm 10
  ./venv/bin/python generate_crossword.py --book bs --rpm 10
"""

import os
import sys
import re
import json
import time
import argparse
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

# ============================================================
# GEMINI RESPONSE SCHEMA
# ============================================================
CROSSWORD_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "clues": {
            "type": "ARRAY",
            "description": (
                "List of crossword clue/answer pairs extracted from the verse. "
                "Each answer must be a single English word, 4-18 letters, A-Z only, no spaces."
            ),
            "items": {
                "type": "OBJECT",
                "required": ["answer", "clue"],
                "properties": {
                    "answer": {
                        "type": "STRING",
                        "description": (
                            "The crossword answer. A single English/transliterated proper noun, name, location, "
                            "or highly specific scriptural title. 4-18 uppercase A-Z letters ONLY. "
                            "No spaces, hyphens, or diacritics. Example: GOVINDA, SVARUPADAMODARA, NAVADVIPA. "
                            "DO NOT use generic theological words like BHAKTA, AVATARA, SAKTI, POTENCY, TATTVAM, DEVOTEE, TRUTH."
                        )
                    },
                    "clue": {
                        "type": "STRING",
                        "description": (
                            "A short, evocative crossword clue (10-20 words). Fill-in-the-blank style. "
                            "Devotional, precise, and unique — only one answer fits this clue."
                        )
                    }
                }
            }
        }
    },
    "required": ["clues"]
}

# ============================================================
# PARSERS (mirrored from generate_questions.py)
# ============================================================


def parse_json_verses(data):
    verses_list = []
    if isinstance(data, list):
        verses_list = data
    elif isinstance(data, dict):
        for val in data.values():
            if isinstance(val, list):
                verses_list = val
                break

    if not verses_list:
        raise ValueError("Could not find a list of verses in the JSON file.")

    parsed = []
    for item in verses_list:
        num_keys = ["text_number", "verse_number", "number", "id"]
        text_num = None
        for k in num_keys:
            if k in item:
                text_num = str(item[k])
                break

        content_keys = ["content", "verse_text", "text"]
        content = None
        for k in content_keys:
            if k in item:
                content = str(item[k])
                break

        if text_num is not None and content is not None:
            parsed.append({"verse_number": text_num, "verse_text": content})
    return parsed


def load_verses(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read().strip()

    if text.startswith("{") or text.startswith("["):
        try:
            data = json.loads(text)
            return parse_json_verses(data)
        except json.JSONDecodeError:
            pass

    suffix = Path(file_path).suffix.lower()
    if suffix == ".json":
        data = json.loads(text)
        return parse_json_verses(data)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")


# ============================================================
# SAFE SAVE UTILITY
# ============================================================

def save_data_atomic(output_path, data):
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_file = path.with_suffix(".tmp")
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        temp_file.replace(path)
    except Exception as e:
        if temp_file.exists():
            temp_file.unlink()
        raise e


# ============================================================
# GENERATION ENGINE
# ============================================================


_ENGLISH_BLOCKLIST = {
    "ABOUT", "ABOVE", "AFTER", "AGAIN", "AGAINST", "ALL", "ALSO", "ALTHOUGH", "ALWAYS", "AMONG", 
    "AND", "ANOTHER", "ANY", "ARE", "AROUND", "AS", "AT", "BACK", "BE", "BECAUSE", "BEEN", 
    "BEFORE", "BEING", "BELOW", "BETWEEN", "BOTH", "BUT", "BY", "CAME", "CAN", "CANNOT", 
    "COME", "COULD", "DID", "DO", "DOES", "DOING", "DOWN", "DURING", "EACH", "EITHER", "ELSE", 
    "EVEN", "EVER", "EVERY", "FOR", "FROM", "GET", "GIVE", "GO", "GOOD", "GREAT", "HAD", 
    "HAS", "HAVE", "HE", "HER", "HERE", "HERS", "HIM", "HIS", "HOW", "HOWEVER", "IF", "IN", 
    "INTO", "IS", "IT", "ITS", "JUST", "KNOW", "LIKE", "MADE", "MAKE", "MANY", "MAY", "ME", 
    "MIGHT", "MORE", "MOST", "MUCH", "MUST", "MY", "NEVER", "NEW", "NO", "NOR", "NOT", "NOTHING", 
    "NOW", "OF", "OFF", "OFTEN", "ON", "ONCE", "ONE", "ONLY", "OR", "OTHER", "OUR", "OURS", 
    "OUT", "OVER", "OWN", "RATHER", "SAME", "SEE", "SEEM", "SHALL", "SHE", "SHOULD", "SINCE", 
    "SO", "SOME", "STILL", "SUCH", "THAN", "THAT", "THE", "THEIR", "THEM", "THEN", "THERE", 
    "THESE", "THEY", "THIS", "THOSE", "THROUGH", "TO", "TOO", "UNDER", "UNTIL", "UP", "UPON", 
    "VERY", "WAS", "WE", "WELL", "WENT", "WERE", "WHAT", "WHEN", "WHERE", "WHICH", "WHILE", 
    "WHO", "WHOM", "WHOSE", "WHY", "WILL", "WITH", "WITHIN", "WITHOUT", "WOULD", "YET", 
    "YOU", "YOUR", "YOURS"
}


def _sanitize_clues(clues: list) -> list:
    """
    Post-process clues from the model:
    - Strip diacritics / non-A-Z from the word field
    - Enforce 4–15 letter length
    - Reject common English words (must be proper nouns / Sanskrit terms)
    - Deduplicate by word
    """
    seen = set()
    clean = []
    rejected = []
    for item in clues:
        # Support both "answer" (new prompt schema) and "word" (legacy) field names
        word = item.get("answer") or item.get("word", "")
        clue = item.get("clue", "").strip()
        # Uppercase and keep only A-Z
        word = re.sub(r"[^A-Za-z]", "", word).upper()
        if not word or not clue:
            continue
        if len(word) < 4 or len(word) > 22:
            rejected.append(f"{word} (length)")
            continue
        if word in _ENGLISH_BLOCKLIST:
            rejected.append(f"{word} (generic English)")
            continue
        if word in seen:
            continue
        seen.add(word)
        clean.append({"word": word, "clue": clue})
    if rejected:
        print(f"    ⚠ Rejected {len(rejected)} generic words: {rejected}")
    return clean


def generate_clues(client, model, prompt_template, previous_verse, current_verse, next_verse):
    # Use explicit replace() instead of str.format() so that any JSON examples
    # with curly braces inside the prompt template don't cause KeyError.
    prompt = prompt_template
    prompt = prompt.replace("{previous_verse}", str(previous_verse))
    prompt = prompt.replace("{verse_number}", str(current_verse["verse_number"]))
    prompt = prompt.replace("{verse_text}", str(current_verse["verse_text"]))
    prompt = prompt.replace("{next_verse}", str(next_verse))

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": CROSSWORD_SCHEMA,
        },
    )
    raw = json.loads(response.text)
    clues = raw.get("clues", [])
    return _sanitize_clues(clues)


def generate_with_retry(client, model, prompt_template, previous_verse, current_verse, next_verse, max_retries=5):
    for attempt in range(max_retries):
        try:
            return generate_clues(client, model, prompt_template, previous_verse, current_verse, next_verse)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = min(15 * (2 ** attempt), 300)
            print(f"  [Retry {attempt + 1}/{max_retries}] Waiting {wait_time}s | Error: {e}")
            time.sleep(wait_time)


# ============================================================
# MAIN ORCHESTRATOR
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate crossword clue/answer pairs from a Gauḍīya scripture."
    )
    parser.add_argument("--book", required=True, help="Book ID (e.g. bs, ggd)")
    parser.add_argument("--model", default="gemini-3.1-flash-lite", help="Gemini model to use")
    parser.add_argument("--max-retries", type=int, default=5)
    parser.add_argument("--rpm", type=float, default=2.0, help="Requests per minute rate limit")
    parser.add_argument(
        "--prompt-file",
        default=None,
        help="Override path to the crossword prompt template file.",
    )
    parser.add_argument(
        "--output-file",
        default=None,
        help="Override output JSON file path.",
    )
    args = parser.parse_args()

    # ── books.json config ──────────────────────────────────
    config_path = Path("public/books.json")
    if not config_path.exists():
        print("Error: public/books.json not found.")
        sys.exit(1)

    with open(config_path, "r", encoding="utf-8") as f:
        books_config = json.load(f)

    if args.book not in books_config:
        print(f"Error: Book '{args.book}' not defined in books.json.")
        sys.exit(1)

    book_cfg = books_config[args.book]
    if book_cfg.get("status") != "ready":
        print(
            f"Warning: Book '{args.book}' is marked '{book_cfg.get('status')}', not 'ready'. Proceeding anyway."
        )

    input_file = book_cfg.get("input_file")
    if not input_file or not Path(input_file).exists():
        print(f"Error: input_file '{input_file}' not found for book '{args.book}'.")
        sys.exit(1)

    # ── Output path ────────────────────────────────────────
    if args.output_file:
        output_path = Path(args.output_file)
    else:
        # Default: same directory as questions.json → crosswords.json
        questions_out = book_cfg.get("output_file", f"public/{args.book}/questions.json")
        output_path = Path(questions_out).parent / "crosswords.json"

    # ── Prompt file ────────────────────────────────────────
    if args.prompt_file:
        prompt_file = Path(args.prompt_file)
    else:
        # Try book-specific crossword_prompt.txt, then fallback
        prompt_file = Path("public") / args.book / "crossword_prompt.txt"
        if not prompt_file.exists():
            prompt_file = Path(args.book) / "crossword_prompt.txt"

    if not prompt_file.exists():
        print(f"Error: Crossword prompt file not found. Tried 'public/{args.book}/crossword_prompt.txt'.")
        sys.exit(1)

    with open(prompt_file, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    # ── Gemini client ──────────────────────────────────────
    api_key = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEYS or GEMINI_API_KEY env var not set.")
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    # ── Load verses ────────────────────────────────────────
    print(f"Parsing verses from: {input_file}...")
    verses = load_verses(input_file)
    print(f"Found {len(verses)} verses.")

    # ── Resume from existing progress ──────────────────────
    data = {}
    completed = set()
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            completed = set(data.keys())
            print(f"Loaded {len(completed)} already-completed verses from {output_path}.")
        except Exception as e:
            print(f"Warning: Could not load existing file: {e}. Starting fresh.")

    # ── Generation loop ────────────────────────────────────
    delay = 60.0 / args.rpm
    print(f"\nStarting crossword generation (model={args.model}, RPM={args.rpm}, delay={delay:.1f}s)...")
    print(f"Output → {output_path}\n")

    total_clues = 0
    for idx, verse in enumerate(verses):
        verse_id = verse["verse_number"]
        if verse_id in completed:
            print(f"[{idx+1}/{len(verses)}] Verse {verse_id} — already done, skipping.")
            continue

        previous_verse = verses[idx - 1]["verse_text"] if idx > 0 else "None"
        next_verse = verses[idx + 1]["verse_text"] if idx < len(verses) - 1 else "None"

        print(f"[{idx+1}/{len(verses)}] Generating clues for Verse {verse_id}...")

        try:
            clues = generate_with_retry(
                client,
                args.model,
                prompt_template,
                previous_verse,
                verse,
                next_verse,
                max_retries=args.max_retries,
            )

            data[verse_id] = {
                "verse_text": verse["verse_text"],
                "clues": clues,
            }

            save_data_atomic(output_path, data)
            total_clues += len(clues)
            print(f"  ✓ Saved Verse {verse_id} → {len(clues)} clues: {[c['word'] for c in clues]}")

        except Exception as e:
            print(f"  ✗ Failed Verse {verse_id}: {e}")

        if idx < len(verses) - 1:
            time.sleep(delay)

    print(f"\n{'='*60}")
    print(f"Generation COMPLETE")
    print(f"  Verses processed : {len(data)}")
    print(f"  Total clues      : {total_clues}")
    print(f"  Output file      : {output_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
