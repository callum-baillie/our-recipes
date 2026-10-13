from __future__ import annotations

from pathlib import Path
from textwrap import dedent
import json

ROOT = Path('/mnt/data/bord_expo_ios_mockup_pack')
HTML_DIR = ROOT / 'source' / 'html'
MOCKUP_DIR = ROOT / 'mockups'
HTML_DIR.mkdir(parents=True, exist_ok=True)
MOCKUP_DIR.mkdir(parents=True, exist_ok=True)

SCREEN_SPECS = [
    ('01-sign-in', 'Sign in', 'auth', 'Native sign-in hierarchy with passkey as a first-class action.'),
    ('02-forgot-password', 'Forgot password', 'auth', 'Focused recovery flow with one primary action and clear alternatives.'),
    ('03-reset-password', 'Reset password', 'auth', 'Recovery-code flow with visible password requirements.'),
    ('04-account-security', 'Account security', 'auth', 'Grouped iOS security settings instead of a long web form.'),
    ('05-home', 'Home', 'core', 'Editorial welcome, next-meal focus, and thumb-reachable quick actions.'),
    ('06-recipes', 'Recipe library', 'recipes', 'Search-first two-column library with compact native filters.'),
    ('07-collections', 'Collections', 'recipes', 'Visual cookbook shelves with stacked recipe previews.'),
    ('08-tags', 'Tags', 'recipes', 'Scannable tag list with color, counts, and native row actions.'),
    ('09-import', 'Import recipe', 'recipes', 'Camera, photo, document, and URL entry points in one native chooser.'),
    ('10-capture', 'Capture notes', 'recipes', 'Single compose surface with mode switcher and bottom action bar.'),
    ('11-recipes-new', 'New recipe', 'recipes', 'Full-screen structured form with progressive sections.'),
    ('12-recipe-detail', 'Recipe detail', 'recipes', 'Rich hero, condensed metadata, and a clear cooking action.'),
    ('13-recipe-edit', 'Edit recipe', 'recipes', 'Native form groups with persistent Save action.'),
    ('14-recipe-cook', 'Cook mode', 'recipes', 'Immersive step-by-step cooking with timer and one-handed controls.'),
    ('15-pantry', 'Pantry', 'core', 'Inventory summary, search, location scopes, and swipe-ready rows.'),
    ('16-planner', 'Meal planner', 'core', 'Day-focused mobile planner with compact date carousel.'),
    ('17-nutrition', 'Nutrition', 'core', 'At-a-glance rings and a concise daily log.'),
    ('18-lists', 'Shopping lists', 'core', 'List-first dashboard with visible progress and quick creation.'),
    ('19-list-detail', 'Shopping list detail', 'core', 'Sticky glass action bar and clear item-state segmentation.'),
    ('20-kitchen-assistant', 'Kitchen assistant', 'assistant', 'Native chat layout with contextual prompts and review-safe framing.'),
    ('21-offline', 'Offline', 'system', 'Calm offline state with downloaded-content status.'),
    ('22-settings', 'Settings', 'settings', 'Inset-grouped navigation modeled on native iOS Settings.'),
    ('23-settings-profiles', 'Profiles & roles', 'settings', 'Profile management with clear ownership and role hierarchy.'),
    ('24-settings-recipes', 'Recipe settings', 'settings', 'Compact defaults using pickers, steppers, and toggles.'),
    ('25-settings-meal-plan', 'Meal-plan settings', 'settings', 'Planning defaults and meal visibility in native controls.'),
    ('26-settings-lists', 'List settings', 'settings', 'Store, completion, pantry intake, and aisle organization.'),
    ('27-settings-pantry', 'Pantry settings', 'settings', 'Inventory defaults and expiry reminders.'),
    ('28-settings-nutrition', 'Nutrition settings', 'settings', 'Profile-specific goals, units, and optional inputs.'),
    ('29-settings-ai', 'AI settings', 'settings', 'Explicit permissions, model choice, and privacy controls.'),
    ('30-settings-system', 'System settings', 'settings', 'Kitchen identity, appearance, icon, and recovery actions.'),
    ('31-settings-backups', 'Backups', 'settings', 'Backup health, automation, export, and restore.'),
    ('32-settings-api', 'API & integrations', 'settings', 'Scoped keys and trusted integrations with security status.'),
]

ICON_PATHS = {
    'home': '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    'book': '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22z"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    'package': '<path d="m4 7 8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>',
    'list': '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r=".8" fill="currentColor" stroke="none"/>',
    'sparkles': '<path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2z"/><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8zM6 14l.7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7z"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'sliders': '<path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'back': '<path d="m15 18-6-6 6-6"/>',
    'ellipsis': '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
    'heart': '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    'bookmark': '<path d="M6 3h12v18l-6-4-6 4z"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    'camera': '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
    'image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>',
    'file': '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    'send': '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    'cart': '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.5 11h11l2-8H6"/>',
    'check': '<path d="m5 12 4 4L19 6"/>',
    'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l3 3"/>',
    'lock': '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    'refresh': '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 11M6 15a7 7 0 0 0 12 2l2-4"/>',
    'cloud': '<path d="M17.5 19H6a4 4 0 1 1 .7-7.9A6 6 0 0 1 18.2 9a5 5 0 0 1-.7 10z"/>',
    'download': '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    'upload': '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    'scan': '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M7 12h10"/>',
    'utensils': '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M15 3v8h5V3M17.5 11v10"/>',
    'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    'tag': '<path d="M20 13 13 20 4 11V4h7z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21H10v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    'chevrons': '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    'archive': '<path d="M3 6h18v4H3zM5 10v11h14V10M10 14h4"/>',
    'trash': '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    'palette': '<path d="M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h2a7 7 0 0 0-2-9z"/><circle cx="7" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="10" r="1" fill="currentColor" stroke="none"/>',
}


def icon(name: str, size: int = 20, cls: str = '') -> str:
    body = ICON_PATHS.get(name, ICON_PATHS['ellipsis'])
    return f'<svg class="icon {cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>'


def brand(compact: bool = False, light: bool = False) -> str:
    color = '#F8F2E8' if light else '#223328'
    text = '' if compact else '<span>Bòrd</span>'
    return f'''<div class="brand" style="color:{color}">
      <svg width="34" height="23" viewBox="0 0 44 26" fill="none" aria-hidden="true">
        <path d="M4 6h36" stroke="currentColor" stroke-width="5" stroke-linecap="square"/>
        <path d="M9 7v15M35 7v15" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
      </svg>{text}
    </div>'''


def status_bar(light: bool = False) -> str:
    c = '#F9F4EC' if light else '#1F2F25'
    return f'''<div class="status-bar" style="color:{c}">
      <div class="status-time">9:41</div>
      <div class="dynamic-island"></div>
      <div class="status-icons"><span class="signal"></span><span class="wifi">⌁</span><span class="battery"><i></i></span></div>
    </div>'''


def glass_button(content: str, cls: str = '', label: str = '') -> str:
    return f'<div class="glass-button {cls}" aria-label="{label}">{content}</div>'


def nav_bar(*, back: str | None = None, title: str | None = None, brand_title: bool = True,
            assistant: bool = False, avatar: bool = False, right: str = '', overlay: bool = False,
            light: bool = False, center: str = '') -> str:
    left = glass_button(icon('back', 22), 'nav-circle', 'Back') if back else (brand(compact=True, light=light) if not brand_title and not center else '')
    if back:
        left = f'<div class="nav-left">{glass_button(icon("back", 22), "nav-circle", "Back")}<span class="back-label">{back}</span></div>'
    if center:
        middle = center
    elif title:
        middle = f'<div class="nav-title">{title}</div>'
    elif brand_title:
        middle = brand(light=light)
    else:
        middle = ''
    r = right
    if assistant:
        r += glass_button(icon('sparkles', 20), 'nav-circle', 'Kitchen assistant')
    if avatar:
        r += '<div class="avatar">C</div>'
    classes = 'nav-bar'
    if overlay:
        classes += ' nav-overlay'
    if light:
        classes += ' nav-light'
    return f'<div class="{classes}"><div class="nav-slot left">{left}</div><div class="nav-center">{middle}</div><div class="nav-slot right">{r}</div></div>'


def tab_bar(active: str) -> str:
    items = [
        ('home','Home','home'),
        ('recipes','Recipes','book'),
        ('planner','Plan','calendar'),
        ('pantry','Pantry','package'),
        ('lists','Lists','list'),
    ]
    cells=[]
    for key,label,ic in items:
        cls='tab active' if key==active else 'tab'
        cells.append(f'<div class="{cls}">{icon(ic,22)}<span>{label}</span></div>')
    return '<div class="tab-wrap"><div class="tab-bar">'+''.join(cells)+'</div></div>'


def shell(body: str, *, active_tab: str | None = None, nav: str = 'brand', back: str | None = None,
          nav_title: str | None = None, assistant: bool = False, avatar: bool = False,
          right: str = '', overlay: bool = False, light: bool = False, body_class: str = '') -> str:
    if nav == 'none':
        nav_html = ''
    elif nav == 'logo-only':
        nav_html = nav_bar(brand_title=True, assistant=False, avatar=False, overlay=overlay, light=light)
    else:
        nav_html = nav_bar(back=back, title=nav_title, brand_title=(nav_title is None and back is None), assistant=assistant, avatar=avatar, right=right, overlay=overlay, light=light)
    main_cls='screen-content'
    if overlay:
        main_cls += ' under-chrome'
    if active_tab:
        main_cls += ' with-tabs'
    if body_class:
        main_cls += ' '+body_class
    return f'''<div class="phone {'dark-phone' if light else ''}">
      {status_bar(light=light)}
      {nav_html}
      <main class="{main_cls}">{body}</main>
      {tab_bar(active_tab) if active_tab else ''}
      <div class="home-indicator {'light' if light else ''}"></div>
    </div>'''


def eyebrow(text: str) -> str:
    return f'<div class="eyebrow">{text}</div>'


def large_header(title: str, subtitle: str = '', eye: str = '', compact: bool = False) -> str:
    return f'''<header class="large-header {'compact' if compact else ''}">
      {eyebrow(eye) if eye else ''}
      <h1>{title}</h1>
      {f'<p>{subtitle}</p>' if subtitle else ''}
    </header>'''


def field(label: str, value: str = '', placeholder: str = '', secure: bool = False, trailing: str = '') -> str:
    content = value if value else placeholder
    cls = 'field-value placeholder' if not value else 'field-value'
    if secure and value:
        content = '••••••••••••'
    return f'''<label class="field-block"><span>{label}</span><div class="field"><span class="{cls}">{content}</span>{trailing}</div></label>'''


def toggle(on: bool = True) -> str:
    return f'<div class="toggle {'on' if on else ''}"><span></span></div>'


def settings_row(icon_name: str, title: str, subtitle: str = '', trailing: str = '', tint: str = 'sage') -> str:
    if not trailing:
        trailing = icon('chevron-right',18)
    return f'''<div class="settings-row">
      <div class="settings-icon {tint}">{icon(icon_name,19)}</div>
      <div class="settings-copy"><strong>{title}</strong>{f'<small>{subtitle}</small>' if subtitle else ''}</div>
      <div class="settings-trailing">{trailing}</div>
    </div>'''


def form_row(title: str, subtitle: str = '', trailing: str = '', destructive: bool = False) -> str:
    return f'''<div class="form-row {'destructive' if destructive else ''}">
      <div><strong>{title}</strong>{f'<small>{subtitle}</small>' if subtitle else ''}</div>
      <div class="form-trailing">{trailing}</div>
    </div>'''


def recipe_thumb(img: str, title: str, meta: str, tag: str = '', class_name: str = '') -> str:
    return f'''<div class="recipe-thumb {class_name}">
      <img src="../../assets/{img}" alt=""/>
      <div class="recipe-thumb-copy">{f'<div class="mini-tag">{tag}</div>' if tag else ''}<strong>{title}</strong><small>{meta}</small></div>
    </div>'''


def recipe_grid_card(img: str, title: str, meta: str, tag: str) -> str:
    return f'''<div class="recipe-grid-card"><div class="image-wrap"><img src="../../assets/{img}" alt=""/><div class="image-heart">{icon('heart',16)}</div></div>
      <div class="grid-copy"><div class="mini-tag">{tag}</div><strong>{title}</strong><small>{icon('clock',13)} {meta}</small></div></div>'''


def auth_screen(kind: str) -> str:
    if kind=='sign-in':
        card=f'''
        <div class="auth-icon">{icon('shield',22)}</div>{eyebrow('HOUSEHOLD SIGN-IN')}
        <h1>Welcome back.</h1><p class="auth-sub">Use your profile email and full passphrase.</p>
        {field('Email', placeholder='callum@example.com')}{field('Passphrase', placeholder='Enter passphrase')}
        <div class="inline-option"><span>{icon('check',15)} Keep this trusted device signed in</span></div>
        <button class="primary full">Sign in</button>
        <div class="or"><span>or</span></div>
        <button class="secondary full">{icon('key',18)} Use a passkey</button>
        <div class="auth-link">Forgot your passphrase?</div>'''
    elif kind=='forgot':
        card=f'''
        <div class="auth-icon">{icon('mail',22)}</div>{eyebrow('ACCOUNT RECOVERY')}
        <h1>Reset your passphrase.</h1><p class="auth-sub">We will send a one-time reset link if the email belongs to a profile.</p>
        {field('Email', placeholder='you@example.com')}
        <button class="primary full">Send reset link</button>
        <div class="auth-actions"><span>Use a local recovery code</span><span>Back to sign in</span></div>'''
    else:
        card=f'''
        <div class="auth-icon">{icon('key',22)}</div>{eyebrow('LOCAL RECOVERY')}
        <h1>Choose a new passphrase.</h1><p class="auth-sub">Enter one unused recovery code for this profile.</p>
        {field('Email', placeholder='you@example.com')}{field('Recovery code', value='BORD-XXXX-XXXX-XXXX')}{field('New passphrase', placeholder='At least 15 characters')}
        <div class="password-meter"><i></i><i></i><i></i><i></i><span>Strong when longer</span></div>
        <button class="primary full">Reset passphrase</button><div class="auth-link">Back to sign in</div>'''
    body=f'''<div class="auth-bg"><div class="auth-logo">{brand()}</div><section class="auth-card">{card}</section></div>'''
    return shell(body, nav='none')


def screen_account_security() -> str:
    body=f'''<div class="scroll pad settings-screen">
      {large_header('Account security','Protect access to your household and review trusted devices.','SECURITY',compact=True)}
      <div class="security-summary card"><div class="status-icon good">{icon('shield',24)}</div><div><strong>Security looks good</strong><small>Passkeys are enabled and your recovery codes are current.</small></div></div>
      <div class="section-label">SIGN-IN METHODS</div>
      <div class="form-group">
        {form_row('Passphrase','Last changed 32 days ago','Change')}
        {form_row('Passkeys','2 passkeys enrolled','Manage')}
        {form_row('Recovery codes','8 unused codes','View')}
      </div>
      <div class="section-label">TRUSTED DEVICES</div>
      <div class="form-group">
        {form_row('This iPhone','Cedar Rapids · active now',toggle(True))}
        {form_row('Mac mini','Home network · 18 minutes ago',icon('chevron-right',18))}
      </div>
      <div class="form-group">{form_row('Sign out other devices','Requires your passphrase',icon('chevron-right',18),True)}</div>
    </div>'''
    return shell(body, back='Settings', nav_title='Security')


def screen_home() -> str:
    body=f'''<div class="scroll pad">
      {large_header('Welcome to the kitchen, Callum.','Keep the recipes you actually cook, plan the week around them, and share one calm kitchen notebook.','BÒRD · THE SHARED COOKBOOK')}
      <section class="tonight-card card">
        <div class="tonight-top"><div><div class="section-kicker">UP NEXT · TUESDAY</div><strong>Turkey Taco Rice Bowls</strong><small>{icon('clock',14)} 30 min · dinner</small></div><img src="../../assets/turkey.jpg" alt=""/></div>
        <div class="tonight-actions"><button class="primary">View meal</button><button class="icon-button">{icon('ellipsis',19)}</button></div>
      </section>
      <div class="section-head"><h2>Quick actions</h2></div>
      <div class="quick-grid">
        <div class="quick-card"><div>{icon('plus',20)}</div><strong>Add recipe</strong><small>Paste, scan, or create</small></div>
        <div class="quick-card"><div>{icon('calendar',20)}</div><strong>Plan week</strong><small>Build from favorites</small></div>
        <div class="quick-card"><div>{icon('scan',20)}</div><strong>Scan pantry</strong><small>Update what is on hand</small></div>
      </div>
      <div class="section-head"><h2>Recent recipes</h2><span>See all</span></div>
      <div class="horizontal-recipes">
        {recipe_thumb('potato.jpg','Baked Potato Broccoli Cheddar Supper','45 min · dinner','VEGETARIAN')}
        {recipe_thumb('tuna.jpg','Mediterranean Tuna White Bean Salad','12 min · lunch','NO-COOK')}
      </div>
    </div>'''
    return shell(body, active_tab='home', assistant=True, avatar=True)


def screen_recipes() -> str:
    body=f'''<div class="scroll pad">
      {large_header('Recipes','21 recipes ready for the kitchen.','THE SHARED COOKBOOK',compact=True)}
      <div class="search-row glass-inline"><div class="search-field">{icon('search',18)}<span>Search recipes or ingredients</span></div>{glass_button(icon('sliders',19),'small-glass')}</div>
      <div class="chip-row"><span class="chip active">All</span><span class="chip">Favorites</span><span class="chip">Recently cooked</span></div>
      <div class="recipe-grid">
        {recipe_grid_card('potato.jpg','Baked Potato Broccoli Cheddar Supper','45 min','VEGETARIAN')}
        {recipe_grid_card('tuna.jpg','Mediterranean Tuna White Bean Salad','12 min','NO-COOK')}
        {recipe_grid_card('beef.jpg','Ginger Beef Broccoli Stir-Fry','30 min','HIGH-PROTEIN')}
        {recipe_grid_card('wraps.jpg','Hummus Rainbow Wraps','20 min','VEGETARIAN')}
      </div>
    </div><div class="floating-add">{icon('plus',22)}</div>'''
    return shell(body, active_tab='recipes', assistant=True, avatar=True)


def screen_collections() -> str:
    collection=lambda name, sub, imgs: f'''<div class="collection-card card"><div class="stacked-images">{''.join(f'<img src="../../assets/{i}" alt=""/>' for i in imgs)}</div><div class="collection-copy"><strong>{name}</strong><small>{sub}</small></div>{icon('chevron-right',18)}</div>'''
    body=f'''<div class="scroll pad">
      {large_header('Collections','Curated shelves for recipes that belong together.','RECIPEBOOK',compact=True)}
      <div class="section-head tight"><h2>Your shelves</h2><button class="text-button">Edit</button></div>
      {collection('Weeknight winners','8 recipes · updated yesterday',['beef.jpg','tuna.jpg','potato.jpg'])}
      {collection('Sunday suppers','6 recipes · shared with household',['potato.jpg','turkey.jpg','wraps.jpg'])}
      {collection('Scottish comfort food','4 recipes · personal collection',['potato.jpg','beef.jpg','tuna.jpg'])}
      <button class="secondary full create-bottom">{icon('plus',18)} New collection</button>
    </div>'''
    return shell(body, back='Recipes', nav_title='Collections', active_tab='recipes')


def screen_tags() -> str:
    rows=[]
    data=[('budget-friendly','7 recipes','#7A8F4E'),('freezer-friendly','5 recipes','#5E7C6C'),('high-protein','6 recipes','#B45936'),('one-pan','4 recipes','#C69742'),('vegetarian','9 recipes','#6A8E49')]
    for name,count,color in data:
        rows.append(f'''<div class="tag-row"><span class="tag-color" style="background:{color}"></span><div><strong>{name}</strong><small>{count}</small></div>{icon('chevron-right',18)}</div>''')
    body=f'''<div class="scroll pad">
      {large_header('Tags','A shared name and color make the cookbook easier to scan.','HOUSEHOLD ORGANIZATION',compact=True)}
      <div class="search-row"><div class="search-field">{icon('search',18)}<span>Search tags</span></div><button class="primary square">{icon('plus',21)}</button></div>
      <div class="form-group tag-list">{''.join(rows)}</div>
      <div class="tip-card"><div class="settings-icon sage">{icon('tag',18)}</div><div><strong>Tags stay flexible</strong><small>Renaming or merging keeps the recipes already using a tag.</small></div></div>
    </div>'''
    return shell(body, back='Recipes', nav_title='Tags', active_tab='recipes')


def screen_import() -> str:
    chooser=lambda ic,title,sub,tint='sage':f'''<div class="import-choice card"><div class="settings-icon {tint}">{icon(ic,22)}</div><div><strong>{title}</strong><small>{sub}</small></div>{icon('chevron-right',18)}</div>'''
    body=f'''<div class="scroll pad">
      {large_header('Import a recipe','Choose a source. You will review an editable draft before anything is saved.','ADD TO YOUR RECIPEBOOK',compact=True)}
      <div class="stepper"><span class="done">1</span><i></i><span>2</span><i></i><span>3</span><div class="step-labels"><b>Choose</b><b>Review</b><b>Save</b></div></div>
      {chooser('camera','Take photos','Capture one or more recipe pages')}
      {chooser('image','Choose from Photos','Use images already on this iPhone')}
      {chooser('file','Choose a document','Import a PDF or scanned file','blue')}
      <div class="url-card card"><div class="settings-icon terracotta">{icon('link',20)}</div><div class="url-copy"><strong>Import from a link</strong><div class="inline-field"><span>Paste recipe URL</span><button>Import</button></div></div></div>
      <div class="privacy-note">{icon('lock',15)} Files are prepared locally before AI extraction and are not added until you confirm the draft.</div>
    </div>'''
    return shell(body, back='Recipes', nav_title='Import', active_tab='recipes')


def screen_capture() -> str:
    body=f'''<div class="scroll pad capture-screen">
      {large_header('Turn your notes into a recipe.','Describe what you want or paste a complete recipe. Bòrd will organize it into an editable draft.','PASTE OR DESCRIBE',compact=True)}
      <div class="segmented"><span class="active">Describe</span><span>Paste</span><span>From URL</span></div>
      <div class="composer-card card">
        <div class="composer-label">Recipe text or request</div>
        <div class="composer-placeholder">Create a quick lemon pasta for four with spinach, garlic, and ingredients I probably already have...</div>
        <div class="prompt-chips"><span>Use pantry first</span><span>30 minutes</span><span>High protein</span></div>
      </div>
      <div class="capture-tip"><div class="settings-icon sage">{icon('sparkles',18)}</div><div><strong>You stay in control</strong><small>Review the title, ingredients, method, tags, and nutrition before saving.</small></div></div>
    </div>
    <div class="bottom-compose glass-bar"><button class="icon-button">{icon('plus',20)}</button><button class="icon-button">{icon('mic',20)}</button><button class="primary grow">Create draft {icon('sparkles',17)}</button></div>'''
    return shell(body, back='Recipes', nav_title='Capture', active_tab='recipes')


def screen_new_recipe() -> str:
    right='<button class="nav-text primary-text">Save</button>'
    body=f'''<div class="scroll pad form-screen">
      {large_header('New recipe','Add the details you use at the stove. You can refine anything later.','A RECIPE WORTH KEEPING',compact=True)}
      <div class="photo-placeholder card">{icon('camera',25)}<strong>Add a cover photo</strong><small>Optional · helps the library scan faster</small></div>
      <div class="section-label">RECIPE CARD</div><div class="form-group fields-group">
        {field('Recipe name', placeholder='e.g. Sunday tomato soup')}
        {field('Short note', placeholder='Why it belongs in your cookbook')}
        <div class="two-fields">{field('Serves',value='4')}{field('Prep time',value='15 min')}</div>
        <div class="two-fields">{field('Cook time',value='30 min')}{field('Meal',value='Dinner',trailing=icon('chevron-down',16))}</div>
      </div>
      <div class="section-label">INGREDIENTS</div><div class="form-group ingredient-preview"><div><strong>Start with your first ingredient</strong><small>Quantity, unit, ingredient, and notes.</small></div><button class="secondary small">{icon('plus',16)} Add</button></div>
    </div><div class="bottom-save glass-bar"><button class="secondary grow">Save draft</button><button class="primary grow">Save recipe</button></div>'''
    return shell(body, back='Cancel', nav_title='New recipe', right=right)


def screen_recipe_detail() -> str:
    right=glass_button(icon('heart',20),'nav-circle light-glass')+glass_button(icon('ellipsis',21),'nav-circle light-glass')
    body=f'''<div class="scroll recipe-detail-scroll">
      <div class="recipe-hero"><img src="../../assets/potato_hero.jpg" alt=""/><div class="hero-shade"></div></div>
      <div class="recipe-detail-body">
        {eyebrow('HOUSE RECIPE')}
        <h1>Baked Potato Broccoli Cheddar Supper</h1>
        <p>Split baked potatoes topped with broccoli, cheddar, and Greek yogurt.</p>
        <div class="meta-row"><span>{icon('clock',15)} 45 min</span><span>{icon('users',15)} Serves 4</span><span>{icon('utensils',15)} Dinner</span></div>
        <button class="primary full big">{icon('utensils',19)} Start cooking</button>
        <div class="action-grid"><button>{icon('calendar',18)} Add to plan</button><button>{icon('list',18)} Add to list</button><button>{icon('bookmark',18)} Save</button></div>
        <div class="section-head tight"><h2>Ingredients</h2><span>4 servings</span></div>
        <div class="ingredient-list"><div><b>4</b><span>large russet potatoes</span></div><div><b>2 cups</b><span>broccoli florets</span></div><div><b>1 cup</b><span>shredded cheddar</span></div></div>
      </div>
    </div>'''
    return shell(body, back='Recipes', nav_title=None, right=right, overlay=True, light=True, nav='brand')


def screen_recipe_edit() -> str:
    right='<button class="nav-text primary-text">Save</button>'
    body=f'''<div class="scroll pad form-screen">
      {large_header('Edit recipe','Saving keeps the previous version in revision history.','REVISION 2',compact=True)}
      <div class="edit-photo-row card"><img src="../../assets/potato.jpg" alt=""/><div><strong>Baked Potato Broccoli Cheddar Supper</strong><button class="text-button">Change photo</button></div></div>
      <div class="section-label">RECIPE CARD</div><div class="form-group fields-group">
        {field('Recipe name',value='Baked Potato Broccoli Cheddar Supper')}
        {field('Short note',value='Split baked potatoes with broccoli and cheddar.')}
        <div class="two-fields">{field('Serves',value='4')}{field('Prep',value='10 min')}</div>
        <div class="two-fields">{field('Cook',value='35 min')}{field('Meal',value='Dinner',trailing=icon('chevron-down',16))}</div>
      </div>
      <div class="section-label">ORGANIZATION</div><div class="form-group">{form_row('Categories','Dinner · Vegetarian',icon('chevron-right',18))}{form_row('Tags','budget-friendly · high-protein',icon('chevron-right',18))}</div>
      <div class="section-label">INGREDIENTS</div><div class="form-group ingredient-rows"><div><b>4</b><span>large russet potatoes</span>{icon('chevrons',17)}</div><div><b>2 cups</b><span>broccoli florets</span>{icon('chevrons',17)}</div></div>
    </div><div class="bottom-save glass-bar"><button class="secondary grow">Preview</button><button class="primary grow">Save changes</button></div>'''
    return shell(body, back='Recipe', nav_title='Edit', right=right)


def screen_recipe_cook() -> str:
    body=f'''<div class="scroll cook-screen">
      <div class="cook-head"><div class="cook-kicker">STEP 1 OF 4 · BAKE</div><h1>Baked Potato Broccoli Cheddar Supper</h1><div class="servings-control"><span>Cook for</span><button>−</button><strong>2</strong><button>+</button><span>servings</span></div></div>
      <div class="cook-progress"><i class="active"></i><i></i><i></i><i></i></div>
      <section class="step-card"><div class="step-number">1</div><div class="step-copy"><div class="section-kicker">BAKE</div><h2>Heat the oven to 425°F.</h2><p>Pierce the potatoes and microwave for 5 minutes, then transfer them to the oven.</p></div></section>
      <div class="cook-tools"><div>{icon('target',19)} Pantry check <b>Unknown</b></div><div>{icon('clock',19)} Suggested timer <b>35 min</b></div></div>
      <div class="cook-next"><span>Up next</span><strong>Prepare the broccoli and cheddar topping.</strong></div>
    </div>
    <div class="cook-bar glass-bar dark-glass"><button class="icon-button">{icon('back',21)}</button><button class="timer-button">{icon('clock',18)} Start timer</button><button class="primary">Next step {icon('chevron-right',17)}</button></div>'''
    return shell(body, back='Recipe', nav_title='Cook mode', light=True, body_class='dark-content')


def screen_pantry() -> str:
    item=lambda emoji,name,meta,badge: f'''<div class="pantry-item"><div class="food-icon">{emoji}</div><div><strong>{name}</strong><small>{meta}</small></div><span class="stock-badge">{badge}</span>{icon('chevron-right',17)}</div>'''
    body=f'''<div class="scroll pad">
      {large_header('Pantry','Know what is on hand, what needs using, and where every batch lives.','HOUSEHOLD INVENTORY',compact=True)}
      <div class="stats-strip"><div><strong>34</strong><span>items</span></div><div><strong>5</strong><span>expiring</span></div><div><strong>3</strong><span>low stock</span></div></div>
      <div class="search-row"><div class="search-field">{icon('search',18)}<span>Search products</span></div><button class="secondary square">{icon('sliders',19)}</button></div>
      <div class="chip-row"><span class="chip active">All</span><span class="chip">Pantry</span><span class="chip">Fridge</span><span class="chip">Freezer</span></div>
      <div class="section-head tight"><h2>Use soon</h2><span>See all</span></div>
      <div class="form-group pantry-list">{item('🥬','Baby spinach','Fridge · expires tomorrow','½ bag')}{item('🥛','Whole milk','Fridge · expires in 2 days','1.2 L')}{item('🥚','Large eggs','Fridge · best before Aug 4','7 left')}</div>
      <div class="section-head tight"><h2>Recently updated</h2></div>
      <div class="form-group pantry-list">{item('🍚','Jasmine rice','Pantry · opened','1.8 kg')}{item('🫘','Black beans','Pantry · 3 cans','3')}</div>
    </div><div class="floating-add wide">{icon('plus',20)} Add item</div>'''
    return shell(body, active_tab='pantry', assistant=True, avatar=True)


def screen_planner() -> str:
    meal=lambda label,img,title,meta: f'''<div class="meal-row card"><div class="meal-label"><div class="meal-icon">{icon('utensils',19)}</div><span>{label}</span></div><img src="../../assets/{img}" alt=""/><div class="meal-copy"><strong>{title}</strong><small>{meta}</small></div>{icon('ellipsis',18)}</div>'''
    body=f'''<div class="scroll pad planner-screen">
      {large_header('Meal plan','A focused day view keeps the weekly plan easy to scan.','MEAL PLANNER',compact=True)}
      <div class="date-strip"><div><b>MON</b><span>27</span></div><div class="active"><b>TUE</b><span>28</span></div><div><b>WED</b><span>29</span></div><div><b>THU</b><span>30</span></div><div><b>FRI</b><span>31</span></div></div>
      <div class="planner-summary"><div><strong>Tuesday, July 28</strong><small>3 meals · about 1,860 kcal</small></div><button class="icon-button">{icon('ellipsis',18)}</button></div>
      {meal('Breakfast','spinach_mushroom.jpg','Spinach Mushroom Scramble','20 min · serves 2')}
      {meal('Lunch','pita_pockets.jpg','Chickpea Greek Pita Pockets','15 min · serves 2')}
      {meal('Dinner','turkey.jpg','Turkey Taco Rice Bowls','30 min · serves 2')}
    </div><div class="planner-bar glass-bar"><button class="secondary">{icon('plus',18)} Add meal</button><button class="primary grow">{icon('sparkles',18)} Generate plan</button></div>'''
    return shell(body, active_tab='planner', assistant=True, avatar=True)


def screen_nutrition() -> str:
    ring=lambda val,label,sub,color: f'''<div class="metric-ring" style="--p:{val};--ring:{color}"><div><strong>{label}</strong><small>{sub}</small></div></div>'''
    body=f'''<div class="scroll pad nutrition-screen">
      {large_header('Nutrition','Confirmed intake and planned portions stay separate.','CALLUM',compact=True)}
      <div class="profile-date-row"><div>{icon('users',17)} Callum {icon('chevron-down',15)}</div><div>{icon('calendar',17)} Jul 28</div></div>
      <section class="nutrition-card card"><div class="section-head tight"><h2>Today</h2><span>View diary</span></div><div class="rings-row">{ring(82,'1,840','of 2,250 kcal','#B55333')}{ring(74,'112 g','protein','#58713B')}{ring(80,'24 g','fiber','#3C7174')}</div><div class="macro-bars"><div><span>Carbs</span><i><b style="width:76%"></b></i><em>182 / 240 g</em></div><div><span>Fat</span><i><b style="width:63%"></b></i><em>54 / 85 g</em></div></div></section>
      <div class="section-head tight"><h2>Meals</h2><button class="primary small">{icon('plus',16)} Record</button></div>
      <div class="form-group meal-log">{form_row('Breakfast','Spinach mushroom scramble · 410 kcal','8:12 AM')}{form_row('Lunch','Chickpea pita pockets · 520 kcal','12:34 PM')}{form_row('Dinner','Planned · Turkey taco rice bowls','680 kcal')}</div>
      <div class="insight-card"><div class="settings-icon sage">{icon('target',19)}</div><div><strong>Protein is on pace</strong><small>You are 38 g from today’s target. Dinner covers about 30 g.</small></div></div>
    </div>'''
    return shell(body, back='Home', nav_title='Nutrition')


def screen_lists() -> str:
    listcard=lambda title,sub,progress,items,status: f'''<div class="shopping-card card"><div class="list-ring" style="--progress:{progress}"><span>{progress}%</span></div><div class="shopping-copy"><strong>{title}</strong><small>{sub}</small><div class="list-meta"><span>{items} items</span><span>{status}</span></div></div>{icon('chevron-right',18)}</div>'''
    body=f'''<div class="scroll pad">
      {large_header('Shopping lists','Planner-generated lists stay editable, and protected changes remain yours.','FROM THE PLAN TO THE PANTRY',compact=True)}
      <button class="primary full big">{icon('plus',19)} New shopping list</button>
      <div class="chip-row list-scopes"><span class="chip active">Active</span><span class="chip">Planned</span><span class="chip">Completed</span></div>
      <div class="section-head tight"><h2>Active lists</h2><span>2 lists</span></div>
      {listcard('Pantry shortages','Updated today',0,80,'Needs review')}
      {listcard('Weekend shop','Saturday morning',35,18,'6 in cart')}
      <div class="section-head tight"><h2>Planned</h2></div>
      {listcard('Meal plan · Aug 3–9','Generates Friday at 6 PM',0,0,'Scheduled')}
    </div>'''
    return shell(body, active_tab='lists', assistant=True, avatar=True)


def screen_list_detail() -> str:
    item=lambda iconchar,name,meta,qty: f'''<div class="shopping-item"><div class="check-circle"></div><div class="food-icon neutral">{iconchar}</div><div><strong>{name}</strong><small>{meta}</small></div><span class="qty">{qty}</span><button class="cart-mini">{icon('cart',18)}</button></div>'''
    body=f'''<div class="scroll pad list-detail-screen">
      {large_header('Pantry shortages','80 of 80 remaining · generated from current pantry demand.','SHOPPING LIST',compact=True)}
      <div class="progress-card card"><div class="large-ring" style="--progress:0"><span>0%</span></div><div><strong>Nothing checked off yet</strong><small>Tap an item, swipe for alternatives, or use Scan mode in store.</small></div></div>
      <div class="search-row"><div class="search-field">{icon('search',18)}<span>Search items</span></div><button class="terracotta-button">{icon('scan',18)} Scan</button></div>
      <div class="segmented compact"><span class="active">To buy <b>80</b></span><span>In cart <b>0</b></span><span>Can’t find <b>0</b></span></div>
      <div class="section-head tight"><h2>Fresh produce</h2><span>12</span></div>
      <div class="form-group shopping-items">{item('🥬','Celery','1 stalk · recipe demand','1')}{item('🍅','Cherry tomatoes','2.5 cups · meal plan','2 pints')}{item('🥑','Avocados','Turkey taco bowls','3')}</div>
      <div class="section-head tight"><h2>Dairy & eggs</h2><span>8</span></div>
      <div class="form-group shopping-items">{item('🧀','Cheddar cheese','Shredded','12 oz')}</div>
    </div><div class="shopping-bar glass-bar"><div><b>0</b><span>in cart</span></div><div><b>0</b><span>can’t find</span></div><button class="primary grow">{icon('check',18)} Done shopping</button></div>'''
    return shell(body, back='Lists', nav_title='Pantry shortages', right=glass_button(icon('ellipsis',20),'nav-circle'))


def screen_assistant() -> str:
    body=f'''<div class="assistant-screen">
      <div class="assistant-context"><span class="chip">Use pantry first</span><span class="chip">Tonight’s dinner</span><span class="chip">Plan next week</span></div>
      <div class="chat-spacer"></div>
      <div class="assistant-bubble"><div class="assistant-mark">{icon('sparkles',18)}</div><div><strong>What can I help with?</strong><p>Ask about recipes or nutrition, prepare an update, or generate a meal plan. You will review every change before it is saved.</p></div></div>
      <div class="assistant-suggestion"><span>Try asking</span><strong>“Use what expires soon and plan three dinners.”</strong></div>
      <div class="assistant-composer glass-bar"><button class="icon-button">{icon('plus',19)}</button><div class="assistant-input">Ask about your kitchen...</div><button class="send-button">{icon('send',19)}</button></div>
    </div>'''
    return shell(body, nav_title='Kitchen assistant', right=glass_button(icon('plus',20),'nav-circle')+glass_button(icon('back',20),'nav-circle'), nav='brand')


def screen_offline() -> str:
    body=f'''<div class="offline-bg"><section class="offline-card"><div class="offline-icon">{icon('cloud',26)}</div>{eyebrow('OFFLINE READING')}<h1>The kitchen is out of reach for a moment.</h1><p>Previously opened recipes remain available. Changes, new recipes, plans, and lists wait for the household network.</p><div class="downloaded-status">{icon('download',16)} 12 recipes available offline</div><button class="primary full">Try again</button></section></div>'''
    return shell(body, nav='none')


def screen_settings() -> str:
    body=f'''<div class="scroll pad settings-screen">
      {large_header('Settings','Manage shared household behavior and profile-specific preferences.','YOUR KITCHEN, YOUR WAY',compact=True)}
      <div class="profile-card card"><div class="avatar large">C</div><div><strong>Callum</strong><small>Admin · American/Chicago</small></div>{icon('chevron-right',18)}</div>
      <div class="section-label">HOUSEHOLD</div><div class="form-group">
        {settings_row('users','Profiles & roles','People, units, goals, and permissions')}
        {settings_row('book','Recipebook','Library defaults and new recipes')}
        {settings_row('calendar','Meal plan','Week, meals, and generation defaults')}
        {settings_row('list','Shopping lists','Stores, completion, and aisle order')}
        {settings_row('package','Pantry','Stock view, grouping, and reminders')}
        {settings_row('target','Nutrition','Profile-specific goals and inputs')}
      </div>
      <div class="section-label">APP & SECURITY</div><div class="form-group">
        {settings_row('sparkles','AI assistant','Models, privacy, and summaries')}
        {settings_row('settings','System','Identity, appearance, and recovery')}
        {settings_row('cloud','Backups','Automatic and manual backups')}
        {settings_row('key','API & integrations','Scoped keys and trusted systems')}
      </div>
    </div>'''
    return shell(body, back='Home', nav_title='Settings')


def screen_settings_profiles() -> str:
    body=f'''<div class="scroll pad settings-screen">
      {large_header('Profiles & roles','Make the app feel right for each person.','PROFILE SETTINGS',compact=True)}
      <div class="profile-detail card"><div class="profile-heading"><div class="avatar large">C</div><div><div class="section-kicker">ACTIVE PROFILE</div><strong>Callum</strong><small>Only active admin</small></div><button class="text-button">Edit</button></div>
        {field('Display name',value='Callum')}
        <div class="two-fields">{field('Role',value='Admin',trailing=icon('chevron-down',16))}{field('Color',value='Teal')}</div>
        {field('Time zone',value='America/Chicago',trailing=icon('chevron-down',16))}
      </div>
      <div class="section-head tight"><h2>Household members</h2><button class="primary small">{icon('plus',16)} Add</button></div>
      <div class="form-group">{form_row('Julia','Member · Nutrition profile active','J')}{form_row('Guest cook','Limited recipe access','G')}</div>
      <div class="section-label">PROFILE PREFERENCES</div><div class="form-group">{form_row('Units','US customary',icon('chevron-right',18))}{form_row('Temperature','Fahrenheit',icon('chevron-right',18))}{form_row('Diet preferences','3 selected',icon('chevron-right',18))}</div>
    </div>'''
    return shell(body, back='Settings', nav_title='Profiles')


def generic_settings_page(title: str, eyebrow_text: str, subtitle: str, groups: str) -> str:
    body=f'''<div class="scroll pad settings-screen">{large_header(title,subtitle,eyebrow_text,compact=True)}{groups}</div>'''
    return shell(body, back='Settings', nav_title=title)


def screen_settings_recipes() -> str:
    groups=f'''<div class="section-label">LIBRARY DEFAULTS</div><div class="form-group">
      {form_row('Default library order','Recently updated','Recently updated  '+icon('chevron-right',16))}
      {form_row('Default recipe view','Cards','Cards  '+icon('chevron-right',16))}
    </div><div class="section-label">NEW RECIPES</div><div class="form-group">
      {form_row('Default servings','Used when a recipe is created','4  '+icon('chevrons',16))}
      {form_row('Calculate nutrition','After ingredients are normalized',toggle(True))}
      {form_row('Offer generated cover images','Always requires confirmation',toggle(True))}
      {form_row('Open editor after import','Review before saving',toggle(True))}
    </div><div class="section-label">COOK MODE</div><div class="form-group">{form_row('Keep screen awake','While a cooking step is open',toggle(True))}{form_row('Haptic step confirmations','Subtle feedback on Next',toggle(True))}</div>'''
    return generic_settings_page('Recipe settings','RECIPEBOOK','Set up the cookbook for everyday use.',groups)


def screen_settings_meal_plan() -> str:
    meals=''.join(f'<span class="meal-toggle selected">{icon("check",14)} {m}</span>' for m in ['Breakfast','Lunch','Dinner'])+'<span class="meal-toggle">Snacks</span>'
    groups=f'''<div class="section-label">PLANNER DEFAULTS</div><div class="form-group">{form_row('Week starts on','Monday','Monday  '+icon('chevron-right',16))}{form_row('Planning window','7 days','7 days  '+icon('chevron-right',16))}{form_row('Show nutrition preview','Calories and protein beneath each day',toggle(True))}</div>
    <div class="section-label">MEALS SHOWN</div><div class="form-group"><div class="form-row column"><div><strong>Visible meals</strong><small>These appear when building a plan.</small></div><div class="meal-toggle-grid">{meals}</div></div></div>
    <div class="section-label">GENERATION</div><div class="form-group">{form_row('Use pantry availability','Prefer ingredients already on hand',toggle(True))}{form_row('Protect manual changes','Regeneration keeps edits',toggle(True))}{form_row('Default servings','2 people','2  '+icon('chevrons',16))}</div>'''
    return generic_settings_page('Meal plan settings','PLANNING DEFAULTS','Start every plan with the right shape.',groups)


def screen_settings_lists() -> str:
    aisle_rows=''.join(f'<div class="reorder-row"><span>{i}</span><b>{name}</b>{icon("chevrons",16)}</div>' for i,name in enumerate(['Fresh produce','Bakery','Meat & seafood','Dairy & eggs'],1))
    groups=f'''<div class="section-label">GENERAL</div><div class="form-group">{form_row('Default supermarket','General grocery store','General grocery store  '+icon('chevron-right',16))}{form_row('Completed items','Move to Completed section','Move  '+icon('chevron-right',16))}{form_row('Open pantry intake','Record purchased quantities',toggle(True))}{form_row('Keep list open after shopping','Until manually completed',toggle(False))}</div>
    <div class="section-label">SUPERMARKET AISLES</div><div class="form-group aisle-list">{aisle_rows}<div class="add-row">{icon('plus',16)} Add aisle</div></div>'''
    return generic_settings_page('List settings','SHOPPING, IN YOUR ORDER','Choose how lists behave and match the store you walk.',groups)


def screen_settings_pantry() -> str:
    groups=f'''<div class="section-label">STOCK DISPLAY</div><div class="form-group">{form_row('Initial pantry view','All stock','All stock  '+icon('chevron-right',16))}{form_row('Default sort','Expiry first','Expiry first  '+icon('chevron-right',16))}{form_row('Default grouping','Location','Location  '+icon('chevron-right',16))}</div>
    <div class="section-label">REMINDERS</div><div class="form-group">{form_row('Expiry reminders','Alert two days before',toggle(True))}{form_row('Low-stock reminders','For items with thresholds',toggle(True))}{form_row('Opened-item tracking','Show opened date and shelf life',toggle(True))}</div>
    <div class="section-label">QUICK ADD</div><div class="form-group">{form_row('Default location','Pantry','Pantry  '+icon('chevron-right',16))}{form_row('Scan confirms immediately','Review item before saving',toggle(False))}</div>'''
    return generic_settings_page('Pantry settings','PANTRY DEFAULTS','Open Pantry on the stock that matters.',groups)


def screen_settings_nutrition() -> str:
    groups=f'''<div class="profile-card card compact-profile"><div class="avatar">C</div><div><strong>Callum</strong><small>Active nutrition profile</small></div>{icon('chevron-right',18)}</div>
    <div class="section-label">GOALS</div><div class="form-group">{form_row('Daily energy target','2,250 kcal','2,250  '+icon('chevrons',16))}{form_row('Protein target','150 g','150 g  '+icon('chevrons',16))}{form_row('Fiber target','30 g','30 g  '+icon('chevrons',16))}{form_row('Goal direction','Gradual weight loss','Weight loss  '+icon('chevron-right',16))}</div>
    <div class="section-label">OPTIONAL INPUTS</div><div class="form-group">{form_row('Body measurements','Used only for personalized estimates',toggle(True))}{form_row('Activity level','Sedentary','Sedentary  '+icon('chevron-right',16))}{form_row('Pregnancy or breastfeeding','Not enabled',toggle(False))}</div>
    <div class="privacy-note card">{icon('lock',16)} Personal body inputs are profile-specific and never inferred from recipes or diary activity.</div>'''
    return generic_settings_page('Nutrition settings','PROFILE NUTRITION','Set goals and optional inputs for this profile.',groups)


def screen_settings_ai() -> str:
    groups=f'''<div class="section-label">MODEL & PRIVACY</div><div class="form-group">{form_row('Assistant model','Balanced','Balanced  '+icon('chevron-right',16))}{form_row('Offer recipe cover images','Only after explicit confirmation',toggle(True))}{form_row('Use household summaries','Share high-level context with assistant',toggle(True))}</div>
    <div class="section-label">ASSISTANT PERMISSIONS</div><div class="form-group">{form_row('Read recipes','Titles, ingredients, and methods',toggle(True))}{form_row('Read pantry','Current stock and expiry dates',toggle(True))}{form_row('Read meal plan','Planned meals and protected changes',toggle(True))}{form_row('Read nutrition','Profile summaries only',toggle(False))}{form_row('Prepare changes','Always requires review before saving',toggle(True))}</div>
    <div class="section-label">SUMMARIES</div><div class="form-group">{form_row('Weekly household summary','Sunday at 6 PM',toggle(True))}{form_row('Include nutrition','Profile owners only',toggle(False))}</div>'''
    return generic_settings_page('AI settings','KITCHEN ASSISTANT','Control what the assistant uses and what it may prepare.',groups)


def screen_settings_system() -> str:
    icons=''.join(f'<div class="app-icon-choice {"selected" if i==0 else ""}">{brand(compact=True)}</div>' for i in range(4))
    groups=f'''<div class="section-label">KITCHEN IDENTITY</div><div class="form-group fields-group">{field('Kitchen name',value='Bòrd')}{field('Kitchen subtitle',value='The shared cookbook')}</div>
    <div class="section-label">APP ICON</div><div class="form-group"><div class="app-icon-grid">{icons}</div></div>
    <div class="section-label">APPEARANCE</div><div class="form-group">{form_row('Theme','Follow system','System  '+icon('chevron-right',16))}{form_row('Accent color','Forest green','Forest  '+icon('chevron-right',16))}{form_row('Reduce decorative motion','Uses system accessibility setting',toggle(False))}</div>
    <div class="section-label">RECOVERY</div><div class="form-group">{form_row('Local recovery codes','8 unused',icon('chevron-right',18))}{form_row('Reset kitchen data','Requires admin confirmation',icon('chevron-right',18),True)}</div>'''
    return generic_settings_page('System settings','SYSTEM','Your kitchen, backed by Bòrd.',groups)


def screen_settings_backups() -> str:
    groups=f'''<div class="backup-status card"><div class="cloud-ring">{icon('cloud',26)}</div><div><div class="section-kicker">BACKUP HEALTH</div><strong>Protected</strong><small>Last successful backup today at 3:14 AM.</small></div><span class="status-pill">Current</span></div>
    <div class="section-label">AUTOMATIC BACKUPS</div><div class="form-group">{form_row('Automatic backups','Daily when on Wi-Fi and power',toggle(True))}{form_row('Backup destination','iCloud Drive','iCloud Drive  '+icon('chevron-right',16))}{form_row('Include recipe images','Adds about 184 MB',toggle(True))}</div>
    <div class="section-label">MANUAL ACTIONS</div><div class="form-group">{form_row('Back up now','Creates a new encrypted snapshot',icon('upload',18))}{form_row('Export backup','Save a portable archive',icon('download',18))}{form_row('Restore from backup','Review before replacing data',icon('chevron-right',18))}</div>
    <div class="privacy-note">{icon('lock',15)} Backups are encrypted before leaving this device.</div>'''
    return generic_settings_page('Backups','DATA PROTECTION','Keep the household cookbook recoverable.',groups)


def screen_settings_api() -> str:
    groups=f'''<div class="security-summary card"><div class="status-icon good">{icon('shield',24)}</div><div><strong>Integration boundary is healthy</strong><small>Keys are scoped, read-only by default, and can be revoked instantly.</small></div></div>
    <div class="section-head tight"><h2>API keys</h2><button class="primary small">{icon('plus',16)} Create</button></div>
    <div class="form-group">{form_row('Kitchen dashboard','Read pantry · expires in 90 days','•••• 8K2F')}{form_row('Home Assistant','Read lists · no expiry','•••• 14QP')}</div>
    <div class="section-label">TRUSTED INTEGRATIONS</div><div class="form-group">{settings_row('book','Open Food Facts','Product lookup · connected','Connected')}{settings_row('target','USDA FoodData Central','Nutrition lookup · connected','Connected')}{settings_row('cloud','Webhook relay','No active endpoint','Set up','blue')}</div>
    <div class="section-label">SECURITY</div><div class="form-group">{form_row('Require passphrase to create keys','Admin-only action',toggle(True))}{form_row('Audit log','12 events in the last 30 days',icon('chevron-right',18))}</div>'''
    return generic_settings_page('API & integrations','API & SECURITY','Private integrations, with an explicit boundary.',groups)


def build_screen(screen_id: str) -> str:
    key=screen_id.split('-',1)[1]
    return {
        'sign-in': lambda: auth_screen('sign-in'),
        'forgot-password': lambda: auth_screen('forgot'),
        'reset-password': lambda: auth_screen('reset'),
        'account-security': screen_account_security,
        'home': screen_home,
        'recipes': screen_recipes,
        'collections': screen_collections,
        'tags': screen_tags,
        'import': screen_import,
        'capture': screen_capture,
        'recipes-new': screen_new_recipe,
        'recipe-detail': screen_recipe_detail,
        'recipe-edit': screen_recipe_edit,
        'recipe-cook': screen_recipe_cook,
        'pantry': screen_pantry,
        'planner': screen_planner,
        'nutrition': screen_nutrition,
        'lists': screen_lists,
        'list-detail': screen_list_detail,
        'kitchen-assistant': screen_assistant,
        'offline': screen_offline,
        'settings': screen_settings,
        'settings-profiles': screen_settings_profiles,
        'settings-recipes': screen_settings_recipes,
        'settings-meal-plan': screen_settings_meal_plan,
        'settings-lists': screen_settings_lists,
        'settings-pantry': screen_settings_pantry,
        'settings-nutrition': screen_settings_nutrition,
        'settings-ai': screen_settings_ai,
        'settings-system': screen_settings_system,
        'settings-backups': screen_settings_backups,
        'settings-api': screen_settings_api,
    }[key]()


CSS = r'''
@font-face{font-family:EBG;src:local("EB Garamond");font-weight:400 800}
@font-face{font-family:Inter;src:local("Inter");font-weight:100 900}
:root{
 --bg:#F7F3EB;--surface:#FFFDF8;--surface2:#ECE8DD;--ink:#203128;--muted:#6D716A;
 --line:#D8CFBF;--sage:#DFE8D4;--sage-2:#CBD9B8;--olive:#5B7139;--terracotta:#B55131;
 --terracotta2:#C98570;--teal:#3E7477;--blue:#DCE7EA;--shadow:0 12px 30px rgba(63,49,31,.08);
}
*{box-sizing:border-box}
html,body{margin:0;width:393px;height:852px;overflow:hidden;background:#ddd}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
button,input{font:inherit;color:inherit}
.phone{position:relative;width:393px;height:852px;overflow:hidden;background:var(--bg);background-image:radial-gradient(circle at 15% 0%,rgba(227,236,214,.55),transparent 34%),linear-gradient(180deg,rgba(255,255,255,.18),transparent 35%)}
.dark-phone{background:#203427}
.status-bar{position:absolute;inset:0 0 auto 0;height:47px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:13px;font-weight:700;z-index:50}
.status-time{width:76px;padding-top:2px}.dynamic-island{position:absolute;left:50%;top:10px;transform:translateX(-50%);width:116px;height:31px;border-radius:20px;background:#050505;box-shadow:0 1px 0 rgba(255,255,255,.06) inset}
.status-icons{display:flex;align-items:center;gap:6px;padding-top:2px}.signal{width:15px;height:10px;background:linear-gradient(90deg,currentColor 15%,transparent 15% 25%,currentColor 25% 45%,transparent 45% 55%,currentColor 55% 75%,transparent 75% 85%,currentColor 85%);clip-path:polygon(0 100%,0 72%,22% 72%,22% 50%,47% 50%,47% 27%,72% 27%,72% 0,100% 0,100% 100%)}
.wifi{font-size:19px;line-height:1;transform:rotate(180deg);display:inline-block;margin-top:-3px}.battery{width:22px;height:10px;border:1.7px solid currentColor;border-radius:3px;position:relative}.battery:after{content:"";position:absolute;right:-3px;top:2px;width:2px;height:4px;border-radius:1px;background:currentColor}.battery i{position:absolute;inset:1.5px;width:14px;background:currentColor;border-radius:1px}
.nav-bar{position:absolute;top:47px;left:0;right:0;height:52px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 14px;border-bottom:1px solid rgba(201,190,172,.78);background:rgba(247,243,235,.84);backdrop-filter:blur(24px) saturate(145%);z-index:40}
.nav-overlay{background:linear-gradient(180deg,rgba(18,31,23,.55),rgba(18,31,23,.08));border-bottom:0;backdrop-filter:none}.nav-light{color:#fff}.nav-slot{display:flex;align-items:center;gap:7px;min-width:0}.nav-slot.right{justify-content:flex-end}.nav-center{display:flex;justify-content:center;align-items:center;min-width:0}.nav-title{font-weight:700;font-size:16px;white-space:nowrap}.nav-left{display:flex;align-items:center;gap:3px}.back-label{font-size:15px;font-weight:600;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nav-text{border:0;background:none;font-weight:700;padding:8px 2px}.primary-text{color:var(--terracotta)}
.brand{display:flex;align-items:center;gap:7px;font-family:EBG,Georgia,serif;font-size:23px;font-weight:600;line-height:1}.brand svg{display:block}.nav-bar .brand{font-size:22px}.nav-bar .brand svg{width:31px;height:20px}
.avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--teal);color:#fff;font-weight:800;font-size:14px;border:1px solid rgba(255,255,255,.65)}.avatar.large{width:50px;height:50px;font-size:18px}
.glass-button{display:grid;place-items:center;min-width:40px;height:40px;border-radius:20px;background:rgba(255,255,255,.56);border:1px solid rgba(198,187,168,.75);box-shadow:0 4px 14px rgba(50,41,31,.08);backdrop-filter:blur(20px) saturate(150%)}.nav-circle{min-width:36px;width:36px;height:36px}.light-glass{background:rgba(255,255,255,.25);border-color:rgba(255,255,255,.35);color:#fff}.small-glass{min-width:42px;width:42px;height:42px}.icon{display:inline-block;vertical-align:middle;flex:none}
.screen-content{position:absolute;top:99px;left:0;right:0;bottom:20px;overflow:hidden}.screen-content.with-tabs{bottom:94px}.screen-content.under-chrome{top:0}.scroll{height:100%;overflow:hidden;position:relative}.pad{padding:20px 16px 30px}.with-tabs .pad{padding-bottom:24px}
.home-indicator{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:5px;background:#1E2C24;z-index:60;opacity:.9}.home-indicator.light{background:#F5EEE4}
.tab-wrap{position:absolute;left:10px;right:10px;bottom:18px;height:70px;z-index:55}.tab-bar{height:70px;border-radius:27px;background:rgba(253,251,246,.68);border:1px solid rgba(209,200,187,.88);box-shadow:0 14px 36px rgba(49,39,27,.15);backdrop-filter:blur(28px) saturate(160%);display:flex;align-items:center;padding:6px}.tab{flex:1;height:58px;border-radius:21px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#697068;font-size:10px;font-weight:650}.tab.active{background:rgba(216,228,202,.78);color:var(--ink);box-shadow:inset 0 0 0 1px rgba(112,129,83,.16)}
.large-header{margin:3px 0 18px}.large-header.compact{margin-bottom:15px}.large-header h1{font-family:EBG,Georgia,serif;font-size:45px;line-height:.91;font-weight:500;letter-spacing:-1.5px;margin:5px 0 11px;color:var(--ink)}.large-header.compact h1{font-size:38px;line-height:.96}.large-header p{font-size:15px;line-height:1.48;margin:0;color:#5D625C;max-width:346px}.eyebrow,.section-kicker{font-size:10.5px;font-weight:850;letter-spacing:1.35px;color:#557035;text-transform:uppercase}.section-kicker{letter-spacing:1px}.card{background:rgba(255,253,248,.8);border:1px solid var(--line);border-radius:18px;box-shadow:0 8px 24px rgba(67,54,37,.045)}
h1,h2,h3,p{overflow-wrap:break-word}h2{font-family:EBG,Georgia,serif;font-weight:600;margin:0;font-size:27px;line-height:1}
button{border:0;background:none}.primary,.secondary,.terracotta-button{height:48px;border-radius:14px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:800;font-size:14px}.primary{background:var(--terracotta);color:white;box-shadow:0 8px 18px rgba(181,81,49,.18)}.secondary{background:rgba(255,253,248,.84);border:1px solid var(--line);color:var(--ink)}.terracotta-button{background:var(--terracotta);color:#fff;padding:0 14px}.full{width:100%}.big{height:52px;font-size:15px}.small{height:36px;padding:0 12px;font-size:12.5px;border-radius:11px}.square{width:48px;padding:0}.grow{flex:1}.text-button{font-weight:750;font-size:13px;color:var(--olive)}.icon-button{width:44px;height:44px;border-radius:14px;border:1px solid var(--line);background:rgba(255,253,248,.75);display:grid;place-items:center}
.section-head{display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px}.section-head.tight{margin:17px 0 9px}.section-head span,.section-head button{font-size:12px;font-weight:750;color:var(--olive)}.section-label{font-size:10px;font-weight:850;letter-spacing:1.2px;color:#73776F;margin:18px 12px 7px}
.form-group{background:rgba(255,253,248,.78);border:1px solid var(--line);border-radius:17px;overflow:hidden}.form-row{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border-bottom:1px solid rgba(216,207,191,.72)}.form-row:last-child{border-bottom:0}.form-row>div:first-child{min-width:0}.form-row strong{display:block;font-family:Inter,sans-serif;font-size:14px;line-height:1.2}.form-row small{display:block;font-size:11.5px;line-height:1.35;color:#73766F;margin-top:4px}.form-trailing{font-size:12px;color:#636A62;font-weight:650;display:flex;align-items:center;gap:4px;white-space:nowrap}.form-row.destructive strong{color:#B24137}.form-row.column{align-items:flex-start;flex-direction:column}.toggle{width:46px;height:28px;border-radius:16px;padding:2px;background:#C9C9C2;transition:none;display:flex;align-items:center}.toggle span{width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.18)}.toggle.on{background:#647E43;justify-content:flex-end}
.field-block{display:block;margin:0;padding:10px 13px;border-bottom:1px solid rgba(216,207,191,.72)}.field-block:last-child{border-bottom:0}.field-block>span{display:block;font-size:11px;font-weight:750;margin-bottom:7px}.field{min-height:42px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.63);display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-size:13px}.field-value.placeholder{color:#8B8E87}.two-fields{display:grid;grid-template-columns:1fr 1fr}.two-fields>.field-block:first-child{border-right:1px solid rgba(216,207,191,.72)}.fields-group .field-block:last-child{border-bottom:0}
.search-row{display:flex;gap:8px;align-items:center;margin:10px 0}.search-field{height:46px;border-radius:14px;border:1px solid var(--line);background:rgba(255,253,248,.78);display:flex;align-items:center;gap:10px;padding:0 13px;flex:1;color:#7B7F77;font-size:13px;font-weight:600;min-width:0}.chip-row{display:flex;gap:7px;overflow:hidden;margin:8px 0 12px}.chip{height:34px;border-radius:18px;border:1px solid var(--line);background:rgba(255,253,248,.64);display:inline-flex;align-items:center;padding:0 13px;font-size:11.5px;font-weight:750;white-space:nowrap}.chip.active{background:#5D753C;color:#fff;border-color:#5D753C}.segmented{display:flex;height:44px;border:1px solid var(--line);background:rgba(255,253,248,.78);border-radius:13px;padding:3px;margin:10px 0 14px}.segmented span{flex:1;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:12px;font-weight:750;color:#697069;gap:4px}.segmented span.active{background:var(--sage);color:var(--ink);box-shadow:0 1px 3px rgba(58,47,34,.08)}.segmented.compact{height:42px}.segmented b{font-size:10px;padding:2px 5px;border-radius:8px;background:rgba(255,255,255,.6)}
/* Auth */
.auth-bg{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 22px;background:radial-gradient(circle at 50% 10%,rgba(219,231,204,.82),transparent 38%),linear-gradient(180deg,#F8F5EE,#F4EEE3)}.auth-logo{position:absolute;top:45px}.auth-card{width:100%;background:rgba(255,253,248,.74);border:1px solid rgba(210,200,184,.8);border-radius:22px;padding:20px 18px 18px;box-shadow:0 18px 45px rgba(73,55,35,.12);backdrop-filter:blur(24px) saturate(140%)}.auth-icon{width:42px;height:42px;border-radius:14px;background:var(--sage);display:grid;place-items:center;color:var(--olive);margin-bottom:10px}.auth-card h1{font-family:EBG,Georgia,serif;font-size:34px;line-height:1;margin:5px 0 5px}.auth-sub{font-size:12.5px;line-height:1.45;color:#6B6F68;margin:0 0 10px}.auth-card .field-block{padding-left:0;padding-right:0;border:0}.auth-card .primary{margin-top:10px}.inline-option{font-size:11px;margin:7px 0 0;color:#5E645D}.inline-option span{display:flex;align-items:center;gap:5px}.or{display:flex;align-items:center;gap:10px;margin:13px 0;color:#8A8D86;font-size:11px}.or:before,.or:after{content:"";height:1px;background:var(--line);flex:1}.auth-link{text-align:center;font-size:11px;font-weight:750;margin-top:13px}.auth-actions{display:flex;justify-content:space-between;font-size:10px;font-weight:700;margin-top:14px}.password-meter{display:flex;gap:4px;align-items:center;margin:5px 0 3px}.password-meter i{height:4px;border-radius:3px;background:#6D834B;flex:1}.password-meter i:nth-child(4){background:#D5D1C6}.password-meter span{font-size:9px;color:#777B73;margin-left:4px}
/* Home */
.tonight-card{padding:12px}.tonight-top{display:flex;gap:12px;min-height:110px}.tonight-top>div{flex:1;padding:5px 0}.tonight-top img{width:106px;height:112px;border-radius:14px;object-fit:cover}.tonight-top strong{font-family:EBG,Georgia,serif;font-size:22px;line-height:.98;display:block;margin:7px 0}.tonight-top small{display:flex;align-items:center;gap:5px;color:#687068;font-size:11px}.tonight-actions{display:flex;gap:8px;margin-top:10px}.tonight-actions .primary{flex:1;height:42px}.tonight-actions .icon-button{height:42px}.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.quick-card{height:112px;border-radius:16px;background:rgba(255,253,248,.72);border:1px solid var(--line);padding:11px;display:flex;flex-direction:column}.quick-card>div{width:32px;height:32px;border-radius:10px;background:var(--sage);color:var(--olive);display:grid;place-items:center;margin-bottom:auto}.quick-card strong{font-size:12px;line-height:1.15}.quick-card small{font-size:9.5px;color:#74786F;line-height:1.2;margin-top:4px}.horizontal-recipes{display:flex;gap:10px;width:max-content}.recipe-thumb{width:250px;height:116px;border-radius:16px;background:rgba(255,253,248,.8);border:1px solid var(--line);padding:8px;display:flex;gap:10px}.recipe-thumb img{width:96px;height:98px;object-fit:cover;border-radius:12px}.recipe-thumb-copy{display:flex;flex-direction:column;justify-content:center;min-width:0}.recipe-thumb strong{font-family:EBG,Georgia,serif;font-size:18px;line-height:.97;margin:5px 0}.recipe-thumb small{font-size:10.5px;color:#71766E}.mini-tag{font-size:8.5px;letter-spacing:.7px;color:#587137;font-weight:850}
/* Recipes */
.recipe-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.recipe-grid-card{border-radius:16px;background:rgba(255,253,248,.8);border:1px solid var(--line);overflow:hidden}.image-wrap{height:122px;position:relative}.image-wrap img{width:100%;height:100%;object-fit:cover}.image-heart{position:absolute;right:8px;top:8px;width:30px;height:30px;border-radius:15px;background:rgba(255,255,255,.72);backdrop-filter:blur(12px);display:grid;place-items:center}.grid-copy{padding:9px 9px 10px}.grid-copy strong{font-family:EBG,Georgia,serif;font-size:17px;line-height:.98;display:block;margin:5px 0 7px}.grid-copy small{display:flex;align-items:center;gap:4px;font-size:10px;color:#6D716A}.floating-add{position:absolute;right:20px;bottom:104px;height:52px;min-width:52px;border-radius:26px;background:rgba(245,248,238,.72);border:1px solid rgba(121,142,87,.32);backdrop-filter:blur(22px) saturate(160%);box-shadow:0 12px 28px rgba(49,69,38,.18);display:flex;align-items:center;justify-content:center;gap:8px;color:var(--olive);font-weight:800;z-index:52}.floating-add.wide{padding:0 18px}
.collection-card{height:112px;margin-bottom:10px;display:flex;align-items:center;padding:12px;gap:13px}.stacked-images{width:108px;height:82px;position:relative;flex:none}.stacked-images img{position:absolute;width:72px;height:74px;object-fit:cover;border-radius:12px;border:2px solid #F9F5EC;box-shadow:0 5px 12px rgba(39,33,25,.12)}.stacked-images img:nth-child(1){left:0;top:7px;transform:rotate(-4deg)}.stacked-images img:nth-child(2){left:17px;top:3px;transform:rotate(1deg)}.stacked-images img:nth-child(3){left:34px;top:6px;transform:rotate(5deg)}.collection-copy{flex:1;min-width:0}.collection-copy strong{font-family:EBG,Georgia,serif;display:block;font-size:21px;line-height:1}.collection-copy small{display:block;font-size:10.5px;color:#71766E;margin-top:7px}.create-bottom{margin-top:14px}.tag-list{margin-top:11px}.tag-row{height:61px;display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid rgba(216,207,191,.72)}.tag-row:last-child{border:0}.tag-color{width:22px;height:22px;border-radius:7px}.tag-row>div{flex:1}.tag-row strong{font-size:14px;display:block}.tag-row small{font-size:11px;color:#74786F}.tip-card,.capture-tip,.insight-card{display:flex;gap:11px;padding:13px;border-radius:16px;background:rgba(222,232,211,.68);border:1px solid rgba(158,174,131,.35);margin-top:14px}.tip-card>div:last-child,.capture-tip>div:last-child,.insight-card>div:last-child{flex:1}.tip-card strong,.capture-tip strong,.insight-card strong{font-family:EBG,Georgia,serif;font-size:18px;display:block}.tip-card small,.capture-tip small,.insight-card small{font-size:11px;line-height:1.4;color:#62685F;display:block;margin-top:3px}
.import-choice{height:76px;margin-bottom:9px;padding:10px 12px;display:flex;align-items:center;gap:11px}.settings-icon{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:var(--olive);flex:none}.settings-icon.sage{background:var(--sage)}.settings-icon.blue{background:var(--blue);color:#3E6A74}.settings-icon.terracotta{background:#F1DDD3;color:#A5492F}.import-choice>div:nth-child(2){flex:1}.import-choice strong{font-size:14px;display:block}.import-choice small{font-size:10.5px;color:#74786F;margin-top:4px;display:block}.stepper{height:55px;position:relative;display:flex;align-items:flex-start;justify-content:center;margin-bottom:12px}.stepper>span{width:28px;height:28px;border-radius:14px;border:1px solid var(--line);background:var(--surface);display:grid;place-items:center;font-size:12px;font-weight:800;z-index:2}.stepper>span.done{background:var(--olive);color:#fff;border-color:var(--olive)}.stepper>i{width:66px;height:1px;background:var(--line);margin-top:14px}.step-labels{position:absolute;top:34px;left:31px;right:31px;display:flex;justify-content:space-between}.step-labels b{font-size:9px;color:#72766F}.url-card{display:flex;padding:12px;gap:11px}.url-copy{flex:1}.url-copy>strong{font-size:14px}.inline-field{height:38px;border:1px solid var(--line);border-radius:10px;margin-top:8px;display:flex;align-items:center;padding-left:10px;color:#8A8E87;font-size:11px}.inline-field span{flex:1}.inline-field button{height:100%;padding:0 12px;background:var(--terracotta);color:#fff;border-radius:0 9px 9px 0;font-size:11px;font-weight:800}.privacy-note{font-size:10.5px;line-height:1.4;color:#6B7169;display:flex;align-items:flex-start;gap:7px;margin:12px 4px}.privacy-note.card{padding:12px;margin:14px 0}
.composer-card{height:305px;padding:15px;display:flex;flex-direction:column}.composer-label{font-size:11px;font-weight:800}.composer-placeholder{font-family:EBG,Georgia,serif;font-size:24px;line-height:1.12;color:#83877E;margin:20px 2px auto}.prompt-chips{display:flex;flex-wrap:wrap;gap:6px}.prompt-chips span{font-size:10px;background:var(--sage);border-radius:12px;padding:6px 9px;color:#566B38;font-weight:750}.glass-bar{position:absolute;left:10px;right:10px;bottom:14px;min-height:62px;border-radius:24px;background:rgba(254,252,247,.7);border:1px solid rgba(207,198,183,.9);box-shadow:0 14px 34px rgba(53,43,31,.16);backdrop-filter:blur(28px) saturate(155%);display:flex;align-items:center;gap:8px;padding:7px;z-index:56}.bottom-compose{bottom:20px}.bottom-compose .icon-button{border:0;background:rgba(225,231,215,.65)}.bottom-save{bottom:20px}.photo-placeholder{height:92px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#607143;gap:3px}.photo-placeholder strong{font-family:EBG,Georgia,serif;font-size:18px}.photo-placeholder small{font-size:10px;color:#777B73}.ingredient-preview{padding:14px;display:flex;align-items:center;justify-content:space-between}.ingredient-preview strong{display:block;font-size:13px}.ingredient-preview small{display:block;font-size:10.5px;color:#777B73;margin-top:4px}
/* Recipe detail/edit/cook */
.recipe-detail-scroll{background:var(--bg)}.recipe-hero{height:302px;position:relative}.recipe-hero img{width:100%;height:100%;object-fit:cover}.hero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(16,26,19,.38) 0%,transparent 42%,rgba(24,35,27,.08) 100%)}.recipe-detail-body{margin-top:-26px;position:relative;border-radius:27px 27px 0 0;background:var(--bg);padding:23px 16px 30px}.recipe-detail-body h1{font-family:EBG,Georgia,serif;font-size:39px;line-height:.9;letter-spacing:-1px;margin:5px 0 10px}.recipe-detail-body>p{font-size:14px;line-height:1.45;color:#60655E;margin:0 0 12px}.meta-row{display:flex;gap:7px;margin:0 0 13px}.meta-row span{height:30px;border-radius:15px;background:rgba(255,253,248,.8);border:1px solid var(--line);display:flex;align-items:center;gap:4px;padding:0 9px;font-size:10.5px;font-weight:700}.action-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}.action-grid button{height:52px;border:1px solid var(--line);border-radius:14px;background:rgba(255,253,248,.72);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10px;font-weight:750}.ingredient-list{border-top:1px solid var(--line)}.ingredient-list div{display:flex;gap:14px;padding:10px 2px;border-bottom:1px solid rgba(216,207,191,.7);font-size:12px}.ingredient-list b{width:54px}.edit-photo-row{display:flex;gap:12px;padding:10px;align-items:center}.edit-photo-row img{width:86px;height:72px;border-radius:12px;object-fit:cover}.edit-photo-row>div{flex:1}.edit-photo-row strong{font-family:EBG,Georgia,serif;font-size:19px;line-height:1;display:block;margin-bottom:9px}.ingredient-rows>div{height:52px;display:grid;grid-template-columns:56px 1fr auto;align-items:center;padding:0 13px;border-bottom:1px solid rgba(216,207,191,.72);font-size:12px}.ingredient-rows>div:last-child{border:0}
.dark-content{background:#203427}.cook-screen{padding:21px 20px 95px;color:#F6F0E5}.cook-head{padding-top:3px}.cook-kicker{font-size:10px;font-weight:850;letter-spacing:1.2px;color:#C9D98E}.cook-head h1{font-family:EBG,Georgia,serif;font-size:41px;line-height:.9;letter-spacing:-1px;margin:7px 0 18px}.servings-control{display:flex;align-items:center;gap:7px;font-size:12px}.servings-control button{width:34px;height:34px;border-radius:11px;background:#F8F2E8;color:#233328;font-weight:900}.servings-control strong{width:25px;text-align:center}.cook-progress{display:flex;gap:5px;margin:18px 0}.cook-progress i{height:4px;border-radius:3px;background:rgba(255,255,255,.17);flex:1}.cook-progress i.active{background:#C8DA91}.step-card{min-height:255px;background:#F7F2E7;color:#203128;border-radius:22px;padding:20px;display:flex;gap:13px;box-shadow:0 18px 34px rgba(0,0,0,.15)}.step-number{width:35px;height:35px;border-radius:12px;background:var(--sage);color:var(--olive);display:grid;place-items:center;font-weight:900}.step-copy{flex:1}.step-copy h2{font-size:31px;line-height:.98;margin:7px 0 10px}.step-copy p{font-size:15px;line-height:1.5;margin:0;color:#525B54}.cook-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.cook-tools>div{height:72px;border:1px solid rgba(255,255,255,.15);border-radius:15px;background:rgba(255,255,255,.07);padding:11px;font-size:10.5px;display:flex;flex-direction:column;gap:6px}.cook-tools b{color:#C9DA91}.cook-next{margin-top:14px;padding:0 3px}.cook-next span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#A8B2A8}.cook-next strong{font-family:EBG,Georgia,serif;font-size:18px;display:block;margin-top:3px}.dark-glass{background:rgba(50,69,55,.64);border-color:rgba(255,255,255,.13);color:#fff}.cook-bar .icon-button{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.15);color:#fff}.timer-button{height:46px;border-radius:14px;padding:0 13px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.1);display:flex;align-items:center;gap:6px;color:#fff;font-weight:750;font-size:12px}
/* Pantry / planner / nutrition / lists */
.stats-strip{height:68px;border-radius:16px;background:rgba(255,253,248,.75);border:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:10px}.stats-strip div{display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid var(--line)}.stats-strip div:last-child{border:0}.stats-strip strong{font-family:EBG,Georgia,serif;font-size:25px;line-height:1}.stats-strip span{font-size:9.5px;color:#74786F}.pantry-item{min-height:63px;display:flex;align-items:center;gap:10px;padding:8px 11px;border-bottom:1px solid rgba(216,207,191,.72)}.pantry-item:last-child{border:0}.food-icon{width:39px;height:39px;border-radius:12px;background:var(--sage);display:grid;place-items:center;font-size:20px;flex:none}.food-icon.neutral{background:#F1EEE5}.pantry-item>div:nth-child(2){flex:1;min-width:0}.pantry-item strong{display:block;font-size:13px}.pantry-item small{display:block;font-size:10px;color:#74786F;margin-top:4px}.stock-badge{font-size:10px;font-weight:750;color:#5D693D}.date-strip{height:72px;display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:2px 0 10px}.date-strip>div{border:1px solid var(--line);background:rgba(255,253,248,.68);border-radius:15px;display:flex;flex-direction:column;align-items:center;justify-content:center}.date-strip>div.active{background:var(--sage);border-color:#A9B98D}.date-strip b{font-size:9px;letter-spacing:.7px}.date-strip span{font-family:EBG,Georgia,serif;font-size:24px;line-height:1}.planner-summary{display:flex;align-items:center;justify-content:space-between;margin:10px 2px}.planner-summary strong{font-family:EBG,Georgia,serif;font-size:21px}.planner-summary small{display:block;font-size:10.5px;color:#74786F;margin-top:3px}.planner-summary .icon-button{width:38px;height:38px}.meal-row{height:112px;margin-bottom:9px;padding:8px;display:flex;align-items:center;gap:9px}.meal-label{width:61px;display:flex;flex-direction:column;align-items:center;gap:5px}.meal-label span{font-family:EBG,Georgia,serif;font-size:16px}.meal-icon{width:36px;height:36px;border-radius:18px;background:var(--sage);color:var(--olive);display:grid;place-items:center}.meal-row img{width:87px;height:94px;border-radius:13px;object-fit:cover}.meal-copy{flex:1;min-width:0}.meal-copy strong{font-family:EBG,Georgia,serif;font-size:18px;line-height:.98;display:block}.meal-copy small{font-size:10px;color:#73786F;display:block;margin-top:7px}.planner-bar{bottom:18px}.profile-date-row{display:flex;gap:8px;margin-bottom:10px}.profile-date-row>div{height:42px;border:1px solid var(--line);border-radius:13px;background:rgba(255,253,248,.75);display:flex;align-items:center;gap:7px;padding:0 12px;font-size:12px;font-weight:750;flex:1}.nutrition-card{padding:13px}.rings-row{display:flex;justify-content:space-between;gap:8px}.metric-ring{--p:70;--ring:#5D733F;width:98px;height:98px;border-radius:50%;background:conic-gradient(var(--ring) calc(var(--p)*1%),#E5E1D7 0);display:grid;place-items:center;position:relative}.metric-ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:#FBF8F1}.metric-ring>div{position:relative;z-index:2;text-align:center}.metric-ring strong{font-family:EBG,Georgia,serif;font-size:18px;display:block}.metric-ring small{font-size:8.5px;color:#72776F}.macro-bars{margin-top:13px}.macro-bars>div{display:grid;grid-template-columns:42px 1fr 75px;gap:7px;align-items:center;margin:7px 0;font-size:9.5px}.macro-bars i{height:7px;border-radius:5px;background:#E5E1D7;overflow:hidden}.macro-bars b{display:block;height:100%;background:var(--olive);border-radius:5px}.macro-bars em{text-align:right;font-style:normal;color:#6F746D}.meal-log .form-row{min-height:57px}.insight-card{margin-top:12px}
.list-scopes{margin-top:12px}.shopping-card{height:102px;margin-bottom:10px;display:flex;align-items:center;padding:12px;gap:12px}.list-ring,.large-ring{--progress:35;width:58px;height:58px;border-radius:50%;background:conic-gradient(var(--olive) calc(var(--progress)*1%),#E9E4D9 0);display:grid;place-items:center;position:relative;flex:none}.list-ring:after,.large-ring:after{content:"";position:absolute;inset:7px;border-radius:50%;background:#FBF8F1}.list-ring span,.large-ring span{position:relative;z-index:2;font-size:10px;font-weight:850}.shopping-copy{flex:1;min-width:0}.shopping-copy strong{font-family:EBG,Georgia,serif;font-size:21px;display:block;line-height:1}.shopping-copy small{display:block;font-size:10.5px;color:#74786F;margin-top:5px}.list-meta{display:flex;gap:10px;font-size:9.5px;color:#5B693D;font-weight:750;margin-top:7px}.progress-card{display:flex;gap:12px;align-items:center;padding:12px}.large-ring{width:66px;height:66px}.progress-card strong{font-size:13px;display:block}.progress-card small{font-size:10.5px;line-height:1.35;color:#74786F;display:block;margin-top:4px}.shopping-item{height:70px;display:flex;align-items:center;gap:9px;padding:8px 9px;border-bottom:1px solid rgba(216,207,191,.72)}.shopping-item:last-child{border:0}.check-circle{width:25px;height:25px;border-radius:50%;border:1.5px solid #A3A79E;flex:none}.shopping-item>div:nth-child(3){flex:1;min-width:0}.shopping-item strong{font-size:12.5px;display:block}.shopping-item small{font-size:9.5px;display:block;color:#74786F;margin-top:3px}.qty{font-size:10px;font-weight:750;color:#5E683F}.cart-mini{width:38px;height:38px;border-radius:11px;border:1px solid var(--line);background:#fff}.shopping-bar>div{width:52px;text-align:center;display:flex;flex-direction:column}.shopping-bar b{font-size:14px}.shopping-bar span{font-size:8.5px;color:#6F746D}.shopping-bar{bottom:18px}
/* Assistant / offline */
.assistant-screen{height:100%;display:flex;flex-direction:column;padding:12px 12px 86px}.assistant-context{display:flex;gap:7px;overflow:hidden}.assistant-context .chip{background:rgba(255,253,248,.8)}.chat-spacer{flex:1}.assistant-bubble{display:flex;gap:10px;background:var(--sage);border-radius:20px 20px 20px 7px;padding:15px;margin-bottom:10px}.assistant-mark{width:35px;height:35px;border-radius:12px;background:#F6F2E8;color:var(--olive);display:grid;place-items:center;flex:none}.assistant-mark.small{width:32px;height:32px}.assistant-bubble strong{font-family:EBG,Georgia,serif;font-size:20px}.assistant-bubble p{font-size:13px;line-height:1.45;color:#586158;margin:5px 0 0}.assistant-suggestion{align-self:flex-end;width:88%;padding:12px 14px;border:1px solid var(--line);border-radius:19px 19px 7px 19px;background:rgba(255,253,248,.78);margin-bottom:11px}.assistant-suggestion span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6E746C}.assistant-suggestion strong{font-family:EBG,Georgia,serif;font-size:17px;line-height:1.05;display:block;margin-top:4px}.assistant-composer{bottom:18px}.assistant-input{flex:1;color:#92968E;font-size:13px;padding:0 4px}.send-button{width:42px;height:42px;border-radius:21px;background:#EAE4D8;color:#64715F}.offline-bg{height:100%;background:radial-gradient(circle at 50% 25%,rgba(243,247,235,.8),transparent 33%),#DDE5D3;display:grid;place-items:center;padding:26px}.offline-card{width:100%;background:rgba(255,253,248,.82);border:1px solid rgba(204,198,185,.85);border-radius:23px;padding:25px 22px;text-align:center;box-shadow:0 18px 40px rgba(49,57,43,.12);backdrop-filter:blur(20px)}.offline-icon{width:48px;height:48px;border-radius:16px;background:var(--olive);color:white;display:grid;place-items:center;margin:0 auto 13px}.offline-card h1{font-family:EBG,Georgia,serif;font-size:35px;line-height:.95;margin:8px 0 12px}.offline-card p{font-size:13px;line-height:1.48;color:#626861}.downloaded-status{height:38px;border-radius:12px;background:var(--sage);display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;font-weight:750;color:#5D6E42;margin:15px 0}
/* Settings */
.settings-screen .large-header h1{font-size:37px}.profile-card{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:9px}.profile-card>div:nth-child(2){flex:1}.profile-card strong{font-family:EBG,Georgia,serif;font-size:21px;display:block}.profile-card small{font-size:10.5px;color:#74786F}.settings-row{min-height:66px;display:flex;align-items:center;gap:11px;padding:10px 12px;border-bottom:1px solid rgba(216,207,191,.72)}.settings-row:last-child{border:0}.settings-copy{flex:1;min-width:0}.settings-copy strong{font-family:EBG,Georgia,serif;font-size:18px;line-height:1;display:block}.settings-copy small{font-size:10px;line-height:1.35;color:#74786F;margin-top:4px;display:block}.settings-trailing{font-size:10px;font-weight:750;color:#617042;display:flex;align-items:center}.profile-detail{padding:12px}.profile-heading{display:flex;align-items:center;gap:11px;margin-bottom:8px}.profile-heading>div:nth-child(2){flex:1}.profile-heading strong{font-family:EBG,Georgia,serif;font-size:22px;display:block}.profile-heading small{font-size:10px;color:#74786F}.compact-profile{margin-bottom:12px}.meal-toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;width:100%}.meal-toggle{height:34px;border:1px solid var(--line);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:750}.meal-toggle.selected{background:var(--sage);color:#516737}.aisle-list .reorder-row{height:48px;display:grid;grid-template-columns:25px 1fr auto;align-items:center;padding:0 13px;border-bottom:1px solid rgba(216,207,191,.72);font-size:11.5px}.reorder-row span{color:#81857D}.add-row{height:46px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--olive);font-weight:750;font-size:12px}.app-icon-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:13px}.app-icon-choice{height:62px;border-radius:15px;background:#F2EFE7;display:grid;place-items:center;border:2px solid transparent;overflow:hidden}.app-icon-choice.selected{border-color:var(--olive);background:var(--sage)}.app-icon-choice .brand span{display:none}.app-icon-choice .brand svg{width:32px}.backup-status{display:flex;align-items:center;gap:12px;padding:14px}.cloud-ring{width:48px;height:48px;border-radius:16px;background:var(--sage);color:var(--olive);display:grid;place-items:center}.backup-status>div:nth-child(2){flex:1}.backup-status strong{font-family:EBG,Georgia,serif;font-size:22px;display:block}.backup-status small{font-size:10px;color:#74786F}.status-pill{font-size:9.5px;font-weight:800;color:#52673A;background:var(--sage);padding:5px 8px;border-radius:10px}.security-summary{display:flex;align-items:center;gap:11px;padding:13px}.status-icon{width:44px;height:44px;border-radius:15px;display:grid;place-items:center}.status-icon.good{background:var(--sage);color:var(--olive)}.security-summary>div:nth-child(2){flex:1}.security-summary strong{font-size:13px;display:block}.security-summary small{font-size:10px;line-height:1.4;color:#74786F;display:block;margin-top:4px}
'''


def html_document(content: str, title: str) -> str:
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=393,initial-scale=1"><title>{title}</title><link rel="stylesheet" href="styles.css"></head><body>{content}</body></html>'''


def main() -> None:
    (HTML_DIR / 'styles.css').write_text(CSS)
    manifest=[]
    for sid,label,category,note in SCREEN_SPECS:
        html=html_document(build_screen(sid), label)
        path=HTML_DIR/f'{sid}.html'
        path.write_text(html)
        manifest.append({'id':sid,'label':label,'category':category,'note':note,'html':str(path.relative_to(ROOT)),'image':f'mockups/{sid}.png'})
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(f'Wrote {len(manifest)} HTML mockups to {HTML_DIR}')

if __name__=='__main__':
    main()
