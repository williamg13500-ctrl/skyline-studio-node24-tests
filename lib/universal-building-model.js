// Universal building envelope for Skyline's existing authoritative floor geometry.
// Floor layouts remain in geometry.floors[].L; this module does not create a parallel drawing model.
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => JSON.parse(JSON.stringify(value));
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const elementId = value => Array.isArray(value) ? value[5] : value?.id;

export function createUniversalBuildingModel(geometry, metadata = {}) {
  if (!record(geometry) || !Array.isArray(geometry.floors) || !geometry.floors.length) {
    throw new TypeError('A building requires at least one existing floor geometry record.');
  }
  const next = clone(geometry);
  next.buildingModel = {
    schema: 'skyline.universal-building',
    schemaVersion: 1,
    id: metadata.id ?? next.buildingModel?.id ?? null,
    name: metadata.name ?? next.brief?.name ?? 'Untitled building',
    units: 'm',
    coordinateFrameId: metadata.coordinateFrameId ?? next.coordinateFrameId ?? null,
    footprint: metadata.footprint ?? {
      widthM: next.floors[0]?.L?.W ?? null,
      depthM: next.floors[0]?.L?.D ?? null,
      relationship: 'floor-specific'
    },
    createdFrom: next.buildingModel?.createdFrom ?? 'skyline-floor-geometry',
    modelVersion: 1
  };
  next.floors = next.floors.map((floor, index) => ({
    ...floor,
    id: floor.id ?? `floor-${index + 1}`,
    label: floor.label ?? `Floor ${index + 1}`,
    elevation: finite(floor.elevation) ? floor.elevation : null,
    floorToFloorHeightM: finite(floor.floorToFloorHeightM) ? floor.floorToFloorHeightM : null,
    coordinateFrameId: floor.coordinateFrameId ?? next.buildingModel.coordinateFrameId
  }));
  return next;
}

export function validateUniversalBuildingModel(geometry) {
  const issues = [];
  const add = (code, message, elementIds = [], severity = 'critical') =>
    issues.push({ code, message, elementIds: elementIds.filter(Boolean), severity });
  if (!record(geometry) || !Array.isArray(geometry.floors) || !geometry.floors.length) {
    add('building_floors_missing', 'A building must contain at least one floor.');
    return { status: 'failed', issues, floorCount: 0, checks: { identity: 'failed', elevations: 'not_checked', coordinates: 'not_checked', geometry: 'not_checked' } };
  }
  const model = geometry.buildingModel;
  if (!record(model) || model.schema !== 'skyline.universal-building' || model.schemaVersion !== 1) {
    add('building_model_schema_missing', 'The versioned universal building envelope is missing.');
  }
  if (geometry.units !== 'm' || model?.units !== 'm') add('building_units_invalid', 'Building and universal model units must both be metres.');
  if (!nonEmpty(model?.coordinateFrameId)) add('building_coordinate_frame_missing', 'An authoritative building coordinate frame is required.', [], 'warning');
  const floorIds = new Set(), elementIds = new Set();
  let elevationsComplete = true, coordinatesComplete = true, geometryComplete = true;
  for (let index = 0; index < geometry.floors.length; index++) {
    const floor = geometry.floors[index], id = floor?.id;
    if (!record(floor) || !nonEmpty(id) || floorIds.has(id)) {
      add('floor_identity_invalid', 'Every floor must have a unique, non-empty identity.', [id]);
      geometryComplete = false;
    } else floorIds.add(id);
    if (!finite(floor?.elevation)) {
      add('floor_elevation_missing', 'Every floor requires an explicit elevation in metres.', [id], 'warning');
      elevationsComplete = false;
    }
    if (index > 0) {
      const previous = geometry.floors[index - 1];
      if (!finite(floor?.floorToFloorHeightM) || floor.floorToFloorHeightM <= 0) {
        add('floor_height_missing', 'Every upper floor requires an explicit positive floor-to-floor height.', [id], 'warning');
        elevationsComplete = false;
      } else if (finite(previous?.elevation) && finite(floor?.elevation) &&
          Math.abs(floor.elevation - previous.elevation - floor.floorToFloorHeightM) > 0.01) {
        add('floor_height_mismatch', 'Floor-to-floor height does not agree with adjacent floor elevations.', [previous.id, id]);
        elevationsComplete = false;
      }
      if (finite(previous?.elevation) && finite(floor?.elevation) && floor.elevation <= previous.elevation) {
        add('floor_elevation_order', 'Floor elevations must increase strictly in building order.', [previous.id, id]);
        elevationsComplete = false;
      }
    }
    if (!nonEmpty(model?.coordinateFrameId) || floor?.coordinateFrameId !== model.coordinateFrameId) {
      add('floor_coordinate_frame_mismatch', 'Every floor must use the authoritative building coordinate frame.', [id], 'warning');
      coordinatesComplete = false;
    }
    const L = floor?.L;
    if (!record(L) || !finite(L.W) || !finite(L.D) || L.W <= 0 || L.D <= 0 ||
        !Array.isArray(L.R) || !Array.isArray(L.S) || !Array.isArray(L.O)) {
      add('floor_layout_invalid', 'Each floor requires positive dimensions and room, wall and opening arrays.', [id]);
      geometryComplete = false;
      continue;
    }
    for (const item of [...L.R, ...L.S, ...L.O]) {
      const eid = elementId(item);
      if (!nonEmpty(eid) || elementIds.has(eid)) {
        add('building_element_identity_invalid', 'Room, wall and opening identities must be present and globally unique.', [id, eid]);
        geometryComplete = false;
      } else elementIds.add(eid);
    }
  }
  const critical = issues.some(issue => issue.severity === 'critical');
  const status = critical ? 'failed' : (!elevationsComplete || !coordinatesComplete ? 'not_checked' : 'passed');
  return {
    status, issues, floorCount: geometry.floors.length,
    checks: {
      identity: issues.some(i => i.code === 'floor_identity_invalid' || i.code === 'building_element_identity_invalid') ? 'failed' : 'passed',
      elevations: elevationsComplete ? 'passed' : 'not_checked',
      coordinates: coordinatesComplete ? 'passed' : 'not_checked',
      geometry: geometryComplete ? 'passed' : 'failed'
    },
    scope: 'Building-envelope and floor-record integrity only; not architectural, structural, accessibility, fire, regulatory or professional approval.'
  };
}

export function duplicateBuildingFloor(geometry, sourceFloorId, options = {}) {
  if (!record(geometry) || !Array.isArray(geometry.floors)) throw new TypeError('A building geometry is required.');
  const sourceIndex = geometry.floors.findIndex(floor => floor.id === sourceFloorId);
  if (sourceIndex < 0) throw new RangeError('The source floor does not exist.');
  const { id, label, elevationM, floorToFloorHeightM } = options;
  if (!nonEmpty(id) || geometry.floors.some(floor => floor.id === id)) throw new TypeError('A new unique floor ID is required.');
  if (!finite(elevationM) || elevationM < 0) throw new TypeError('An explicit non-negative elevation in metres is required.');
  if (!finite(floorToFloorHeightM) || floorToFloorHeightM <= 0) throw new TypeError('An explicit positive floor-to-floor height is required.');
  const floor = clone(geometry.floors[sourceIndex]);
  floor.id = id;
  floor.label = label ?? id;
  floor.elevation = elevationM;
  floor.floorToFloorHeightM = floorToFloorHeightM;
  const remap = new Map();
  const makeId = old => {
    const nextId = `${id}:${old ?? 'element'}:${remap.size + 1}`;
    remap.set(old, nextId);
    return nextId;
  };
  floor.L.R = floor.L.R.map(room => ({ ...room, id: makeId(room.id) }));
  floor.L.S = floor.L.S.map(wall => {
    const copy = [...wall];
    copy[5] = makeId(wall[5]);
    return copy;
  });
  floor.L.O = floor.L.O.map(opening => ({ ...opening, id: makeId(opening.id) }));
  const next = clone(geometry);
  next.floors.push(floor);
  return next;
}

export function replaceBuildingFloorLayout(geometry, floorId, layout) {
  if (!record(geometry) || !Array.isArray(geometry.floors) || !record(layout)) throw new TypeError('Building and replacement layout are required.');
  const index = geometry.floors.findIndex(floor => floor.id === floorId);
  if (index < 0) throw new RangeError('The target floor does not exist.');
  const next = clone(geometry);
  next.floors[index].L = clone(layout);
  return next;
}
