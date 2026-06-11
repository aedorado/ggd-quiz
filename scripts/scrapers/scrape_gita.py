import os
import re
import json
import time
import requests
import copy
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import argparse

BASE_URL = "https://vedabase.io"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
OUTPUT_FILE = Path("public/bg/gita.json")

def get_soup(url, retries=5, backoff=2):
    for i in range(retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=15)
            if response.status_code == 200:
                return BeautifulSoup(response.content, 'html.parser')
            elif response.status_code == 429:
                wait_time = backoff * (2 ** i)
                print(f"[Rate Limit] 429 for {url}. Waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"[Error] Status {response.status_code} for {url}. Retrying...")
                time.sleep(backoff)
        except Exception as e:
            print(f"[Connection Error] {e} for {url}. Retrying...")
            time.sleep(backoff)
    raise Exception(f"Failed to fetch {url} after {retries} retries")

def extract_clean_verse_text(element):
    if not element:
        return ""
    el = copy.copy(element)
    h2 = el.find("h2")
    if h2:
        h2.decompose()
    for br in el.find_all("br"):
        br.replace_with("\n")
    text = el.get_text()
    
    # Split by lines and clean each line, preserving line breaks
    lines = []
    for line in text.split("\n"):
        cleaned_line = re.sub(r'[ \t]+', ' ', line).strip()
        if cleaned_line:
            lines.append(cleaned_line)
    return "\n".join(lines)

def extract_clean_inline_text(element):
    if not element:
        return ""
    el = copy.copy(element)
    h2 = el.find("h2")
    if h2:
        h2.decompose()
    text = el.get_text()
    # Replace all newlines/tabs with a single space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_clean_purport(element):
    if not element:
        return ""
    el = copy.copy(element)
    h2 = el.find("h2")
    if h2:
        h2.decompose()
    
    # Find all leaf elements
    paragraphs = []
    for p in el.find_all(['p', 'div']):
        if not p.find(['p', 'div']):
            text = re.sub(r'\s+', ' ', p.get_text()).strip()
            if text and text not in paragraphs:
                paragraphs.append(text)
                
    if paragraphs:
        return "\n\n".join(paragraphs)
    else:
        text = el.get_text()
        return "\n\n".join([re.sub(r'\s+', ' ', line).strip() for line in text.split("\n") if line.strip()])

def parse_verse_page(url, verse_id):
    try:
        soup = get_soup(url)
        
        # Devanagari (Preserve newlines)
        devanagari_div = soup.select_one(".av-devanagari")
        devanagari = extract_clean_verse_text(devanagari_div) if devanagari_div else ""
        
        # Verse Text / transliteration (Preserve newlines)
        verse_text_div = soup.select_one(".av-verse_text")
        verse_text = extract_clean_verse_text(verse_text_div) if verse_text_div else ""
        
        # Synonyms (Inline/single paragraph)
        synonyms_div = soup.select_one(".av-synonyms")
        synonyms = extract_clean_inline_text(synonyms_div) if synonyms_div else ""
        
        # Translation (Inline/single paragraph)
        translation_div = soup.select_one(".av-translation")
        translation = extract_clean_inline_text(translation_div) if translation_div else ""
        
        # Purport (Double newline paragraphs)
        purport_div = soup.select_one(".av-purport")
        purport = extract_clean_purport(purport_div) if purport_div else ""
                
        return {
            "verse_number": verse_id,
            "devanagari": devanagari,
            "verse_text": verse_text,
            "synonyms": synonyms,
            "translation": translation,
            "purport": purport
        }
    except Exception as e:
        print(f"  [Failed] Verse {verse_id} at {url}: {e}")
        return None

def scrape_chapter(chapter_num):
    chapter_url = f"{BASE_URL}/en/library/bg/{chapter_num}/"
    print(f"\n[Chapter {chapter_num}] Starting scrape of chapter index page...")
    
    try:
        soup = get_soup(chapter_url)
        
        # Extract Chapter Title
        title_el = soup.find('h1')
        chapter_title = extract_clean_inline_text(title_el) if title_el else f"Chapter {chapter_num}"
        h2_el = soup.find('h2')
        if h2_el:
            chapter_title = f"{chapter_title} - {extract_clean_inline_text(h2_el)}"
            
        print(f"[Chapter {chapter_num}] Title: {chapter_title}")
        
        # Extract all verse links
        verse_links = []
        pattern = re.compile(rf"^/en/library/bg/{chapter_num}/[\d-]+/$")
        for a in soup.find_all('a', href=True):
            href = a['href']
            if pattern.match(href):
                full_link = f"{BASE_URL}{href}"
                match = re.search(rf"/bg/{chapter_num}/([\d-]+)/$", href)
                if match:
                    verse_id = f"{chapter_num}.{match.group(1)}"
                    if (full_link, verse_id) not in verse_links:
                        verse_links.append((full_link, verse_id))
                        
        print(f"[Chapter {chapter_num}] Found {len(verse_links)} verses to scrape.")
        
        verses_data = []
        for idx, (url, verse_id) in enumerate(verse_links):
            print(f"[Chapter {chapter_num}] Scraping Verse {idx+1}/{len(verse_links)} ({verse_id})...")
            verse_data = parse_verse_page(url, verse_id)
            if verse_data:
                verses_data.append(verse_data)
            time.sleep(0.5)
            
        print(f"[Chapter {chapter_num}] Completed. Scraped {len(verses_data)}/{len(verse_links)} verses.")
        
        return {
            "chapter_number": chapter_num,
            "chapter_title": chapter_title,
            "verses": verses_data
        }
    except Exception as e:
        print(f"[Chapter {chapter_num}] Failed: {e}")
        return {
            "chapter_number": chapter_num,
            "chapter_title": f"Chapter {chapter_num}",
            "verses": [],
            "error": str(e)
        }

def main():
    parser = argparse.ArgumentParser(description="Scrape Bhagavad Gita from Vedabase.")
    parser.add_argument("--chapter", type=int, choices=range(1, 19), help="Scrape only a specific chapter (1-18)")
    args = parser.parse_args()

    print("=============================================================")
    print("STARTING BHAGAVAD GITA SCRAPER")
    print("=============================================================")
    start_time = time.time()
    
    chapters_to_scrape = [args.chapter] if args.chapter else list(range(1, 19))
    print(f"Chapters to scrape: {chapters_to_scrape}")
    
    chapters_data = {}
    
    # Run threads in parallel (max 3 workers)
    with ThreadPoolExecutor(max_workers=min(3, len(chapters_to_scrape))) as executor:
        futures = {executor.submit(scrape_chapter, ch): ch for ch in chapters_to_scrape}
        
        for future in as_completed(futures):
            ch = futures[future]
            try:
                result = future.result()
                chapters_data[str(ch)] = result
                print(f"[Main Progress] Chapter {ch} is fully processed and added.")
            except Exception as exc:
                print(f"[Main Error] Chapter {ch} generated an exception: {exc}")
                
    # Sort and structure
    sorted_chapters = {str(k): chapters_data[str(k)] for k in sorted(map(int, chapters_data.keys()))}
    
    # Save the output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_chapters, f, indent=2, ensure_ascii=False)
        
    duration = time.time() - start_time
    print("=============================================================")
    print(f"SCRAPING COMPLETE! Saved to {OUTPUT_FILE}")
    print(f"Total time taken: {duration:.2f} seconds")
    print("=============================================================")

if __name__ == "__main__":
    main()
