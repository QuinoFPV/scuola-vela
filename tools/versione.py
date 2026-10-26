#!/usr/bin/env python3
"""Timbro di versione per il sito: da lanciare prima di pubblicare.

Calcola un'impronta di tutti i file di codice e la aggiunge agli indirizzi in index.html
(foglio di stile, main.js e una "import map" per tutti i moduli). Cosi' a ogni aggiornamento
il browser scarica i file nuovi invece di usare quelli che ha in memoria.
"""
import hashlib, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
files = sorted(p for p in (root / 'js').rglob('*.js')) + [root / 'css' / 'style.css']
h = hashlib.sha1()
for p in files:
    h.update(p.relative_to(root).as_posix().encode()); h.update(p.read_bytes())
v = h.hexdigest()[:8]

html = (root / 'index.html').read_text()
html = re.sub(r'href="css/style\.css(\?v=\w+)?"', f'href="css/style.css?v={v}"', html)
html = re.sub(r'src="js/main\.js(\?v=\w+)?"', f'src="js/main.js?v={v}"', html)
mods = [p.relative_to(root).as_posix() for p in files if p.suffix == '.js']
entries = ',\n'.join(f'    "./{m}": "./{m}?v={v}"' for m in mods)
imap = f'<script type="importmap">\n{{\n  "imports": {{\n{entries}\n  }}\n}}\n</script>'
if '<script type="importmap">' in html:
    html = re.sub(r'<script type="importmap">.*?</script>', imap, html, flags=re.S)
else:
    html = html.replace('<script type="module" src=', imap + '\n<script type="module" src=', 1)
(root / 'index.html').write_text(html)
print('versione', v)
