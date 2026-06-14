import os
import sys
import json
import time
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

SINGLE_ENTITY_SCHEMA = {
    "type": "OBJECT",
    "required": ["canonical_id", "display_name", "type", "attributes", "relations"],
    "properties": {
        "canonical_id": {
            "type": "STRING",
            "description": "Standardised lowercase snake_case ID (e.g. 'krsna', 'balarama', 'radha_kunda', 'nanda_maharaja', 'yasoda')."
        },
        "display_name": {
            "type": "STRING",
            "description": "Formatted English name with proper diacritics where appropriate (e.g. 'Śrī Kṛṣṇa', 'Lord Balarāma', 'Rādhā-kunda', 'Yaśodā-devī')."
        },
        "type": {
            "type": "STRING",
            "enum": ["personality", "location", "animal", "object"],
            "description": "Category: personality, location, animal, or object."
        },
        "attributes": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Visual, emotional, or pastime attributes specifically described in this verse."
        },
        "relations": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["type", "target_id"],
                "properties": {
                    "type": {
                        "type": "STRING",
                        "description": "Relationship type in lowercase snake_case (e.g. 'brother_of', 'mother_of', 'friend_of', 'adjacent_to', 'pet_of', 'uncle_of')."
                    },
                    "target_id": {
                        "type": "STRING",
                        "description": "The canonical_id of the target entity (e.g. 'krsna', 'radharani')."
                    }
                }
            },
            "description": "Explicit relationships stated in this verse."
        }
    }
}

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "required": ["entities"],
    "properties": {
        "entities": {
            "type": "ARRAY",
            "items": SINGLE_ENTITY_SCHEMA
        }
    }
}

RESOLVER_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "required": ["remap_rules"],
    "properties": {
        "remap_rules": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["original_id", "verse_number", "resolved_id"],
                "properties": {
                    "original_id": {
                        "type": "STRING",
                        "description": "The naive canonical_id that has a collision (e.g. 'vidyanidhi')."
                    },
                    "verse_number": {
                        "type": "STRING",
                        "description": "The specific verse number or range where this instance was found."
                    },
                    "resolved_id": {
                        "type": "STRING",
                        "description": "The new disambiguated lowercase snake_case ID (e.g. 'vidyanidhi_parampara' or 'vidyanidhi_treasure')."
                    }
                }
            }
        }
    }
}

RESOLVER_PROMPT = """
You are an expert scriptural entity resolution assistant specializing in Gaudiya Vaishnava history and theology.

Your task is to analyze a list of entities that were extracted from different verses of 'Radha Krishna Ganoddesha Dipika'. Because the extraction was done verse-by-verse, some different personalities or objects who share the same name (or similar names) have been naively assigned the same 'canonical_id'.

You need to identify which of these IDs represent multiple distinct real-world personalities, locations, animals, or objects, and suggest a distinct 'resolved_id' for each distinct entity.

CRITICAL: PREVENT OVER-SPLITTING (DO NOT OVER-DISAMBIGUATE)
Be extremely conservative when splitting entities. Most occurrences of the same name refer to the SAME entity unless there is clear, contradictory evidence.

Follow these strict rules to decide if occurrences belong to the SAME entity:
1. RULE OF CONSISTENCY: If the descriptions, attributes, and relationships are compatible (even if different details are highlighted in different verses), treat them as the SAME entity.
   - Example: An entity 'Sumukhi Devi' described as "mother of Madhumangala" in one verse and "mother of Nandimukhi" in another is the SAME person, because Madhumangala and Nandimukhi are siblings (children of Sandipani Muni and Sumukhi-devi). Do NOT split them.
   - Example: 'Hiranyangi' described as "born of Harini-devi" (mother), "born to a deer" (harini translates to female deer), "friend of Radha", and "daughter of Mahavasu" (father) is the SAME person. These details are completely consistent with a single person. Do NOT split them.
   - Example: 'Jatila' described as "Radharani's mother-in-law" in one verse, "living in Javata" in another, and "sister of mother of Daksina-devi" in a third is the SAME famous Jatila-devi. Do NOT split them.
2. RULE OF NARRATIVE SEQUENCE: Verses of a scripture often describe the same person in contiguous blocks of verses (e.g. introducing her, then describing her beauty, then her parents, then her marriage). If the name appears in adjacent/close verses, they are almost always the same person.
3. ONCE-PER-ERA: For eternal associates or pastimes in Vraja-lila (such as in RKGD), there is typically only ONE primary character per name (e.g., only one gopi named Kalavati, only one gopa named Sridama, only one mother-in-law named Jatila).

Only split (i.e., output remapping rules) if there is DIRECT CONTRADICTION, such as:
- Different entity types (e.g. one is a person, another is an animal, another is a river/location).
- Contradictory parents or husbands (e.g., one Gopi is married to 'Vahika' and another Gopi named the same is married to someone else, or they have completely different fathers that cannot be matched).

If the instances represent the SAME personality/object across all mentions, do NOT output any rules for that ID.
If they represent DIFFERENT personalities/objects:
- Generate a distinct, descriptive lowercase snake_case resolved_id for each distinct entity (e.g., adding distinguishing suffixes based on parentage, roles, or relationships).
- Create a remapping rule for EVERY instance of that ID.

Input Candidates (grouped by naive canonical_id):
{candidates_json}

Output the results strictly in the specified JSON format.
"""

def find_disambiguation_candidates(raw_extractions):
    entity_occurrences = {}
    for verse_id, data in raw_extractions.items():
        entities_list = data.get("entities", [])
        for ent in entities_list:
            cid = ent["canonical_id"].strip().lower()
            if not cid:
                continue
            if cid not in entity_occurrences:
                entity_occurrences[cid] = []
            entity_occurrences[cid].append({
                "verse_number": verse_id,
                "lila": ent.get("lila", "krishna"),
                "attributes": ent.get("attributes", []),
                "relations": ent.get("relations", [])
            })
            
    candidates = {}
    for cid, occurrences in entity_occurrences.items():
        if len(occurrences) > 1:
            candidates[cid] = occurrences
            
    return candidates

def resolve_entity_collisions(client, model, raw_extractions):
    candidates = find_disambiguation_candidates(raw_extractions)
    if not candidates:
        print("No multi-mention entities found to resolve.")
        return raw_extractions
        
    print(f"Analyzing {len(candidates)} entities with multiple mentions for name collisions...")
    candidates_str = json.dumps(candidates, indent=2)
    prompt = RESOLVER_PROMPT.replace("{candidates_json}", candidates_str)
    
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": RESOLVER_RESPONSE_SCHEMA
            }
        )
        
        result = json.loads(response.text)
        remap_rules = result.get("remap_rules", [])
        
        if not remap_rules:
            print("No entity collisions resolved (no remapping rules generated).")
            return raw_extractions
            
        print(f"Applying {len(remap_rules)} remapping rules to raw extractions...")
        
        remap_lookup = {}
        for rule in remap_rules:
            orig_id = rule["original_id"].strip().lower()
            v_num = rule["verse_number"].strip()
            res_id = rule["resolved_id"].strip().lower()
            
            if orig_id not in remap_lookup:
                remap_lookup[orig_id] = {}
            remap_lookup[orig_id][v_num] = res_id
            print(f"  Remap: '{orig_id}' in Verse {v_num} -> '{res_id}'")
            
        for verse_id, data in raw_extractions.items():
            entities_list = data.get("entities", [])
            for ent in entities_list:
                cid = ent["canonical_id"].strip().lower()
                
                if cid in remap_lookup and verse_id in remap_lookup[cid]:
                    ent["canonical_id"] = remap_lookup[cid][verse_id]
                
                for rel in ent.get("relations", []):
                    t_id = rel.get("target_id", "").strip().lower()
                    if t_id in remap_lookup and verse_id in remap_lookup[t_id]:
                        rel["target_id"] = remap_lookup[t_id][verse_id]
                        
                if "incarnation_of" in ent:
                    new_inc = []
                    for inc in ent["incarnation_of"]:
                        inc_clean = inc.strip().lower()
                        if inc_clean in remap_lookup and verse_id in remap_lookup[inc_clean]:
                            new_inc.append(remap_lookup[inc_clean][verse_id])
                        else:
                            new_inc.append(inc)
                    ent["incarnation_of"] = new_inc
                
    except Exception as e:
        print(f"Error during entity resolution API call: {e}")
        print("Proceeding without remapping...")
        
    return raw_extractions

def load_verses(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    key = "sri_sri_radha_krsna-ganoddesa-dipika"
    verses = data.get(key, [])
    parsed = []
    for item in verses:
        parsed.append({
            "verse_number": str(item.get("text_number", "")),
            "verse_text": item.get("content", "")
        })
    return parsed

def extract_identities(client, model, prompt_template, current_verse, prev_verse=None):
    prompt = prompt_template
    if prev_verse:
        context_str = (
            f"PRECEEDING CONTEXT (Preceding Verse {prev_verse['verse_number']}):\n"
            f"{prev_verse['verse_text']}\n\n"
            f"Note: Use this preceding context ONLY to resolve pronouns or ambiguous entities in the main verse. "
            f"Do not extract new entities or attributes that exist ONLY in this preceding context.\n\n"
        )
        prompt = prompt.replace("MAIN VERSE", f"{context_str}MAIN VERSE")

    prompt = prompt.replace(
        "{verse_number}", current_verse["verse_number"]
    ).replace(
        "{verse_text}", current_verse["verse_text"]
    )

    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": RESPONSE_SCHEMA
        }
    )
    return json.loads(response.text).get("entities", [])

def extract_with_retry(client, model, prompt_template, current_verse, prev_verse=None, max_retries=5):
    for attempt in range(max_retries):
        try:
            return extract_identities(client, model, prompt_template, current_verse, prev_verse)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = min(5 * (2 ** attempt), 60)
            print(f"  [Retry {attempt + 1}/{max_retries}] Waiting {wait_time}s | Error: {e}")
            time.sleep(wait_time)

def main():
    model = "gemini-3.1-flash-lite"
    input_file = "public/rkgd/rkgd.json"
    raw_extractions_file = "public/rkgd/raw_extractions.json"
    output_file = "public/rkgd/identities.json"
    prompt_file = "public/rkgd/graph_prompt.txt"

    if not Path(prompt_file).exists():
        print(f"Error: Prompt file not found at {prompt_file}")
        sys.exit(1)
        
    with open(prompt_file, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    api_key = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEYS or GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)

    print(f"Parsing verses from: {input_file}...")
    verses = load_verses(input_file)
    print(f"Found {len(verses)} verses.")

    raw_extractions = {}
    completed_verses = set()
    raw_path = Path(raw_extractions_file)
    
    if raw_path.exists():
        try:
            with open(raw_path, "r", encoding="utf-8") as f:
                raw_extractions = json.load(f)
            completed_verses = set(raw_extractions.keys())
            print(f"Loaded {len(raw_extractions)} raw extractions from existing file.")
        except Exception as e:
            print(f"Warning: Could not load raw extractions file: {e}. Starting fresh.")

    # RPM limit delay
    delay_between_requests = 4.5

    print("Starting extraction loop...")
    for idx, verse in enumerate(verses):
        verse_id = verse["verse_number"]
        if verse_id in completed_verses:
            continue

        prev_verse = verses[idx - 1] if idx > 0 else None

        print(f"[{idx+1}/{len(verses)}] Extracting entities for Verse {verse_id}...")
        try:
            extracted_entities = extract_with_retry(
                client, 
                model, 
                prompt_template, 
                verse,
                prev_verse,
                max_retries=3
            )
            
            raw_extractions[verse_id] = {
                "entities": extracted_entities,
                "verse_text": verse["verse_text"]
            }
            print(f"  ✓ Extracted {len(extracted_entities)} entities.")

            # Save progress incrementally
            with open(raw_extractions_file, 'w', encoding='utf-8') as f:
                json.dump(raw_extractions, f, indent=2, ensure_ascii=False)

        except Exception as e:
            print(f"  ✗ Failed Verse {verse_id}: {e}")
            
        time.sleep(delay_between_requests)

    print("\nExtraction finished. Resolving entity collisions...")
    
    # ── ENTITY DISAMBIGUATION (RESOLVING NAME COLLISIONS) ──
    try:
        raw_extractions = resolve_entity_collisions(client, model, raw_extractions)
    except Exception as e:
        print(f"Warning: Entity resolution step failed or was skipped: {e}")

    print("\nNormalising and merging entities...")
    
    # ── AGGREGATION AND DEDUPLICATION ──
    normalized_entities = {}
    normalized_verses = {}
    
    for verse_id, data in raw_extractions.items():
        normalized_verses[verse_id] = {
            "text": data["verse_text"],
            "entities": []
        }
        
        entities_list = data.get("entities", [])
        for ent in entities_list:
            cid = ent["canonical_id"].strip().lower()
            if not cid:
                continue
                
            display_name = ent.get("display_name", "").strip()
            ent_type = ent.get("type", "personality")
            
            if not display_name:
                display_name = cid.replace("_", " ").title()
                
            if cid not in normalized_entities:
                normalized_entities[cid] = {
                    "type": ent_type,
                    "name": display_name,
                    "attributes": [],
                    "relations": [],
                    "mentioned_in": []
                }
            
            # Choose the most descriptive name (preferring diacritics)
            current_name = normalized_entities[cid]["name"]
            diacritical_chars = set("āīūṛḷṅñṭḍṇśṣhḥṁ")
            has_diacritics = lambda s: any(c in diacritical_chars for c in s.lower())
            
            if len(display_name) > len(current_name) or (has_diacritics(display_name) and not has_diacritics(current_name)):
                normalized_entities[cid]["name"] = display_name
                
            # Add attributes
            for attr in ent.get("attributes", []):
                attr_clean = attr.strip()
                if attr_clean:
                    # Check if already exists in the list
                    exists = False
                    for existing_attr in normalized_entities[cid]["attributes"]:
                        if existing_attr["att"] == attr_clean:
                            exists = True
                            break
                    if not exists:
                        normalized_entities[cid]["attributes"].append({
                            "att": attr_clean,
                            "verse": verse_id
                        })
                    
            # Add relations (as a list of objects containing verse reference)
            for rel in ent.get("relations", []):
                rel_type = rel["type"].strip().lower().replace(" ", "_")
                target_id = rel["target_id"].strip().lower()
                if rel_type and target_id:
                    # Check if already exists
                    exists = False
                    for existing_rel in normalized_entities[cid]["relations"]:
                        if existing_rel["type"] == rel_type and existing_rel["target_id"] == target_id:
                            exists = True
                            break
                    if not exists:
                        normalized_entities[cid]["relations"].append({
                            "type": rel_type,
                            "target_id": target_id,
                            "verse": verse_id
                        })
                    
            # Add mention
            if verse_id not in normalized_entities[cid]["mentioned_in"]:
                normalized_entities[cid]["mentioned_in"].append(verse_id)
                
            # Link entity to verse
            if cid not in normalized_verses[verse_id]["entities"]:
                normalized_verses[verse_id]["entities"].append(cid)
                
    # Sort mentioned_in lists
    def clean_sort_key(v_id):
        import re
        m = re.match(r'\d+', str(v_id))
        return int(m.group(0)) if m else 9999
        
    for cid in normalized_entities:
        normalized_entities[cid]["mentioned_in"].sort(key=clean_sort_key)
        
    final_graph = {
        "entities": normalized_entities,
        "verses": normalized_verses
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_graph, f, indent=2, ensure_ascii=False)
        
    print(f"Graph compiling complete. Saved {len(normalized_entities)} entities to {output_file}.")

if __name__ == "__main__":
    main()
