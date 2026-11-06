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
