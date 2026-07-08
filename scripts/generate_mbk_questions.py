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
# GEMINI RESPONSE SCHEMA
# ============================================================
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "description": "List of high-quality quiz questions testing details of the scriptural prose.",
            "items": {
                "type": "OBJECT",
                "required": ["question", "options", "correct_answer", "explanation", "difficulty", "tags"],
                "properties": {
                    "question": {
                        "type": "STRING", 
                        "description": "The quiz question. Saturated with proper nouns; completely self-contained without text or paragraph numbers. Closed-book style, testing historical/dynastic details, not trivial vocabulary/emotions."
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
                        "description": "Explanation verifying the fact directly from the main paragraph content."
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

PROMPT_TEMPLATE = """You are an expert scriptural educator creating educational quiz questions for a closed-book study tool on the Mahabharata.

BOOK CONTEXT:
This is Mahabharata, retold by Kṛṣṇa Dharma dasa.

SOURCE RESTRICTIONS:
- The supplied MAIN PARAGRAPH is the ONLY source of truth for generating questions, answers, options, and explanations.
- DO NOT invent facts, use outside knowledge, or assume any information not explicitly present in the MAIN PARAGRAPH.
- Context paragraphs (PREVIOUS and NEXT) are provided SOLELY for pronoun resolution and continuity. Under no circumstances should any question, correct option, distractor, or explanation rely on information from the PREVIOUS or NEXT paragraphs.
- Do NOT add theological conclusions or interpretations not explicitly stated in the MAIN PARAGRAPH.

Every question, option, answer, and explanation must be derivable strictly and exclusively from the MAIN PARAGRAPH target text.

STRICT CLOSED-BOOK QUESTION FORMAT RULES:
1. ASSUME CLOSED-BOOK REVIEW: The user is NOT looking at the text while answering. The questions must test real recall, memory, and understanding.
2. ABSOLUTELY NO COMPREHENSION PHRASES: Do NOT use any meta-commentary, reading-comprehension tags, or references to the source text. The question must NEVER refer to "the text", "the passage", "the paragraph", "the excerpt", "the verse", "the story", "the retelling", or "the scriptures".
3. NO META-PREFIXES: Do NOT prefix questions with "According to...", "Based on...", "In this...", etc. Write the question directly.

COMPARE THESE STYLES:
- CRITICAL FAILURE (Reading Comprehension / Meta-commentary):
  * "According to the text, what was the consequence of Vicitravīrya dying without an heir?"
  * "Based on the paragraph, why did Satyavatī prevent Ambikā from committing sati?"
  * "What did Vicitravīrya fail to do according to the scriptures?"
  * "In this passage, who is identified as the mother of Bhīṣma?"

- CORRECT CLOSED-BOOK STYLE (Direct, Natural, Recall-based):
  * "What was the spiritual consequence for King Vicitravīrya dying without leaving an heir?"
  * "Why did Satyavatī prevent Ambikā from committing sati on Vicitravīrya's funeral pyre?"
  * "Under scriptural law, who was permitted to conceive children with a man's wife in times of emergency?"
  * "Which goddess is the mother of the Kuru hero Bhīṣma?"

STRICT NO-TRIVIALITY RULE:
- Do NOT test trivial narrative descriptions, minor actions, vocabulary, or basic adjectives (e.g. "What did Ambikā peer into?" -> "The mirror").
- If a paragraph contains only generic narrative transitions or descriptions without any non-trivial scriptural, historical, or dynastic facts, you MUST return an empty list of questions (`"questions": []`). Do not force questions.

<PREVIOUS_PARAGRAPH_CONTEXT>
{previous_paragraph}
</PREVIOUS_PARAGRAPH_CONTEXT>

<MAIN_PARAGRAPH_TARGET>
Paragraph ID: {paragraph_id}
Paragraph Text: {paragraph_text}
</MAIN_PARAGRAPH_TARGET>

<NEXT_PARAGRAPH_CONTEXT>
{next_paragraph}
</NEXT_PARAGRAPH_CONTEXT>
"""

def generate_questions_for_para(client, model, previous_paragraph, current_para, next_paragraph):
    prompt = PROMPT_TEMPLATE.format(
        previous_paragraph=previous_paragraph,
        paragraph_id=current_para["id"],
        paragraph_text=current_para["content"],
        next_paragraph=next_paragraph
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

def main():
    parser = argparse.ArgumentParser(description="Generate quiz questions for Mahabharata (mbk).")
    parser.add_argument("--all", action="store_true", help="Process all chapters and paragraphs in mbk.json")
    parser.add_argument("--chapter", type=str, help="Process a specific chapter (e.g., '1.1')")
    parser.add_argument("--limit", type=int, default=10, help="Limit number of paragraphs to process (default: 10, ignored if --all is set)")
    parser.add_argument("--rpm", type=int, default=15, help="Rate limit for requests per minute (default: 15)")
    parser.add_argument("--model", type=str, default="gemini-2.5-flash", help="Gemini model to use (default: gemini-2.5-flash)")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing completed paragraphs")
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEYS or GEMINI_API_KEY environment variable is not set.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)
    
    # Load mbk.json
    mbk_path = Path("public/mbk/mbk.json")
    if not mbk_path.exists():
        print(f"Error: {mbk_path} not found.")
        sys.exit(1)
        
    with open(mbk_path, "r", encoding="utf-8") as f:
        mbk_data = json.load(f)
        
    # Gather paragraphs to process
    paragraphs_to_process = []
    for chapter in mbk_data["chapters"]:
        chap_id = chapter["chapter_id"]
        
        # Check if we should filter by specific chapter
        if args.chapter and chap_id != args.chapter:
            continue
            
        for idx, para in enumerate(chapter["paragraphs"]):
            paragraphs_to_process.append({
                "para": para,
                "chapter_paragraphs": chapter["paragraphs"],
                "index_in_chapter": idx,
                "chapter_title": chapter["chapter_title"]
            })
            
    # Apply limit if not running all
    if not args.all and not args.chapter:
        paragraphs_to_process = paragraphs_to_process[:args.limit]
    elif args.limit and not args.all:
        paragraphs_to_process = paragraphs_to_process[:args.limit]
        
    print(f"Processing {len(paragraphs_to_process)} paragraphs using model '{args.model}' (RPM: {args.rpm})...")
    
    # Load existing questions if file exists
    questions_path = Path("public/mbk/questions.json")
    output_data = {}
    if questions_path.exists():
        try:
            with open(questions_path, "r", encoding="utf-8") as f:
                output_data = json.load(f)
            print(f"Loaded {len(output_data)} existing paragraph items from questions.json.")
        except Exception as e:
            print(f"Warning: Could not parse existing questions: {e}")
            
    # Calculate delay based on RPM
    request_delay = 60.0 / args.rpm if args.rpm > 0 else 0
    
    for idx, item in enumerate(paragraphs_to_process):
        para = item["para"]
        para_id = para["id"]
        ch_paras = item["chapter_paragraphs"]
        ch_idx = item["index_in_chapter"]
        
        # Check if existing item is valid
        if para_id in output_data and not args.overwrite:
            print(f"[{idx+1}/{len(paragraphs_to_process)}] Paragraph {para_id} already generated. Skipping.")
            continue
        else:
            print(f"[{idx+1}/{len(paragraphs_to_process)}] Generating questions for paragraph {para_id}...")
            
        previous_para = ch_paras[ch_idx - 1]["content"] if ch_idx > 0 else "None"
        next_para = ch_paras[ch_idx + 1]["content"] if ch_idx < len(ch_paras) - 1 else "None"
        
        # Generate with retry upon API failure
        max_retries = 3
        generated_questions = []
        
        start_time = time.time()
        
        for attempt in range(max_retries):
            try:
                result = generate_questions_for_para(client, args.model, previous_para, para, next_para)
                generated_questions = result.get("questions", [])
                break
            except Exception as e:
                print(f"  [Attempt {attempt+1}/{max_retries}] Request failed: {e}. Retrying...")
                time.sleep(2)
            
        output_data[para_id] = {
            "paragraph_text": para["content"],
            "questions": generated_questions
        }
        print(f"  ✓ Saved {len(generated_questions)} questions.")
        
        # Incremental save to disk to safeguard progress
        questions_path.parent.mkdir(parents=True, exist_ok=True)
        with open(questions_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
            
        # Respect RPM rate limiting
        elapsed = time.time() - start_time
        if elapsed < request_delay:
            time.sleep(request_delay - elapsed)
            
    print(f"\nSuccessfully saved questions to {questions_path}")

if __name__ == "__main__":
    main()
