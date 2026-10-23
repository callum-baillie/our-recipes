# Dependency remediation · 2026-10-22

This supersedes the audit counts in `post-review-dependencies.md` for this
working patch. Node 24.21.0, pnpm 11.13.1 and the native lockfile's npm 11.4.2
were used. CI now explicitly installs npm11.4.2 before native `npm ci`,
matching `mobile/package.json` rather than inheriting the runner version. Host npm 11.19.0 was identified during discovery; the native clean
installation and final audit are rerun explicitly with `npx --yes npm@11.4.2`.

| Audit                                                 | Before                         | After               | Disposition                                                                        |
| ----------------------------------------------------- | ------------------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| Root full (`pnpm audit --json`)                       | 2 high, 2 moderate, 1 critical | 1 high              | Vite 8.1.6, Next 16.4.1 and Vitest 4.1.12; supported updates                       |
| Root production-filtered (`pnpm audit --prod --json`) | 1 high, 2 moderate, 1 critical | 0                   | Current result after remediation; earlier production-clean evidence was not reused |
| Native (`npx --yes npm@11.4.2 audit --json`)          | 22 high, 8 moderate            | 22 high, 8 moderate | No forced Expo/React Native major or advisory suppression                          |

Raw dependency findings and exact audit paths are retained in
[rv-evidence](rv-evidence/). Counts are graph findings, not a determination that
every parser is included in or reachable from a deployed application.

## Root

A fresh October 22 rerun found additional advisories after the earlier receipt:
Next 16.3.8 was affected by [image optimization RCE](https://github.com/advisories/GHSA-2464-fhr4-w9xw)
and [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r),
and Vitest 4.1.11 by two mocker advisories
([registration](https://github.com/advisories/GHSA-qxg6-89mg-rqv8),
[Windows traversal](https://github.com/advisories/GHSA-xp26-3454-mjgp)).
The root now pins Next and its ESLint config16.4.1 plus Vitest 4.1.12.
Current pre-patch and post-patch JSON files are retained alongside the October21
receipts; the table uses October 22 counts. Production includes Next, so its
findings were addressed regardless of whether this app exercised the specific
vulnerable image path. Vitest entered the production-filtered dependency graph
through Better Auth's optional peer, without establishing deployed reachability.
Release tests and artifact inspection use the patched toolchain.

The three Vite findings came from `vitest → vite@8.1.4`, also resolved through
Better Auth's optional Vitest peer in the production-filtered graph. The
compatible 8.1.6 patch is available in the registry and now locked. The remaining
high advisory is `eslint-config-next → @next/eslint-plugin-next → fast-glob →
micromatch → braces@3.0.3` (GHSA-vfj7-8cjw-p6xm). `pnpm view braces@3.0.4 version`
returns package-not-found; `pnpm view braces version` returns 3.0.3. This is a
lint/build tooling risk for hostile glob input, not evidence of a deployed HTTP
handler accepting that input. Next step: adopt the published compatible fix and
rerun lint/build/audit when available. The final standalone inspection covers184 package manifests: Next 16.4.1 is
present; Vite, Vitest, its mocker, braces, micromatch and ESLint config are absent.
This is the traced artifact, not an operator-volume runtime acceptance.

## Native unresolved chains

These are concrete leaf advisories; npm also counts affected parent packages,
which explains the larger 30-entry total. Exact installed nodes, ranges, advisory
URLs and suggested replacements are in the raw native audit.

| Chain / installed leaf                                                                                                                | Reachability evidence                                                                                                                                             | Blocker and next action                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo 54.0.37 → @expo/metro-config 54.0.17 → @expo/metro 54.2.0 → Metro 0.83.3 → image-size 1.2.1                                      | Metro's Node asset transformer reads images while bundling; do not feed untrusted build assets                                                                    | Latest compatible 1.x is 1.2.1; 2.x changes exports used by this Metro line. Upgrade through a supported Expo/Metro matrix and verify asset transforms and native builds |
| Expo/React Native → Metro/Jest → micromatch → braces 3.0.3                                                                            | Node development, source watching and test/build globbing                                                                                                         | No published 3.0.4. Adopt fixed compatible release when available                                                                                                        |
| Expo → @expo/cli → @expo/code-signing-certificates → node-forge 1.4.0                                                                 | Node update signing/certificate tooling; not proof of Hermes runtime inclusion                                                                                    | Registry latest is 1.4.0; use supported Expo signing-tool update when patched, retain trusted certificate inputs                                                         |
| Expo Router 6.0.24 → query-string 7.1.3 → decode-uri-component 0.2.2                                                                  | Both current iOS and Android Hermes source maps include query-string and decode-uri-component; this is confirmed bundled code, not merely a production dependency | Latest compatible 0.2.x is 0.2.2; patched 0.5.x is outside the range. Requires a supported Router/Expo migration and hostile/deep-link tests, not a forced leaf override |
| React Native → babel-jest → babel-plugin-istanbul → @istanbuljs/load-nyc-config → js-yaml 3.15.2 → argparse 1.0.10 → sprintf-js 1.0.3 | Node test/coverage configuration parsing                                                                                                                          | Compatible js-yaml 3.x latest remains 3.15.2; npm's suggested React Native major is outside Expo 54's matrix. Upgrade the supported test/build chain when available      |

Native navigation is aligned to Expo's declared `^7.1.8` range with the lockfile
resolving the compatible 7.5.1 release; this is a compatibility correction, not a
claim that it fixes these advisories. Expo's audit suggestions include downgrading
to SDK 44 and jumping React Native majors. Neither is a supported repair for this
SDK 54 installation. No new override forces those versions.

## Export reachability evidence

The successful current `expo export --platform ios --platform android
--source-maps --max-workers 2` produced two Hermes bundles (4.06 MB iOS,
4.05 MB Android). [Source-map inspection](rv-evidence/native-bundle-reachability.json)
finds `query-string` and `decode-uri-component` in both. It does not find
`image-size`, `node-forge`, `braces`, `js-yaml` or `sprintf-js` among their source
modules. Their Node build/development reachability remains real; absence from
these source maps is not a universal claim about every future binary or plugin.
The confirmed bundled router advisory remains unresolved and material. No exploit
was attempted and bundle inclusion alone does not prove a particular hostile URL
can reach the vulnerable branch.

## Remaining acceptance

Clean installs, affected tests and iOS/Android exports are recorded in
[rv-completion.md](rv-completion.md). Native export success is not an installed
binary/device test. A supported Expo-major migration needs its complete
React/React Native/native-plugin matrix, emulator/device navigation, deep-link,
scanner and accessibility checks. The remaining advisories stay unresolved until
that evidence exists. This report is not a clean dependency bill of health.
