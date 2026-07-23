# T073 preparation confidence Judge

Decision: `approved`.

T070 plus T072 now preserve the selected immutable nutrition record confidence when explicit edible-portion or drained-yield evidence is supplied. The preparation evidence remains frozen in calculation notes and contribution digests, without a speculative nutrient-retention factor or an arbitrary confidence penalty.

The direct paired regression calculates otherwise identical recipes at 800 g and 400 g final cooked weights. Both snapshots retain 50 g total protein, while per-100 g protein changes from 6.25 g to 12.5 g. This proves final weight changes concentration and weighed scaling only, not total nutrient mass.

The next Worker must make prepared batches align at creation time with one immutable calculation snapshot. It must reject recipe-revision, final-weight, exclusion, substitution, or preparation-factor mismatches before inserting a prepared instance; freeze server-resolved calculation evidence; and support exactly one serving-count or weighed-portion consumption input. Existing prepared instances, calculations, allocations, and intake revisions remain immutable. A cook session's unique prepared snapshot must never be replaced in place.

The exact GoalBuddy Judge exceeded the single 30-second wait and was interrupted. The PM performed the same read-only gate as permitted fallback.
