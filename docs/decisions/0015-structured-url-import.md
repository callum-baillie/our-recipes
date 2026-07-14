# 0015 — Public recipe URLs use deterministic bounded markup extraction

## Decision

Keep public-page fetching inside the existing server-side URL safety boundary. After a URL passes HTTP(S), credential, DNS/address, redirect, type, timeout, and byte-limit checks, parse the returned bounded HTML with server-only Cheerio. Do not render the page, execute JavaScript, follow metadata URLs, or download images.

Candidate order is intentional:

1. embedded Schema.org `Recipe` JSON-LD, including root arrays and `@graph` nodes;
2. Schema.org Recipe Microdata when no usable JSON-LD Recipe candidate exists;
3. Open Graph title/description plus bounded readable page text only as an explicitly warned review fallback.

Every structured result remains a candidate until the household member chooses it and reviews the ordinary recipe form. URL extraction does not persist page HTML, raw JSON-LD, candidate state, source media, or remote credentials.

## Consequences

The approach makes standards-compliant URL import useful without creating a browser automation, remote image, or provider boundary. It does not claim arbitrary JavaScript-rendered pages or proprietary export formats are supported. Those would require a separate security and retention decision.

## References

- [Cheerio loading documentation](https://cheerio.js.org/docs/basics/loading/)
- [Schema.org Recipe](https://schema.org/Recipe)
