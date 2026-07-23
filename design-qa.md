# Design QA: live onboarding branding and kitchen illustration

## Source visual truth

- `C:\Users\Callum\Pictures\Screenshots\Screenshot 2026-07-21 092357.png`
- User direction: replace the lower-right placeholder with a transparent illustrated wooden chopping board, garlic, avocados, and utensils in the initial green palette; update the left wordmark while the kitchen name and icon change.

## Implementation evidence

- Asset: `C:\Users\Callum\Documents\Recipe\public\illustrations\onboarding-kitchen-board.png`
- Desktop: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8292-74aa-71e3-89d7-ce4ced5a2a9b\onboarding-live-branding-illustration-desktop-1280x900-v2.png`
- Mobile: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8292-74aa-71e3-89d7-ce4ced5a2a9b\onboarding-live-branding-mobile-390x844.png`

## Viewports and state

- Desktop: 1280 x 900, green dark theme, step 1, Kitchen name set to `The Garden Table`, Croissant selected.
- Mobile: 390 x 844, green dark theme, step 1, Kitchen name set to `Callum's Kitchen`, Croissant selected.
- The source crop, transparent generated asset, desktop implementation, and mobile implementation were opened together for comparison.

## Findings

- No remaining P0, P1, or P2 findings.
- Fonts and typography: existing Georgia/Inter hierarchy is unchanged; the dynamic wordmark retains the established style and truncates safely.
- Spacing and layout: the decorative cluster is anchored to the lower-right, visually clears the intro copy, and does not affect the split layout. The mobile illustration remains intentionally hidden in the compact header.
- Colors and tokens: the artwork uses the existing olive, sage, cream, warm wood, and terracotta family. The live icon background and foreground use branding tokens and therefore follow palette/appearance changes.
- Image quality: the 1254 x 1254 RGBA PNG has transparent corners, full alpha range, crisp matte edges, and a compact readable silhouette at its rendered size.
- Copy and content: the typed Kitchen name is mirrored immediately in the left wordmark; an empty field falls back to `Your kitchen` only for the preview.

## Comparison history

1. The source showed a generic CSS-drawn pot/plant placeholder and a static `Our Recipes` wordmark.
2. The placeholder was replaced with a generated, locally alpha-matted illustration containing the requested chopping board, garlic, avocados, knife, spoon, and fork. The wordmark was connected to the onboarding name and icon state.
3. First desktop capture found the generated cluster too large and overlapping the intro-copy region (P2). Its responsive width and bottom/right offsets were reduced.
4. The second desktop capture shows clear visual separation from the copy while preserving the requested lower-right placement. Mobile remains one viewport tall with no horizontal overflow.

## Interaction and browser evidence

- Typing a Kitchen name changed the left link's visible text and accessible name immediately.
- Selecting Croissant changed both the selected radio state and the left mark.
- Mobile document size was exactly 390 x 844; the illustration was hidden as designed and the dynamic wordmark fit without truncation for `Callum's Kitchen`.
- Desktop document size was exactly 1280 x 900; the illustration rendered as a decorative block and the customized name remained visible.
- Browser warning/error log was empty.

## Final result

passed

---

# Design QA: mobile planner generation action and footer

## Source visual truth

- User browser annotations for `/planner` at 555 x 912.
- Pre-change reference: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-command-closed-555x912.png`
- Requested changes: replace the mobile Add recipe command with Generate meal plan, open the existing recipebook-versus-AI dialog, slightly enlarge the centered Bòrd lockup, and show the global footer on mobile only.

## Implementation evidence

- Final 555 x 912 command bar: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-generate-footer-555x912-v2.png`
- Final 390 x 844 command bar: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-generate-390x844-v3.png`
- Generation dialog: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-generation-dialog-555x912.png`
- Footer at the end of the mobile plan: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-footer-555x912.png`

## Fidelity ledger

- Command copy and behavior: `Add recipe` was replaced by `Generate meal plan`; the button opens the shared dialog with `Plan from recipebook` and `Create a plan with AI`.
- Context: the mobile launcher passes the selected date range, meal types, household profiles, AI model, and image-generation preference to the same generator used by the planner setup panel.
- Manual workflow: every empty meal slot retains its existing `Add recipe` button and recipebook picker.
- Header: the mobile lockup increased from 97.6 px to 108 px at 555 px while remaining responsive at 83.2 px on a 390 px viewport.
- Responsive fit: document scroll width equals client width at 390 px and 555 px; the narrow header retains a positive gap between the centered logo box and right-side controls.
- Footer: mobile/tablet planner layouts use normal document scrolling and show the global footer after the schedule; the 1280 x 720 desktop workspace keeps body overflow hidden and the footer hidden.
- Dialog: the 555 px dialog has no horizontal overflow and exposes unique dialog and heading IDs for each launcher instance.
- Scrollbar mismatch fixed: document-root scrollbars initially consumed 15 px at the narrow breakpoint; the scrollbar remains functional but visually hidden on the mobile planner.

## Above-the-fold copy diff

- Removed from the mobile command bar: `Add recipe`.
- Added to the mobile command bar: `Generate meal plan`.
- No other planner toolbar, header, meal-row, or desktop copy changed.

## Verification

- Browser interaction verified the generation dialog, both generation choices, selected planner context, footer visibility, 390/555 px overflow, and desktop footer suppression.
- Prettier, ESLint, TypeScript, and seven focused unit tests passed.
- The focused Playwright file could not start its isolated web server because the active Next.js development server owns the repository lock; its updated flow was verified manually in the running browser instead.

## Final result

passed

---

# Design QA: mobile application header

## Source visual truth

- Browser annotations supplied for `/planner` at 555 x 912.
- Pre-change capture: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-command-closed-555x912.png`
- Requested mobile-only changes: place the navigation menu at the far left, center and enlarge the Bòrd lockup, and move Settings from the standalone header control into the navigation menu.

## Implementation evidence

- Closed mobile header: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\app-header-mobile-closed-555x912.png`
- Open mobile menu: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\app-header-mobile-menu-555x912-v2.png`
- Narrow-phone menu: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\app-header-mobile-menu-390x844-v2.png`

## Viewports and findings

- 555 x 912: hamburger begins at x=16, the 97.6 px lockup is centered with a 0 px center offset, the standalone Settings control is hidden, and the menu contains Recipebook, Pantry, Nutrition, Planner, Lists, and Settings.
- 390 x 844: hamburger begins at x=16, the responsive 83.2 px lockup remains centered without overlapping the right controls, and the page has no horizontal overflow.
- 768 x 900 and 1280 x 720: the existing larger-viewport layout is unchanged; the standalone Settings control remains visible and the wordmark/menu retain their previous placement.
- Browser console and page-error capture was empty at the tested mobile widths.
- The open menu overlays the page from the left without moving planner content or introducing horizontal overflow.

## Copy and interaction changes

- Added `Settings` to the mobile navigation only.
- Removed no desktop actions or navigation.
- The native disclosure menu retains keyboard activation, focus behavior, and an accessible `Open navigation` label.

## Final result

passed

---

# Design QA: Planner summary consolidation

## Source visual truth

- `C:\Users\Callum\AppData\Local\Temp\codex-clipboard-435881ab-d9a0-419d-b507-fbe11fcdebb8.png`
- User browser feedback: remove the calendar-bottom “Your plan at a glance” strip and carry its visual language into the right-rail week summary.

## Implementation evidence

- Desktop planner: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-summary-rail-2026-07-22.png`

## Viewport and state

- Desktop: 1280 x 720, week view, empty meal plan, current-day column highlighted.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- The former bottom summary is absent, allowing the calendar to fill the planner column through the bottom of the viewport.
- The right-rail summary now reuses the removed strip’s calendar marker, visible date range, and three segmented metrics without crowding the narrow rail.
- The page has no horizontal overflow (`scrollWidth` equals `clientWidth`), and the browser console contains no warnings or errors beyond development-mode informational logs.

## Primary checks

- Confirmed the removed summary label is absent from the rendered DOM.
- Confirmed the replacement exposes a named `Week plan at a glance` region with meals, servings, and recipe counts.
- Compared the accepted planner mockup and the final browser-rendered screenshot at original resolution.

## Final result

passed

---

# Design QA: meal-plan AI costs and image controls

## Source visual truth

- User-annotated planner dialog at `http://localhost:3000/planner`, targeting the AI mode explainer.
- Requested additions: clearly estimated input/output costs, an off-by-default per-plan recipe-image switch with a cost warning, and a household-wide setting.

## Viewports and states

- Desktop: 1178 x 912 in the in-app browser, planner generator open with recipe images off and on.
- Global gate: AI Settings switch enabled, disabled, saved, reloaded, enforced in the planner, then restored to enabled.
- Mobile coverage: 390 x 844 assertions were added to the existing planner browser test for dialog overflow and the image switch.

## Findings

- Typography: the estimate uses the dialog's existing compact body scale and restrained weights; its total remains the strongest figure without competing with the mode title.
- Spacing: the estimate is grouped directly below the AI explainer, and the image toggle stays in the existing option rhythm. The two mode cards remain balanced.
- Color: the estimate uses existing linen, leaf, line, and muted tokens; no new one-off palette was introduced.
- Content: input, output, optional image count/cost, total, pricing date, and actual-usage caveat are explicit. The required cost warning is present next to the image switch.
- Behavior: the local switch defaults off, recalculates the visible total, and is disabled with a Settings link when the global permission is off. Settings persistence survived reload.
- Accessibility: both controls expose switch roles and descriptive accessible names; the estimate has an accessible label; keyboard focus styling is inherited from the existing switch controls.
- Console: no warning or error entries were observed during planner and Settings verification.

## Primary interactions tested

- Opened the generator and confirmed separate input and output estimates.
- Enabled recipe images and confirmed the image count, image estimate, and total updated.
- Disabled image generation globally, saved, reloaded, and confirmed the planner switch became unavailable with an explanation.
- Restored the global setting and confirmed the checked state after reload.

## Final result

passed

---

# Design QA: planner range, meal types, views, and history controls

## Source visual truth

- Desktop planner reference: `C:\Users\Callum\AppData\Local\Temp\codex-clipboard-435881ab-d9a0-419d-b507-fbe11fcdebb8.png`
- Mobile planner reference: `C:\Users\Callum\AppData\Local\Temp\codex-clipboard-2f2ae1f5-35ff-4573-b129-c267c8c1fb7a.png`
- User browser annotations defined the final interaction changes: overlaid date picker, configurable meal rows, Add New profile link, period views, and save/history controls.

## Implementation evidence

- Desktop implementation: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-final-2026-07-22.png`
- Mobile implementation: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-390x844.png`
- Compact mobile command card: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-command-closed-555x912.png`
- Expanded mobile nutrition state: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-mobile-command-nutrition-555x912.png`
- Side-by-side desktop comparison: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-reference-final-comparison.png`

## Viewports and state

- Desktop: 1178 x 912, empty weekly plan, default five visible meal rows, current-day highlight.
- Phone: 390 x 844, single-day fallback, empty meal cards, two-row compact toolbar.
- Annotated mobile viewport: 555 x 912, compact command card closed and nutrition disclosure open.
- Tablet: 768 x 1024, month selected in the URL while the responsive UI intentionally falls back to a single-day plan.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Layout: the planner retains the edge-to-edge three-column workspace on desktop. Save, undo, and redo sit immediately before the combined Previous/view/Next control without colliding with the heading at the annotated 1178 px viewport.
- Date range: the picker floats above the sidebar content and exposes 3, 5, 7, and 14 day quick actions from today. Selecting 14 days updated the accessible selected-day summary without shifting the layout.
- Meal types: Breakfast, Lunch, Dinner, Dessert, and Snack are visible by default. The compact editor includes Brunch, Supper, Tiffin, Suhoor, and Iftar plus a custom-type field; the old Select all and Clear all actions are absent.
- Responsive behavior: phone and iPad-mini-width layouts show a single day and full-width empty meal boxes below their labels. The oversized weekday heading and separate toolbar are replaced by one compact command card containing the retained date tile, Day/Week/Month control, period navigation, history, settings, Nutrition, and Add recipe. Nutrition and pantry details are absent by default and disclosed only from the toolbar. The 555 px document has no horizontal overflow.
- Typography and color: the existing serif planner hierarchy, muted green selection state, terracotta creation action, and restrained UI weights remain consistent with the approved planner references.
- Accessibility: period navigation has explicit accessible labels even when text is visually hidden; view buttons expose pressed state; quick ranges, meal settings, and history controls have accessible names and visible focus treatment.

## Primary interactions tested

- Opened and closed the date range popover; selected the 14-day and 7-day quick ranges.
- Opened the meal-type editor and verified all built-in labels, descriptions, custom-type input, and save action.
- Switched to Month, advanced to the next month, switched to Day, and advanced to the next day while retaining the selected view in the URL.
- Verified Previous/Next advance by the active Day, Week, or Month period on mobile; Day advanced to Jul 23, Week to Jul 27, and Month to Aug 1.
- Opened and closed the mobile Nutrition disclosure; the details region was absent while collapsed and exposed with `aria-expanded` when opened.
- Verified the 768 px month URL renders the compact one-day fallback.
- Activated Save and observed the explicit `All planner changes are saved.` status.
- Confirmed the phone toolbar exposes Undo, Redo, Save, Previous day, Today, Next day, settings, and Add recipe without hiding the planner content.

## Final result

passed

---

# Design QA: planner date range control and sidebar sections

## Source visual truth

- `C:\Users\Callum\AppData\Local\Temp\codex-clipboard-f6493c25-5a0b-4b25-8778-e50edcfeedcd.png`
- User direction: make Date range interactive, let the selected range define plan duration, remove the duplicate duration control, and remove the clipped section borders.

## Implementation evidence

- Desktop picker capture: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-date-range-desktop-2026-07-22.jpg`
- Open-picker source/implementation comparison: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-date-range-comparison-2026-07-22.jpg`
- Closed-state source/implementation comparison: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-date-range-final-comparison-2026-07-22.jpg`

## Viewport, state, and normalization

- Desktop CSS viewport: 1178 x 912 at device pixel ratio 1.
- State: empty Jul 20–Jul 26, 2026 planner, Callum selected, Breakfast/Lunch/Dinner selected.
- Comparison: the 280 x 624 reference and a 289 x 624 implementation sidebar crop were placed side by side at equal height. The browser-comment annotation overlay is external to the app and appears in the captured implementation comparison.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: existing planner serif/body hierarchy is retained. Range labels and the derived day count use the same compact sidebar scale.
- Spacing and layout rhythm: removing the duration fieldset shortens the setup flow and renumbers the remaining steps. The picker expands in the normal sidebar flow and remains inside the custom-scrollbar region.
- Colors and visual tokens: the picker uses existing field, leaf, line, focus, and selection tokens; no new palette was introduced.
- Image quality and assets: no image assets were needed for this UI-only correction. Existing Lucide calendar and chevron icons remain crisp at the sidebar size.
- Copy and content: `Date range`, `Start date`, `End date`, the inclusive day count, and `Done` make the control's behavior explicit. `Plan duration` is removed because the selected dates are now authoritative.
- Interaction and accessibility: the range summary is a real button with `aria-expanded` and `aria-controls`; the date inputs have visible labels and native calendar affordances; Escape and Done close the picker; focus states remain visible.
- Section borders: computed styles at 1178 px confirm zero top, left, and right borders on the Meals and household fieldsets. Only the intended bottom divider remains.

## Comparison history

1. The initial implementation used an invisible single-date input stretched over a decorative range label, so it did not offer an explicit end-date selection.
2. The range label was replaced with an expandable start/end picker and the selected inclusive day count became the duration passed to both generation paths.
3. Browser QA exposed a legacy `@media (max-width: 1180px)` adjacent-fieldset selector that reintroduced the left border. A matching later override removed it; computed style now reports `0px none` for top, left, and right borders.

## Primary interactions tested

- Opened the date range picker from the summary button.
- Changed the end date from Jul 26 to Jul 24 and verified the summary changed to Jul 20–Jul 24 and `5 days selected`.
- Opened the meal-plan generator and verified its Planner selections showed Jul 20–Jul 24.
- Closed and reopened the picker with the Done button.
- Verified the picker and controls remain within the sidebar at 1178 x 912 without horizontal overflow.
- Browser DOM showed no application error banner or alert during the tested states. This in-app browser capability does not expose a separate console-log stream.

## Verification

- Prettier: passed for the changed component and stylesheet.
- TypeScript: `tsc --noEmit` passed.
- ESLint: passed for `src/components/meal-planner.tsx`.
- Focused unit suite: 3 tests passed in `tests/unit/pantry-recipe-planner-components.test.ts`.
- Focused Playwright launch was attempted, but its isolated web server could not start because the user's development server already owns the repository's Next.js dev lock. Equivalent live interaction coverage was completed in the in-app browser without mutating planner data.

## Final result

passed

---

# Design QA: planner configuration sidebar

## Source visual truth

- `C:\Users\Callum\AppData\Local\Temp\codex-clipboard-71e3cf12-4aad-4013-b229-a49d7c64b118.png` (686 x 2048 px).
- User direction: match the four-section setup hierarchy and pin the Generate meal plan action and its explainer to the bottom of the sidebar.

## Implementation evidence

- Full desktop capture: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-sidebar-final-v3.jpg`.
- Focused implementation crop: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-sidebar-polished-crop-v3.png`.
- Normalized side-by-side comparison: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8677-3dec-7b00-91b2-21b20ab1226f\planner-sidebar-comparison-v3.png`.

## Viewport, state, and normalization

- Desktop browser viewport: 1178 x 912 CSS px at device pixel ratio 1.
- Implementation sidebar: 288 x 822 px below the 90 px global header.
- Source was normalized from 686 x 2048 px to 288 x 864 px. The 288 x 822 implementation crop was padded below by 42 px only for the side-by-side canvas; content widths are compared 1:1.
- State: Jul 20 to Jul 26, 2026; 7 days; Breakfast, Lunch, and Dinner selected; Callum selected.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the serif heading, medium-weight section labels, compact control labels, and centered helper copy reproduce the source hierarchy without introducing heavier UI weights.
- Spacing and layout rhythm: the four numbered sections use the source order, dividers, two-column meal grid, segmented duration control, and comparable vertical cadence. The footer is sticky at the exact bottom of the 822 px sidebar and the panel has no internal overflow at this viewport.
- Colors and visual tokens: selected controls intentionally inherit the active household theme's teal-green tokens rather than hard-coding the mockup's olive palette. Terracotta remains reserved for the generation action.
- Image quality and asset fidelity: the source contains no raster artwork or custom imagery. Existing Lucide calendar, chevron, profile, close, user-add, and sparkle icons remain crisp and consistent with the rest of the product.
- Copy and content: the visible date range, duration labels, meal labels, profile name, Generate meal plan label, and explainer match the requested content. The explainer now reads `Start with trusted recipes or create a balanced plan automatically.`
- Integration constraint: the source depicts a rounded standalone card, while the implementation intentionally remains flush to the browser's left edge to preserve the previously approved full-width planner layout.

## Comparison history

1. The initial implementation used a compact native date field, pill-sized meals, a narrow 240 px rail, and an action block that visually sat within the scrolling content.
2. The sidebar was widened to 288 px, the date was reformatted as an icon-led range control, sections were separated, meal controls became a two-column grid, and the selected profile gained the source-style remove affordance.
3. The first normalized comparison found the action and helper copy slightly undersized. The button was increased to 53.6 px and helper copy to 13.1 px; the final comparison shows their scale and bottom placement aligned with the source.

## Primary interactions and browser evidence

- Changed the duration from 7 days to 3 days and verified the visible date range updated to Jul 20 to Jul 22; restored 7 days afterward.
- Opened the Generate meal plan dialog from the pinned footer and closed it again.
- Checked the 390 x 844 mobile day view and mobile settings drawer; document width remained exactly 390 px with no horizontal overflow.
- Browser warning/error log was empty.

## Follow-up polish

- P3: the olive source palette could be hard-coded for exact screenshot color matching, but doing so would bypass the user's active theme and make this sidebar visually inconsistent with the rest of Bòrd.

## Final result

passed

---

# Design QA: supplied SVG masters and platform icons

## Source visual truth

- Original icon: `C:\Users\Callum\Downloads\icon.svg` (1024 x 1024 SVG viewport).
- Original lockup: `C:\Users\Callum\Downloads\logo.svg` (1024 x 336 SVG viewport).
- Direction: preserve the supplied artwork, remove any pure-white canvas background, optimize it for the web, make the table mark behave like a Lucide icon, and rebuild favicon, Apple, Android, and PWA assets from it.

## Implementation evidence

- Optimized masters: `C:\Users\Callum\Documents\Recipe\branding\icon.svg` and `C:\Users\Callum\Documents\Recipe\branding\logo.svg`.
- Public vectors: `C:\Users\Callum\Documents\Recipe\public\brand\bord-mark.svg` and `C:\Users\Callum\Documents\Recipe\public\brand\bord-lockup.svg`.
- Full-asset comparison: `C:\Users\Callum\Documents\Recipe\.test-data\bord-svg-master-comparison.png` (1604 x 680; original on the left, optimized implementation on the right).
- Focused rendered-icon comparison: `C:\Users\Callum\Documents\Recipe\.test-data\bord-svg-source-implementation-comparison.png` (1028 x 512; source-derived target on the left, settings-picker capture on the right).
- Desktop home capture: `C:\Users\Callum\Documents\Recipe\.test-data\bord-svg-qa-desktop-viewport.png` (1265 x 889 captured pixels).
- Desktop settings capture: `C:\Users\Callum\Documents\Recipe\.test-data\bord-svg-qa-settings.png` (1265 x 889 captured pixels).
- Mobile home capture: `C:\Users\Callum\Documents\Recipe\.test-data\bord-svg-qa-mobile.png` (375 x 812 captured pixels).
- Offline-state capture: `C:\Users\Callum\Documents\Recipe\.test-data\bord-svg-qa-offline.png` (1265 x 889 captured pixels).

## Viewport, state, and normalization

- Desktop CSS viewport: 1280 x 900 at device pixel ratio 1; the browser capture excludes the scrollbar gutter and reports 1265 x 889 pixels.
- Mobile CSS viewport: 390 x 844 at device pixel ratio 1; the browser capture reports 375 x 812 pixels.
- State: configured Bòrd kitchen, green dark theme; table selected in System Settings.
- The full-asset comparison renders both original and optimized SVGs onto equal off-white panels at equal dimensions. The focused comparison normalizes an 80 x 80 source-derived icon-picker tile and the corresponding 80 x 80 implementation crop to equal 512 x 512 panels.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the outlined Bòrd typography in the supplied `logo.svg` is retained as vector paths, so it has no runtime font dependency or fallback drift.
- Spacing and layout rhythm: the table geometry and its square 1024 viewBox are preserved. The 21 px header, 23 px picker, and 16 px footer renderings align with surrounding Lucide icons; desktop and mobile have no horizontal overflow.
- Colors and visual tokens: the optimized vectors use `currentColor`. The in-app table inherits the same foreground tokens as Lucide icons, while install exports intentionally use the existing olive background and warm-white foreground.
- Image quality and asset fidelity: neither supplied SVG contained a white background element; transparency remains implicit. Illustrator metadata and fixed black color attributes were removed. At source resolution, the optimized icon has zero differing raster channels from the original; the lockup differs only across 47 antialiased channels with a maximum value delta of 2. The full and focused comparisons show no visible geometry drift, halo, crop, or blur beyond expected small-icon antialiasing.
- Copy and content: the supplied `Bòrd` typography and the accessible `Table` label are unchanged. No unrelated product copy was altered in this asset pass.
- Icons and behavior: `BordIcon` exposes Lucide-compatible size, color, class, ref, stroke-width, and accessibility props while rendering the supplied filled path. The settings picker, header, footer, offline state, import, capture, tags, and collection surfaces now use this component. The dynamic install-icon renderer reads the optimized public SVG.
- Accessibility: decorative instances remain `aria-hidden`; the picker button supplies its own accessible label and `aria-checked` state. Selecting Chef Hat and returning to Table both produced `aria-checked="true"` on the chosen control.

## Comparison history

1. The original SVGs were opened and found to contain no background rectangle or white fill; the visible white canvas came from the viewer.
2. Web optimization removed Illustrator metadata and dimensions, retained the viewBoxes, converted fixed black fills to `currentColor`, and reduced the icon from 2321 to 1292 bytes and the lockup from 7759 to 4478 bytes.
3. The original and optimized assets were rendered together. A raster comparison confirmed an exact icon match and only sub-visible lockup antialiasing differences. No P0/P1/P2 visual fix was required after the combined comparison.
4. Desktop, mobile, and settings-picker captures confirmed the supplied mark in context at the expected Lucide sizes, with no overflow or browser warning/error logs.

## Primary interactions tested

- Switched the kitchen-icon picker from Table to Chef Hat and back to Table, confirming the accessible selected state each time.
- Checked desktop and mobile responsive widths and verified scroll width equals client width.
- Checked browser warning/error logs after home and settings rendering; none were present.

## Implementation checklist

- [x] Transparent, optimized, `currentColor` SVG masters.
- [x] Lucide-compatible table icon component using the supplied path.
- [x] All previous generated table-mark component usage replaced.
- [x] ICO plus 16/32/48 px favicon PNGs.
- [x] 152/167/180 px Apple icons.
- [x] 192/512 px Android icons and a safe-zone maskable 512 px icon.
- [x] Refreshed Next.js, PWA, and compatibility icon outputs.
- [x] Desktop/mobile browser comparison and console check.

## Final result

passed

---

# Design QA: Bòrd rebrand and onboarding introduction

## Source visual truth

- `C:\Users\Callum\Downloads\ChatGPT Image Jul 21, 2026, 12_10_24 PM.png`
- User direction: retain the table-and-wordmark character, make the artwork transparent and colorable, keep the table mark square-icon friendly, and introduce Bòrd with the supplied definition and mission copy.

## Implementation evidence

- Desktop onboarding: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8618-bada-7c10-93b4-6b2f189aa865\bord-onboarding-desktop-1280x900.png`
- Mobile onboarding: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8618-bada-7c10-93b4-6b2f189aa865\bord-onboarding-mobile-390x844.png`
- Full-view source/implementation comparison: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8618-bada-7c10-93b4-6b2f189aa865\bord-source-implementation-comparison.png`
- Focused logo comparison: `C:\Users\Callum\.codex\visualizations\2026\07\21\019f8618-bada-7c10-93b4-6b2f189aa865\bord-logo-focused-comparison.png`
- Vector assets: `public/brand/bord-mark.svg` and `public/brand/bord-lockup.svg`

## Viewports and state

- Desktop: 1280 x 900, green dark theme, onboarding step 1, default Bòrd kitchen identity and table icon.
- Mobile: 390 x 844, green dark theme, onboarding step 1, default Bòrd kitchen identity and table icon.
- Interaction state: kitchen name changed to `Callum's Table`; Croissant selected as the separate kitchen icon.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Fonts and typography: the existing Georgia/body-font hierarchy supports the definition treatment and retains a clear visual relationship to the supplied serif wordmark. The final supplied `logo.svg` preserves the intended outlined typography without a runtime font dependency.
- Spacing and layout rhythm: desktop preserves the established split onboarding frame while giving the introduction an uncluttered reading order. Mobile stacks the complete introduction above the wizard, reaches the action area through normal page scrolling, and has no horizontal overflow.
- Colors and visual tokens: the logo inherits `currentColor`; onboarding uses the existing olive, cream, muted-text, border, and accent tokens in light/dark-aware surfaces.
- Image quality and asset fidelity: the original raster remains the onboarding concept reference, while the final supplied SVG masters now provide the production table and lockup paths. They are transparent, colorable, and exported into crisp square platform icons; the newer asset-specific comparison above supersedes the earlier trace evidence.
- Copy and content: the visible definition, communal-table line, product explainer, and goal statement match the approved wording. Capitalization is `Bòrd` for product references and lowercase `bòrd` only in the dictionary definition.
- Icons and identity: the fixed Bòrd table mark is visually distinct from the selectable kitchen icon. The table is the default kitchen icon, and all selectable icons retain the existing Lucide family and selected-state treatment.
- Accessibility and behavior: the brand lockup has an accessible image label, the definition uses semantic terms/descriptions, fields and icon radios expose accessible names/states, focusable onboarding controls remain available, and the browser console warning/error log was empty during the captured onboarding states.

## Comparison history

1. The supplied image had a white background and a wide table-plus-wordmark composition unsuitable for direct theming or square install icons.
2. The initial pass traced the raster; the later supplied SVG masters replaced those traces while preserving the `currentColor` and square palette-backed icon system.
3. The first rendered desktop and mobile comparisons found no P0/P1/P2 difference requiring a visual fix. No post-comparison visual fix was made.

## Primary interactions tested

- Typed a custom kitchen name and verified the input value.
- Selected Croissant and verified its radio state replaced the default table selection.
- Confirmed desktop and mobile responsive layout measurements, including no horizontal overflow.
- Checked browser warning/error logs for the rendered onboarding state; none were present.

## Open questions

- None blocking. The supplied vector master resolves the earlier wordmark-trace refinement.

## Implementation checklist

- [x] Source-derived transparent vector mark and lockup.
- [x] Square Bòrd icon exports for app, Apple, Android/PWA, and favicon use.
- [x] Fixed product branding plus customizable kitchen identity.
- [x] Desktop/mobile onboarding introduction and interactive kitchen controls.
- [x] Browser-rendered comparison and console check.

## Final result

passed
