import os
import sys
import json
import time
import argparse
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

# ============================================================
# GEMINI RESPONSE SCHEMA FOR VALIDATION
# ============================================================
VALIDATION_SCHEMA = {
    "type": "OBJECT",
    "required": ["valid", "issues"],
    "properties": {
        "valid": {
            "type": "BOOLEAN",
            "description": "True if the question meets all validation rules, False otherwise."
        },
        "issues": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "List of issues found if the question is invalid; empty if valid."
        }
    }
}

# ============================================================
# VALIDATION PROMPT TEMPLATE
# ============================================================
VALIDATION_PROMPT = """
You are validating quiz questions.

BOOK CONTEXT

{book_title} by {book_author}.

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

VERSE:
{verse_text}

QUESTION:
{question_json}
"""

# ============================================================
# SAFE SAVE UTILITY
# ============================================================

def save_data_atomic(output_path, data):
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_file = path.with_suffix('.tmp')
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        temp_file.replace(path)
    except Exception as e:
        if temp_file.exists():
            temp_file.unlink()
        raise e

# ============================================================
# MAIN VALIDATOR
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Validate generated quiz questions against scriptural sources.")
    parser.add_argument("--book", required=True, help="ID of the book to validate (e.g. ggd, vvs, rkgd)")
    parser.add_argument("--model", default="gemini-3.1-flash-lite", help="Gemini model to use")
    parser.add_argument("--rpm", type=float, default=3.0, help="Requests per minute rate limit")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite the original questions file with validated questions")
    args = parser.parse_args()

    # Load books.json config
    config_path = Path("public/books.json")
    if not config_path.exists():
        print("Error: books.json config not found at public/books.json.")
        sys.exit(1)
        
    with open(config_path, "r", encoding="utf-8") as f:
        books_config = json.load(f)
        
    if args.book not in books_config:
        print(f"Error: Book '{args.book}' not defined in books.json.")
        sys.exit(1)
        
    book_cfg = books_config[args.book]
    output_file = book_cfg.get("output_file")
    book_title = book_cfg.get("title")
    book_author = book_cfg.get("author")
    
    if not output_file:
        print(f"Error: 'output_file' not configured for '{args.book}'.")
        sys.exit(1)

    output_path = Path(output_file)
    if not output_path.exists():
        print(f"Error: Questions file '{output_path}' does not exist. Please generate questions first.")
        sys.exit(1)

    # Load generated questions
    with open(output_path, "r", encoding="utf-8") as f:
        questions_data = json.load(f)

    # Initialize Gemini client
    api_key = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEYS or GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)

    # Prepare paths for output
    validated_output_path = output_path
    if not args.overwrite:
        validated_output_path = output_path.parent / f"{output_path.stem}_validated.json"
        
    rejected_output_path = output_path.parent / "rejected_questions.json"

    validated_data = {}
    rejected_questions = []
    
    total_verses = len(questions_data)
    delay_between_requests = 60.0 / args.rpm

    print(f"Starting validation for '{book_title}' ({total_verses} verses)...")
    print(f"Saving validated output to: {validated_output_path}")
    print(f"Saving rejected output to: {rejected_output_path}")

    for idx, (verse_id, verse_data) in enumerate(questions_data.items(), start=1):
        verse_text = verse_data["verse_text"]
        questions = verse_data["questions"]
        
        print(f"[{idx}/{total_verses}] Validating Verse {verse_id} ({len(questions)} questions)...")
        
        approved_questions = []
        
        for q_idx, question in enumerate(questions, start=1):
            prompt = VALIDATION_PROMPT.format(
                book_title=book_title,
                book_author=book_author,
                verse_text=verse_text,
                question_json=json.dumps(question, ensure_ascii=False, indent=2)
            )
            
            try:
                response = client.models.generate_content(
                    model=args.model,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": VALIDATION_SCHEMA
                    }
                )
                result = json.loads(response.text)
                
                if result.get("valid", False):
                    approved_questions.append(question)
                    print(f"  ✓ Q{q_idx}: Valid")
                else:
                    issues = result.get("issues", [])
                    rejected_questions.append({
                        "verse_number": verse_id,
                        "question": question,
                        "issues": issues
                    })
                    print(f"  ✗ Q{q_idx}: Invalid | Issues: {issues}")
                    
            except Exception as e:
                print(f"  ERROR validating Q{q_idx}: {e}")
                rejected_questions.append({
                    "verse_number": verse_id,
                    "question": question,
                    "issues": [str(e)]
                })
                
            time.sleep(delay_between_requests)
            
        validated_data[verse_id] = {
            "verse_text": verse_text,
            "questions": approved_questions
        }
        
        # Save progress incrementally
        save_data_atomic(validated_output_path, validated_data)
        save_data_atomic(rejected_output_path, rejected_questions)

    # Summary
    approved_count = sum(len(v["questions"]) for v in validated_data.values())
    rejected_count = len(rejected_questions)
    
    print("\n" + "=" * 60)
    print("VALIDATION COMPLETE")
    print("=" * 60)
    print(f"Total input verses: {total_verses}")
    print(f"Approved questions: {approved_count}")
    print(f"Rejected questions: {rejected_count}")
    print(f"Validated questions saved to {validated_output_path}")
    print(f"Rejected questions logged to {rejected_output_path}")

if __name__ == "__main__":
    main()
