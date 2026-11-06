# Skyline Architecture Agent — Product and Engineering North Star

Status: engineering roadmap, not a claim of current capability.

## Mission

Build a browser-first architectural design agent that turns a client's brief and real site conditions into a coordinated, measurable building model; explains trade-offs; validates what it can prove; and clearly routes everything else to qualified professionals. Compete globally through engineering reliability, transparent evidence and a better design workflow — not through unsupported claims that the system is already superior to any country's architects or tools.

## Product principles

1. Geometry is authoritative. A single versioned building model is the source for plans, elevations, sections, schedules, visualisations and exports.
2. AI proposes; deterministic systems measure and validate. Language models must never certify geometry, code compliance, structure or safety.
3. Every output carries provenance: brief inputs, assumptions, rule-set version, model revision, validation results and unresolved questions.
4. Failed critical checks block downstream deliverables. No validation, no approval.
5. Human professional review is a first-class workflow, not a disclaimer hidden in the footer.
6. The customer workflow stays in the browser. No customer Node, Python, CAD or CLI installation.
7. Extend the existing geometry engine. Do not fork a second drawing or validation engine.

## Capability baseline — do not overstate

The current bounded generator supports single-storey rectangular residential concepts with constrained room programs. It creates measurable geometry and corresponding 2D/3D schematic views, and performs independent geometry and room-quality checks. The guided brief reader is available; the hosted AI interpretation provider is not configured. Multi-storey generation, construction exports and professional approval remain disabled or blocked. Daylight, ventilation, accessibility, regulations, structural design and site-specific constraints are not established by the current validator.

## Competitive capability roadmap

### Stage 1 — Reliability and product integrity
- Keep one authoritative geometry revision across all views and reports.
- Eliminate UI/backend constraint mismatches and make every rejected edit explain the exact constraint.
- Complete the supported-runtime regression suite and establish a restorable source snapshot.
- Add repeatable browser tests for onboarding, generation, edits, save/restore, validation and exports.
- Maintain privacy, ownership, rate limits, audit events and safe failure behaviour.

### Stage 2 — Site-aware architectural briefing
- Draft foundation and browser workspace includes click-to-draw local-metre boundary and exclusion-zone polygons on the same canvas, editable zone vertices, evidence status/source, adjustable drawing frame, orientation, slope, access, constraint register, neighbour notes, JSON import/export and authenticated preliminary analysis. Boundary and exclusion geometry reject repeated points, near-zero edges, backtracking/overlapping adjacent edges and self-intersections. Technical input bounds are documented in lib/site-input-bounds.md; they are not regulatory thresholds. Owner-scoped site records use immutable revisions and optimistic concurrency. Private PDF/JPEG/PNG/WebP evidence uploads are pinned to a site revision, retain source references and submitted evidence status, enforce size/signature checks, store an SHA-256 digest, verify stored bytes by read-back, and issue owner-checked 30-second download redirects. Source-level and browser UI tests are added, but hosted runtime integration and malware-scanning decisions remain outstanding.
- Capture site boundary and dimensions separately from the building footprint.
- Capture north/orientation, access points, slope/topography, neighbouring context, setbacks and easements as explicit inputs.
- Complete source-backed survey/site document intake with malware scanning, immutable provenance, jurisdiction/date tracking and explicit uncertainty states.
- Produce a site constraints report before proposing a building layout.
- Never infer a legal boundary or setback from an unverified map or AI image.

### Stage 3 — Richer building program and spatial planning
- Replace the current rectangular-only brief with a structured requirements model: spaces, areas, occupancy, adjacency, privacy, accessibility needs, circulation, services and priorities.
- Add an explainable constraint solver that returns multiple ranked options and the reasons for each trade-off.
- Support irregular footprints and more room types only after topology, openings, circulation and independent validation cover them.
- Add climate-responsive design options using explicit climate/site inputs; label all assumptions and data sources.
- Keep room schedules, area calculations and model geometry revision-consistent.

### Stage 4 — Coordinated multi-storey building model
- Extend the existing engine only after verified floor-to-floor coordination, stair geometry, headroom, landings, guardrails, accessible routes, shafts, service risers, fire strategy and escape-path checks exist.
- Validate cross-floor openings, structure grids, vertical circulation and all linked drawings against the same model revision.
- Run independent adversarial test cases for stairs, voids, slabs, walls and vertical services.
- Keep multi-storey generation paused until every release gate is satisfied.

### Stage 5 — Jurisdiction-aware code intelligence
- Build a versioned ruleset framework by jurisdiction and building type.
- Store source, publication date, effective date, clause reference, applicability and confidence for every rule.
- Separate hard requirements, advisory guidance and assumptions.
- Report missing jurisdiction/site data and conflicting requirements instead of guessing.
- Require qualified local professionals to review code interpretations; never present automated screening as permit approval.

### Stage 6 — Engineering coordination and BIM
- Add structural concept coordination only with validated load paths, spans, supports, material assumptions and engineering review.
- Add MEP coordination for plumbing, electrical, HVAC, drainage and fire systems with clash detection and serviceability checks.
- Introduce interoperable BIM exchange (for example IFC) only after semantic mapping, units, object identities and round-trip validation are proven.
- Preserve source geometry and revision lineage through every import/export.

### Stage 7 — Visualisation, costing and delivery
- Distinguish schematic model orbit videos from photorealistic walkthroughs.
- Add materials, lighting, terrain and camera paths only as separate rendering layers that do not alter authoritative geometry.
- Add quantity take-offs and cost ranges with dated regional rates, assumptions and confidence intervals.
- Generate construction-document packages only after all required validators pass and a licensed professional signs off.
- Maintain a complete review and approval audit trail.

## Release gates for every capability

- A written scope and explicit unsupported-case list.
- Deterministic validators independent from the generator.
- Positive, negative, boundary, malformed and adversarial regression tests.
- Cross-view and cross-export revision consistency.
- Performance and security checks.
- Browser-based end-to-end tests.
- Source snapshot, checksum verification and rehearsed rollback.
- Human review requirements where regulated professional judgement is required.

## Immediate next engineering priorities (Version 60 checkpoint)

1. Preserve Version 60 as the live baseline and verify a restorable source snapshot before engine changes. The current deployment history identifies Version 60 as live; no production rollback rehearsal has yet been demonstrated in this checkpoint.
2. Resolve the supported-runtime verification workflow. The checked-in runner requires Node.js 24+, but a complete current test run and authenticated browser QA have not yet been evidenced for this checkpoint.
3. Correct the Studio brief/editor affordances so they accurately describe the currently supported single-storey generator and do not imply that multi-storey generation is available.
4. Additive validator implementation is now staged in `lib/multistorey-validation.js` and wired into the existing `lib/validation.js`: it checks unique floor/element identities, explicit elevations and floor-to-floor heights, shared coordinate-frame declarations, stair-to-void alignment, traceable measured-headroom evidence, sourced threshold screening and explicit cross-floor escape-graph reachability. Six focused regression cases are added to `lib/verification/source-tests.json`. This does not enable multi-storey generation. The current geometry model still lacks a true overhead-solid/beam/soffit intersection model, so the headroom value is evidence supplied by a measured survey/scan/model section, not a clearance automatically derived from the current schematic stair mesh. Lift/service shafts, structural-grid continuity, full geometric egress distances, 2D/3D revision consistency and save/restore tests remain outstanding.
5. Extend the existing site-fit engine with source-backed measured exclusion-zone polygons. Only verified zones from accepted survey, title-plan, authority-record or professional-observation sources are applied; owner estimates remain visible but never block placements. Side/distance setbacks remain unapplied until their jurisdictional rule source and geometry are independently established. Complete adversarial geometry tests, API/browser tests, document provenance and malware-scanning decisions before any live integration. The current browser suite uses a local static server with mocked API responses and is not hosted-runtime evidence.
6. Keep multi-storey generation blocked until every independent validation and regression gate passes. Keep billing/Stripe and construction exports out of this stage. AI provider setup remains a separate owner-controlled decision.

## Success measures

- Zero critical geometry defects in the release regression corpus.
- Zero unexplained differences between 2D, 3D, schedules and exported model revisions.
- Every unsupported requirement is surfaced before generation.
- Every automated compliance statement links to a current, applicable rule source and is marked for professional review.
- Measurable improvements in successful brief completion, design iteration time, edit acceptance, validation clarity and professional-review turnaround.