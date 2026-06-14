import os
import sys
import json
import time
import re
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

SINGLE_ENTITY_SCHEMA = {
    "type": "OBJECT",
    "required": ["canonical_id", "display_name", "type", "lila", "attributes", "relations", "incarnation_of"],
    "properties": {
        "canonical_id": {
            "type": "STRING",
            "description": "Standardised lowercase snake_case ID (e.g. 'caitanya_mahaprabhu', 'krsna', 'saci_devi', 'nanda_maharaja')."
        },
        "display_name": {
            "type": "STRING",
            "description": "Formatted English name with proper diacritics (e.g. 'Śrī Caitanya Mahāprabhu', 'Śrī Kṛṣṇa', 'Yaśodā-devī')."
        },
        "type": {
            "type": "STRING",
            "enum": ["personality", "location", "group", "object"],
            "description": "Category: personality, location, group, or object."
        },
        "lila": {
            "type": "STRING",
            "enum": ["gaura", "krishna"],
            "description": "Lila layer: gaura (contemporary timeline of Lord Caitanya's advent) or krishna (all previous incarnations, eternal pastimes, demigods, or history)."
        },
        "attributes": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Visual, character, or pastime facts about this entity from this verse."
        },
        "relations": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["type", "target_id"],
                "properties": {
                    "type": {
                        "type": "STRING",
                        "description": "Relationship type (e.g. 'son_of', 'disciple_of', 'father_of', 'wife_of', 'author_of', 'non_different_from')."
                    },
                    "target_id": {
                        "type": "STRING",
                        "description": "The canonical_id of the target entity."
                    }
                }
            },
            "description": "Explicit relationships stated in this verse."
        },
        "incarnation_of": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "For gaura entities, list the canonical_id(s) of the previous forms/incarnations they map to. Empty for krishna entities."
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

Your task is to analyze a list of entities that were extracted from different verses of Kavi Karnapura's 'Gaura Ganoddesha Dipika'. Because the extraction was done verse-by-verse, some different personalities who share the same name (or similar names) have been naively assigned the same 'canonical_id'.

You need to identify which of these IDs represent multiple distinct real-world personalities or objects, and suggest a distinct 'resolved_id' for each distinct entity.

CRITICAL: PREVENT OVER-SPLITTING (DO NOT OVER-DISAMBIGUATE)
Be extremely conservative when splitting entities. Most occurrences of the same name refer to the SAME entity unless there is clear, contradictory evidence.

Follow these strict rules to decide if occurrences belong to the SAME entity:
1. RULE OF CONSISTENCY: If the descriptions, attributes, and relationships are compatible (even if different details are highlighted in different verses), treat them as the SAME entity.
   - Example: An entity 'Sumukhi Devi' described as "mother of Madhumangala" in one verse and "mother of Nandimukhi" in another is the SAME person, because Madhumangala and Nandimukhi are siblings (children of Sandipani Muni and Sumukhi-devi). Do NOT split them.
   - Example: 'Hiranyangi' described as "born of Harini-devi" (mother), "born to a deer" (harini translates to female deer), "friend of Radha", and "daughter of Mahavasu" (father) is the SAME person. These details are completely consistent with a single person. Do NOT split them.
   - Example: 'Jatila' described as "Radharani's mother-in-law" in one verse, "living in Javata" in another, and "sister of mother of Daksina-devi" in a third is the SAME famous Jatila-devi. Do NOT split them.
2. RULE OF NARRATIVE SEQUENCE: Verses of a scripture often describe the same person in contiguous blocks of verses (e.g. introducing her, then describing her beauty, then her parents, then her marriage). If the name appears in adjacent/close verses, they are almost always the same person.

Only split (i.e., output remapping rules) if there is DIRECT CONTRADICTION, such as:
- Different entity types (e.g. one is a person, another is an animal, another is a river/location).
- Contradictory parents or husbands (e.g., one Gopi is married to 'Vahika' and another Gopi named the same is married to someone else, or they have completely different fathers that cannot be matched).
- Different eras/timelines: For GGD, a pre-Caitanya historical acarya (like Vidyanidhi in the disciplic succession of Verse 22) and a contemporary associate of Caitanya (like Vidyanidhi the son of Nidhiratna-devi in Verse 102) are DIFFERENT.

If the instances represent the SAME personality/object across all mentions, do NOT output any rules for that ID.
If they represent DIFFERENT personalities/objects:
- Generate a distinct, descriptive lowercase snake_case resolved_id for each distinct entity (e.g., suffixing with '_parampara', '_treasure', '_gopi', '_devi', '_misra', etc. to distinguish them based on parentage, guru, or pastime role).
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
                "lila": ent.get("lila", "gaura"),
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
                        
                new_inc = []
                for inc in ent.get("incarnation_of", []):
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
    
    verses_list = []
    if isinstance(data, list):
        verses_list = data
    elif isinstance(data, dict):
        for val in data.values():
            if isinstance(val, list):
                verses_list = val
                break
                
    parsed = []
    for item in verses_list:
        text_num = str(item.get('text_number', item.get('verse_number', '')))
        content = str(item.get('content', item.get('verse_text', '')))
        if text_num and content:
            parsed.append({
                "verse_number": text_num,
                "verse_text": content
            })
    return parsed

def extract_identities(client, model, prompt_template, current_verse):
    prompt = prompt_template.replace(
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

def is_generic_attribute(attr: str) -> bool:
    val = attr.lower().strip()
    
    # Strip leading articles
    val = re.sub(r'^(a|an|the|this)\s+', '', val)
    
    # Generic terms list
    generic_terms = {
        "appeared as a devotee in gaura-lila",
        "appeared as a devotee in krsna-lila",
        "appeared as a devotee in krishna-lila",
        "appeared as a devotee in caitanya-lila",
        "appeared as a devotee",
        "appeared as a saintly devotee",
        "appeared as a follower of lord caitanya",
        "appeared later as a follower of lord caitanya",
        "cowherd damsel of vraja",
        "cowherd damsel of vrajabhumi",
        "cowherd damsel of vrndavana",
        "cowherd damsel of vrndavana-dhama",
        "gopi present in krishna-lila",
        "gopi present in krsna-lila",
        "gopi present in vraja-lila",
        "gopi of vraja-lila",
        "gopi from the eternal pastimes",
        "vraja-gopi residing in vraja",
        "vraja-gopi from the eternal pastimes",
        "resident of vraja",
        "resident of vrajabhumi",
        "resident of vrndavana",
        "gopi in krishna-lila",
        "gopi in krsna-lila",
        "gopi in gaura-lila",
        "appeared in gaura-lila",
        "appeared in krishna-lila",
        "appeared in krsna-lila",
        "appeared in caitanya's pastimes",
        "appeared in lord caitanya's pastimes",
        "an associate appearing in gaura-lila",
        "an associate in gaura-lila",
        "associate appearing in gaura-lila",
        "associate in gaura-lila",
        "associate of lord caitanya",
        "devotee of lord caitanya",
        "devotee of caitanya",
        "devotee in gaura-lila",
        "devotee in krishna-lila",
        "devotee in krsna-lila",
        "associate of caitanya",
        "devotee of caitanya",
        "gopi in krishna-lila",
        "gopi in krsna-lila",
        "gopi in gaura-lila",
        "cowherd boy in caitanya's pastimes",
        "cowherd boy in vraja",
        "cowherd boy in vrajabhumi",
        "cowherd boy of vraja",
        "cowherd friend of lord krishna",
        "cowherd friend of lord krsna",
        "cowherd friend of krishna",
        "cowherd friend of krsna",
        "cowherd friend in vrajabhumi",
        "cowherd friend in vraja",
        "gopi residing in vraja",
        "servant of lord caitanya",
        "servant of lord caitanya mahaprabhu",
        "servant of caitanya",
        "servant of lord krsna",
        "servant of lord krishna",
        "servant of krishna",
        "servant of krsna",
        "servant in vrndavana",
        "servant in vraja",
        "servant in vrajabhumi",
        "gopi who appeared in gaura-lila",
        "vraja-gopi who appeared in gaura-lila",
        "vraja-gopi who appeared as a devotee in gaura-lila",
        "vraja-gopi who appeared as a devotee in caitanya-lila",
        "vraja-gopi who appeared as a devotee",
        "personality who appeared in gaura-lila",
        "associate who appeared in gaura-lila",
        "devotee who appeared in gaura-lila",
        "gopi residing in vrndavana"
    }
    
    if val in generic_terms:
        return True
        
    pattern = r'^(appeared as a )?(devotee|saintly devotee|associate|gopi|vraja-gopi|cowherd damsel|cowherd boy|resident|servant)\s+(in|of|present in|appearing in|residing in|from|from the|who appeared in)\s+(gaura[- ]lila|krishna[- ]lila|krsna[- ]lila|caitanya[- ]lila|vraja|vrajabhumi|vrndavana|caitanya|lord caitanya\'s? pastimes|the eternal pastimes|eternal pastimes|puri)$'
    if re.match(pattern, val):
        return True
        
    return False

def main():
    model = "gemini-3.1-flash-lite"
    input_file = "public/ggd/ggd.json"
    raw_extractions_file = "public/ggd/raw_extractions.json"
    output_file = "public/ggd/identities.json"
    prompt_file = "public/ggd/graph_prompt.txt"

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

    # RPM limit delay (4 RPM is standard for gemini-3.1-flash-lite API keys sometimes, let's keep it safe)
    delay_between_requests = 5.0

    print("Starting extraction loop...")
    for idx, verse in enumerate(verses):
        verse_id = verse["verse_number"]
        if verse_id in completed_verses:
            continue

        print(f"[{idx+1}/{len(verses)}] Extracting entities for Verse {verse_id}...")
        try:
            extracted_entities = extract_with_retry(
                client, 
                model, 
                prompt_template, 
                verse,
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
        # Clean verse id (some can be ranges like '38-39')
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
            lila = ent.get("lila", "gaura")
            
            if not display_name:
                display_name = cid.replace("_", " ").title()
                
            if cid not in normalized_entities:
                normalized_entities[cid] = {
                    "type": ent_type,
                    "lila": lila,
                    "name": display_name,
                    "attributes": [],
                    "relations": [],
                    "incarnation_of": [],
                    "mentioned_in": []
                }
            
            # Choose the most descriptive name (e.g. with diacritics)
            current_name = normalized_entities[cid]["name"]
            diacritical_chars = set("āīūṛḷṅñṭḍṇśṣhḥṁ")
            has_diacritics = lambda s: any(c in diacritical_chars for c in s.lower())
            
            if len(display_name) > len(current_name) or (has_diacritics(display_name) and not has_diacritics(current_name)):
                normalized_entities[cid]["name"] = display_name
                
            # Add attributes
            for attr in ent.get("attributes", []):
                attr_clean = attr.strip()
                if attr_clean:
                    if is_generic_attribute(attr_clean):
                        continue
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
                        
            # Add incarnation_of (as a list of objects containing verse reference)
            for inc in ent.get("incarnation_of", []):
                inc_clean = inc.strip().lower()
                if inc_clean:
                    # Check if already exists
                    exists = False
                    for existing_inc in normalized_entities[cid]["incarnation_of"]:
                        if existing_inc["id"] == inc_clean:
                            exists = True
                            break
                    if not exists:
                        normalized_entities[cid]["incarnation_of"].append({
                            "id": inc_clean,
                            "verse": verse_id
                        })
                    
            # Add mention
            if verse_id not in normalized_entities[cid]["mentioned_in"]:
                normalized_entities[cid]["mentioned_in"].append(verse_id)
                
            # Link entity to verse
            if cid not in normalized_verses[verse_id]["entities"]:
                normalized_verses[verse_id]["entities"].append(cid)
                
    # Sort mentioned_in lists (numerically if possible, otherwise alphabetically)
    def clean_sort_key(v_id):
        # Extract the first integer if it's a range like '38-39'
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
