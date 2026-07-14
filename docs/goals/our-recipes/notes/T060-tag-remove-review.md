# T060 — Tag removal interaction review

## Classification

This is a client-state reconciliation defect, not a route, service, database,
or API-contract failure. `DELETE /api/v1/tags/{tagName}` correctly performs the
atomic service deletion and returns `204 No Content`. A `204` legitimately has
no JSON body.

`TagManager.request` currently maps the empty successful body to `null`, which
is also its failure sentinel. `TagManager.remove` then returns before updating
its local list or refreshing the route. The mutation is durable but the
visible household state is stale.

## Approved correction

Keep the DELETE route at `204`. Make the shared client request helper
distinguish a successful empty response from an unsuccessful response, so the
existing `remove` handler removes the confirmed tag from React state and
refreshes. Retain T059’s visible removal assertion; it is the correct
regression proof. No migration, service, API, dependency, credential, remote,
Docker, or destructive operation is needed.

## Follow-up scope

T061 may change only the tag manager’s successful-empty-response handling,
the expanded fresh-household acceptance test, and the local release evidence
that T059 was unable to mark complete. It must run the whole package gate; any
different behavioral failure returns to a Judge rather than being folded into
this repair.
