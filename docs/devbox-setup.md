# DevBox setup

The live household remains on [Bòrd on Tower](https://bord.tower). The DevBox
checkout has a separate development database, current migrations and its own
cookie/auth secrets. Background AI work is disabled locally. Native catalog
settings are server-only in `.env.local`; the configured Tower endpoint requires
the Tower CA for Node HTTPS requests.

## Development server

Run from this checkout:

```sh
devbox-dev up our-recipes --dir "$PWD" \
  --cmd 'NODE_EXTRA_CA_CERTS=/srv/devbox-data/users/dev/.local/share/devbox/ca/tower-root.crt pnpm run dev --hostname 0.0.0.0' \
  --ttl 8h
```

The explicit command avoids the launcher's extra `--` separator, which this pnpm
version passes through to Next as a directory argument. Next reads the assigned
`PORT`. The exact development hostname is allowed by `next.config.ts`; mutation
origins remain exact in `.env.local`.

- HTTPS: <https://our-recipes.dev.app.devbox>
- HTTP: <http://our-recipes.dev.app.devbox>
- Stop after use: `devbox-dev down our-recipes`

The server runs `pnpm run dev` temporarily for eight hours. The Food API Viewer
remains a separate permanent service. The household first-run setup remains for the owner.
SMTP credentials, `INSTACART_API_KEY` and `HOMEPAGE_INTEGRATION_TOKEN` are not
configured locally. An empty `BACKUP_DIR` uses the application's default under
its data directory. No external database service is needed for this setup:
household storage uses SQLite and the optional Redis queue is not enabled.

## Related projects

- `../food-api-viewer`: permanently installed with `devbox-app`, separate private
  runtime configuration and login-free LAN access at
  <https://food-api-viewer.prod.app.devbox>. HTTP redirects to HTTPS. The owner
  selected `VIEWER_AUTH_MODE=none` in the private runtime file returned by
  `devbox-app env-path food-api-viewer`; upstream credentials remain server-side.
  Updates use `devbox-app update food-api-viewer`.
- `../bord-food-api`: Python dependencies installed in `.venv` using
  `uv pip install --python .venv/bin/python -r requirements-dev.txt`. Its serving
  catalog remains on Unraid. The viewer's fixed read-only SSH collector uses the
  existing trusted host and authorized key; API credentials remain on Unraid.
- `mobile`: independent npm dependency installation. iOS/Android bundle export
  was verified; device installation and hardware testing are separate work.

## Validation on 23 October 2026

Web lint/type checks, 727 unit tests, 491 integration tests (9 skipped), and the
release build/artifact verification passed. The five PDF tests initially failed
because `pdftotext` was missing, then passed after installing Poppler under the
user's `.local/opt/bord-poppler` with a `.local/bin/pdftotext` wrapper. System
packages and `/etc` were not changed.

Food API: 438 tests and Ruff passed. Mobile: lint/type checks, 81 tests and both
native exports passed. npm reports 25 existing mobile dependency alerts (22 high,
3 moderate); suggested fixes include major upgrades and were not applied.

Viewer: 8 Node tests, 8 Python tests, formatting, build and 13 fixture browser
tests passed. The browser suite used the installed app with private HTTP
credentials and mocked API responses. Live read-only browser checks separately
verified 50 store rows, search/details, USDA search and the map dashboard without
page errors. TLS was verified with the Tower CA; the browser runner used a context
TLS override because its default trust store lacks that CA.

T3's embedded browser currently lacks system libraries. Repository Playwright
checks used the existing cached Chromium with user-local shared libraries.
No paid provider calls, catalog imports, Unraid service updates, device tests,
Docker smoke tests, PWA acceptance tests or backup restore tests were performed.
