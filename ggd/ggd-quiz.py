from dotenv import load_dotenv
load_dotenv()

import os
import re
import json
import time
from pathlib import Path

from google import genai

# ============================================================
# CONFIG
# ============================================================

MODEL = "gemini-3.1-flash-lite"

INPUT_FILE = "gaura_ganodesha_dipika.txt"
OUTPUT_FILE = "questions_by_verse.json"

REQUESTS_PER_MINUTE = 2
DELAY_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE

MAX_RETRIES = 5

# ============================================================
# GEMINI
# ============================================================

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEYS", "")
)

# ============================================================
# PROMPT
# ============================================================

PROMPT = """
You are creating educational quiz questions for a study tool.

BOOK CONTEXT

This is Gaura Ganoddesha Dipika by Kavi Karnapura.

This work describes the transcendental identities of the associates and followers of Sri Caitanya Mahaprabhu and their relationships to Krishna-lila and other divine pastimes.

SOURCE RESTRICTIONS

The supplied verses are the ONLY source of truth.

DO NOT:

- Invent facts
- Use outside knowledge
- Use Caitanya-caritamrta
- Use Caitanya-bhagavata
- Use Srimad Bhagavatam
- Use commentaries
- Use information from verses not provided below
- Add theological conclusions not explicitly stated

Every question, answer, explanation and distractor must be derivable from the supplied verses.

QUESTION DESIGN RULES

This quiz is NOT a reading-comprehension exercise.

Assume the user is NOT looking at the verse while answering.

Questions should test knowledge, memory, recognition, and understanding of the teachings and identifications presented in Gaura Ganoddesha Dipika.

DO NOT write questions such as:

* "According to the text..."
* "What does the passage say..."
* "Who is mentioned in the verse..."
* "According to the above excerpt..."
* "Based on the passage..."

Instead write questions as if testing a student who has studied the book.

GOOD:

* Who is identified as Hanuman in Lord Caitanya's pastimes?
* Which associate is identified as Narada Muni?
* Who compiled the evidence used in Gaura Ganoddesha Dipika?
* Which member of the Panca-tattva is described as bhakta-sakti?

BAD:

* According to the text, who...
* What does the passage state...
* Which person is mentioned above...
* According to the excerpt...

QUESTION PRIORITY

Prefer questions about:

1. Identities
2. Previous incarnations
3. Relationships between personalities
4. Panca-tattva theology
5. Important claims made by the book

Avoid questions about:
* Who wrote this sentence
* What evidence was collected
* Narrative framing
* Meta-commentary about writing the book
unless the verse itself is primarily about those topics.

Requirements:

- At least 70% must focus on MAIN VERSE.
- Exactly 4 options.
- Exactly 1 correct answer.
- Include explanation.
- Include difficulty.
- Use a mixture of:
  - identity questions
  - reverse identity questions
  - relationship questions
  - meaning questions
  - contextual questions

Return ONLY valid JSON.

Schema:

{{
  "questions": [
    {{
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct_answer": "...",
      "explanation": "...",
      "difficulty": "easy",
      "tags": ["tag1", "tag2"]
    }}
  ]
}}

PREVIOUS VERSE
{previous_verse}

MAIN VERSE ({verse_number})
{verse_text}

NEXT VERSE
{next_verse}
"""

# ============================================================
# PARSER
# ============================================================

def parse_verses(text):
    pattern = r"\n(\d+(?:[-/]\d+)?)\.?\s*\n"

    matches = list(re.finditer(pattern, text))

    verses = []

    for i, match in enumerate(matches):

        verse_number = match.group(1)

        start = match.end()

        end = (
            matches[i + 1].start()
            if i + 1 < len(matches)
            else len(text)
        )

        verse_text = text[start:end].strip()

        verses.append({
            "verse_number": verse_number,
            "verse_text": verse_text
        })
    print(verses)
    return verses

# ============================================================
# SAVE
# ============================================================

def save_data(data):
    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            data,
            f,
            indent=2,
            ensure_ascii=False
        )

# ============================================================
# GENERATE
# ============================================================

def generate_questions(
    previous_verse,
    current_verse,
    next_verse
):
    prompt = PROMPT.format(
        previous_verse=previous_verse,
        verse_number=current_verse["verse_number"],
        verse_text=current_verse["verse_text"],
        next_verse=next_verse
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config={
            "response_mime_type": "application/json"
        }
    )

    return json.loads(response.text)

# ============================================================
# RETRY
# ============================================================

def generate_questions_with_retry(
    previous_verse,
    current_verse,
    next_verse
):
    for attempt in range(MAX_RETRIES):

        try:
            return generate_questions(
                previous_verse,
                current_verse,
                next_verse
            )

        except Exception as e:

            if attempt == MAX_RETRIES - 1:
                raise

            wait_time = min(
                30 * (2 ** attempt),
                300
            )

            print(
                f"Retry {attempt + 1}/{MAX_RETRIES}"
            )

            print(
                f"Waiting {wait_time}s"
            )

            print(
                f"Error: {e}"
            )

            time.sleep(wait_time)

# ============================================================
# MAIN
# ============================================================

def main():

    with open(
        INPUT_FILE,
        "r",
        encoding="utf-8"
    ) as f:
        text = f.read()

    verses = parse_verses(text)

    print(
        f"Found {len(verses)} verses"
    )

    data = {}

    completed = set()

    if Path(OUTPUT_FILE).exists():

        try:

            with open(
                OUTPUT_FILE,
                "r",
                encoding="utf-8"
            ) as f:

                data = json.load(f)

            completed = set(data.keys())

            print(
                f"Loaded {len(completed)} completed verses"
            )

        except Exception as e:

            print(
                f"Could not load existing file: {e}"
            )

    for idx, verse in enumerate(verses[:]):

        verse_id = verse["verse_number"]

        if verse_id in completed:

            print(
                f"[{idx+1}/{len(verses)}] "
                f"{verse_id} (skip)"
            )

            continue

        previous_verse = (
            verses[idx - 1]["verse_text"]
            if idx > 0
            else "None"
        )

        next_verse = (
            verses[idx + 1]["verse_text"]
            if idx < len(verses) - 1
            else "None"
        )

        print(
            f"[{idx+1}/{len(verses)}] "
            f"Generating {verse_id}"
        )

        try:

            result = generate_questions_with_retry(
                previous_verse,
                verse,
                next_verse
            )

            data[verse_id] = {
                "verse_text": verse["verse_text"],
                "questions": result["questions"]
            }

            save_data(data)

            print(
                f"✓ Saved {verse_id}"
            )

        except Exception as e:

            print(
                f"✗ Failed {verse_id}: {e}"
            )

        print(
            f"Sleeping {DELAY_BETWEEN_REQUESTS:.0f}s..."
        )

        time.sleep(
            DELAY_BETWEEN_REQUESTS
        )

    print()
    print("DONE")
    print(
        f"Verses completed: {len(data)}"
    )

if __name__ == "__main__":
    main()