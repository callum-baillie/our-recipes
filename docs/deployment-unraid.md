# Unraid deployment

1. Create `/mnt/user/appdata/our-recipes`. On first start the image initializes ownership of this app-specific data directory before dropping to its non-root runtime user; do not map a shared media directory here.
2. Import `unraid/our-recipes.xml` as a custom template, or adapt `docker-compose.unraid.yml`. Both use the public `ghcr.io/callum-baillie/our-recipes:latest` image.
3. Map container `/data` to `/mnt/user/appdata/our-recipes` and map container port `3000` to an unused LAN port (for example host port `4123`).
4. Set a unique `COOKIE_SECRET`, exact `APP_ORIGIN` using that same host port (such as `http://recipes.lan:4123`), timezone, and optional trusted proxy origins. Set `OPENAI_API_KEY` only when you intentionally permit explicit OpenAI actions; do not mount or copy the development-only `.api_keys` file.
5. Start the container, check its health endpoint, complete household setup, and run `pnpm test:docker` or the equivalent target-host smoke procedure to prove persistence before relying on it.

The SQLite database, local images, and backup bundles must all remain under the one persistent `/data` mapping. Keep the application behind a trusted LAN or authenticated reverse proxy; profiles do not restrict access.

The template and compose example are prepared but not verified on an Unraid host in this workspace. Treat host-specific ownership, share settings, reverse proxy, and port mapping as operator review steps.
