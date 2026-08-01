# Bòrd Expo design QA

- Source visual truth: `../bord_expo_ios_mockup_pack/mockups/06-recipes.png`, `12-recipe-detail.png`, `14-recipe-cook.png`, `17-nutrition.png`, `19-list-detail.png`, plus `../bord_expo_ios_mockup_pack/contact-sheets/02-recipe-workflows.png` and `03-planning-household.png`.
- Implementation screenshot: unavailable for the current build. The older `artifacts/ui-audit-2026-07-30/05-after-recipes-375x667.png` was opened only as a pre-change baseline and is not valid evidence for this pass.
- Intended viewport: 393 x 852 CSS points at device scale factor 2.
- Source pixels: 786 x 1704 for each relevant mockup (393 x 852 points at 2x).
- Implementation pixels/CSS size/density: unavailable; no current browser-rendered or simulator screenshot could be captured in this Windows session.
- State: authenticated Recipes, Recipe Detail, Cook Mode, Nutrition, and active Shopping List.

## Full-view comparison evidence

The source contact sheets and relevant individual mockups were opened and inspected. A current implementation image could not be opened, so a normalized same-state comparison could not be performed. The older Recipes capture confirms the pre-change issues (large body-level New recipe/Import actions and a filled header plus), but it predates the implementation in this pass.

## Focused region comparison evidence

Blocked. The important focused regions are the fixed header actions, recipe hero overlay, ingredient alignment, Cook Mode step card and footer, shopping state controls/store card, Nutrition profile/date controls/chart, and bottom-tab clearance. Current rendered captures are required to judge these regions.

## Findings

- [P1] Current rendered implementation evidence is missing.
  - Location: all changed screens.
  - Evidence: source mockups are available at 786 x 1704, but the current implementation has no matching screenshot.
  - Impact: typography, wrapping, safe-area clearance, icon rendering, and final visual fidelity cannot be accepted from source code or bundle output alone.
  - Fix: capture the authenticated screens on an iPhone simulator or Expo Go device at 393 x 852 points, then compare normalized 2x images with the source mockups.

## Required fidelity surfaces

- Fonts and typography: code continues to use the shared editorial/system hierarchy; current rendering not visually verified.
- Spacing and layout rhythm: shared tokens and centralized tab clearance are implemented; current rendering not visually verified.
- Colors and visual tokens: the design-pack palette is retained; current rendering not visually verified.
- Image quality and asset fidelity: source recipe imagery and the real Bòrd SVG remain in use; current crop and density not visually verified.
- Copy and content: requested labels and shopper states are implemented; truncation and wrapping not visually verified.

## Comparison history

1. Baseline evidence: the 2026-07-30 Recipes capture showed the old filled plus action and duplicated body actions.
2. Fixes made: fixed shared header with tappable Bòrd SVG and avatar menu; Recipes/Plan/Pantry/Nutrition/Lists native tabs; compact hero controls; time breakdown and Method; semantic server-backed Cook Mode; native recipe import and cover selection; Pantry and shopping scanner continuations; shopper state/store workflow; Nutrition chart/profile/date/manual-intake layout; centralized tab clearance; and account-scoped cache states.
3. Post-fix visual evidence: unavailable. Static checks, iOS/Android/Web exports, and automated tests do not substitute for the required visual comparison.

## Primary interactions checked

- Automated: five-tab route contract and logo-owned Home; shopping in-cart/unavailable state transitions; scoped persisted app-state behavior; Cook Mode progress bounds; selected planner day state; server cache replacement; format, lint, TypeScript, Expo Doctor, and all three platform exports.
- Rendered interaction check: blocked without a current simulator/device/browser surface.
- Console errors: web production bundle completed, but runtime console inspection was not available.

## Implementation checklist

- Capture the five changed screens at 393 x 852 points.
- Verify the header menu, profile selector, shopper filters, and More nested navigation interactively.
- Check bottom clearance on the smallest supported iPhone and a gesture-navigation Android device.
- Compare the source and current captures in one normalized comparison image.

final result: blocked
