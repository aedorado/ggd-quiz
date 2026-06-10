import os
import sys
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "description": "List of extracted identities from the verse. Empty list if none are mentioned.",
    "items": {
        "type": "OBJECT",
        "required": ["gaura_name", "previous_forms", "verse_ref", "verse_text"],
        "properties": {
            "gaura_name": {
                "type": "STRING",
                "description": "The name of the associate of Lord Caitanya (e.g. Advaita Acarya, Sivananda Sena)"
            },
            "previous_forms": {
                "type": "ARRAY",
                "items": {"type": "STRING"},
                "description": "The previous forms/incarnations of the associate (e.g. Sadasiva, Mahavishnu, Hanuman)"
            },
            "verse_ref": {
                "type": "STRING",
                "description": "The verse number or range (e.g. 11)"
            },
            "verse_text": {
                "type": "STRING",
                "description": "The exact verse text that details this mapping"
            }
        }
    }
}

def load_verses(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    verses_list = []
    if isinstance(data, list):
        verses_list = data
    elif isinstance(data, dict):
        for val in data.values():
            if isinstance(val, list):
                verses_list = val
                break
                
    parsed = []
    for item in verses_list[:]:
        text_num = str(item.get('text_number', item.get('verse_number', '')))
        content = str(item.get('content', item.get('verse_text', '')))
        if text_num and content:
            parsed.append({
                "verse_number": text_num,
                "verse_text": content
            })
    return parsed

def extract_identities(client, model, prompt_template, current_verse):
    prompt = prompt_template.format(
        verse_number=current_verse["verse_number"],
        verse_text=current_verse["verse_text"]
    )

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": {
                "type": "OBJECT",
                "properties": {
                    "identities": RESPONSE_SCHEMA
                },
                "required": ["identities"]
            }
        }
    )
    return json.loads(response.text).get("identities", [])

def extract_with_retry(client, model, prompt_template, current_verse, max_retries=5):
    for attempt in range(max_retries):
        try:
            return extract_identities(client, model, prompt_template, current_verse)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = min(5 * (2 ** attempt), 60)
            print(f"  [Retry {attempt + 1}/{max_retries}] Waiting {wait_time}s | Error: {e}")
            time.sleep(wait_time)

def main():
    model = "gemini-3.1-flash-lite"
    input_file = "public/ggd/ggd.json"
    output_file = "public/ggd/identities.json"
    prompt_file = "public/ggd/identities_prompt.txt"

    if not Path(prompt_file).exists():
        print(f"Error: Prompt file not found at {prompt_file}")
        sys.exit(1)
        
    with open(prompt_file, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    # Initialize Gemini client
    api_key = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEYS or GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)

    print(f"Parsing verses from: {input_file}...")
    verses = load_verses(input_file)
    print(f"Found {len(verses)} verses.")

    # Load existing progress if any
    all_identities = {}
    completed_verses = set()
    output_path = Path(output_file)
    
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                all_identities = json.load(f)
            # Track which verses we have already successfully processed
            completed_verses = set(all_identities.keys())
            print(f"Loaded {len(all_identities)} processed verses from existing file.")
        except Exception as e:
            print(f"Warning: Could not load existing file: {e}. Starting fresh.")

    # Delay between requests (RPM limit)
    delay_between_requests = 15.0 # 4 RPM is standard

    print("Starting extraction loop...")
    for idx, verse in enumerate(verses):
        verse_id = verse["verse_number"]
        if verse_id in completed_verses:
            continue

        print(f"[{idx+1}/{len(verses)}] Extracting identities for Verse {verse_id}...")
        try:
            identities = extract_with_retry(
                client, 
                model, 
                prompt_template, 
                verse,
                max_retries=3
            )
            
            cleaned_identities = []
            if identities:
                # Add to our list
                for identity in identities:
                    # Clean/validate keys just in case
                    if "gaura_name" in identity and "previous_forms" in identity:
                        cleaned_identities.append({
                            "gaura_name": identity["gaura_name"],
                            "previous_forms": identity["previous_forms"]
                        })
                print(f"  ✓ Found {len(cleaned_identities)} identities.")
            else:
                print(f"  - No identities in this verse.")

            all_identities[verse_id] = {
                "identities": cleaned_identities,
                "verse_text": verse["verse_text"]
            }

            # Temporarily save progress periodically
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_identities, f, indent=2, ensure_ascii=False)

        except Exception as e:
            print(f"  ✗ Failed Verse {verse_id}: {e}")
            
        time.sleep(delay_between_requests)

    # Final save
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_identities, f, indent=2, ensure_ascii=False)
    print(f"\nExtraction completed. Saved {len(all_identities)} processed verses to {output_file}.")

if __name__ == "__main__":
    main()
