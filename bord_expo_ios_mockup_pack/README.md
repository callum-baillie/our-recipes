# Bord Expo iOS Mockup Pack

This pack translates the supplied web and responsive screenshots into a native-first iPhone design direction for an Expo application.

## What is included

- `mockups/` - 32 high-resolution PNG mockups, one for each supplied app page.
- `contact-sheets/` - four overview sheets covering the complete set.
- `Bord-Expo-iOS-Mockups.pdf` - a visual lookbook and design summary.
- `design-analysis.md` - source audit, design rationale, navigation model, and accessibility guidance.
- `expo-implementation-guide.md` - Expo Router architecture and native component recommendations.
- `design-tokens.json` - proposed color, typography, spacing, radius, and motion tokens.
- `manifest.json` - ordered screen index with a short rationale for each mockup.
- `gallery.html` - local visual browser for all mockups and notes.
- `source/` - the deterministic HTML renderer used to generate the PNGs.

## Visual direction

The source product already has a strong identity: warm paper surfaces, dark forest typography, botanical green, terracotta actions, editorial serif headings, and restrained food photography. The mockups preserve that identity while changing the app shell and interaction model to feel native on iPhone.

The resulting direction is **an editorial household cookbook inside an iOS-native shell**:

- System navigation, safe areas, familiar controls, sheets, and grouped settings.
- Branded serif display typography used selectively for page identity and recipe content.
- System typography for controls, labels, data, and dense utility information.
- Liquid Glass reserved for navigation and transient control layers.
- Opaque paper and material surfaces for reading, forms, food cards, and data.
- Five stable primary destinations: Home, Recipes, Plan, Pantry, and Lists.
- Secondary destinations such as Nutrition, Assistant, Security, and Settings opened from contextual entry points.

## Mockup dimensions

Each mockup represents a 393 x 852 point iPhone viewport and is exported at 2x resolution as a 786 x 1704 PNG.

## Important implementation note

These images define visual hierarchy, interaction placement, and component intent. They are not intended as fixed-pixel specifications. The production Expo app should support Dynamic Type, localization, safe-area changes, compact and regular widths, reduced motion, increased contrast, and reduced transparency.
