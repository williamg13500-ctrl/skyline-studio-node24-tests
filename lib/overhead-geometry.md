# Stage 2A — overhead geometry data contract

This stage defines a structural data contract only. It does not calculate headroom, infer a regulatory minimum, approve a stair, or alter the existing multi-storey generation gate.

## Overhead elements

Building geometry may carry an `overheadElements` array. Each element has a unique `id`, a `type` of `beam`, `soffit`, `ceiling_drop`, or `stair_opening_edge`, an existing `floorId`, a matching `coordinateFrameId`, `units: "m"`, 3D `geometry`, and `source: { kind, referenceId, revision }` with all source fields non-empty.

Solid overhead elements use `{ type: "box3d", min: {x,y,z}, max: {x,y,z} }` with positive extents. Opening edges use `{ type: "polyline3d", points: [{x,y,z}, ...] }` with at least two distinct consecutive points. Frames are declared in `coordinateFrames` as `{ id, floorId, units: "m" }`; a floor may declare its own `coordinateFrameId` and explicit `units`.

## Stair path

A stair with an explicit path carries `geometryParts` and `path`. Geometry parts have unique IDs, a `kind` of `flight` or `landing`, an endpoint floor/frame reference, metre units, and 3D box geometry. The path contains non-empty `flights` and `landings` arrays. Each path entry has its own ID and a `geometryRef` resolving to a real geometry part of the matching kind.

## Legacy behaviour and status

A saved project with no overhead data and no explicit stair path returns `not_checked`, without a failure issue or mutation.

`model_valid` means only that supplied records are structurally linked. It is not a clearance result or safety/regulatory approval. Missing data remains `not_checked`; Stage 2B defines clearance and release-blocker behaviour.

 
## Stage 2B — continuous stair-clearance geometry

Each stair path has an ordered `path.sequence` of references to `geometryParts`. The sequence must include every usable approach, flight, transition, landing and opening-edge segment. Each referenced part has a `clearancePath` containing exactly two connected `centerline3d` points and a positive `widthM`; each path part also identifies its floor. Consecutive segments share the exact endpoint coordinates. A segment's swept usable region is its continuous width-defined corridor, and its walking surface is the plane interpolated along its 3D centreline.

Overhead boxes use the lower horizontal face as their underside. A sloped soffit may use `plane3d` with `z = a*x + b*y + c` and a bounded convex XY footprint. Opening edges remain 3D polylines. The intersection calculation clips the path corridor against each bounded obstruction footprint and evaluates the linear vertical gap at the resulting intersection vertices; line edges are clipped parametrically. This is continuous polygon/line geometry, not fixed-point sampling.

A complete overhead inventory must be explicitly reviewed with `overheadGeometryReview.status: "complete"`, a non-empty review ID and the current `geometryRevision`. Measured headroom records must carry the same geometry revision. The building must declare `clearanceMeasurementToleranceM`; no default tolerance is supplied. Geometry-derived and measured clearance remain separate output values. A stale measurement, missing path/overhead geometry, absent tolerance, disagreement beyond tolerance or absent sourced ruleset blocks release. Only an explicit versioned sourced ruleset supplies a threshold; no threshold is inferred.

The validator returns per-stair `stairClearance` results and top-level `releaseBlockers`. The `continuous_stair_clearance` check is independent of the legacy measured-evidence check. A passed geometric calculation is not professional approval or construction-export authorization.
