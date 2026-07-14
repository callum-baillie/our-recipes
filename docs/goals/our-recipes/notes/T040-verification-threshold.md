# T040 — Browser verification threshold

The T040 implementation is present but is not being marked complete because its stop condition was reached: `pnpm test:e2e` failed twice after focused diagnosis.

1. The restore succeeded, but `getByText('Revision 3')` matched both the timeline and footer. The test was narrowed to the exact timeline label.
2. The retry again completed the restore, then failed only because the test expected a `20 min` fact that does not exist in the source revision selected by the existing capture workflow.

`pnpm test:a11y` passed on both runs, and the unit/integration/type checks previously passed. No provider, remote, daemon, destructive migration, or external operation was attempted. A fresh Worker package may replace the incorrect browser assertion with a fact that actually distinguishes revision 1 from revision 2, then run the complete fresh gate. The T040 worker must not continue verification under its own threshold.
