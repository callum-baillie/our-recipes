# T028 Nutrition API validation repair

Centralized strict Nutrition profile UUID and access-secret UTF-8 byte validation in the server route helper. Every dynamic profile endpoint validates its route parameter before invoking a service. Identity and login now share the credential layer's 8-character/256-byte boundary, so multibyte overflow is a safe 400 rather than a generic 500.

Regression tests prove invalid profile paths and over-byte-limit multibyte secrets return 400; validation responses do not echo the submitted secret. Existing exact-origin, signed-session and service authorization behavior is unchanged.

Evidence: focused API/session tests 4 pass; full suite 142 unit and 60 integration pass; ESLint, TypeScript, Prettier and scoped diff checks pass.

The exact GoalBuddy Worker exceeded the single-wait limit and was interrupted; the PM completed the exact bounded repair as permitted fallback.
