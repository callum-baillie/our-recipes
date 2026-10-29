# Connection and reload troubleshooting

The connection notice checks `GET /api/v1/health` on the same Bòrd server. That endpoint
checks local household/database readiness, migration status and SQLite integrity. It
does not ask for camera access, contact a scanner or call an AI provider. Signing in
is a separate check. A successful health response does not guarantee every individual
page or mutation will succeed; those operations still handle their own failures.

The initial notice appears only if the check takes more than 1.5 seconds. Each request
times out after 8 seconds. Failed checks retry after 2, 4, 8, 16 and then at most once
every 30 seconds, while the tab is visible and the device reports a network connection.
Returning to the tab or reconnecting checks immediately. The manual Check connection
button also retries. These probes never reload the document or replay writes, and
stop scheduling retries when the surface unmounts. Unsaved changes are not an offline
queue; a full browser reload can still discard a draft.

## Development reload loop diagnosed on 2026-10-28

The LAN development server repeatedly sent Turbopack HMR `restart` messages for its
entry chunk list. The sign-in page reproduced the loop even without a service worker
or the connection-notice component. The server's health endpoint returned 200/ok.
Disabling `experimental.turbopackFileSystemCacheForDev` stopped the loop after Next
automatically restarted, and fresh page loads stayed stable while source edits still
updated the page in place.

This matches the Next 16.4 restart-cache regressions reported in
[Next issue #100251](https://github.com/vercel/next.js/issues/100251) and
[Next issue #100267](https://github.com/vercel/next.js/issues/100267). The preceding switch
between a fixture server and the saved LAN server reused `.next/dev`; that is a likely
trigger, rather than a confirmed identification of which cached entry first went bad.

Keep the development filesystem cache disabled until an upstream fix is verified.
Before re-enabling it, exercise client navigation, a server restart using the same
cache, an early API request, and a fresh browser load; observe document navigations
and HMR messages for at least 15 seconds. Healthy HTTP responses alone miss this bug.
Use a separate checkout/build directory for independently running test servers.
Never delete household data to repair compiler state.

If a loading screen recurs, inspect document navigation counts, browser console and
failed script requests alongside the server logs and health response. A framework
HMR navigation can interrupt React before its error boundary can show an error.
Do not add automatic page reloads as connection recovery. For everyday use, a built
production/preview server avoids development HMR entirely; deployment is a separate
operation from fixing the current development instance.
