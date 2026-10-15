# Calculated scale body composition

The VeSync ESF24 integration now derives a separate body-composition estimate using a TypeScript port of `qn-scale-ble` 0.0.1's `BodyMetrics`. Upstream: https://github.com/BHSPitMonkey/qn_scale_ble and https://pypi.org/project/qn-scale-ble/. The MIT license is preserved in `licenses/qn-scale-ble-MIT.txt`.

## Inputs and provenance

Calculations run on the server using the weight, height, age, sex code and impedance from the same VeSync V3 weigh-in. Missing/invalid inputs, children and athlete-mode readings do not produce estimates. The ESF24 upstream BLE implementation passes resistance in ohms directly; this integration passes the cloud impedance unchanged. The equivalence of the cloud field to that BLE resistance has not independently been established. No fitted constants or guessed demographics are used.

Outputs include BMI, body fat, visceral fat, subcutaneous fat, metabolic age, fat-free weight, water, skeletal muscle, bone mass, protein, muscle mass and BMR. Weight itself remains imported. Python rounding, intermediate rounding and upstream clamps are preserved, including the 900–2500 BMR clamp. These are algorithm estimates, not additional measurements returned by VeSync.

Migration 0057 adds nullable estimate JSON separately to profiles and measurement history. A method/version identifies the source. Onboarding saves only the server-verified selected reading's estimate; sync also updates estimates for previously imported matching weigh-ins without duplicating history. The onboarding and scale settings views display a collapsed calculated-results panel. Imported body fat and manually entered metrics remain separate; calculations do not set calorie targets. Privacy cleanup clears profile estimates along with other body metrics.

## Verification, 2026-10-15

The port matched the original Python package for all 12 calculated outputs on both connected-account profiles. These estimates did **not** reproduce the complete VeSync app reports: BMI and visceral fat agreed at displayed precision, while composition values differed, and BMR differed substantially. The newer upstream ESF24 implementation uses the same core formulas. Personal measurements and raw account responses are deliberately omitted from this repository document.

Four synthetic reference fixtures were generated with the original Python implementation. Unit tests also cover Python rounding, invalid/unsupported inputs and preservation of provider body fat when calculations fail. No Python runtime or Bluetooth connection is needed by the app.
