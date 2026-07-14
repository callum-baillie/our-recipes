# T047 — Planner locator review

The T046 failures are test-only label collisions introduced by the new controls; no request was sent. The remaining textbox has a stable semantic selector, `input[name="title"]`. A fresh task may use it and run the full gate; any later failure must be treated as a product defect, not solved by further locator guessing.
