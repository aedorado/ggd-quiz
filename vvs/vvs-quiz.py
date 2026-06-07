from dotenv import load_dotenv
load_dotenv()

import os
import json
import time
from pathlib import Path
from google import genai

# ============================================================
# CONFIG
# ============================================================

MODEL = "gemini-3.1-flash-lite"

INPUT_FILE = "vvs.json" 
OUTPUT_FILE = "questions.json"

REQUESTS_PER_MINUTE = 1.5
DELAY_BETWEEN_REQUESTS = 90 / REQUESTS_PER_MINUTE

MAX_RETRIES = 3

# ============================================================
# GEMINI CLIENT & NATIVE RESPONSES SCHEMA
# ============================================================

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEYS", "")
)

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "description": "List of sweet, devotionally resonant quiz questions testing precise memory of Vraja-vilasa-stava details.",
            "items": {
                "type": "OBJECT",
                "required": ["question", "options", "correct_answer", "explanation", "difficulty", "tags"],
                "properties": {
                    "question": {"type": "STRING", "description": "The quiz question. Saturated with devotional flavor and proper nouns; completely self-contained without text numbers."},
                    "options": {
                        "type": "ARRAY", 
                        "items": {"type": "STRING"},
                        "description": "Exactly 4 highly plausible, authentic Vraja-lila multiple-choice options."
                    },
                    "correct_answer": {"type": "STRING", "description": "The exact correct answer, matching one item in options."},
                    "explanation": {"type": "STRING", "description": "Explanation verifying the fact directly from the main verse content, preserving the sweet mood."},
                    "difficulty": {"type": "STRING", "enum": ["easy", "medium", "hard"]},
                    "tags": {"type": "ARRAY", "items": {"type": "STRING"}}
                }
            }
        }
    },
    "required": ["questions"]
}

# ============================================================
# RASA-INFUSED PUNCHY PROMPT (NO TEXT NUMBERS)
# ============================================================

PROMPT = """
You are an expert scriptural educator deep in the mood of Gaudiya Vaishnava bhakti, creating a clean, closed-book review tool for the book 'Vraja-vilasa-stava' by Srila Raghunatha dasa Gosvami.

The students answering these questions have thoroughly studied and memorized the book, relishing its sweet devotional pastimes, but DO NOT have any text or verses in front of them.

STRICT QUESTION ARCHITECTURING RULES:
1. MANDATORY PUNCHY ANCHOR: Start every single question directly with either:
   - "In Vraja-vilasa-stava, ..."
   - "According to Vraja-vilasa-stava, ..."
   Do NOT include text or verse numbers (e.g., do NOT say "In Text 6" or "In Verse 12").
2. INFUSE DEVOTIONAL RASA & BHAVA: Vraja-vilasa-stava is a work of intense love (prema), spiritual longing, and deep relationships (parental affection, friendly joking, conjugal sweetness). Do not treat the facts as sterile data points. Capture the sweet visual descriptions, emotional transformations (trembling, weeping, restlessness), and specific relational moods.
3. NO TRAILING OVERKILL: Keep the rest of the question sleek, poetic, and focused. Do not append clunky, legalistic phrases at the end of the sentence (e.g., do NOT write: "...of the place known as Vraja?" or "...found inside the Vrndavana forest text?").
4. BAN DRY TEXTBOOK JARGON: Do not use over-academic, rigid language like "botanical scenery", "physical features", "what environment is identified as", "sentence mechanics", "the passage states". Use natural, beautiful scriptural phrasing.
5. ABSOLUTE RECALL TEST: Ensure the question tests real recall of unique identities, specific services, pastimes, family relations, ornaments, sacred locations, or descriptions of pets/animals.

COMPARE THESE STYLES:
- CRITICAL FAILURE (Dry, academic, over-engineered): "According to Vraja-vilasa-stava, Text 6, what specific internal effect is experienced by those who understand the nectar of the place known as Vraja?"
- CORRECTED RASA STYLE (Sweet, punchy, self-contained): "According to Vraja-vilasa-stava, what wonderful sweetness is said to awaken inside the hearts of those who truly understand the nectar of Vraja?"

- CRITICAL FAILURE (Clinical, mechanical jargon): "In Vraja-vilasa-stava, Text 7, what botanical scenery is mentioned as a setting where the divine couple acts?"
- CORRECTED RASA STYLE (Sweet, punchy, self-contained): "In Vraja-vilasa-stava, amidst what charming foliage in the Vrndavana forest is the youthful divine couple described as enjoying their playful pastimes?"

TASK EXPECTATIONS:
- SOURCE RESTRICTION: Extract facts ONLY from the provided MAIN VERSE text. Do not invent external lore.
- AUTHENTIC DISTRACTORS: All 3 incorrect options must be real, authentic names, abodes, or items from Vraja-lila history so answers cannot be guessed by simple elimination.
- QUANTITY: Maximize the count (4, 5, or more distinct questions) by mining every possible factual element (e.g., identity, relationship, setting, dynamic action).

CONTEXT BLOCKS FOR MASTER DATA ONLY:

<PREVIOUS_CONTEXT_VERSE>
{previous_verse}
</PREVIOUS_CONTEXT_VERSE>

<MAIN_VERSE_TARGET>
Verse Number: {verse_number}
Verse Text: {verse_text}
</MAIN_VERSE_TARGET>

<NEXT_CONTEXT_VERSE>
{next_verse}
</NEXT_CONTEXT_VERSE>
"""

# ============================================================
# SAVE DATA UTILITY
# ============================================================

def save_data(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# ============================================================
# CONTENT GENERATION
# ============================================================

def generate_questions(previous_verse, current_verse, next_verse):
    prompt = PROMPT.format(
        previous_verse=previous_verse,
        verse_number=current_verse["text_number"],
        verse_text=current_verse["content"],
        next_verse=next_verse
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": RESPONSE_SCHEMA
        }
    )

    return json.loads(response.text)

# ============================================================
# EXECUTION RETRY LOOP
# ============================================================

def generate_questions_with_retry(previous_verse, current_verse, next_verse):
    for attempt in range(MAX_RETRIES):
        try:
            return generate_questions(previous_verse, current_verse, next_verse)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait_time = min(30 * (2 ** attempt), 300)
            print(f"Retry {attempt + 1}/{MAX_RETRIES} | Waiting {wait_time}s | Error: {e}")
            time.sleep(wait_time)

# ============================================================
# MAIN ORCHESTRATION
# ============================================================

def main():
    if not Path(INPUT_FILE).exists():
        print(f"✗ Input file '{INPUT_FILE}' not found.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        input_data = json.load(f)
    
    verses = input_data.get("vraja_vilasa_stava", [])
    print(f"Found {len(verses)} total texts inside file.")

    data = {}
    completed = set()

    if Path(OUTPUT_FILE).exists():
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            completed = set(data.keys())
            print(f"Loaded {len(completed)} existing records. Skipping duplicates...")
        except Exception as e:
            print(f"Could not load existing progress file: {e}. Starting fresh.")

    for idx, verse in enumerate(verses[:]):
        verse_id = str(verse["text_number"])

        if verse_id in completed:
            print(f"[{idx+1}/{len(verses)}] Text {verse_id} (Skipped)")
            continue

        previous_verse = (
            verses[idx - 1]["content"]
            if idx > 0
            else "None"
        )

        next_verse = (
            verses[idx + 1]["content"]
            if idx < len(verses) - 1
            else "None"
        )

        print(f"[{idx+1}/{len(verses)}] Engineering clean exam questions for Text {verse_id}...")

        try:
            result = generate_questions_with_retry(
                previous_verse,
                verse,
                next_verse
            )

            data[verse_id] = {
                "verse_text": verse["content"],
                "questions": result["questions"]
            }

            save_data(data)
            print(f"✓ Saved: Text {verse_id} ({len(result['questions'])} crisp questions generated)")

        except Exception as e:
            print(f"✗ Failure on Text {verse_id}: {e}")

        print(f"Sleeping {DELAY_BETWEEN_REQUESTS:.0f}s...")
        time.sleep(DELAY_BETWEEN_REQUESTS)

    print("\nProcessing Pipeline: COMPLETED")

if __name__ == "__main__":
    main()