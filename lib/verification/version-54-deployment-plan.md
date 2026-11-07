# Version 54 deployment and rollback plan

Status: DRAFT ONLY — Version 53 remains live. Release is blocked pending full regression execution and verified rollback.

## Pre-deploy checklist

- [ ] Run the complete source-controlled regression suite. The bundle now contains 132 test cases across 10 files (the earlier plan's 110/111 counts were superseded by added regression coverage). The official runner requires Node.js 24+. The available internal shell currently has Node.js 22.16.0; do not weaken the runner or claim the suite passed on an unsupported runtime.
- [ ] Confirm the complete test suite exits successfully. The suite invokes actual API handlers and engine code but mocks Hatchable services; separately run route smoke checks against the live runtime.
- [x] Hatchable dry-run deployment validation: zero hard errors. Seven public-route warnings were inspected individually; all seven handlers call `identify()` and `requireBuild()` before protected actions. All seven protected Studio request paths returned 401 in anonymous smoke tests; `/api/studio/generate` intentionally permits only its limited anonymous GET role-discovery response. These are application-level guards that the generic linter does not detect. Preserve these checks; do not change access declarations without checking the Studio's login/role bootstrap flow.
- [x] Additive migration `004_request_limits.sql` is present. The table `studio_request_limits`, composite primary key and bucket index were created directly after owner approval and verified in the live schema. The migration remains in the draft and uses IF NOT EXISTS, so deployment can record/run it idempotently.
- [x] Version 53 remains live. Live config confirms billing_enabled=false, render_enabled=false, studio_access_mode=preview and policies_approved=false. Multi-storey generation remains paused; construction exports remain blocked.
- [ ] Rollback readiness is NOT VERIFIED. Version 53's deployment manifest lists 56 files, but only 26 static/public entries expose retrievable blob identifiers; server-side source entries expose hashes only. The connected tools expose no source-by-version retrieval or one-click restore action. A complete, verified source backup or a confirmed Hatchable Console restore procedure is required before deployment.
- [ ] Confirm the project privacy notice remains a draft and has not been changed by this deployment.

## Post-deploy smoke checklist — Version 54

### A. `POST /api/studio/generate`

Pass criteria:
- Valid 10 × 12 m, one-storey, 3-bedroom, 2-bathroom, study brief returns HTTP 200.
- Response contains geometry, model, revision and validation report.
- Critical geometry count is 0.
- Malformed or infeasible brief returns 400/422 with `error_code`, `message`, `suggestion` and `request_id`; never a generic 503.
- Request log includes request ID, endpoint, mode, status, duration, redacted summary and body hash; no raw description.

Fail if the route returns 5xx for an expected brief rejection, returns no model/revision, or logs raw input text.

### B. `POST /api/studio/projects`

Pass criteria:
- A valid edit against generated geometry returns HTTP 200 with a new revision and valid model.
- Malformed geometry returns 422 with an actionable structured error.
- Furniture containment rejection returns 4xx, not 503.
- A legacy saved revision can be opened and edited; the historical `studio_revisions` row remains unchanged, and the new revision validates with zero critical geometry errors.
- When normalisation repairs legacy fields, its request log includes project ID, source revision, repair count and field/element list.
- More than 60 requests from one IP in a one-minute route window returns 429; payloads over 2 MB return 413.

Fail if the old revision changes, no new revision is generated, the new revision fails critical validation, or repairs are absent from the request log.

### C. `POST /api/studio/interpret`

Pass criteria:
- Guided mode returns HTTP 200 without an AI key, identifies its source as guided text, and remains the default UI selection.
- AI mode while no provider is configured returns HTTP 503 with `ai_provider_unavailable`, a clear message and a guided-reader suggestion.
- AI option and model selector remain disabled while the provider is unconfigured.
- Request logs distinguish `guided_reader` from `ai_provider` failures and do not contain the submitted description.

Fail if guided mode depends on AI, AI failure is misreported as an unexpected 500, or the unavailable AI option is selectable.

### D. Studio browser UI

Run in an authenticated test session. Pass criteria:
- Trigger a furniture-containment rejection; the Studio displays the reason, suggestion, offending element ID and request reference.
- Trigger malformed geometry; the Studio displays the same four diagnostic details.
- Trigger a controlled unexpected server error in a safe test context; the UI shows the request reference and does not label it as a 503 dependency outage.
- Guided reader is selected by default and AI is visibly disabled with the provider-unavailable explanation.
- Accepted edits update the same revision across 2D, 3D and validation; rejected edits do not replace the current drawing.

Fail if any diagnostic field is missing, the UI reports only a generic error, or a rejected edit changes the displayed revision.

## Log verification after smoke tests

For each test, record request ID, route, status, duration and the matching structured log event. Confirm the body hash and redacted summary exist, stack frames are present on unexpected exceptions, interpretation failures carry the correct failure path, and no raw free-text description, name or email appears.

## Rollback plan to Version 53

1. Stop further smoke traffic and record the failing Version 54 request IDs.
2. Restore the exact Version 53 source snapshot using the Hatchable Console deployment-history restore function, if available. If it is not available, restore the pre-deploy local source backup file-by-file.
3. Run dry-run validation on the restored source and deploy it as a new deployment (the version number will advance; the live behaviour should match Version 53).
4. Verify the site and core Version 53 routes. Do not delete or roll back `studio_request_limits`; migration 004 is additive and the unused table is safe to leave in place while Version 53 runs.
5. If source restoration cannot be verified, do not attempt a speculative rollback. Escalate and keep Version 53 serving until a known-good source snapshot is available.

Rollback limitation: the connected Hatchable tools expose Version 53's deployment manifest but no explicit rollback command or source-file retrieval by deployment version. The Console restore path/local backup must be confirmed before deployment approval. This rollback has not been rehearsed.

## Browser-only customer requirement

The customer application is a browser-based product. Customers must not be asked to install Node.js, Python, developer tools, a CLI, or a local runtime. Node/Python requirements apply only to internal engineering verification. All customer-facing generation, editing, validation and project persistence must run through the hosted application and its server-side services. Do not weaken geometry validation or move authoritative geometry decisions into an untrusted browser-only path to avoid an internal tooling dependency.

## Verification findings — 2026-11-02

The first live smoke run failed with HTTP 500 because `studio_request_limits` was missing. After explicit owner approval, the missing table and bucket index were created directly in the live database. The original failures are historical and predate the repair; do not treat them as current post-repair failures. A later live run confirmed authenticated generation (200), anonymous POST generation rejection (401), guided interpretation (200), and multi-storey generation rejection (422). The guided reader also identifies multi-storey as unsupported.

The seven dry-run access warnings were investigated individually. Each affected handler applies its own `identify()` and `requireBuild()` checks before protected work. Anonymous smoke tests returned 401 for protected POST/GET requests to generate, export, projects, interpret, reviews, renders and manual-check. Generate's anonymous GET remains a deliberately limited role-discovery response (`role: anon`). These are intentional application-level guards, so no access declarations were changed. The generic linter cannot infer the shared guard helper.

The source bundle now contains 132 tests across ten test files. Sixteen additional regression tests cover explicit open connections, continuous partition walls, edit-topology preservation, singular-metre parsing, SVG attribute uniqueness, site polygon validity, evidence provenance, strict document dates and AI feature gating. The official runner requires Node.js 24+. The available internal shell is Node.js 22.16.0; no Node.js 24 executable or local checkout/materialization path for the Hatchable project source is exposed in this environment. The hosted Hatchable REPL is a V8 isolate without the Node test runner/filesystem workflow. Therefore the official full suite has NOT been run and no pass count is claimed. Do not lower the runtime requirement or weaken tests; provide a secure Node.js 24+ CI/source-checkout path or a supported hosted test-runner path.

Version 53 remains live. Draft-only browser and portfolio fixes remain unpublished. The dry run has zero hard errors. Live settings remain billing disabled, render worker disabled, preview access mode and policies unapproved. The live privacy page still labels itself an owner-review draft. No payment, multi-storey or construction-export controls were changed.

Additional live smoke checks on the deployed runtime: valid 10 × 12 m single-storey generation returned 200 with zero critical geometry issues and a revision; a valid room rename returned 200 with a new revision shared by model and validation; a deliberately invalid wall move returned 422 and no replacement revision; SVG export returned 200 with the same authoritative revision; construction export remained rejected with `professional_review_unavailable`; guided interpretation returned 200, `guided_text`, ready=true. These checks are edit-only and did not save a customer project. The live Studio page title and main heading load successfully. The live page still has the pre-Version-54 intro copy; the browser-only copy change is draft-only. The draft hostname is sign-in gated in an unauthenticated browser session, so full visual QA of the draft UI remains outstanding.

Rollback is not ready: Version 53's manifest has 56 entries, but server-side source files are represented by hashes without retrievable source content in the connected tools. There is no exposed one-click rollback/source-by-version retrieval action. A verified full source snapshot or confirmed Console restore procedure is still required. Platform feedback was filed for the missing bulk source export/restore path (Hatchable feedback #2362) and hosted Node 24 test-runner path (#2363). Do not deploy until the full regression suite is run on Node 24+, browser diagnostics are checked, and rollback is verified.

## Additional draft engineering work — 2026-11-06

- Added `lib/architecture-agent-roadmap.md` to define the global architecture-agent capability sequence, explicit limits, evidence/provenance requirements and release gates. It is a roadmap, not a claim that future capabilities are already implemented.
- Corrected the Studio custom-room editor so it stops at the same 12-room maximum enforced by the server parser and explains the limit to the user.
- Restricted custom-room floor assignment to the currently supported ground floor, preventing the UI from offering upper-floor assignments while multi-storey generation remains paused.
- Hatchable dry-run after these draft edits: zero hard errors; the same seven known application-level access warnings remain. No access declarations were changed.
- These edits are draft-only. Version 53 remains live. The full Node.js 24+ regression suite, authenticated browser QA and verified rollback remain outstanding. No deployment was performed.

## Site-intelligence foundation — 2026-11-06

- Added draft-only `lib/site-intelligence.js` with schema version 1, local-site-metre coordinate contract, boundary polygon validation (finite bounded coordinates, 3–200 vertices, self-intersection rejection and area bounds), north bearing, slope, access points, constraints and evidence provenance.
- Added `lib/site-intelligence.md` documenting the evidence contract, limitations and staged integration path.
- Analysis returns explicit missing/unverified findings and a `brief_only` decision. It deliberately does not calculate a legal buildable envelope, infer zero setbacks, alter building geometry, claim regulatory compliance or connect to external map/survey data.
- Added a draft Studio Site Intelligence Workspace with a click-to-draw local-metre boundary canvas, configurable drawing frame, north bearing, slope, access, constraint notes, neighbouring-condition notes, JSON import/export and an authenticated `/api/studio/site` preliminary-analysis endpoint.
- The draft workspace includes site boundary capture/import, preliminary analysis, saved site revisions and private evidence-document upload endpoints/UI. These routes are not registered in live Version 53; migrations 005/006 remain unapplied. The site layer does not calculate a buildable envelope or affect the house generator.
- Required next: automated positive/negative/adversarial tests on supported Node.js 24+, authenticated browser QA of the site-intake workspace, secure survey-document upload and provenance storage, immutable site-context revision lineage, source-backed constraint import, and only then a separately gated integration with the existing solver.
- Final draft dry-run after adding the authenticated site endpoint: zero hard errors and seven previously known public-route warnings; the new site endpoint is declared `access = 'user'` and checks `req.user` plus the existing build-access policy. Version 53 remains live; no deployment performed. Full Node.js 24+ regression and browser QA have not been run.

## Site-context persistence foundation — 2026-11-06

- Added draft migration `005_site_intelligence.sql` with owner-scoped `studio_site_contexts` and append-only `studio_site_revisions`. Existing project and drawing revision tables are untouched.
- Added authenticated `GET/POST /api/studio/site-projects` for creating, listing, reading and version-saving site records. It uses the existing owner-key model, checks ownership before linking a site record to a Studio project, and uses optimistic concurrency to reject stale writes.
- Each saved revision stores the normalized schema-v1 site context and its analysis snapshot. Historical revisions are append-only; the endpoint does not offer revision mutation or deletion.
- The migrations have NOT been applied to the live database. Site and document endpoints remain draft-only and are not usable from the live Version 53 application.
- Private site-document storage is now implemented in draft code; malware scanning and content parsing are not integrated. Uploaded files are not independently trusted or verified. The application must not pretend a survey file is uploaded or stored.
- No buildable-envelope calculation or solver integration was added. Site changes therefore cannot alter current 2D/3D geometry.
- Latest dry-run: zero hard errors; seven known public-route warnings remain on existing routes with application-level guards. The new site persistence endpoint is declared user-only. Next verification must test migration application on a disposable database, owner isolation, create/read/list/update, stale-version conflict, project-link preservation/unlink, invalid polygon rejection and payload limits before any live migration.
- Version 53 remains live; Version 54 remains draft. Node.js 24+ regression, authenticated browser QA and verified rollback remain release blockers. No deployment or database migration was performed.

## Site document evidence storage — 2026-11-06

- Added draft migration `006_site_documents.sql`. Each document row is linked by a composite foreign key to one immutable site-context revision and records owner key, original filename, detected MIME type, byte count, SHA-256 digest, source type/reference, submitted evidence status, optional date and notes.
- Added authenticated `GET/POST /api/studio/site-documents`. Uploads are limited to 8 MiB, accept PDF/JPEG/PNG/WebP only after magic-byte detection, use random per-owner object keys in private S3-backed storage, and are stored as `application/octet-stream` to avoid inline rendering. The stored object is read back and its SHA-256 digest is compared before the metadata row is committed; a failed insert/integrity check triggers object cleanup.
- Retrieval re-checks ownership on every request and redirects to a 30-second signed URL. The database stores object keys, never expiring URLs. Listing returns only metadata and the integrity digest.
- Studio UI now exposes source metadata, evidence-status, date and notes inputs; upload/list controls; and owner-checked open links. A site record must be saved first, and each upload is pinned to the active immutable site revision.
- The uploaded evidence status is user-supplied provenance, not independent verification. No malware scanner or PDF-content parser is connected; files are not interpreted by the application. Do not treat uploaded documents as trusted or verified solely because upload/integrity checks pass.
- Verified the Hatchable storage primitive in a one-off smoke test: private object put, HEAD, GET, SHA-256 equality and delete all succeeded. The test object used the auto-expiring `tmp/` prefix and was explicitly deleted.
- Disposable transaction fixture test: owner A's query returned only A's fixture; version-1 compare-and-swap update advanced exactly once; a repeated stale version-1 update returned zero rows. These are SQL-pattern checks, not an end-to-end test of the draft route or a separately provisioned database.
- No migrations have been applied, no endpoint has been deployed, and no live site records/files were created. Version 53 remains live; Version 54 remains draft.
- Required before release: apply migrations 005/006 on a separately isolated test database/project; run actual authenticated two-account route tests including cross-owner document ID and site ID attempts; exercise multipart uploads with valid and spoofed formats, oversize/empty files, malformed dates, orphan cleanup and signed-download expiry; run Node.js 24+ regression and authenticated browser QA; verify rollback.

## Runtime audit and geometry fixes — 2026-11-06

The latest systematic audit found and corrected the following draft/runtime defects:

- **Missing rate-limit schema:** the database migration ledger contained only 001–003 and studio_request_limits was absent, while the request guard expected it. Created the intended table and bucket index in the project database. Migration 004 remains pending in the migration ledger and is still present with idempotent IF NOT EXISTS statements for the next deployment.
- **False missing-partition failures:** the independent validator did not recognise explicitly modelled L.E open connections, and it required one wall element to exactly match one room-pair boundary. It now accepts explicit open edges and checks that continuous internal walls are fully supported by shared room-boundary intervals; unsupported gaps remain critical.
- **Validator scope regression:** the first open-edge patch referenced an undefined L variable. Corrected it to use the current floor's f.L.E. A subsequent valid generation smoke test returned HTTP 200 and zero critical geometry issues.
- **Legacy revision restore:** the saved Version-53 demo revision that previously returned 422 now restores with HTTP 200, 54 explicit normalisation repairs, a generated 3D model and zero critical validation issues. The original historical revision was not rewritten.
- **Edit topology preservation:** rebuildTopology now retains previously explicit open connections instead of silently converting them into walls. A split-room smoke test on a restored legacy plan returned HTTP 200, preserved the open edge and passed critical validation.
- **SVG wall styling:** removed a duplicate stroke attribute from wall SVG elements. A generated-plan inspection found 45 line elements and zero duplicate stroke attributes.
- **Request observability:** successful generation logs now record actual floor, room, wall, opening and furniture counts instead of reporting zero geometry for a successful generated model.
- **Site boundary integrity:** the evidence layer now rejects repeated adjacent points, zero-length edges, adjacent backtracking/overlap and self-intersecting parcel polygons. Explicit null orientation/slope values are treated as absent rather than invalid. Unsupported evidence source/status labels are rejected instead of silently downgraded.
- **Document date integrity:** evidence-document dates now use strict ISO calendar validation, rejecting impossible dates such as February 31 and non-leap-year February 29.
- **Site-analysis freshness:** the Studio now invalidates a displayed site report when the boundary, evidence provenance, north bearing, slope, access or constraints are edited. Boundary completion, undo and clear actions also mark the prior report stale; saved site records refresh automatically when the Studio opens.
- **AI provider activation:** the owner can test OpenAI, Anthropic or Google connectivity from the Studio admin controls. AI mode remains disabled by default and becomes available only after a successful provider test and the owner enabling the dedicated Setup switch. Guided interpretation remains available without a provider.
- **Guided text units:** the no-AI reader now accepts singular 'metre' in phrases such as '10 metre wide by 12 metre deep'. A hosted guided-interpretation smoke test extracted both dimensions, room counts and returned ready=true.

### Verification after these changes

- Current 10 × 12 m, single-storey, 3-bedroom, 2-bathroom, study generation: HTTP 200; 9 rooms; 438 model faces; zero critical issues.
- Current 8 × 10 m, 2-bedroom, 1-bathroom generation: HTTP 200; validation passed; 5 rooms; 288 model faces.
- Legacy saved revision restore: HTTP 200; zero critical issues.
- Legacy room split: HTTP 200; explicit open connection preserved; zero critical issues.
- Multi-storey generation remains deliberately rejected with 422 and an explanatory field error.
- A 15 × 14 m sparse brief returned a structured feasibility 422 with smaller suggested footprints; this is a bounded-solver limitation, not an unexpected server failure.
- Anonymous protected requests to all seven existing Studio routes returned 401. The anonymous generate GET role-discovery response remains intentionally limited.
- Generation request logs now contain non-zero geometry counts. No new error logs appeared in the final one-minute check; the earlier 20:14 validator-scope 500 remains as historical log data from before the correction.
- Latest dry-run: zero hard errors and seven known application-level access warnings. Do not remove the shared app-auth checks merely to silence the generic linter.

- **AI provider connection:** the admin-only provider test was executed against the current account and returned `412 ai_setup_required`; no working provider key is connected. The Studio now includes a provider test control and a separate owner-controlled enable switch, but AI mode remains disabled until the owner connects and tests a provider in Hatchable Setup.

### Still blocked

- The official 132-test source suite has NOT been run: the runner requires Node.js 24+, while the available shell is Node.js 22.16.0. Sixteen additional regression tests are added but remain unexecuted. This remains a release-quality follow-up even though Version 54 has now been published at the user's explicit request.
- **Post-deploy migration state:** Version 54 applied migrations 004, 005 and 006 successfully. The request-limit, site-context, site-revision and site-document tables are present; the new `/api/studio/site`, `/api/studio/site-projects` and `/api/studio/site-documents` routes are registered.
- **Post-deploy API checks:** anonymous requests to all three new routes returned 401. Signed-in API checks confirmed site analysis, create/read/list, revision 2 update, stale revision rejection (409), and empty document listing. The temporary QA site and both revision rows were deleted; final site-context, revision and document table counts are all zero.
- **Site validation checks:** a valid 10 × 10 m parcel returned a preliminary `brief_only` result; a self-intersecting parcel and unsupported evidence status were rejected with 400. Impossible document date `2026-02-31` was rejected; valid leap-day input proceeded to the expected missing-file check.
- **Post-deploy architecture checks:** 10 × 12 m single-storey generation returned 200 with 9 rooms and zero critical issues; SVG concept export returned 200; construction export remained blocked with `professional_review_unavailable` (422). Multi-storey generation remains paused with 422.
- **Browser preview:** anonymous preview of the marketing home page and Studio loaded; Studio correctly displayed its own sign-in gate. Authenticated browser workflows, multipart document upload, actual signed-download expiry and two distinct real user accounts have not yet been browser-tested.
- Version-53 source rollback remains unverified. The 132-test Node.js 24+ suite also remains unrun because the available shell is Node.js 22.16.0. Record these as outstanding operational checks; do not claim complete verification.

Version 54 is live. Billing remains disabled; multi-storey generation and construction exports remain disabled. The AI provider is not connected, so AI interpretation remains off and the guided reader remains available.

## Preliminary footprint-fit integration — 2026-11-06

- Added `lib/site-fit.js`, a read-only candidate-placement search against the normalized parcel polygon. It checks axis-aligned rectangular ground-floor footprints at 0° and 90° in local site-metre coordinates, uses point-in-polygon and segment-intersection checks (including concave parcel edges), and reports up to five placements ranked by minimum parcel-edge clearance.
- The assessment uses the existing solver's ground-floor footprint dimensions. It does not edit, translate or rotate the authoritative generated geometry; the candidates are placement suggestions only. It does not calculate a legal buildable envelope, apply setbacks/easements/hazards, interpret survey documents, or assess access, slope engineering, planning, structural suitability or professional approval.
- Added authenticated `POST /api/studio/site-fit`. It rebuilds the brief through the existing `buildDraft` engine and requires the exact 64-character geometry revision, preventing stale or client-forged geometry from being treated as the current generated revision.
- Added Studio UI control and candidate report. The control is enabled only after supported single-storey generation; site changes invalidate the prior result, brief changes require a fresh concept, and accepted geometry edits can be reassessed against their new server-validated revision.
- Added eight regression tests for positive fit, missing boundary, undersized and concave parcels, explicit non-application of constraints, multi-storey scope, exterior-wall allowance and thicker edited exterior walls. The source bundle now contains 141 tests across 11 files, including JSON-safe wall-property persistence and revision-hash coverage; the Node.js 24+ suite has not yet been executed.
- Dry-run before release: zero hard errors; the same seven known access-linter warnings remain on existing guarded endpoints. No database migration or data mutation is required for this feature.
- The Version 59–60 live smoke tests below supersede this initial verification checklist. Keep construction export and multi-storey generation disabled.

## Approval gate

The owner has approved the additive request-limit schema repair and the requested Phase 1 verification work. That approval does not authorize deployment. Keep Version 53 live until the remaining regression, browser verification and rollback gates are satisfied.

## Version 59 live site-fit verification — 2026-11-06

This section supersedes the earlier draft-only and Version-54 status notes above.

- **Current deployment:** Version 59 is live at `https://skyline-studio-build.hatchable.site`. The `/api/studio/site-fit` route is registered as a user-authenticated endpoint. No database migration or production data mutation was needed.
- **Geometry source:** the endpoint accepts the current browser geometry only after rebuilding it through `buildDraftFromGeometry`, the existing normalizer and independent validator. It checks the expected 64-character revision before assessing the footprint. If no geometry is supplied, it can rebuild the brief through the same existing engine. Invalid geometry is rejected; stale revisions return 409.
- **Outside footprint:** the check uses wall-centreline dimensions plus a 0.30 m total exterior-wall allowance per dimension (or a larger explicitly represented exterior-wall thickness). It does not treat centreline dimensions as the outside footprint. Candidate rotations are 0° or 90° relative to local site x/y axes; north bearing is not inferred.
- **Live API smoke tests:** anonymous request 401; valid 20 × 20 m parcel returned five candidates; a 10 × 12 m parcel did not fit the 10.3 × 12.3 m outside footprint; a 10.8 × 12.8 m parcel returned a candidate with 0.25 m parcel-edge clearance; a 14 × 11 m parcel returned a 90° candidate; missing boundary 422; self-intersecting boundary 400; stale revision 409; invalid room geometry 422; unsupported multi-storey brief 422.
- **Geometry integrity:** a generation before and after site-fit returned the same geometry revision and zero critical issues. The site-fit operation is read-only; it does not translate, rotate or mutate the building model.
- **Browser smoke check:** live Studio HTML loaded; site boundary canvas, analysis control, fit button and report container were present; fit button was disabled before a supported concept was generated; no page JavaScript errors were observed. Authenticated interactive browser workflow remains outstanding.
- **Limitations:** this is parcel-polygon containment exploration only. It does not apply setbacks, easements, hazard buffers or statutory controls; does not use true-north orientation; does not assess access, slope/grading, drainage, foundations, structure, daylight, fire escape, zoning or planning; and does not create a legal buildable envelope or professional approval. A candidate is not permission to build.
- **Regression inventory:** eight site-fit tests are now included; the complete source bundle contains 141 tests across 11 files. The official Node.js 24+ suite remains unexecuted because the available shell is Node.js 22.16.0. Do not claim a full-suite pass.
- **Dry-run after the release: zero hard errors; seven known application-level access-linter warnings remain on the existing guarded routes. Recent error logs contain the expected AI-provider-unavailable test and an older pre-fix generation error; no site-fit route error was recorded in the inspected window.
- **Current release:** Version 59 live. Payments remain untouched; AI remains off until a provider is connected; multi-storey generation and construction exports remain disabled. Rollback rehearsal and full Node.js 24+ regression remain outstanding.

## Version 60 wall-property integrity verification — 2026-11-06

This section supersedes Version 59 as the current deployment record.

- **Current deployment:** Version 60 is live. The site-fit endpoint remains active and user-authenticated; no migration was added.
- **Wall metadata integrity fix:** edited wall thickness and material are now persisted in JSON-safe wall-array slots `[6]` and `[7]`, while the engine restores the named convenience properties before validation and rendering. This makes those properties survive JSON transport and be included in the geometry revision hash. Topology rebuilds preserve them.
- **Live edit test:** generated a 10 × 12 m concept, edited an exterior wall to 0.50 m thickness and brick material through the existing `/api/studio/projects` edit route, and received HTTP 200 with zero critical issues and a changed geometry revision. The response retained `[6] = 0.5` and `[7] = "brick"`.
- **Live wall-aware site fit:** sent the edited geometry through JSON transport to `/api/studio/site-fit`. The server independently rebuilt and validated it, then reported a 10.5 × 12.5 m outside footprint (0.50 m total allowance). A 10.8 × 12.8 m parcel produced a candidate; a 10.4 × 12.4 m parcel produced none. This verifies the fit check uses the accepted edited exterior-wall thickness, not only the original brief dimensions.
- **Browser check:** Studio page loaded with the site-fit controls and report container present, the fit action correctly disabled before generation, and no page JavaScript errors observed.
- **Live route health:** `/api/studio/site-fit` is active with 0 errors in the last 24 hours at inspection. The inspected recent error log contained only the expected AI-provider-unavailable test; no site-fit error was recorded.
- **Dry-run:** zero hard errors; seven known access-linter warnings remain on the existing guarded routes.
- **Regression inventory:** 141 tests across 11 files, including wall-property JSON round-trip and revision-hash coverage. The Node.js 24+ suite remains unexecuted; the available runtime is Node.js 22.16.0. Do not claim a full-suite pass.
- **Current restrictions:** payments untouched; AI remains disabled pending provider setup; multi-storey generation and construction exports remain blocked. Rollback rehearsal and full Node.js 24+ regression remain outstanding.