# Phase 2 — Universal Building Model

Status: implemented additively in the source snapshot; not deployed and not enabled for production generation.

## Architecture

`lib/universal-building-model.js` adds a versioned `skyline.universal-building` envelope around the existing authoritative `geometry.floors[]` collection. The floor's existing `L` record remains the single source of truth for room, wall, opening and other floor geometry. No second plan or drawing geometry is created.

The envelope records a stable building ID/name, schema version, metre units, shared coordinate-frame identity and building footprint metadata. Each floor carries a stable floor ID and label, explicit elevation, explicit floor-to-floor height where applicable, coordinate-frame identity and its editable existing layout record.

## Operations

- `createUniversalBuildingModel(geometry, metadata)` upgrades an existing geometry record without changing its floor layout arrays. Missing elevation/frame evidence remains missing; it is not fabricated.
- `validateUniversalBuildingModel(geometry)` checks schema, floor identity, global room/wall/opening identity, positive layout extents, explicit elevations, adjacent floor height arithmetic and shared coordinate frames. It reports missing evidence as `not_checked`.
- `duplicateBuildingFloor(geometry, sourceFloorId, options)` requires a new ID, explicit elevation and explicit floor-to-floor height, clones the source floor and remaps room/wall/opening IDs.
- `replaceBuildingFloorLayout(geometry, floorId, layout)` replaces only the selected floor layout.

There is no hard-coded floor-count ceiling in this data model. This is a data architecture capability, not evidence that every tower height is computationally or architecturally supported. Application/request-size limits and performance qualification remain separate work.

## Persistence and compatibility

The existing `studio_projects` and `studio_revisions` JSONB geometry/validation fields are reused; no migration or table alteration is required. The existing owner-scoped atomic save and immutable revision append are retained. Universal model saves use the `universal-building-save` project operation and compute the same SHA-256 content revision with `revisionFor`. Restore recognizes the versioned envelope and returns the stored floor geometry and its evidence report without sending a multi-floor model through the legacy single-storey renderer.

Legacy single-storey projects remain on the existing save/restore path. The upgrade helper preserves their `L` arrays and records unknown elevation/frame information as null/not_checked. Historical revisions are not rewritten or migrated.

## Explicit limitations

- The legacy generation, drawing editor, 2D/3D renderer and geometry validator remain single-storey release-gated. This phase does not enable multi-storey generation or rendering.
- Universal model save/restore persists floor records but does not yet produce multi-floor 2D plans, coordinated 3D, elevations, sections or cross-floor edit UI.
- Stair/lift/service-core connections, slab/void coordination, structural grid continuity, escape graphs, headroom and jurisdiction-specific rules remain separate validation/release gates.
- A passed envelope check means only that the implemented data-integrity checks passed. It is not architectural, structural, regulatory, fire, accessibility or professional approval.
- Construction-document export remains unavailable and unconditionally blocked.

## Verification

The universal model regression file is `tests/universal-building-model.test.js`. The Node 24 runner copies this test into its temporary isolated test checkout. The complete workflow also runs the existing source regression bundle and Site Intelligence browser E2E suite. CI results must be read from the actual GitHub Actions run; no test result is inferred from local source inspection.
