# pdfcn components

Vendored from the MIT-licensed pdfcn Forme registry on 2026-10-15:
https://www.pdfcn.dev/r/forme/text.json
https://www.pdfcn.dev/r/forme/heading.json
https://www.pdfcn.dev/r/forme/page-footer.json
https://www.pdfcn.dev/r/forme/utils.json
https://www.pdfcn.dev/r/forme/badge.json, card.json, divider.json, page-header.json, pdf-image.json, stack.json and table.json (vendored 2026-10-25)
https://www.pdfcn.dev/r/theme-professional.json

The upstream license is included. Imports use the local library path. The professional theme uses Bòrd's green palette (ink #26372b, primary #4a6b3c). The Bòrd lockup in document headers is rendered from `public/brand` by `src/lib/pdf/brand.ts`. The theme provider uses one immutable theme, avoiding mutable global theme state across concurrent server requests. Rendering and document composition are server-side; no external rendering service is used.
