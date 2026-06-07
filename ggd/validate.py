import os
import json
import time
from pathlib import Path

from google import genai

# ============================================================
# CONFIG
# ============================================================

MODEL = "gemini-3.1-flash-lite"

INPUT_FILE = "questions_by_verse.json"
OUTPUT_FILE = "questions_validated.json"
REJECTED_FILE = "rejected_questions.json"

REQUESTS_PER_MINUTE = 3
DELAY_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE

# ============================================================
# GEMINI
# ============================================================

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEYS", "")
)

# ============================================================
# VALIDATION PROMPT
# ============================================================

VALIDATION_PROMPT = """
You are validating quiz questions.

BOOK CONTEXT

Gaura Ganoddesha Dipika by Kavi Karnapura.

The supplied verse is the ONLY source of truth.

VALIDATION RULES

A question is VALID only if:

1. The correct answer is supported by the verse.
2. The explanation is supported by the verse.
3. No outside knowledge is required.
4. There is exactly one correct answer.
5. The question is clear.
6. Distractors do not create ambiguity.
7. Nothing is invented.

Return JSON ONLY.

Schema:

{{
  "valid": true,
  "issues": []
}}

VERSE:

{verse_text}

QUESTION:

{question_json}
"""

# ============================================================
# VALIDATE ONE QUESTION
# ============================================================

def validate_question(
    verse_text,
    question
):
    prompt = VALIDATION_PROMPT.format(
        verse_text=verse_text,
        question_json=json.dumps(
            question,
            ensure_ascii=False,
            indent=2
        )
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
# LOAD
# ============================================================

if not Path(INPUT_FILE).exists():
    raise FileNotFoundError(
        f"{INPUT_FILE} not found"
    )

with open(
    INPUT_FILE,
    "r",
    encoding="utf-8"
) as f:
    data = json.load(f)

# ============================================================
# VALIDATE
# ============================================================

validated_data = {}
rejected_questions = []

total_verses = len(data)

for verse_index, (
    verse_number,
    verse_data
) in enumerate(data.items(), start=1):

    print(
        f"[{verse_index}/{total_verses}] "
        f"Verse {verse_number}"
    )

    verse_text = verse_data["verse_text"]

    approved_questions = []

    questions = verse_data["questions"]

    for question_index, question in enumerate(
        questions,
        start=1
    ):

        try:

            result = validate_question(
                verse_text,
                question
            )

            if result.get("valid", False):

                approved_questions.append(
                    question
                )

                print(
                    f"  ✓ Question "
                    f"{question_index}"
                )

            else:

                rejected_questions.append(
                    {
                        "verse_number":
                        verse_number,

                        "question":
                        question,

                        "issues":
                        result.get(
                            "issues",
                            []
                        )
                    }
                )

                print(
                    f"  ✗ Question "
                    f"{question_index}"
                )

                print(
                    f"    Issues: "
                    f"{result.get('issues', [])}"
                )

            time.sleep(
                DELAY_BETWEEN_REQUESTS
            )

        except Exception as e:

            print(
                f"  ERROR: {e}"
            )

            rejected_questions.append(
                {
                    "verse_number":
                    verse_number,

                    "question":
                    question,

                    "issues":
                    [str(e)]
                }
            )

    validated_data[
        verse_number
    ] = {
        "verse_text":
        verse_text,

        "questions":
        approved_questions
    }

    # Save progress after every verse

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            validated_data,
            f,
            indent=2,
            ensure_ascii=False
        )

    with open(
        REJECTED_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            rejected_questions,
            f,
            indent=2,
            ensure_ascii=False
        )

# ============================================================
# SUMMARY
# ============================================================

approved_count = sum(
    len(v["questions"])
    for v in validated_data.values()
)

print()
print("=" * 60)
print("VALIDATION COMPLETE")
print("=" * 60)

print(
    f"Approved questions: "
    f"{approved_count}"
)

print(
    f"Rejected questions: "
    f"{len(rejected_questions)}"
)

print(
    f"Saved validated data to "
    f"{OUTPUT_FILE}"
)

print(
    f"Saved rejected questions to "
    f"{REJECTED_FILE}"
)