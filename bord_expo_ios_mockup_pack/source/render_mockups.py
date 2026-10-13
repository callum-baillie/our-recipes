from pathlib import Path
from playwright.sync_api import sync_playwright
import json, base64, mimetypes, re

ROOT=Path('/mnt/data/bord_expo_ios_mockup_pack')
HTML_DIR=ROOT/'source'/'html'
OUT=ROOT/'mockups'
OUT.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'manifest.json').read_text())
css=(HTML_DIR/'styles.css').read_text()
assets={}
for f in (ROOT/'assets').iterdir():
    if f.is_file():
        mime=mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
        assets[f.name]=f'data:{mime};base64,'+base64.b64encode(f.read_bytes()).decode('ascii')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--disable-gpu','--font-render-hinting=none'])
    context=browser.new_context(viewport={'width':393,'height':852}, device_scale_factor=2)
    page=context.new_page()
    for i,item in enumerate(manifest,1):
        html=(HTML_DIR/f"{item['id']}.html").read_text()
        html=html.replace('<link rel="stylesheet" href="styles.css">',f'<style>{css}</style>')
        for name,data in assets.items():
            html=html.replace(f'../../assets/{name}',data)
        page.set_content(html, wait_until='load')
        page.wait_for_timeout(140)
        page.screenshot(path=str(OUT/f"{item['id']}.png"), full_page=False)
        print(i,item['id'])
    browser.close()
