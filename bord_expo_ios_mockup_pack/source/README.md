# Mockup generator

The visual exports are deterministic rather than AI-rasterized. This makes labels, spacing, typography, page relationships, and revision changes consistent across all 32 screens.

## Scripts

- `generate_mockups.py` writes the per-screen HTML and the ordered `manifest.json`.
- `render_mockups.py` renders each 393 x 852 point viewport at 2x using Chromium and Playwright.
- `generate_contact_sheets.py` creates the four visual overview sheets.
- `generate_gallery.py` creates the local browsable gallery.
- `generate_pdf.py` creates the 12-page PDF lookbook.

The HTML source is a visual specification only. Production implementation should use Expo and React Native components as described in `../expo-implementation-guide.md`; it should not embed these pages in a WebView.
