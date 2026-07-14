# T016 — review-first URL and text capture decision

## Decision

The next package is a hardened first capture workflow: paste recipe text or submit a public `http`/`https` URL; create a non-persistent capture draft; show source/original extracted text and a user-editable structured recipe review; and only write a shared recipe after an explicit confirm action. It will not call OpenAI.

For URLs, the Worker must keep all fetching server-side and implement a bounded fetcher: URL parsing, `http`/`https` only, credentials rejection, hostname DNS resolution, loopback/private/link-local/multicast/reserved address rejection on every redirect, no more than three redirects, response type allow-list, byte limit, timeout, and no forwarded cookies. Normal tests must mock network responses; they must not use the internet.

Image, handwriting, and PDF capture remain later packages because their upload/OCR/parser boundaries need distinct quotas and malware/archive/image defenses. This package creates the review-and-provenance architecture they will share.
