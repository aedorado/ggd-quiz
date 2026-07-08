import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path

BASE_URL = "https://vedabase.io"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
OUTPUT_FILE = Path("public/mbk/mbk.json")

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
                print(f"[Error] Status {response.status_code} for {url}. Retrying in {backoff}s...")
                time.sleep(backoff)
        except Exception as e:
            print(f"[Connection Error] {e} for {url}. Retrying in {backoff}s...")
            time.sleep(backoff)
    raise Exception(f"Failed to fetch {url} after {retries} retries")

def clean_text(text):
    if not text:
        return ""
    # Normalize spaces
    text = re.sub(r'[ \t]+', ' ', text)
    # Strip leading/trailing spaces from each line
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join([line for line in lines if line])

def discover_chapters(part):
    index_url = f"{BASE_URL}/en/library/mbk/{part}/"
    print(f"\n[Part {part}] Discovering chapters from: {index_url}")
    
    soup = get_soup(index_url)
    
    # Links pattern: /en/library/mbk/{part}/{chapter_num}/
    pattern = re.compile(rf"^/en/library/mbk/{part}/(\d+)/$")
    
    chapters = []
    seen_urls = set()
    
    for a in soup.find_all("a", href=True):
        href = a["href"]
        match = pattern.match(href)
        if match:
            chapter_num = int(match.group(1))
            full_url = f"{BASE_URL}{href}"
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                chapters.append({
                    "part": part,
                    "chapter_number": chapter_num,
                    "url": full_url
                })
                
    # Sort chapters by chapter number
    chapters.sort(key=lambda x: x["chapter_number"])
    print(f"[Part {part}] Found {len(chapters)} chapters.")
    return chapters

def scrape_chapter_paragraphs(part, chapter_num, url):
    print(f"Scraping Part {part}, Chapter {chapter_num} from: {url}")
    try:
        soup = get_soup(url)
        
        # Chapter Title
        h1 = soup.find("h1")
        chapter_title = h1.get_text().strip() if h1 else f"Chapter {chapter_num}"
        
        # Paragraph elements (class user-select-text, skipping the ones containing h1)
        content_divs = soup.find_all("div", class_="user-select-text")
        
        paragraphs = []
        p_idx = 1
        for div in content_divs:
            if div.find("h1"):
                continue
            text = clean_text(div.get_text())
            if text:
                paragraphs.append({
                    "paragraph_number": p_idx,
                    "id": f"{part}.{chapter_num}.{p_idx}",
                    "content": text
                })
                p_idx += 1
                
        print(f"  Title: '{chapter_title}' | Paragraphs: {len(paragraphs)}")
        return {
            "chapter_id": f"{part}.{chapter_num}",
            "part": part,
            "chapter_number": chapter_num,
            "chapter_title": chapter_title,
            "paragraphs": paragraphs
        }
    except Exception as e:
        print(f"  [Failed] Chapter {part}.{chapter_num}: {e}")
        return None

def main():
    print("=============================================================")
    print("STARTING COMPLETE MAHABHARATA SCRAPER")
    print("=============================================================")
    start_time = time.time()
    
    # 1. Discover all chapters
    all_chapters_to_scrape = []
    for part in [1, 2]:
        try:
            chapters = discover_chapters(part)
            all_chapters_to_scrape.extend(chapters)
        except Exception as e:
            print(f"[Error] Failed to discover chapters for Part {part}: {e}")
            
    print(f"\nTotal chapters to scrape across all parts: {len(all_chapters_to_scrape)}")
    
    # 2. Scrape each chapter sequentially
    scraped_chapters = []
    for idx, ch in enumerate(all_chapters_to_scrape):
        print(f"\n[{idx + 1}/{len(all_chapters_to_scrape)}] Processing...")
        ch_data = scrape_chapter_paragraphs(ch["part"], ch["chapter_number"], ch["url"])
        if ch_data:
            scraped_chapters.append(ch_data)
        # Sleep for a bit to avoid hitting rate limits
        time.sleep(0.5)
        
    # 3. Structure the consolidated JSON
    data = {
        "book_info": {
            "title": "Mahābhārata - Retold by Kṛṣṇa Dharma dasa",
            "book_id": "mbk",
            "author": "Kṛṣṇa Dharma dasa",
            "category": "epic",
            "desc": "A prose retelling of the great epic Mahabharata by Krsna Dharma dasa."
        },
        "chapters": scraped_chapters
    }
    
    # 4. Save to file
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    duration = time.time() - start_time
    print("\n=============================================================")
    print(f"SCRAPING COMPLETE! Saved to {OUTPUT_FILE}")
    print(f"Total time taken: {duration:.2f} seconds")
    print(f"Total chapters successfully saved: {len(scraped_chapters)}")
    print("=============================================================")

if __name__ == "__main__":
    main()
