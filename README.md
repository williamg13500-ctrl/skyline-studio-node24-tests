# Skyline Studio Build — engine 3

Source runs directly on Hatchable without a build step. Preserve the existing users, subscriptions, projects and immutable revision history. No database migrations are required by this engine update. Payments remain deferred and disabled; signed-in preview access is enabled, with private project ownership checks.

## Supported concepts

Single-storey rectangular residential concepts with 1–5 bedrooms, 1–4 bathrooms, optional study and an editable room program. Footprint inputs are wall-centreline dimensions (the outside extent adds 0.30 m in each direction). The solver performs a bounded search over rectilinear partitions and corridor connections, ranks target-area deviation/proportion/circulation costs (accepted clear areas stay within 25% of target and inside room-type bounds), and returns up to three candidates that pass the implemented independent checks. It does not prove global optimality or that rejected briefs have no architectural solution.

The old fixed strip generator is retired. A three-bedroom/two-bathroom 10 × 12 m reference now has measured clear bedroom areas around 14.7, 11.9 and 11.6 m², and bathrooms around 6 m². The cramped 6 × 6 m and sparse 40 × 40 m versions are rejected with actionable 422 responses rather than exported as poor layouts.

Clear rectangular room dimensions deduct assumed exterior wall thickness 0.30 m and internal thickness 0.12 m. Hallways and door thresholds are not included in the clear-room-area total. This is schematic measurement, not a survey or jurisdiction-specific usable-area certification. Furniture/fixture footprints, walls and openings share element identities and exact coordinates across 2D and 3D outputs. All exports are bound to a SHA-256 revision and rerun server checks.

## Independent checks and export protection

Geometry checks cover zoning overlap/coverage, envelope, walls, hosted openings and entrance connectivity. Engine 3 additionally checks clear-room measurements, minimum/maximum room areas, target ranges, proportions, furniture footprint containment/non-overlap, required fixture presence, conservative door-swing envelope collisions, external window presence in occupied rooms, and corridor area ratio. Targets are studio planning limits, not building regulations. The 8% glazing proxy is a warning only; it is not a daylight or ventilation assessment.

Critical failures block concept drawing/model exports. Reports remain accessible. Construction-document export stays blocked unconditionally. Passing implemented checks is not professional approval. Accessibility, furniture access clearances, daylight performance, ventilation, egress, local regulations, structural engineering, elevations/sections and qualified review remain unverified.

## Multi-storey pause and existing records

New multi-storey generation is paused until stair headroom, landings, escape routes and floor coordination have a verified implementation. Existing saved briefs, geometry and revision records are not modified. Owners can download recorded historical briefs/reports via Saved report controls. Historical reports are labelled as recorded checks that have not been rerun; they cannot establish current validity or approval. Legacy geometry must be regenerated within supported scope before exporting current drawings.

## Workspace and provider readiness

The Studio includes description review/confirmation, feasible layout comparison, clickable room details/editing, 3D zoom/reset, schematic styles, private project saving and revision history. Furniture layouts are schematic placeholders: fitting footprints is not sufficient evidence of usable access clearances. Applying room edits searches again and revalidates. Footprint and room changes may require a different arrangement.

The guided reader works without an AI key. Optional AI interpretation requires a real provider configured in Hatchable Setup; the AI extracts requirements and never validates or approves a design. No working provider was verified at the prior checkpoint; use the owner connection test before claiming activation. Browser orbit video uses the actual model. The external Blender worker is included but requires a separate connected rendering host; no live photorealistic walkthrough is claimed.

Billing files remain inactive and payment implementation is the final phase. Existing legal pages remain drafts. Billing ownership is application-enforced and explicitly filtered; database row policies require a verified service-write path before activation. Do not add client-controlled SQL endpoints.

## Reproducible verification

With a source checkout, Python 3 and Node.js 24+, run:

    python3 lib/verification/run-tests.py

The source-controlled JSON bundle contains the actual tests. The runner makes a temporary checkout, mocks Hatchable services and runs the test suite without contacting production data. 84 tests pass, including a 36-case footprint/program matrix, adversarial geometry/room/furniture/window/door-swing faults, distinct deterministic alternatives, 2D/3D furniture extents, paused multi-storey requests, historical report reads, access/ownership, stale exports and concurrency protection. Hosted runtime and browser checks are separate requirements before deployment.

## Next release gates

1. Have qualified architectural reviewers assess actual pilot layouts and turn findings into requirements/tests.
2. Connect and evaluate the AI interpreter against explicit briefs; preserve missing/conflicting requirements.
3. Derive elevations/sections and improve furnishing/access-clearance, daylight and site/orientation models.
4. Add jurisdiction-specific reviewed rules and a verified professional review workflow.
5. Restore multi-storey generation only after vertical coordination, stair/headroom and egress tests are verified.
6. Activate and test the external rendering pipeline.
7. Implement payments and final business/legal policies last.