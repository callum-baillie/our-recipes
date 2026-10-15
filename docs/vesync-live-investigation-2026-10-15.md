# ESF24 live API investigation — 2026-10-15

Used the application's existing encrypted VeSync session for read-only requests. No login password
was needed. Credentials, identifiers and measurement values were kept out of diagnostic output.
No measurements, profiles, device settings or provider records were modified.

## Requests and observations

| Request                                                                                                         | Result                              |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `getWeighingDataV2`, `allData: true`, page 1, page size 100                                                     | Success; nine selected-user records |
| Same endpoint, `allData: false`                                                                                 | Same nine records and fields        |
| Device list                                                                                                     | ESF24 found; no cloud `cid`         |
| Legacy `fatScale/getWeighData`, standard body                                                                   | Rejected with code -11000079        |
| Legacy endpoint, captured request format with time range, index, flag, order and own device MAC as CID fallback | Success code, empty result          |
| V2 history with device region, MAC and UUID                                                                     | Same nine records and fields        |

## Available fields

- Weight in grams and measurement timestamp: present in all nine records.
- Height in centimetres, age and reference gender: present, recorded with the weigh-in.
- `bfr`: non-zero in seven records. All non-zero values lie between 1 and 100, consistent with
  body-fat percentage. This is evidence for the interpretation, not confirmation of its unit contract.
- Impedance: non-zero in seven records.
- Heart rate: zero in all records; do not import this as a real reading.
- Eight-electrode impedance list: null.
- Arithmetic version: null or numeric; metadata for an algorithm, not computed body metrics.
- Remaining fields describe upload/read status, identity and source.

No explicit bone mass, muscle mass, skeletal muscle, water percentage, protein percentage,
visceral fat, subcutaneous fat, fat-free weight, metabolic age or BMR values appeared, including
inside nested objects. Neither history mode nor the legacy reader exposed them.

## Interpretation and next evidence needed

The historical [VeSync app capture in pyvesync issue 56](https://github.com/webdjoe/pyvesync/issues/56)
shows composition fields in `uploadAppLog`, but the weight-history upload and download contain
weight, impedance and demographic inputs. This supports the possibility that the app calculates
some composition metrics locally. It does not prove the current ESF24 app has no other endpoint.
The upload/log endpoints were not called: they write data and do not retrieve measurements.

The API did not yield the complete composition report. The next useful evidence is a capture
from the current VeSync app while opening an existing body-composition report, or a supported
export from that report. This would reveal an additional reader if one exists; otherwise the
vendor calculation implementation would need to be reproduced and verified against actual app
results. Generic formulas would be new estimates, not imported VeSync measurements.

The app's automatic import remains weight/date only pending confirmation of `bfr` against the
matching VeSync report. No production parser was changed based on an undocumented field guess.

## Follow-up: V3 resolves missing recent history

A subsequent comparison against two reports supplied by the user found a working reader:
`POST /cloud/v3/deviceManaged/getWeighingDataV3`, with method `getWeighingDataV3` and the same
config module, pagination and `allData` fields. This supersedes the V2-only conclusions above.

- V3 returned 29 records: 26 primary-account records and three for the additional profile.
- Both profiles' newest records were dated 2026-07-07. V2's newest record was from 2021.
- `/cloud/v2/user/getAllSubUserV2` supplies additional-profile labels and IDs.
- `/cloud/v2/user/getOneSubUserV2` returns demographics/targets, not composition history.
- V2 ignores the sub-user selector when `allData` is true; a sub-user-specific V2 request with
  `allData: false` returned no readings. Page 2 of both history readers was empty.
- `/cloud/v2/deviceManaged/getWeighingDataV3` and the candidate
  `/cloud/v4/deviceManaged/getWeighingDataV4` returned error code -11102086.
- The V3 `bfr` field exactly matches the body-fat percentages in both user-supplied reports.
  BMI calculated from the returned weight/height also matches both displayed BMI values.
- One displayed weight differs by 0.1 lb from standard rounding of the returned grams.
  Its cause was not established; the integration retains the provider's gram measurement.
- No other composition metrics occur in the V3 records or nested objects. Calculating fat-free
  mass matches one report but differs slightly for the other; these calculations are not imported.

The production reader now uses V3 with bounded pagination, resolves additional-profile labels,
and returns confirmed body-fat percentages alongside weight/date. Zero, malformed and
out-of-range `bfr` values are omitted. Onboarding imports body fat into advanced measurements;
subsequent scale sync stores it with the weight-history measurement. Other body-composition
metrics remain manual. No user's measurement values or credentials are stored in this document.
