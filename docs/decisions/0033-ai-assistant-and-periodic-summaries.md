# 0033: AI assistant and periodic summaries

## Status

Accepted

## Decision

Our Recipes provides a profile-scoped assistant drawer, a dedicated meal-plan generator, and daily/weekly summary surfaces using the OpenAI SDK Responses API. OpenAI response storage is disabled (`store: false`); conversation history and generated summaries are stored in the household SQLite database.

Read tools may return recipes, plans, and permitted nutrition context directly. Every tool that changes app data creates an expiring local proposal. A separate trusted-origin confirm request applies the proposal using existing domain services and the signed actor profile seam. Generated recipes and their meal-plan entries commit in one SQLite transaction.

AI workload settings are household-wide. Each profile separately controls which data categories can be included in future model requests. Identity, personal metrics, weight, and raw diary entries are off by default. Revoking a category affects future requests and does not recall previously transmitted data.

Periodic summary jobs run in production only, use bounded aggregate evidence, and retry with backoff. Development and tests use injected deterministic providers and never make paid calls.

## Consequences

- Household profiles remain a convenience boundary rather than authentication.
- AI output is never trusted as a database command or medical/allergen guarantee.
- Proposal digests, optimistic versions, trusted-origin checks, and server-side validation guard every write path.
- Model availability is operator-dependent; curated choices coexist with validated custom model IDs.
