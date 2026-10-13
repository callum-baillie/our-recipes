from pathlib import Path
import json, html
root = Path('/mnt/data/bord_expo_ios_mockup_pack')
manifest = json.loads((root/'manifest.json').read_text())
buttons = ['all'] + sorted({m['category'] for m in manifest})
filter_buttons = ''.join(f'<button data-filter="{c}" class="filter{(" active" if c=="all" else "")}">{c.replace("-"," ").title()}</button>' for c in buttons)
cards=[]
for m in manifest:
    cards.append(f'''<article class="card" data-category="{html.escape(m['category'])}">
      <a href="{html.escape(m['image'])}" target="_blank" rel="noreferrer"><img src="{html.escape(m['image'])}" alt="{html.escape(m['label'])} iOS mockup"></a>
      <div class="copy"><div class="index">{html.escape(m['id'][:2])}</div><h2>{html.escape(m['label'])}</h2><p>{html.escape(m['note'])}</p><a class="open" href="{html.escape(m['image'])}" target="_blank" rel="noreferrer">Open PNG</a></div>
    </article>''')
page=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bord Expo iOS Mockups</title>
<style>
@font-face{{font-family:EBG;src:local("EB Garamond")}}:root{{--paper:#F7F3EB;--surface:#FFFDF8;--ink:#203128;--muted:#626A63;--sage:#DDE8D1;--olive:#5E7C3D;--terracotta:#C4512F;--line:#DDD6C9}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}header{{position:sticky;top:0;z-index:2;padding:28px clamp(20px,4vw,56px) 20px;background:rgba(247,243,235,.9);backdrop-filter:blur(18px);border-bottom:1px solid rgba(221,214,201,.8)}}.eyebrow{{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--olive)}}h1{{font-family:EBG,Georgia,serif;font-size:clamp(38px,6vw,72px);line-height:.95;font-weight:500;margin:8px 0 10px}}header p{{max-width:760px;color:var(--muted);line-height:1.55;margin:0}}.filters{{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}}.filter{{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:9px 13px;font-weight:650;cursor:pointer}}.filter.active{{background:var(--olive);color:white;border-color:var(--olive)}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:28px;padding:34px clamp(20px,4vw,56px) 64px;max-width:1800px;margin:auto}}.card{{background:var(--surface);border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(73,55,35,.08)}}.card>a{{display:block;background:#EAE3D7;padding:22px;text-align:center}}.card img{{display:block;width:min(100%,393px);height:auto;margin:auto;border-radius:28px;box-shadow:0 14px 34px rgba(32,49,40,.18)}}.copy{{display:grid;grid-template-columns:44px 1fr;column-gap:12px;padding:20px}}.index{{grid-row:1/4;width:38px;height:38px;border-radius:14px;background:var(--sage);display:grid;place-items:center;font-weight:800;color:var(--olive)}}h2{{font-family:EBG,Georgia,serif;font-size:28px;line-height:1;margin:2px 0 8px;font-weight:600}}.copy p{{margin:0;color:var(--muted);line-height:1.5;font-size:14px}}.open{{margin-top:13px;font-size:13px;font-weight:750;color:var(--terracotta);text-decoration:none}}.hidden{{display:none}}footer{{padding:0 56px 50px;color:var(--muted);font-size:13px}}@media(max-width:620px){{header{{position:static}}main{{grid-template-columns:1fr;padding:22px 14px 48px}}.card>a{{padding:14px}}footer{{padding:0 20px 30px}}}}
</style></head><body>
<header><div class="eyebrow">BORD - EXPO IOS DESIGN DIRECTION</div><h1>32 native-first mobile mockups.</h1><p>The supplied desktop and mobile pages have been translated into an editorial cookbook aesthetic inside an iOS-native navigation and interaction model.</p><div class="filters">{filter_buttons}</div></header>
<main>{''.join(cards)}</main><footer>Viewport: 393 x 852 points. Exports: 786 x 1704 pixels.</footer>
<script>document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');const f=b.dataset.filter;document.querySelectorAll('.card').forEach(c=>c.classList.toggle('hidden',f!=='all'&&c.dataset.category!==f));}}));</script>
</body></html>'''
(root/'gallery.html').write_text(page)
print(root/'gallery.html')
