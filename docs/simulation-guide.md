# Round 3 simulation guide

## Starting record

RK-2048 belongs to Sangamesh's household and Kent water purifier. Complaint: **Low water flow**. Suggested service: **Filter replacement**. Quote: **₹749**. Initial status: **Waiting for approval**. All seeded people/provider/history details beyond the supplied scenario are explicitly documentary fixtures, not real verified entities.

The initial six timeline events are incoming report, agent classification, asset-history lookup, provider selection, quote, and approval request. These are retained as history; future completion is not preloaded as fact.

## Six clicks

Open `/simulation`. If rehearsing again, acknowledge the reset checkbox and click **Reset demo case**. Each **Run one step** changes backend state once:

| Step | Event                  | Guard / visible proof                                                    |
| ---- | ---------------------- | ------------------------------------------------------------------------ |
| 1    | Customer approval      | Exact documentary ₹749 scope approved; not a real customer authorization |
| 2    | Provider assignment    | Approved mock payment + assignment request/response logged               |
| 3    | Service evidence       | Documentary filter replacement/flow-check evidence recorded              |
| 4    | Provider completion    | Provider confirmed; case still open                                      |
| 5    | Household confirmation | Both confirmed; final scripted closure still pending                     |
| 6    | Final closure          | Backend verifies both parties, approval, assignment and evidence         |

There is no autorun. Repeating Next after completion is harmless. In scripted mode, the explicit final closure event is separate; manual submission of the second confirmation invokes the same closure guard immediately.

## Demonstrate backend—not just UI—safety

1. Reset. Open Case Room → RK-2048 → **Try mock payment**. Expect 403 and a denial decision. **Run approved mock share** also fails without its own approval; spend approval does not authorize sharing.
2. Set header attribution to **Household**. Approve or reject the pending quote. A rejection blocks Simulation with 409; reset explicitly to replay rather than silently reversing it.
3. Reset, run the first three simulation steps. Open Case Room.
4. Set attribution to **Provider**, enter what was checked, and submit provider confirmation. Case remains open.
5. Set attribution to **Household**, enter the observed result, and submit household confirmation. Case closes.
6. Change household assessment to **Unresolved**, enter the remaining issue and submit. Case reopens. Provider completion alone does not override the household's report.
7. Inspect Evidence Ledger: evidence, decisions/rules and sanitized connector request/response logs have truthful labels. Mock connector labels remain documentary even when triggered by a real local button click.

Optional: use the scope disclosure in Case Room to request a target provider change or minimal data share. Resolve that specific approval, then run the approved action. Changing provider invalidates prior service approval/evidence scope and requests fresh spend permission.

## Reset scope and limits

Reset deletes the demo's workflow changes and restores original scenario records, but preserves unrelated cases and local signup records. Reset requires explicit acknowledgement in the UI. The backend is a local, unauthenticated demo; do not expose reset or other routes to the public internet.

A completed script can later have an unresolved/reopened case. `complete=true` means the script has been exhausted, not that an unresolved problem was secretly fixed. Review the case status, not just the step counter.

New complaints are persisted without a guessed quote or provider, and have their own explicit quote and provider service-report workflow. Only RK-2048 has a scripted evidence source. Generic notes cannot masquerade as service evidence; see [the full local model](working-model.md) for creating and closing a separate case without simulation.
