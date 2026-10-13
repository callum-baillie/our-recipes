from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path('/mnt/data/bord_expo_ios_mockup_pack')
MOCKUPS = ROOT / 'mockups'
OUT = ROOT / 'contact-sheets'
OUT.mkdir(exist_ok=True)
manifest = json.loads((ROOT / 'manifest.json').read_text())

font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font_bold_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = ImageFont.truetype(font_path, 19)
font_small = ImageFont.truetype(font_path, 14)
font_bold = ImageFont.truetype(font_bold_path, 24)

names = [
    ('01-auth-library.png', 'Authentication & Recipe Library'),
    ('02-recipe-workflows.png', 'Recipe Creation & Cooking'),
    ('03-planning-household.png', 'Planning, Pantry & Household'),
    ('04-settings.png', 'Settings & System'),
]

for idx, (filename, title) in enumerate(names):
    chunk = manifest[idx*8:(idx+1)*8]
    thumb_w = 270
    gap = 26
    label_h = 46
    title_h = 74
    margin = 34
    with Image.open(ROOT / chunk[0]['image']) as first:
        ratio = first.height / first.width
    thumb_h = int(thumb_w * ratio)
    canvas_w = margin*2 + 4*thumb_w + 3*gap
    canvas_h = title_h + margin + 2*(thumb_h+label_h) + gap + margin
    canvas = Image.new('RGB', (canvas_w, canvas_h), '#EEE9DE')
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 24), title, fill='#203128', font=font_bold)
    draw.text((canvas_w-margin, 28), f'{idx*8+1:02d}-{idx*8+len(chunk):02d}', fill='#6F756D', font=font_small, anchor='ra')
    for i, item in enumerate(chunk):
        row, col = divmod(i, 4)
        x = margin + col*(thumb_w+gap)
        y = title_h + margin + row*(thumb_h+label_h+gap)
        im = Image.open(ROOT / item['image']).convert('RGB')
        im.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        # shadow
        draw.rounded_rectangle((x+6, y+8, x+thumb_w+6, y+thumb_h+8), radius=28, fill='#D2C9BA')
        mask = Image.new('L', (thumb_w, thumb_h), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle((0,0,thumb_w-1,thumb_h-1), radius=27, fill=255)
        resized = im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        canvas.paste(resized, (x,y), mask)
        label = item.get('label') or item['id'].replace('-', ' ').title()
        draw.text((x, y+thumb_h+13), f"{int(item['id'][:2]):02d}  {label}", fill='#203128', font=font)
    canvas.save(OUT / filename, quality=95)
    print(OUT / filename)
