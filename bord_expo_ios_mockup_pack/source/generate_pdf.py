from pathlib import Path
import json
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

ROOT = Path('/mnt/data/bord_expo_ios_mockup_pack')
OUT = ROOT / 'Bord-Expo-iOS-Mockups.pdf'
MANIFEST = json.loads((ROOT/'manifest.json').read_text())
W, H = landscape(letter)

pdfmetrics.registerFont(TTFont('EBG', '/usr/share/fonts/truetype/ebgaramond/EBGaramond12-Regular.ttf'))
pdfmetrics.registerFont(TTFont('EBG-Bold', '/usr/share/fonts/truetype/ebgaramond/EBGaramond12-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVS', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVS-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))

PAPER = HexColor('#F7F3EB')
SURFACE = HexColor('#FFFDF8')
INK = HexColor('#203128')
MUTED = HexColor('#626A63')
LINE = HexColor('#DDD6C9')
SAGE = HexColor('#DDE8D1')
OLIVE = HexColor('#5E7C3D')
TERRACOTTA = HexColor('#C4512F')
TEAL = HexColor('#3F7C7E')
GOLD = HexColor('#B98738')

styles = {
    'body': ParagraphStyle('body', fontName='DVS', fontSize=8.5, leading=12, textColor=MUTED),
    'body_dark': ParagraphStyle('body_dark', fontName='DVS', fontSize=8.5, leading=12, textColor=INK),
    'small': ParagraphStyle('small', fontName='DVS', fontSize=7, leading=9.5, textColor=MUTED),
    'card_title': ParagraphStyle('card_title', fontName='EBG-Bold', fontSize=13, leading=13, textColor=INK),
    'caption': ParagraphStyle('caption', fontName='DVS', fontSize=7.2, leading=9.7, textColor=MUTED),
}

def bg(c):
    c.setFillColor(PAPER); c.rect(0,0,W,H,stroke=0,fill=1)

def page_number(c, n):
    c.setFont('DVS', 7); c.setFillColor(MUTED)
    c.drawRightString(W-28, 18, f'{n:02d}')

def eyebrow(c, text, x, y, color=OLIVE):
    c.setFont('DVS-Bold', 7); c.setFillColor(color); c.drawString(x,y,text.upper())

def title(c, text, x, y, size=30):
    c.setFont('EBG-Bold', size); c.setFillColor(INK); c.drawString(x,y,text)

def paragraph(c, text, x, y_top, w, h, style='body'):
    p=Paragraph(text, styles[style]); p.wrapOn(c,w,h); p.drawOn(c,x,y_top-p.height); return p.height

def rounded_box(c,x,y,w,h,fill=SURFACE,stroke=LINE,r=12,line=0.8):
    c.setFillColor(fill); c.setStrokeColor(stroke); c.setLineWidth(line); c.roundRect(x,y,w,h,r,stroke=1,fill=1)

def image_dimensions(path):
    with Image.open(path) as im: return im.size

def draw_image_fit(c,path,x,y,w,h,stroke=True,r=14):
    iw,ih=image_dimensions(path); scale=min(w/iw,h/ih); dw,dh=iw*scale,ih*scale
    dx=x+(w-dw)/2; dy=y+(h-dh)/2
    if stroke:
        c.setFillColor(SURFACE); c.setStrokeColor(LINE); c.setLineWidth(.7)
        c.roundRect(dx-3,dy-3,dw+6,dh+6,r,stroke=1,fill=1)
    c.drawImage(ImageReader(str(path)),dx,dy,dw,dh,mask='auto')
    return dx,dy,dw,dh

def draw_phone(c,path,x,y,w):
    iw,ih=image_dimensions(path); h=w*ih/iw
    c.saveState()
    c.setFillColor(HexColor('#D7D0C4')); c.roundRect(x+4,y-4,w,h,18,stroke=0,fill=1)
    c.restoreState()
    c.drawImage(ImageReader(str(path)),x,y,w,h,mask='auto')
    return h

def bullet(c, x, y, heading, body, width=305):
    c.setFillColor(SAGE); c.circle(x+8,y-3,8,stroke=0,fill=1)
    c.setFillColor(OLIVE); c.setFont('DVS-Bold',7); c.drawCentredString(x+8,y-5.5,'+')
    c.setFont('DVS-Bold',10); c.setFillColor(INK); c.drawString(x+24,y,heading)
    h=paragraph(c,body,x+24,y-8,width-24,42,'small')
    return max(42,h+12)

def header(c, label, heading, page):
    eyebrow(c,label,34,H-34)
    title(c,heading,34,H-66,30)
    c.setStrokeColor(LINE); c.line(34,H-78,W-34,H-78)
    page_number(c,page)

c=canvas.Canvas(str(OUT), pagesize=(W,H))
c.setTitle('Bord Expo iOS Mockups')
c.setAuthor('OpenAI')

# Page 1 - Cover
bg(c)
eyebrow(c,'BORD - EXPO IOS DESIGN DIRECTION',42,H-44)
c.setFont('EBG-Bold',49); c.setFillColor(INK); c.drawString(42,H-105,'A native kitchen,')
c.drawString(42,H-153,'still unmistakably Bord.')
paragraph(c,'A complete visual translation of 32 supplied web pages into an iOS-first Expo application - preserving the editorial cookbook identity while adopting native navigation, controls, safe areas, accessibility, and selective Liquid Glass.',42,H-180,365,105,'body_dark')
chips=[('32','screens'),('5','primary tabs'),('64','source views')]
for i,(num,lab) in enumerate(chips):
    x=42+i*112; rounded_box(c,x,166,98,55,SURFACE,LINE,13)
    c.setFont('EBG-Bold',22); c.setFillColor(INK); c.drawString(x+13,191,num)
    c.setFont('DVS-Bold',7); c.setFillColor(OLIVE); c.drawString(x+13,177,lab.upper())
paragraph(c,'Deliverables include high-resolution PNGs, contact sheets, a local gallery, source audit, tokens, and an Expo implementation blueprint.',42,142,365,64,'small')
# phones
phone_paths=[ROOT/'mockups/05-home.png',ROOT/'mockups/12-recipe-detail.png',ROOT/'mockups/16-planner.png']
positions=[(454,70,118),(553,54,130),(662,78,110)]
for path,(x,y,w) in zip(phone_paths,positions): draw_phone(c,path,x,y,w)
page_number(c,1); c.showPage()

# Page 2 - analysis with before/after
bg(c); header(c,'SOURCE AUDIT','What changed and why',2)
left_x=42; y=H-112
moves=[
('Native navigation','The compressed desktop header becomes five persistent tabs plus stack navigation. Global chrome no longer competes with page controls.'),
('Task-first hierarchy','Editorial type remains on identity-rich moments; settings and operational screens become denser, clearer, and quicker to act on.'),
('Reachable actions','Cook, save, generate, create, and shopping actions move to safe-area bottom bars or standard navigation actions.'),
('Fewer boxes','Spacing, list grouping, and separators replace nested bordered cards. Content layers remain opaque for reading.'),
('Accessible by construction','Dynamic Type, 44-point targets, native semantics, reduced transparency, and non-color status cues are treated as requirements.')]
for h,b in moves:
    used=bullet(c,left_x,y,h,b,318); y-=used+7
# comparisons
x0=408
c.setFont('DVS-Bold',8); c.setFillColor(MUTED); c.drawString(x0,H-108,'SOURCE MOBILE')
c.drawString(x0+172,H-108,'IOS TRANSLATION')
comparisons=[
    (ROOT.parent/'app_screens/screenshots/home-mobile.png',ROOT/'mockups/05-home.png','Home'),
    (ROOT.parent/'app_screens/screenshots/settings-mobile.png',ROOT/'mockups/22-settings.png','Settings')]
row_y=[302,54]
for (before,after,label),yy in zip(comparisons,row_y):
    draw_phone(c,before,x0,yy,92); draw_phone(c,after,x0+172,yy,92)
    c.setFont('EBG-Bold',12); c.setFillColor(INK); c.drawString(x0+104,yy+178,label)
    paragraph(c,'Web shell' if label=='Home' else 'Long custom form',x0+104,yy+160,60,35,'small')
    c.setStrokeColor(LINE); c.setLineWidth(1.2); c.line(x0+107,yy+132,x0+157,yy+132)
    c.setFillColor(TERRACOTTA); c.circle(x0+160,yy+132,3,stroke=0,fill=1)
    paragraph(c,'Native shell' if label=='Home' else 'Grouped settings',x0+104,yy+114,60,35,'small')
c.showPage()

# Page 3 - system
bg(c); header(c,'DESIGN SYSTEM','Editorial cookbook, native operating system',3)
# palette
c.setFont('DVS-Bold',9); c.setFillColor(INK); c.drawString(42,H-108,'CORE PALETTE')
palette=[('Paper',PAPER,'#F7F3EB'),('Ink',INK,'#203128'),('Sage',SAGE,'#DDE8D1'),('Olive',OLIVE,'#5E7C3D'),('Terracotta',TERRACOTTA,'#C4512F'),('Teal',TEAL,'#3F7C7E')]
for i,(name,col,hexv) in enumerate(palette):
    x=42+i*84; c.setFillColor(col); c.setStrokeColor(LINE); c.setLineWidth(.7); c.roundRect(x,H-166,68,38,10,stroke=1,fill=1)
    c.setFont('DVS-Bold',7); c.setFillColor(INK if name not in ('Ink','Olive','Terracotta','Teal') else SURFACE); c.drawString(x+8,H-148,name)
    c.setFont('DVS',5.8); c.drawString(x+8,H-159,hexv)
# type samples
rounded_box(c,42,257,324,142,SURFACE,LINE,16)
eyebrow(c,'TYPE ROLES',57,379)
c.setFont('EBG-Bold',28); c.setFillColor(INK); c.drawString(57,340,'Dinner begins here.')
c.setFont('DVS-Bold',10); c.drawString(58,309,'Functional controls use the system font.')
paragraph(c,'Serif type carries identity, recipe names, and editorial moments. System text carries controls, metadata, settings, quantities, and long-form utility copy.',58,294,284,58,'small')
# navigation
rounded_box(c,388,257,362,142,SURFACE,LINE,16)
eyebrow(c,'PRIMARY NAVIGATION',404,379)
labels=[('Home','house'),('Recipes','book'),('Plan','calendar'),('Pantry','cube'),('Lists','list')]
for i,(lab,_) in enumerate(labels):
    x=405+i*67
    if lab=='Recipes':
        c.setFillColor(SAGE); c.roundRect(x,302,56,52,15,stroke=0,fill=1)
    c.setFillColor(OLIVE if lab=='Recipes' else INK); c.circle(x+28,333,5,stroke=1,fill=0)
    c.setFont('DVS-Bold' if lab=='Recipes' else 'DVS',6.5); c.drawCentredString(x+28,314,lab)
paragraph(c,'Each tab owns its own stack so users keep place when switching destinations. Nutrition, Assistant, Security, and Settings remain contextual routes.',404,292,326,38,'small')
# glass policy
rounded_box(c,42,72,708,158,SURFACE,LINE,16)
eyebrow(c,'LIQUID GLASS POLICY',58,207)
c.setFont('EBG-Bold',18); c.setFillColor(INK); c.drawString(58,177,'Glass explains controls. Paper carries content.')
cols=[
('USE GLASS FOR','Tab bars; over-image navigation; sticky cook, capture, planner, shopping, and assistant controls; system form-sheet backgrounds.'),
('KEEP OPAQUE','Recipe reading; ingredient lists; pantry rows; nutrition charts; settings groups; food cards; long explanatory text.'),
('FALL BACK CLEANLY','Older iOS uses tinted blur or an opaque material. Android uses Material 3 tonal surfaces. Reduced Transparency always wins.')]
for i,(h,b) in enumerate(cols):
    x=58+i*225; c.setFont('DVS-Bold',7); c.setFillColor([OLIVE,TERRACOTTA,TEAL][i]); c.drawString(x,148,h)
    paragraph(c,b,x,137,205,58,'small')
c.showPage()

# Pages 4-11: mockups, 4 per page
page=4
for start in range(0,32,4):
    chunk=MANIFEST[start:start+4]
    bg(c); header(c,f'SCREEN SET {start+1:02d}-{start+len(chunk):02d}','iPhone mockups',page)
    margin=34; gap=14; img_w=167; img_y=164
    for i,item in enumerate(chunk):
        x=margin+i*(img_w+gap)
        path=ROOT/item['image']
        iw,ih=image_dimensions(path); img_h=img_w*ih/iw
        draw_phone(c,path,x,img_y,img_w)
        c.setFillColor(SAGE); c.roundRect(x,118,28,24,9,stroke=0,fill=1)
        c.setFont('DVS-Bold',8); c.setFillColor(OLIVE); c.drawCentredString(x+14,126,item['id'][:2])
        p=Paragraph(item['label'],styles['card_title']); p.wrapOn(c,img_w-38,32); p.drawOn(c,x+36,141-p.height)
        paragraph(c,item['note'],x,106,img_w,49,'caption')
    c.showPage(); page+=1

# Final page
bg(c); header(c,'EXPO BLUEPRINT','Build the native shell first',12)
# left architecture
rounded_box(c,42,73,325,430,SURFACE,LINE,16)
eyebrow(c,'ROUTE ARCHITECTURE',58,480)
route_text='''<b>Root</b><br/>Authentication gate and providers<br/><br/><b>Five tab stacks</b><br/>Home / Recipes / Plan / Pantry / Lists<br/><br/><b>Contextual routes</b><br/>Nutrition, Assistant, Security, Settings<br/><br/><b>Recipe workflow</b><br/>Library - Collections - Tags - Import - Capture - New - Detail - Edit - Cook<br/><br/><b>System states</b><br/>Offline overlay, queued sync, conflict review'''
paragraph(c,route_text,58,458,290,260,'body_dark')
rounded_box(c,58,94,292,88,SAGE,SAGE,14)
c.setFont('DVS-Bold',8); c.setFillColor(OLIVE); c.drawString(72,159,'IMPLEMENTATION ORDER')
paragraph(c,'1. Tokens and routes  2. Tabs and stacks  3. Home and Recipes  4. Detail and Cook  5. Pantry, Plan, Lists, offline  6. Settings and auth  7. Assistant and Nutrition  8. Platform polish',72,148,264,49,'small')
# right columns
rounded_box(c,388,309,362,194,SURFACE,LINE,16)
eyebrow(c,'NATIVE-FIRST COMPONENTS',404,480)
components=[
('Expo Router','Stacks, form sheets, deep links, per-tab history.'),
('Native tabs','Use behind an abstraction; retain a stable fallback.'),
('@expo/ui SwiftUI','Selectively embed native iOS controls where it adds real value.'),
('Glass effect','Use on iOS 26 controls only; blur/opaque and Material fallbacks.'),
('Lists and gestures','Virtualized lists, swipe actions, previews, context menus.')]
y=454
for h,b in components:
    c.setFont('DVS-Bold',8); c.setFillColor(INK); c.drawString(404,y,h)
    paragraph(c,b,404,y-8,326,22,'small'); y-=32
rounded_box(c,388,73,362,218,SURFACE,LINE,16)
eyebrow(c,'NON-NEGOTIABLE QUALITY',404,268)
quality=[
('Dynamic Type','No essential action or value may disappear at accessibility sizes.'),
('Reduced transparency','Glass switches to an opaque high-contrast surface.'),
('Offline durability','Cooking and shopping continue; mutations queue with visible state.'),
('Platform adaptation','Android keeps the brand but uses Material patterns, not imitation iOS.'),
('Data provenance','Nutrition and assistant output identify confirmed, estimated, planned, and pending data.')]
y=242
for h,b in quality:
    c.setFillColor(OLIVE); c.circle(409,y+2,3,stroke=0,fill=1)
    c.setFont('DVS-Bold',7.5); c.setFillColor(INK); c.drawString(419,y,h)
    paragraph(c,b,419,y-8,306,24,'small'); y-=35
c.showPage()

c.save()
print(OUT)
