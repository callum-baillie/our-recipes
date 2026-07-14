# ADR 0004: Cooking state is profile-specific and recipe content stays immutable

Cooking mode computes scaled display quantities from the current recipe and a target serving count in the browser. It never writes those calculated values back to a shared recipe. Local timers are browser state only; favorite records and completed cook sessions are persisted per profile.

Temperature conversion is an explicitly labeled calculator, not an automatic ingredient or recipe rewrite. This keeps potentially ambiguous culinary conversions visible and reversible while preserving source content.
