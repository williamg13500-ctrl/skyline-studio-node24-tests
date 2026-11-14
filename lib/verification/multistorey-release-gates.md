# Multi-storey engineering release contract

Status: partially implemented and deployed in Hatchable Version 66 (2026-11-08); multi-storey generation remains intentionally blocked. `lib/multistorey-validation.js` is in the live deployment and `lib/validation.js` invokes it from the existing authoritative validator. The engine still rejects requested storeys above one, and `validateGeometry` retains a critical `unsupported_storeys` issue for any multi-floor geometry. The independent checks cover floor identity/elevations, coordinate-frame identity, room identity/dimensions, vertical-connection records, traceable measured headroom evidence and evidence-backed egress topology. The headroom gate does not calculate clearance against overhead solids because the schematic geometry has no complete beam/soffit/ceiling obstruction model. Egress graph reachability is topology only, not a fire-code travel-distance or exit-capacity calculation. None of these checks establishes regulatory compliance, structural safety, fire safety or professional approval.

## Latest live audit (2026-11-09)

- Hatchable Version 66 is live; deployment timestamp: 2026-11-08 14:32:30 UTC. Version 60 and Version 64 are superseded.
- Live API smoke checks as an admin: a valid 10 m × 12 m, three-bedroom/two-bathroom single-storey brief returned HTTP 200; the same brief with two storeys returned HTTP 422 with the deliberate multi-storey pause message. Anonymous generation and saved-project access returned HTTP 401.
- The admin readiness endpoint reports AI interpretation, billing, rendering and construction export disabled. No verified professional-review provider or construction-document production is connected.
- Version 66's deployment manifest matches the current workspace for `lib/multistorey-validation.js`, `lib/validation.js`, `lib/verification/source-tests.json`, `lib/verification/run-tests.py`, `lib/engine.js`, `api/studio/generate.js`, `lib/site-fit.js`, `lib/elevations.js` and `lib/sections.js`.
- The embedded `tests/multistorey-validation.test.js` currently contains 26 declared test cases (static source inspection only; not a pass result). The current workspace has a draft correction so single-storey designs report unimplemented disciplines as `not_checked`, rather than incorrectly labelling them `not_applicable`; that draft has not been Node 24 tested or deployed.
- A Node 24 Actions run against the `snapshot/hatchable-v64-source` branch is not an exact Version 66 verification: the branch's `lib/engine.js` and `lib/site-fit.js` differ from the live Version 66 files. The connected GitHub repository metadata still reports that repository as public, so no Version 66 source was uploaded to it.
- Scratch branch `scratch/ci-reporting-accuracy` contains only CI-harness changes: commit `01a6d44` makes the source runner emit TAP, and commit `4360d2e` makes the workflow parse real totals and fail the job if either test gate fails. Actions Run #98 on Node.js 24.22.2 reported 166 tests, 158 passed, 8 failed, 0 skipped; Site Intelligence browser E2E had 3 failures. The machine-readable result was published and the final gate correctly failed the job. This run verifies the reporting correction, not Version 66 application source.
- The 8 source-suite failures on that snapshot were: service-error test expects HTTP 503 but receives 500; readiness test mock lacks the Hatchable `api` export; room-split fixture violates the 1.5 m minimum on each side; legacy-opening fixture fails earlier with `Check the project brief`; SVG wall-line assertion finds no stroke attribute; single-storey professional checks are incorrectly marked `not_applicable`; boundary-backtracking assertion predicate rejects the thrown `SiteInputError`; and UI test cannot display `not checked` while those statuses are wrong. A Version 66 workspace draft now addresses the single-storey status defect; it is not Node 24 tested or deployed.
- The 3 browser E2E failures were two 30-second timeouts waiting for `#site-draw-mode` and one imported-unverified-easement assertion failing because `#site-zone-list` did not display the supplied zone. These are snapshot E2E results, not a hosted Version 66 browser test.

## Objective

Extend the existing authoritative geometry model and validator so every storey has an editable 2D plan and all storeys assemble into one consistent 3D building. The same model revision must drive plans, 3D, schedules, sections, elevations and any later exchange format. Do not create a second drawing engine.

## Historical baseline at Version 60 (2026-11-06)

- Live project version: 60.
- Single-storey rectangular residential generation returns HTTP 200 for a valid 10 m x 12 m, 3-bedroom, 2-bathroom brief.
- A 2-storey generation request returns HTTP 422 with the deliberate pause message.
- Anonymous generation and saved-project access return HTTP 401.
- The generator brief parser accepts a requested range of 1–3 storeys but deliberately rejects storeys above one.
- The 3D renderer contains preliminary floor stacking and schematic stair rendering code. This is not evidence of a validated multi-storey model.
- The independent validator rejects every model with more than one floor. It has preliminary stair count, connection, dimensions, floor-opening alignment and circulation-room checks, but it does not yet verify stair headroom, escape strategy, accessible vertical circulation, lift/service shafts, structural continuity or jurisdictional rules.
- The validator's report explicitly leaves structure, accessibility, regulatory compliance, stair headroom/egress, elevations/sections and professional review unchecked.
- AI interpretation, billing and rendering remain disabled in the current admin readiness response. Construction export remains blocked and no verified professional-review provider is connected.

## Authoritative geometry contract

A future multi-storey model must retain the existing top-level model shape and stable element identities. Each floor record must contain:
- stable unique floor ID and user-facing label;
- explicit elevation and floor-to-floor height, in metres;
- its own editable layout record (rooms, walls, openings, circulation and furniture);
- explicit slab/void/opening geometry, with voids linked to the vertical element they serve;
- a shared building coordinate frame and a declared footprint relationship.

The building model must include versioned, explicit records for:
- vertical circulation connections between adjacent levels;
- stair flights, landings, clear width, riser count/height, tread depth, direction and measured clear headroom;
- lift shafts, lift openings and any declared lift core;
- service risers and their floor-by-floor continuity;
- structural grid references, column/beam/support identities and preliminary load-path relationships;
- escape-route graph and exits for each applicable level;
- slab edges, penetrations, atria and other double-height voids.

Do not silently synthesize missing values, infer regulatory approval, or assign a floor elevation from array order when the geometry does not state it. Historical revisions must remain readable as historical records and must never be silently regenerated under a newer engine.

## Independent validation gates

### A. Floor identity and coordination
- Floor IDs and element IDs are unique across the building, not merely within one floor.
- Floor elevations are finite, strictly ordered and consistent with declared floor-to-floor heights.
- Every floor has a valid layout and consistent units/footprint coordinate frame.
- Floor plates, perimeter walls, shafts, openings and vertical voids align where declared.
- No unsupported gaps, overlaps, duplicate slabs or floating/unconnected vertical elements.
- All generated plans and model surfaces carry the exact same revision hash.

### B. Stairs and vertical circulation
- Every required adjacent-floor connection has a matching stair record and a matching upper-floor opening.
- Stair geometry has finite dimensions, valid flights and landings, consistent riser/tread arithmetic and verified floor-to-floor rise.
- Clear headroom is explicitly measured from the model geometry; missing, non-finite or obstructed headroom must fail closed.
- Headroom screening thresholds must come from an explicitly selected, versioned jurisdiction/design ruleset. If no applicable source is configured, report not checked; never silently treat a generic default as code compliance.
- Stair landing access must connect to the intended circulation network on both floors.
- Lift and service shafts must be vertically continuous and must not collide with rooms, beams, stairs or other openings.

### C. Escape and accessibility
- Build a graph of rooms, corridors, doors, stairs and exits for each floor and across connected floors.
- Verify graph reachability, missing links, blocked doors, dead ends and route continuity.
- Travel-distance, exit-count, stair separation, protected-lobby, fire-rating and accessibility requirements require a selected, current jurisdiction ruleset and applicable building classification.
- When source rules, occupancy, building use or site information are missing, the relevant checks remain not_checked and the report explains why.
- A connected graph alone is not proof of code-compliant egress or fire safety.

### D. Structure and building services
- Structural grid references must remain coordinated between levels.
- Columns and walls that are declared as supports must align or have an explicit transfer element; unsupported offsets must be reported.
- Beam spans, material assumptions, loads, foundations and lateral stability cannot be certified by geometric alignment alone.
- MEP risers and service zones must be continuous, sized from declared assumptions and checked for clashes.
- All structural, fire, accessibility and MEP results remain preliminary until reviewed by qualified professionals.

### E. Cross-view consistency and persistence
- Every floor's 2D plan, the assembled 3D model, elevations, sections, room schedule and quantities must derive from the same geometry revision.
- Editing one floor must update only the intended geometry while revalidating all cross-floor dependencies.
- Stale edits must be rejected by revision/concurrency checks.
- Save and restore must preserve all floor records, vertical elements, validation evidence and revision hashes.
- Never update or delete immutable historical revision records.

## Required adversarial regression corpus

1. Valid 2-storey schematic with explicit floor elevations and fully linked stair geometry: geometry-only checks may pass, while regulatory/professional checks remain not_checked until evidence exists.
2. Valid 3–5-storey stack with continuous floor IDs, coordinates and vertical cores.
3. Missing floor, duplicate floor ID or duplicate element ID.
4. Non-monotonic, negative or inconsistent floor elevation.
5. Missing stair, duplicate stair, wrong from/to floor IDs or disconnected landing.
6. Missing/undersized upper-floor stair opening or misaligned void.
7. Invalid riser count, tread, width, landing or floor-to-floor rise.
8. Missing headroom measurement, non-finite headroom, obstructed headroom and jurisdiction threshold not configured.
9. Stairwell intersects a room, wall, slab, beam, lift shaft or service riser.
10. Disconnected room/corridor/exit graph, blocked exit, missing vertical connection and deliberately unreachable floor.
11. Misaligned structural supports, unsupported transfer, discontinuous service shaft and MEP clashes.
12. Mismatched 2D/3D revision, stale edit, altered saved revision hash and historical multi-storey record retrieval.
13. Requests for 10, 20, 50 and 100+ floors: remain unsupported until explicit scale/performance tests and all relevant validation gates pass.
14. Anonymous access, non-owner project access, stale revision writes, request-size abuse and unauthorized export attempts.

## Release sequence

1. Preserve the current live release and complete a restorable source snapshot.
2. Resolve the supported-runtime test runner and execute the complete source corpus on Node.js 24+.
3. Add independent floor-stack and vertical-connection validators with positive, negative and adversarial tests.
4. Add stair headroom measurement and evidence-aware checks; do not mark jurisdictional compliance passed without a configured source.
5. Add multi-floor escape graph and route-rule framework.
6. Add structural grid/support continuity and vertical service coordination.
7. Add multi-floor edit/save/restore and browser QA across 2–5 storeys.
8. Only then consider enabling 2-storey generation behind a controlled release gate. Expand to 3–5 only after separate evidence and regression coverage.
9. Design for larger towers only after the 2–5-storey model, validation, performance and persistence contracts are proven.

## Hard release blockers

- No multi-storey feature flag or UI control may be enabled while any critical gate is missing.
- Never bypass the independent validator to make a generator pass.
- Do not claim code compliance, fire safety, structural adequacy, accessibility compliance, permit readiness or construction approval from schematic checks.
- Do not enable construction exports, billing/Stripe or professional sign-off claims in this stage.
- No production deployment unless the full supported-runtime test suite, authenticated browser QA, deployment validation and rollback rehearsal all pass.