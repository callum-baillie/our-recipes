# T001: Specification validation

Task: `T001`
Kind: `judge`
Status: `current`

## Summary

The supplied specification is internally consistent enough to execute continuously from an empty repository. Its likely failure mode is a high-quality partial application, so progress must remain tied to the fresh-Docker end-to-end release oracle rather than any individual route, component, or test suite. Required current-product and dependency research should complete before the initial architecture package; no user decision is needed to begin that read-only work.

## Validated execution sequence

1. Research current feature patterns in the six named recipe products and current official technical documentation.
2. Select and implement one coherent production foundation package: repository conventions, Next.js/TypeScript baseline, quality tooling, dependency lock, environment/configuration model, secure persistence seams, and required architecture documentation.
3. Build a real household workflow vertically: setup/profiles, persisted recipes/revisions, responsive library/detail/editor, search, attribution, and meaningful tests.
4. Add complete reviewed capture/import and local image handling; keep all AI calls optional, server-only, auditable, and mocked in normal tests.
5. Complete cooking, scaling/conversion, organization, meal plans, shopping, printing, PWA/API, security, recovery, Docker/Unraid, documentation, and release verification as cohesive packages.

## First foundation-package decision criteria

The architecture Judge must select a package that creates a runnable, testable production base—not a static design mock—and explicitly defines:

- maintained, compatible package choices from official sources, with a lockfile;
- a testable service/repository/provider boundary and SQLite lifecycle approach;
- safe configuration, `DATA_DIR`, actor-context, request-security, migration, and storage seams;
- product and architecture documentation, including decisions for material deviations;
- quality commands that can run locally before feature work;
- no exposure or invocation of OpenAI credentials, no paid calls, and no external publishing.

## Material risks and deferred approvals

- The exact current compatibility of Next.js, a PWA approach, SQLite native driver, Sharp, Drizzle, and Node/Docker needs official-source confirmation before dependency selection.
- User authorization permits mocked OpenAI features, but live credentials and paid provider verification remain separately gated.
- The requested Image Gen concept is authorized by the specification, but should be scheduled with the UI/design package after the foundation is stable; it is not a prerequisite for repository scaffolding.
- Docker persistence, backup/restore, hostile-import defense, 10,000-recipe performance, and visual/print accessibility must be designed early and proved at release—not treated as documentation-only work.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  decision: approved
  full_outcome_complete: false
  note: notes/T001-specification-validation.md
  summary: "Specification validated; complete T002/T003 research before selecting a coherent production foundation package."
```
