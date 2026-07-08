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
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "description": "List of quiz questions testing details of the scriptural verses.",
            "items": {
                "type": "OBJECT",
                "required": ["question", "options", "correct_answer", "explanation", "difficulty", "tags"],
                "properties": {
                    "question": {
                        "type": "STRING", 
                        "description": "The quiz question. Saturated with devotional flavor and proper nouns; completely self-contained without text or verse numbers."
                    },
                    "options": {
                        "type": "ARRAY", 
                        "items": {"type": "STRING"},
                        "description": "Exactly 4 highly plausible, authentic multiple-choice options."
                    },
                    "correct_answer": {
                        "type": "STRING", 
                        "description": "The exact correct answer, matching one item in options."
                    },
                    "explanation": {
                        "type": "STRING", 
                        "description": "Explanation verifying the fact directly from the main verse content."
                    },
                    "difficulty": {
                        "type": "STRING", 
                        "enum": ["easy", "medium", "hard"]
                    },
                    "tags": {
                        "type": "ARRAY", 
                        "items": {"type": "STRING"}
                    }
                }
            }
        }
    },
    "required": ["questions"]
}

# ============================================================
# PARSERS
# ============================================================

def parse_txt_verses(text):
    # Matches verse numbers (e.g. 1, 2, 1-2, 1.1, 1.4-5) followed by newlines
    pattern = r"\n(\d+(?:[-./]\d+)?)\.?\s*\n"
    matches = list(re.finditer(pattern, text))
    verses = []
    for i, match in enumerate(matches):
        verse_number = match.group(1)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        verse_text = text[start:end].strip()
        verses.append({
            "verse_number": verse_number,
            "verse_text": verse_text
        })
    return verses

def parse_json_verses(data):
    # Find the list of verses inside the JSON object
    verses_list = []
    if isinstance(data, list):
        verses_list = data
    elif isinstance(data, dict):
        # 1. Check if any value is directly a list of verses
        for val in data.values():
            if isinstance(val, list):
                verses_list = val
                break
        
        # 2. Check if it is a chapter-based dictionary (e.g. chapter_id -> chapter_object with "verses" list)
        if not verses_list:
            for val in data.values():
                if isinstance(val, dict) and "verses" in val and isinstance(val["verses"], list):
                    verses_list.extend(val["verses"])
                    
        # 3. Check if it is a flat dictionary of verses (e.g. verse_id -> verse_object)
        if not verses_list:
            first_val = next(iter(data.values())) if data else None
            if isinstance(first_val, dict) and any(k in first_val for k in ['content', 'verse_text', 'text', 'translation']):
                verses_list = list(data.values())
    
    if not verses_list:
        raise ValueError("Could not find a list of verses in the JSON file.")
        
    parsed = []
    for item in verses_list:
        # Auto-detect verse/text number field
        num_keys = ['text_number', 'verse_number', 'number', 'id']
        text_num = None
        for k in num_keys:
            if k in item:
                text_num = str(item[k])
                break
        
        # Auto-detect verse text/content field
        content_keys = ['translation', 'content', 'verse_text', 'text']
        content = None
        for k in content_keys:
            if k in item:
                content = str(item[k])
                break
                
        if text_num is not None and content is not None:
            parsed.append({
                "verse_number": text_num,
                "verse_text": content
            })
    return parsed

def load_verses(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read().strip()
        
    if text.startswith('{') or text.startswith('['):
        try:
            data = json.loads(text)
            return parse_json_verses(data)
        except json.JSONDecodeError:
            pass

    suffix = Path(file_path).suffix.lower()
    if suffix == '.txt':
        return parse_txt_verses(text)
    elif suffix == '.json':
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
    
    # Save to a temporary file in the same directory first
    temp_file = path.with_suffix('.tmp')
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        # Atomically rename to replace the actual file
        temp_file.replace(path)
    except Exception as e:
        if temp_file.exists():
            temp_file.unlink()
        raise e

# ============================================================
# GENERATION ENGINE
# ============================================================

def generate_questions(client, model, prompt_template, previous_verse, current_verse, next_verse):
    prompt = prompt_template.format(
        previous_verse=previous_verse,
        verse_number=current_verse["verse_number"],
        verse_text=current_verse["verse_text"],
        next_verse=next_verse
    )

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": RESPONSE_SCHEMA
        }
    )
    return json.loads(response.text)

def generate_with_retry(client, model, prompt_template, previous_verse, current_verse, next_verse, max_retries=5):
    for attempt in range(max_retries):
        try:
            return generate_questions(client, model, prompt_template, previous_verse, current_verse, next_verse)
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
    parser = argparse.ArgumentParser(description="Generate quiz questions from a Gauḍīya scripture.")
    parser.add_argument("--book", required=True, help="ID of the book to process (e.g. ggd, vvs, rkgd)")
    parser.add_argument("--model", default="gemini-3.1-flash-lite", help="Gemini model to use")
    parser.add_argument("--max-retries", type=int, default=5, help="Maximum retries per verse")
    parser.add_argument("--rpm", type=float, default=2.0, help="Requests per minute rate limit")
    parser.add_argument("--limit", type=int, help="Maximum number of verses to process")
    parser.add_argument("--prefix", help="Only process verses whose text/verse number starts with this prefix (e.g. 1.1.)")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing completed verses")
    args = parser.parse_args()

    # Load books.json configuration
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
    if book_cfg.get("status") != "ready":
        print(f"Warning: Book '{args.book}' is marked as '{book_cfg.get('status')}', not 'ready'. Proceeding anyway.")
        
    input_file = book_cfg.get("input_file")
    output_file = book_cfg.get("output_file")
    
    if not input_file or not output_file:
        print(f"Error: 'input_file' or 'output_file' not configured for '{args.book}'.")
        sys.exit(1)

    if not Path(input_file).exists():
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)

    # Load Prompt template
    prompt_file_path = book_cfg.get("prompt_file")
    if prompt_file_path:
        prompt_file = Path(prompt_file_path)
    else:
        prompt_file = Path("public") / args.book / "prompt.txt"
        if not prompt_file.exists():
            prompt_file = Path(args.book) / "prompt.txt"

    if not prompt_file.exists():
        print(f"Error: System prompt template not found. Tried '{Path('public') / args.book / 'prompt.txt'}' and '{Path(args.book) / 'prompt.txt'}'.")
        sys.exit(1)
        
    with open(prompt_file, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    # Initialize Gemini client
    api_key = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEYS or GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)

    # Load verses
    print(f"Parsing verses from: {input_file}...")
    verses = load_verses(input_file)
    print(f"Found {len(verses)} verses.")

    # Load existing progress if any
    data = {}
    completed = set()
    output_path = Path(output_file)
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not args.overwrite:
                completed = set(data.keys())
            print(f"Loaded {len(data)} existing completed verses from {output_file}.")
        except Exception as e:
            print(f"Warning: Could not load existing file: {e}. Starting fresh.")

    # Calculate delays
    delay_between_requests = 60.0 / args.rpm

    # Filter verses by prefix if specified
    verses_to_process = verses
    if args.prefix:
        verses_to_process = [v for v in verses_to_process if v["verse_number"].startswith(args.prefix)]
    
    if args.limit is not None:
        verses_to_process = verses_to_process[:args.limit]

    print(f"Starting generation loop (RPM: {args.rpm}, Delay: {delay_between_requests:.1f}s)...")
    for idx, verse in enumerate(verses_to_process):
        verse_id = verse["verse_number"]
        if verse_id in completed:
            continue

        # Find the correct adjacent context verses from the full list
        orig_idx = next((i for i, v in enumerate(verses) if v["verse_number"] == verse_id), -1)
        previous_verse = verses[orig_idx - 1]["verse_text"] if orig_idx > 0 else "None"
        next_verse = verses[orig_idx + 1]["verse_text"] if (orig_idx != -1 and orig_idx < len(verses) - 1) else "None"

        print(f"[{idx+1}/{len(verses_to_process)}] Generating questions for Verse {verse_id}...")
        
        try:
            result = generate_with_retry(
                client, 
                args.model, 
                prompt_template, 
                previous_verse, 
                verse, 
                next_verse,
                max_retries=args.max_retries
            )
            
            data[verse_id] = {
                "verse_text": verse["verse_text"],
                "questions": result["questions"]
            }
            
            # Atomically save
            save_data_atomic(output_path, data)
            print(f"  ✓ Saved Verse {verse_id} ({len(result['questions'])} questions generated)")
            
        except Exception as e:
            print(f"  ✗ Failed Verse {verse_id}: {e}")
            
        # Rate limit delay
        if idx < len(verses_to_process) - 1:
            time.sleep(delay_between_requests)

    print("\nGeneration Loop: COMPLETED")
    print(f"Total processed verses: {len(data)}")

if __name__ == "__main__":
    main()
