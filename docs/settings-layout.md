# Settings layout

App settings and personal preferences share `settings-primitives.tsx` and
`src/app/settings-layout.css`. Both layouts provide a `settings-content` wrapper;
pages use `SettingsPageHeader` inside `main.recipe-page.settings-hub`.

## Components

- `SettingsPane`: a titled section with an explanation and optional header actions.
- `SettingsField`: one native input, select, or textarea, with its label and explanation
  on the left and its control on the right. Keep the original input name, validation,
  autocomplete, and form handler. Use `role="switch"` only for on/off preferences;
  acknowledgments and multiple-choice selections remain checkboxes.
- `SettingsRow`: actions, read-only values, or a group of already labeled controls.
- `SettingsGroup`: related form controls with a legend; supports `disabled`.
- `SettingsSubsection`: a full-width list, explanation, or specialized editor.
- `SettingsItem`: a saved record with descriptive metadata and record actions.
- `SettingsEmpty`: an empty list explanation.
- `SettingsActionBar`: the save action and status for the form it belongs to.

Use `settings-fields` for a stack of fields, and `settings-stack` for a stack of
sections. Avoid placing these rows inside an old multi-column field grid. A dialog
with settings controls can add `settings-dialog` so its controls respond to the
dialog width. The common styles stack controls on narrow screens, preserve switch
alignment, and use the app's theme variables.

## Placement

- `/settings`: installation and shared kitchen preferences, protected by the
  existing authenticated admin layout.
- `/account`: personal preferences and account security. Passkeys are listed and
  managed here, with API keys remaining in app settings.
- Keep measurements and other changing app data in their feature pages.
- Server-managed values such as backup storage and queue configuration are
  explanatory read-only rows; do not imply they can be edited in the browser.

UI organization never changes authorization. Continue using the existing validated
HTTP routes and authenticated account checks for mutations.
