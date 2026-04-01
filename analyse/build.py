import json, hashlib, subprocess, os

TEXTES_DIR = os.path.join(os.path.dirname(__file__), 'textes')
OUTPUT = os.path.join(os.path.dirname(__file__), 'textes.json')

TYPE_MAP = {
    'essai': 'essai',
    'portfolio': 'portfolio',
    'protfolio': 'portfolio',
    'entretien': 'entretien',
}

def extract_text(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext in ('.odt', '.docx'):
        r = subprocess.run(['pandoc', filepath, '-t', 'plain', '--wrap=none'], capture_output=True, text=True)
        return r.stdout.strip()
    elif ext == '.pdf':
        r = subprocess.run(['pdftotext', filepath, '-'], capture_output=True, text=True)
        return r.stdout.strip()
    return ''

def clean_text(text):
    text = text.replace('\xa0', ' ').replace('\u202f', ' ')
    text = '\n'.join(line.rstrip() for line in text.split('\n'))
    return text.strip()

def main():
    entries = []
    files = sorted(os.listdir(TEXTES_DIR))

    for f in files:
        name, ext = os.path.splitext(f)
        if ext.lower() not in ('.odt', '.docx', '.pdf'):
            continue

        prefix = name.split('_')[0]
        typ = TYPE_MAP.get(prefix, prefix)
        auteur = name.split('_')[-1] if '_' in name else ''

        text = extract_text(os.path.join(TEXTES_DIR, f))
        text = clean_text(text)
        if not text:
            print(f'  SKIP (vide): {f}')
            continue

        h = hashlib.sha256(text.encode('utf-8')).hexdigest()[:6]
        entries.append({'id': h, 'type': typ, 'auteur': auteur, 'texte': text})
        print(f'  {h}  {typ}/{auteur} ({len(text)} chars)')

    entries.sort(key=lambda e: e['id'])

    with open(OUTPUT, 'w', encoding='utf-8') as out:
        json.dump(entries, out, ensure_ascii=False, indent=2)

    print(f'\n{len(entries)} textes -> {OUTPUT}')

if __name__ == '__main__':
    main()
