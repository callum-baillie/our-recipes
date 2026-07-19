FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data
ENV DATABASE_URL=/data/our-recipes.db
RUN apt-get update \
  && apt-get install --yes --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 recipes && useradd --uid 1001 --gid recipes --create-home recipes \
  && mkdir -p /data/backups /app \
  && chown -R recipes:recipes /data /app
COPY --from=builder --chown=recipes:recipes /app/public ./public
COPY --from=builder --chown=recipes:recipes /app/.next/standalone ./
COPY --from=builder --chown=recipes:recipes /app/.next/static ./.next/static
COPY --from=builder --chown=recipes:recipes /app/drizzle ./drizzle
COPY --from=builder --chown=recipes:recipes /app/scripts/container-migrate.mjs ./scripts/container-migrate.mjs
COPY --chown=recipes:recipes scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh
# The migration entrypoint runs before Next starts, so its direct ORM and
# optional provider imports must be present beside the standalone runtime.
COPY --from=builder --chown=recipes:recipes /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=recipes:recipes /app/node_modules/openai ./node_modules/openai
# Sharp loads its platform-specific native binding and bundled libvips from
# optional @img packages at runtime. Next's standalone trace can include the
# Sharp JavaScript wrapper without those native packages, so copy both
# explicitly for each buildx target architecture.
COPY --from=builder --chown=recipes:recipes /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=recipes:recipes /app/node_modules/@img ./node_modules/@img
# PDF.js parses recipe PDFs through its Node legacy build. Its optional canvas
# bridge provides DOMMatrix and must ship beside the standalone server.
COPY --from=builder --chown=recipes:recipes /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
COPY --from=builder --chown=recipes:recipes /app/node_modules/@napi-rs ./node_modules/@napi-rs
# Tesseract starts its Node worker from installed package files and loads this
# pinned English model through a local filesystem path. It is immutable image
# content, deliberately outside the household data volume.
COPY --from=builder --chown=recipes:recipes /app/node_modules/tesseract.js ./node_modules/tesseract.js
COPY --from=builder --chown=recipes:recipes /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core
COPY --from=builder --chown=recipes:recipes /app/node_modules/wasm-feature-detect ./node_modules/wasm-feature-detect
COPY --from=builder --chown=recipes:recipes /app/node_modules/@tesseract.js-data/eng ./node_modules/@tesseract.js-data/eng
COPY --from=builder --chown=recipes:recipes /app/scripts/verify-container-runtime.mjs ./scripts/verify-container-runtime.mjs
RUN node ./scripts/verify-container-runtime.mjs
RUN chmod 0755 ./scripts/container-entrypoint.sh
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/app/scripts/container-entrypoint.sh"]
CMD ["sh", "-c", "node scripts/container-migrate.mjs && exec node server.js"]
