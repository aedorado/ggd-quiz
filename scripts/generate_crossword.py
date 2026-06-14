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
  ./venv/bin/python scripts/generate_crossword.py --book bs --rpm 10
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
                            "A short, simple, and direct crossword clue (8-20 words). "
                            "It should be factual and easy to understand, focusing on identities/previous births, "
                            "books written, locations, or prominent distinguishable activities/attributes."
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


def normalize_canonical_id(cid):
    if cid == 'caitanya_mahaprabhu':
        return 'CAITANYA'
    return cid.replace('_', '').upper()


THEOLOGICAL_BLOCKLIST = {
    "BHAKTA", "AVATARA", "SAKTI", "POTENCY", "TATTVAM", "DEVOTEE", "TRUTH", "GROUP", "PERSONALITY", "LOCATION"
}


def _sanitize_clues(clues: list) -> list:
    """
    Post-process clues from the model:
    - Strip diacritics / non-A-Z from the word field
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
        if word in _ENGLISH_BLOCKLIST or word in THEOLOGICAL_BLOCKLIST:
            rejected.append(f"{word} (generic/theological)")
            continue
        if word in seen:
            continue
        seen.add(word)
        clean.append({"word": word, "clue": clue})
    if rejected:
        print(f"    ⚠ Rejected {len(rejected)} generic words: {rejected}")
    return clean


SYSTEM_INSTRUCTION = (
    ""
)


def generate_clues_from_extractions(client, model, prompt_template, current_verse, entities):
    candidates_text = ""
    allowed_words = set()
    for ent in entities:
        normalized_word = normalize_canonical_id(ent["canonical_id"])
        if normalized_word in _ENGLISH_BLOCKLIST or normalized_word in THEOLOGICAL_BLOCKLIST:
            continue
        attributes = ent.get("attributes", [])
        if not attributes:
            continue
        allowed_words.add(normalized_word)
        candidates_text += f"\n- ANSWER: {normalized_word}\n  DISPLAY NAME: {ent.get('display_name', '')}\n  ATTRIBUTES EXTRACTED FROM VERSE:\n"
        for att in attributes:
            candidates_text += f"    * {att}\n"

    if not allowed_words:
        return []

    prompt = f"""{prompt_template}

We have already extracted the exact entities and their attributes for the MAIN VERSE ({current_verse["verse_number"]}) below.
You MUST generate crossword clues ONLY for the following candidate answers using ONLY their provided attributes.
Do NOT generate clues for any other words.
Do NOT add any details, historical facts, or theological concepts that are not explicitly present in the provided attributes.
Keep clues short (8-20 words), simple, direct, and factual. Do NOT use flowery, poetic, or cheesy language.

CRITICAL RULE FOR CLUES:
- The clue MUST NOT contain the answer itself, nor any parts of the answer. E.g., if the answer is "SRISAMPRADAYA", you MUST NOT use the words "Sri" or "sampradaya" in the clue. 
- You can and SHOULD freely use the names of OTHER personalities (e.g., "Caitanya", "Nityananda", "Krsna") to provide clear and unambiguous context. Do NOT mask names of other characters.
- Do NOT use relative, index-based, or ordinal references like "the first personality", "the second personality", "the former", "the latter", etc. Refer to other entities by their actual names.

CANDIDATES:
{candidates_text}

MAIN VERSE ({current_verse["verse_number"]})
{current_verse["verse_text"]}
"""

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": CROSSWORD_SCHEMA,
            "system_instruction": SYSTEM_INSTRUCTION,
        },
    )
    raw = json.loads(response.text)
    clues = raw.get("clues", [])
    
    # We sanitize the output but map it to our validated canonical IDs to ensure exact mapping
    seen = set()
    clean = []
    
    for item in clues:
        word = item.get("answer") or item.get("word", "")
        clue = item.get("clue", "").strip()
        word = re.sub(r"[^A-Za-z]", "", word).upper()
        if not word or not clue:
            continue
        if word not in allowed_words:
            continue
        if word in seen:
            continue
        seen.add(word)
        clean.append({"word": word, "clue": clue})
        
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
            "system_instruction": SYSTEM_INSTRUCTION,
        },
    )
    raw = json.loads(response.text)
    clues = raw.get("clues", [])
    return _sanitize_clues(clues)


def generate_with_retry(client, model, prompt_template, previous_verse, current_verse, next_verse, extractions_entities=None, max_retries=5):
    for attempt in range(max_retries):
        try:
            if extractions_entities is not None:
                return generate_clues_from_extractions(client, model, prompt_template, current_verse, extractions_entities)
            else:
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

    # ── Extractions path ───────────────────────────────────
    extractions_path = output_path.parent / "raw_extractions.json"
    if extractions_path.exists():
        print(f"Found entity extractions at {extractions_path}. Will generate clues based strictly on extracted entities.")
        with open(extractions_path, "r", encoding="utf-8") as f:
            extractions_data = json.load(f)
    else:
        print("No extractions found. Using raw verse text mode.")
        extractions_data = {}

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

    # ── Resume from existing progress (2-pass check) ──────
    raw_output_path = output_path.with_name(output_path.stem + "_raw.json")
    raw_data = {}
    completed = set()

    # If raw file exists, use it. If not, but old output exists, migrate it.
    if raw_output_path.exists():
        try:
            with open(raw_output_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            completed = set(raw_data.keys())
            print(f"Loaded {len(completed)} completed verses from raw progress: {raw_output_path}")
        except Exception as e:
            print(f"Warning: Could not load raw progress file: {e}. Starting fresh.")
    elif output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                temp_data = json.load(f)
            # Check if this is the old verse-level format (keys are digits)
            is_old_format = any(k.isdigit() for k in temp_data.keys())
            if is_old_format:
                raw_data = temp_data
                completed = set(raw_data.keys())
                print(f"Migrated {len(completed)} completed verses from old format in {output_path}")
        except Exception as e:
            print(f"Warning: Could not check old output file: {e}")

    # ── Generation loop ────────────────────────────────────
    delay = 60.0 / args.rpm
    print(f"\nStarting crossword generation (model={args.model}, RPM={args.rpm}, delay={delay:.1f}s)...")
    print(f"Intermediate Raw Progress → {raw_output_path}")
    print(f"Final Normalized Output  → {output_path}\n")

    total_clues = 0
    for idx, verse in enumerate(verses):
        verse_id = verse["verse_number"]
        if str(verse_id) in completed:
            print(f"[{idx+1}/{len(verses)}] Verse {verse_id} — already done, skipping.")
            continue

        previous_verse = verses[idx - 1]["verse_text"] if idx > 0 else "None"
        next_verse = verses[idx + 1]["verse_text"] if idx < len(verses) - 1 else "None"

        print(f"[{idx+1}/{len(verses)}] Generating clues for Verse {verse_id}...")

        try:
            extractions_entities = None
            if str(verse_id) in extractions_data:
                extractions_entities = extractions_data[str(verse_id)].get("entities", [])

            clues = generate_with_retry(
                client,
                args.model,
                prompt_template,
                previous_verse,
                verse,
                next_verse,
                extractions_entities=extractions_entities,
                max_retries=args.max_retries,
            )

            # 1. Update and save the raw verse-level data
            raw_data[str(verse_id)] = {
                "verse_text": verse["verse_text"],
                "clues": clues
            }
            save_data_atomic(raw_output_path, raw_data)

            # 2. Compile raw data to normalized format: {"verses": ..., "words": ...}
            normalized_verses = {}
            normalized_words = {}
            for v_id, v_info in raw_data.items():
                v_text = v_info["verse_text"]
                normalized_verses[str(v_id)] = v_text
                for c in v_info["clues"]:
                    word = c["word"]
                    clue_item = {
                        "clue": c["clue"],
                        "verse": str(v_id)
                    }
                    if word not in normalized_words:
                        normalized_words[word] = []
                    # Avoid duplicates
                    if not any(x["verse"] == str(v_id) for x in normalized_words[word]):
                        normalized_words[word].append(clue_item)

            normalized_data = {
                "verses": normalized_verses,
                "words": normalized_words
            }
            save_data_atomic(output_path, normalized_data)
            total_clues += len(clues)
            print(f"  ✓ Saved Verse {verse_id} → {len(clues)} clues: {[c['word'] for c in clues]}")

        except Exception as e:
            print(f"  ✗ Failed Verse {verse_id}: {e}")

        if idx < len(verses) - 1:
            time.sleep(delay)

    print(f"\n{'='*60}")
    print(f"Generation COMPLETE")
    # Safe reference to actual words object
    final_words = normalized_data.get("words", {}) if 'normalized_data' in locals() else {}
    print(f"  Total unique words: {len(final_words)}")
    print(f"  Total clues       : {total_clues}")
    print(f"  Output file       : {output_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
