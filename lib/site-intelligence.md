# Site intelligence — engineering foundation (draft)

## Purpose
Site intelligence is an evidence-first context layer. It records what is known about a parcel, where the information came from, how reliable it is, and what remains unknown before any building layout is considered.

## Current implementation boundary
- `lib/site-intelligence.js` defines schema version 1 and pure normalization/analysis functions.
- The draft Studio workspace provides a click-to-draw local-metre polygon canvas, configurable drawing-frame dimensions, north bearing, slope, access, constraint notes, neighbour observations, JSON import/export and an authenticated analysis request through `api/studio/site.js`.
- `api/studio/site-projects.js` adds authenticated, owner-scoped site records with optimistic concurrency and append-only JSON revisions. Site records can optionally link to an existing owned Studio project; omitted project IDs preserve an existing link, while explicit `null` unlinks it.
- The Studio workspace now has saved-site listing, load and save-revision controls. Loading restores the saved normalized context and analysis snapshot; importing a standalone JSON file clears the active saved-record pointer so it cannot accidentally overwrite a previously loaded record.
- The persistence API stores normalized site context and its preliminary analysis snapshot. The draft `api/studio/site-documents.js` endpoint adds private, owner-scoped PDF/JPEG/PNG/WebP storage pinned to an immutable site revision, with source metadata, magic-byte validation, an 8 MiB cap, SHA-256 read-back verification and 30-second owner-checked download redirects. The object key is stored, never an expiring URL.
- Uploaded evidence status is user-supplied, not independently verified. The intake rejects unsupported evidence source/status labels, degenerate/backtracking/self-intersecting parcel boundaries and impossible ISO document dates. No malware scanner or PDF parser is connected; uploaded files are not interpreted by the application. Both site and document migrations remain draft-only until release gates are cleared.
- Coordinates are local site metres, not latitude/longitude. No map geocoding, cadastral lookup, terrain service, sun-path engine or jurisdictional code service is connected.
- Boundary polygons are checked for finite coordinates, supported range, self-intersection and measurable area.
- North bearing, slope, access and constraints are recorded with provenance.
- Constraint distances are recorded only as supplied evidence; this module does not infer legal setbacks or calculate a buildable envelope.
- Missing evidence creates explicit findings. Missing constraints never means no constraints exist.
- Site analysis does not change, generate or approve building geometry. Existing geometry engine remains the only drawing authority.

## Evidence contract
Each material input carries a status (provided, verified, estimated, unknown, conflicting), source (owner input, survey, title plan, authority record, professional observation, map reference, unknown), optional reference, observation date and note. A user-entered value is not promoted to verified evidence.

## Future stages
1. Browser intake and boundary drawing/import with units and coordinate provenance.
2. Parcel orientation, access and topographic layers from licensed/authoritative sources.
3. Constraint register with source documents and jurisdiction/date tracking.
4. Preliminary buildable-envelope computation only when parcel geometry and applicable setbacks are verified and the method is independently tested.
5. Feed a versioned site envelope into the existing solver as an explicit constraint; reject stale or unverified site revisions.
6. Solar/daylight, drainage, slope/accessibility and environmental analysis with stated assumptions.
7. Jurisdiction-specific planning checks reviewed by qualified local professionals.

## Release rules
- Never silently assume a north direction, flat terrain, road access, boundary or zero setbacks.
- Never label an unverified parcel as buildable.
- Keep site context and building geometry on the same immutable revision lineage.
- Any site-context change invalidates dependent fit analysis and any geometry derived from it.
- Regulatory, structural, geotechnical and construction approval remain unavailable until validated services and professional review exist.