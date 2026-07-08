python3 -m venv venv
./venv/bin/pip install -r requirements.txt

pip install -r requirements.txt

./venv/bin/python3 scripts/generate_questions.py --book rkgd --limit 2 --rpm 20 --overwrite

venv/bin/python3 scripts/generate_mbk_questions.py --limit 100  --rpm 10

./venv/bin/python3 scripts/generate_questions.py --book rkgd --overwrite


# Scrape Gita

```
.venv/bin/python scripts/scrapers/scrape_gita.py
```