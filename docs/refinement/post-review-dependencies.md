# Dependency disposition ·2026-10-20

Fresh audits on the Node24/pnpm11 root and separate native npm lock:

| Scope                 | Current result   | Reachability and disposition                                                                                                                                                                                    |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root full audit       | 1high            | `braces<=3.0.3`, reached through development lint/glob tooling. Registry currently reports3.0.3 as latest; advisory asks3.0.4, which is not published. No fictitious override or forced incompatible downgrade. |
| Root production audit | 0                | This bounds the installed production dependency graph; it does not establish application security.                                                                                                              |
| Native full audit     | 22high,8moderate | Expo54/React Native0.81 toolchain includes Metro/Jest/code-signing and router dependencies. Physical native behavior is not verified by this audit.                                                             |

`pnpm view braces version`, `npm view image-size@1 version`, `npm view node-forge version` and `npm view decode-uri-component@0.2 version` checked actual available releases. Image-size1.2.1, node-forge1.4.0 and decode-uri-component0.2.2 are the latest in the installed compatible lines. Patched image-size2 changes its require/export API used by Metro; forcibly overriding it without adapting/testing the Expo matrix is not a compatible fix. Expo's audit suggestions include a downgrade to44 and a newer React Native major; neither is a supported automatic remediation for the present SDK.

Metro, image-size, braces/micromatch, code-signing node-forge and Jest chains run during local development, bundling or native build, where hostile source/assets remain a risk; they are not evidence that the published Hermes app executes those Node parsers. Expo Router's query-string/decode chain can participate in runtime URL handling and remains a material unresolved advisory until a supported SDK/router upgrade is verified. npm's transitive inclusion under production dependencies does not by itself establish bundle reachability. Source/build reachability and advisory counts are separate.

A supported Expo major migration needs its full React/React Native/plugin matrix and emulator/device/build verification. No forced major change or advisory suppression is included in this pass. These advisories remain explicitly unresolved; this document is not a clean dependency bill of health. Exact final install/test/export commands belong in the completion evidence.
