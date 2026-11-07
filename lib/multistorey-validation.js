import { assessStairClearance } from './stair-clearance.js';
// Independent multi-storey coordination, vertical-circulation, headroom and egress checks.
// Geometry-only checks never imply code compliance. Missing or malformed evidence fails closed.
const EPS = 1e-6;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const objectRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;
const pairKey = (a, b) => JSON.stringify([String(a), String(b)].sort());
const nodeKey = (floorId, roomId) => JSON.stringify([String(floorId), String(roomId)]);
const add = (issues, code, message, elementIds = [], measured = null, expected = null, severity = 'critical') => {
  issues.push({ id: 'ms-' + (issues.length + 1), code, severity, message, elementIds: elementIds.filter(x => x !== null && x !== undefined && x !== ''), measured, expected });
};
const floorRooms = f => Array.isArray(f?.L?.R) ? f.L.R : [];
const allChecks = ['floor_identity_and_elevations','floor_coordinate_and_element_identity','room_identity_and_geometry','vertical_circulation_connections','measured_stair_headroom','continuous_stair_clearance','escape_route_graph','egress_regulatory_screening','vertical_core_geometry','vertical_core_regulatory','vertical_core_circulation_connectivity'];
function statusFor(issues, codes, applicable = true, evidenceComplete = true) {
  if (!applicable) return 'not_applicable';
  if (issues.some(i => codes.includes(i.code) && i.severity === 'critical')) return 'failed';
  if (!evidenceComplete || issues.some(i => codes.includes(i.code))) return 'not_checked';
  return 'passed';
}
function makeResult(issues, statuses = {}, stairClearance = [], releaseBlockers = []) {
  const verticalCoreResults = {
    geometry: statuses.vertical_core_geometry || 'not_checked',
    circulationConnectivity: statuses.vertical_core_circulation_connectivity || 'not_checked',
    regulatory: statuses.vertical_core_regulatory || 'not_checked'
  };
  const measuredResults = {
    stairHeadroom: statuses.measured_stair_headroom || 'not_checked',
    continuousStairClearance: statuses.continuous_stair_clearance || 'not_checked'
  };
  const regulatoryResults = {
    egress: statuses.egress_regulatory_screening || 'not_checked'
  };
  return {
    issues,
    stairClearance,
    releaseBlockers,
    verticalCoreResults,
    measuredResults,
    regulatoryResults,
    checks: allChecks.map(name => ({ name, status: statuses[name] || 'not_checked' })),
    scope: 'Independent geometric coordination and evidence-gated topology checks only. A connected route graph is not proof of code-compliant egress, fire safety, accessibility or professional approval.'
  };
}
function reachable(starts, adjacency) {
  const seen = new Set(starts), queue = [...starts];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}
function validHeadroom(h) {
  return objectRecord(h) && finite(h.clearanceM) && h.clearanceM > 0 &&
    nonEmpty(h.measurementId) &&
    ['laser_scan','survey','verified_model_section'].includes(h.method) &&
    Array.isArray(h.measurementPoints) && h.measurementPoints.length >= 2 &&
    h.measurementPoints.every(p => objectRecord(p) && finite(p.x) && finite(p.y) && finite(p.z)) &&
    objectRecord(h.obstructionReview) && h.obstructionReview.status === 'clear' &&
    nonEmpty(h.obstructionReview.reviewId);
}
function findStairVoid(upperFloor, stair) {
  if (Array.isArray(upperFloor?.voids)) return upperFloor.voids.find(v => objectRecord(v) && v.stairId === stair.id) || null;
  return objectRecord(upperFloor?.void) ? upperFloor.void : null;
}

const verticalCoreKinds = new Set(['stair','lift','shaft','lobby']);
function validateVerticalCores(g, floors, floorIndexById, issues, releaseBlockers, multi) {
  if (!multi) return {geometry:'not_applicable', regulatory:'not_applicable'};
  let geometry = 'passed';
  const markUnknown = (code, message, ids = []) => {
    add(issues, code, message, ids, null, 'complete, supported vertical-core evidence', 'warning');
    releaseBlockers.push({domain:'geometry',code,message,elementIds:ids});
    if (geometry !== 'failed') geometry = 'not_checked';
  };
  const markFailed = (code, message, ids = [], measured = null, expected = null) => {
    add(issues, code, message, ids, measured, expected);
    releaseBlockers.push({domain:'geometry',code,message,elementIds:ids});
    geometry = 'failed';
  };
  if (!Array.isArray(g.verticalCores) || g.verticalCores.length === 0) {
    markUnknown('vertical_core_data_missing', 'Shared vertical-core geometry is absent; core alignment and continuity were not checked.');
    releaseBlockers.push({domain:'regulatory',code:'vertical_core_regulatory_not_checked',message:'Vertical-core regulatory suitability has not been assessed.'});
    return {geometry:'not_checked',regulatory:'not_checked'};
  }
  const seen = new Set();
  for (const core of g.verticalCores) {
    if (!objectRecord(core)) {
      markUnknown('vertical_core_data_malformed', 'A vertical-core record is not a supported object.');
      continue;
    }
    if (!nonEmpty(core.id) || !verticalCoreKinds.has(core.kind) ||
        !nonEmpty(core.coordinateFrameId) || !objectRecord(core.servedFloorRange) ||
        !Array.isArray(core.floorsServed) || !Array.isArray(core.footprints)) {
      markUnknown('vertical_core_data_ambiguous', 'Vertical-core data is incomplete or uses an unsupported shape.', [core.id]);
      continue;
    }
    if (seen.has(core.id)) markFailed('vertical_core_id_duplicate', 'Vertical-core IDs must be unique across the building.', [core.id]);
    else seen.add(core.id);
    if (core.coordinateFrameId !== g.coordinateFrameId) {
      markFailed('vertical_core_coordinate_frame_mismatch', 'Vertical core must use the authoritative building coordinate frame.', [core.id], core.coordinateFrameId, g.coordinateFrameId);
    }
    const from = floorIndexById.get(core.servedFloorRange.fromFloorId);
    const to = floorIndexById.get(core.servedFloorRange.toFloorId);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
      markUnknown('vertical_core_floor_range_ambiguous', 'Vertical-core served-floor range does not identify an ordered range in this building.', [core.id, core.servedFloorRange.fromFloorId, core.servedFloorRange.toFloorId]);
      continue;
    }
    const expectedFloors = floors.slice(from, to + 1).map(f => f.id);
    if (core.floorsServed.some(id => !nonEmpty(id)) || new Set(core.floorsServed).size !== core.floorsServed.length ||
        core.floorsServed.length !== expectedFloors.length ||
        core.floorsServed.some((id, index) => id !== expectedFloors[index])) {
      markFailed('vertical_core_floor_continuity', 'A vertical core must serve every floor in its declared range in building order, without gaps or early termination.', [core.id, ...core.floorsServed], core.floorsServed, expectedFloors);
    }
    const footprintByFloor = new Map();
    let footprintDataComplete = true;
    for (const footprint of core.footprints) {
      if (!objectRecord(footprint) || !nonEmpty(footprint.floorId) ||
          ![footprint.x,footprint.y,footprint.w,footprint.h].every(finite) ||
          footprint.w <= 0 || footprint.h <= 0 || !nonEmpty(footprint.coordinateFrameId)) {
        footprintDataComplete = false;
        continue;
      }
      if (footprintByFloor.has(footprint.floorId)) {
        markFailed('vertical_core_footprint_duplicate', 'A vertical core may declare only one footprint per served floor.', [core.id, footprint.floorId]);
      }
      footprintByFloor.set(footprint.floorId, footprint);
      if (footprint.coordinateFrameId !== core.coordinateFrameId || footprint.coordinateFrameId !== g.coordinateFrameId) {
        markFailed('vertical_core_footprint_frame_mismatch', 'Every core footprint must use the shared building coordinate frame.', [core.id, footprint.floorId], footprint.coordinateFrameId, g.coordinateFrameId);
      }
    }
    if (!footprintDataComplete) {
      markUnknown('vertical_core_footprint_malformed', 'A vertical-core footprint is malformed or incomplete.', [core.id]);
      continue;
    }
    if (expectedFloors.some(id => !footprintByFloor.has(id)) ||
        [...footprintByFloor.keys()].some(id => !core.floorsServed.includes(id))) {
      markUnknown('vertical_core_footprint_missing', 'A complete footprint record is required for every floor served by the core.', [core.id]);
      continue;
    }
    const baseline = footprintByFloor.get(expectedFloors[0]);
    for (const floorId of expectedFloors.slice(1)) {
      const current = footprintByFloor.get(floorId);
      if (['x','y','w','h'].some(key => current[key] !== baseline[key])) {
        markFailed('vertical_core_footprint_misaligned', 'Vertical-core footprints must align exactly in the shared coordinate frame on every served floor.', [core.id, expectedFloors[0], floorId], current, baseline);
      }
    }
  }
  if (geometry === 'passed') {
    releaseBlockers.push({domain:'regulatory',code:'vertical_core_regulatory_not_checked',message:'Geometric core coordination does not establish structural, fire, accessibility or regulatory compliance.'});
  } else if (geometry === 'not_checked') {
    releaseBlockers.push({domain:'regulatory',code:'vertical_core_regulatory_not_checked',message:'Vertical-core regulatory suitability remains not checked.'});
  }
  return {geometry,regulatory:'not_checked'};
}


function validateCoreCirculation(g, floors, roomById, egress, reachedNodes, issues, releaseBlockers, multi) {
  if (!multi) return 'not_applicable';
  let status = 'passed';
  const unknown = (code, message, ids = []) => {
    add(issues, code, message, ids, null, 'complete supported core-circulation and escape-graph evidence', 'warning');
    releaseBlockers.push({domain:'circulation',code,message,elementIds:ids});
    if (status !== 'failed') status = 'not_checked';
  };
  const failed = (code, message, ids = []) => {
    add(issues, code, message, ids);
    releaseBlockers.push({domain:'circulation',code,message,elementIds:ids});
    status = 'failed';
  };
  const cores = g.verticalCores;
  if (!Array.isArray(cores) || cores.length === 0) {
    unknown('vertical_core_circulation_data_missing', 'Vertical-core circulation connections are absent; connectivity was not checked.');
    return 'not_checked';
  }
  if (!objectRecord(egress) || !Array.isArray(egress.edges) || !Array.isArray(egress.exits) || !reachedNodes) {
    unknown('vertical_core_escape_graph_unavailable', 'A complete escape graph is required to verify vertical-core circulation routes.');
    return 'not_checked';
  }
  const coreById = new Map();
  for (const core of cores) {
    if (!objectRecord(core) || !nonEmpty(core.id) || !Array.isArray(core.floorsServed) ||
        !Array.isArray(core.circulationConnections)) {
      unknown('vertical_core_circulation_data_ambiguous', 'Core circulation connections are missing or malformed.', [core?.id]);
      continue;
    }
    if (coreById.has(core.id)) {
      failed('vertical_core_circulation_duplicate_id', 'Vertical-core IDs must be unique when checking circulation.', [core.id]);
      continue;
    }
    coreById.set(core.id, core);
  }
  const connectionByCoreFloor = new Map();
  for (const [coreId, core] of coreById) {
    for (const floorId of core.floorsServed) {
      const matches = core.circulationConnections.filter(c => objectRecord(c) && c.floorId === floorId);
      if (matches.length !== 1 || !nonEmpty(matches[0]?.roomId)) {
        unknown('vertical_core_circulation_connection_missing', 'Each served floor requires exactly one explicit circulation-room connection.', [coreId, floorId]);
        continue;
      }
      const connection = matches[0];
      const roomInfo = roomById.get(connection.roomId);
      if (!roomInfo || roomInfo.floorId !== floorId || roomInfo.room.spaceUse !== 'circulation') {
        failed('vertical_core_circulation_room_invalid', 'A core must connect to an existing room explicitly classified as circulation on every served floor.', [coreId, floorId, connection.roomId]);
        continue;
      }
      connectionByCoreFloor.set(JSON.stringify([coreId,floorId]), connection);
      const graphLinks = egress.edges.filter(edge => objectRecord(edge) && edge.coreId === coreId && edge.floorId === floorId &&
        (edge.from === connection.roomId || edge.to === connection.roomId));
      if (graphLinks.length === 0) {
        failed('egress_core_floor_link_missing', 'A core circulation connection is absent from the escape-route graph on a served floor.', [coreId, floorId, connection.roomId]);
        continue;
      }
      const node = nodeKey(floorId, connection.roomId);
      if (!reachedNodes.has(node)) {
        failed('egress_core_route_missing', 'The core lobby or circulation connection has no validated route through the escape graph to a declared exterior exit.', [coreId, floorId, connection.roomId]);
      }
    }
  }
  for (const edge of egress.edges) {
    if (!objectRecord(edge) || !nonEmpty(edge.coreId)) continue;
    const core = coreById.get(edge.coreId);
    if (!core) {
      failed('egress_core_geometry_missing', 'The escape graph references a vertical core that is absent from building geometry.', [edge.coreId, edge.id]);
      continue;
    }
    if (!nonEmpty(edge.floorId) || !core.floorsServed.includes(edge.floorId)) {
      failed('egress_core_connection_mismatch', 'A core graph edge must identify a floor served by that core.', [edge.coreId, edge.floorId, edge.id]);
      continue;
    }
    const connection = connectionByCoreFloor.get(JSON.stringify([edge.coreId,edge.floorId]));
    if (!connection || (edge.from !== connection.roomId && edge.to !== connection.roomId)) {
      failed('egress_core_connection_mismatch', 'A core graph edge must connect the declared circulation room for that core and floor.', [edge.coreId, edge.floorId, edge.from, edge.to]);
    }
  }
  return status;
}

export function validateMultiStorey(g) {
  const issues = [];
  const stairClearance = [];
  const releaseBlockers = [];
  try {
    if (!objectRecord(g)) {
      add(issues, 'building_input_invalid', 'Building geometry must be a non-null object.');
      return makeResult(issues);
    }
    if (!Array.isArray(g.floors) || g.floors.length === 0) {
      add(issues, 'floors_invalid', 'Building geometry must contain a non-empty floors array.');
      return makeResult(issues);
    }
    const floors = g.floors;
    if (floors.some(f => !objectRecord(f))) {
      add(issues, 'floor_record_invalid', 'Every floor entry must be a valid object.');
      return makeResult(issues);
    }
    const multi = floors.length > 1;
    const floorIds = new Set();
    const globalElements = new Set();
    const roomById = new Map();
    const floorIndexById = new Map();
    const floorIdentityCodes = ['floor_identity','floor_elevation_missing','floor_elevation_order','floor_height_missing','floor_height_mismatch'];
    const coordinateCodes = ['floor_layout_invalid','floor_units','floor_coordinate_frame_missing','floor_coordinate_frame_mismatch','floor_footprint_relationship_missing','building_element_identity','building_coordinate_frame_missing'];
    const roomCodes = ['floor_layout_invalid','room_identity_invalid','room_identity_duplicate','room_geometry_invalid'];
    const circulationCodes = ['vertical_connection_count','vertical_connection_duplicate','vertical_connection_extras','stair_identity_invalid','stair_identity_duplicate','stair_floor_pair_invalid','stair_rise_mismatch','stair_footprint_invalid','stair_void_alignment','stair_landing_association_invalid'];
    const headroomCodes = ['stair_identity_invalid','stair_identity_duplicate','stair_headroom_unmeasured','stair_headroom_obstructed','stair_headroom_unprocessed'];
    const egressCodes = ['egress_evidence_missing','egress_structure_invalid','egress_edge_invalid','egress_edge_unverified','egress_exit_invalid','egress_stair_link_missing','egress_unreachable_room','egress_core_geometry_missing','egress_core_connection_mismatch','egress_core_floor_link_missing','egress_core_route_missing'];

    if (multi && !nonEmpty(g.coordinateFrameId)) {
      add(issues, 'building_coordinate_frame_missing', 'A multi-storey building must declare one authoritative building-level coordinateFrameId.');
    }
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i], id = f.id;
      if (!nonEmpty(id) || floorIds.has(id)) add(issues, 'floor_identity', 'Every storey must have a non-empty unique floor ID.', [id]);
      if (nonEmpty(id)) { floorIds.add(id); floorIndexById.set(id, i); }
      if (!finite(f.elevation)) add(issues, 'floor_elevation_missing', 'Each storey requires an explicit finite elevation in metres.', [id], f.elevation, 'finite metres');
      if (!objectRecord(f.L) || !Array.isArray(f.L.R) || !Array.isArray(f.L.S) || !Array.isArray(f.L.O) ||
          !finite(f.L.W) || !finite(f.L.D) || f.L.W <= 0 || f.L.D <= 0) {
        add(issues, 'floor_layout_invalid', 'Each storey needs a complete, positive-dimension layout.', [id]);
      }
      if (multi && g.units !== 'm') add(issues, 'floor_units', 'Multi-storey coordination requires explicit metre units.', [id], g.units, 'm');
      if (multi && (!nonEmpty(f.coordinateFrameId) || f.coordinateFrameId !== g.coordinateFrameId)) {
        add(issues, 'floor_coordinate_frame_mismatch', 'Every floor must declare and match the authoritative building coordinateFrameId.', [id], f.coordinateFrameId ?? null, g.coordinateFrameId ?? null);
      }
      if (multi && (!objectRecord(f.footprintRelationship) || !nonEmpty(f.footprintRelationship.type))) {
        add(issues, 'floor_footprint_relationship_missing', 'Each floor plate must declare its relationship to the building footprint.', [id], null, 'explicit footprint relationship', 'warning');
      }
      const rooms = Array.isArray(f.L?.R) ? f.L.R : [];
      for (const room of rooms) {
        if (!objectRecord(room) || !nonEmpty(room.id)) {
          add(issues, 'room_identity_invalid', 'Every room requires a non-empty string ID.', [id, room?.id]);
          continue;
        }
        if (roomById.has(room.id)) add(issues, 'room_identity_duplicate', 'Room IDs must be unique across the entire building.', [id, room.id, roomById.get(room.id).floorId]);
        else roomById.set(room.id, { floorId: id, room });
        if (![room.x,room.y,room.w,room.h].every(finite) || room.w <= 0 || room.h <= 0) {
          add(issues, 'room_geometry_invalid', 'Every room requires finite coordinates and positive width and height.', [id, room.id]);
        }
      }
      const elements = [...rooms, ...(Array.isArray(f.L?.S) ? f.L.S : []), ...(Array.isArray(f.L?.O) ? f.L.O : [])];
      for (const el of elements) {
        const eid = Array.isArray(el) ? el[5] : el?.id;
        if (!nonEmpty(eid) || globalElements.has(eid)) add(issues, 'building_element_identity', 'Element IDs must be present and unique across the whole building.', [eid, id]);
        else globalElements.add(eid);
      }
      if (i > 0) {
        const lower = floors[i - 1], upper = f;
        if (finite(lower.elevation) && finite(upper.elevation) && upper.elevation <= lower.elevation + EPS) {
          add(issues, 'floor_elevation_order', 'Storey elevations must increase strictly from the lowest level.', [lower.id, upper.id], [lower.elevation, upper.elevation], 'strictly increasing');
        }
        const declared = upper.floorToFloorHeightM;
        if (!finite(declared) || declared <= 0) add(issues, 'floor_height_missing', 'Every upper storey must declare its floor-to-floor height.', [upper.id], declared, 'positive metres');
        else if (finite(lower.elevation) && finite(upper.elevation) && Math.abs((upper.elevation - lower.elevation) - declared) > 0.01) {
          add(issues, 'floor_height_mismatch', 'Declared floor-to-floor height disagrees with measured floor elevations.', [lower.id, upper.id], upper.elevation - lower.elevation, declared);
        }
      }
    }

    const stairs = Array.isArray(g.stairs) ? g.stairs : [];
    if (multi && !Array.isArray(g.stairs)) add(issues, 'vertical_connection_count', 'A multi-storey building requires an explicit stairs array.');
    const stairIds = new Set(), pairCounts = new Map(), headroomProcessed = new Set();
    const validStairs = [];
    for (const s of stairs) {
      if (!objectRecord(s)) { add(issues, 'stair_identity_invalid', 'Every stair record must be a valid object.'); continue; }
      if (!nonEmpty(s.id)) add(issues, 'stair_identity_invalid', 'Every stair requires a non-empty string ID.', [s.id]);
      else if (stairIds.has(s.id)) add(issues, 'stair_identity_duplicate', 'Stair IDs must be unique across the building.', [s.id]);
      else stairIds.add(s.id);
      const fromIndex = floorIndexById.get(s.from), toIndex = floorIndexById.get(s.to);
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || toIndex !== fromIndex + 1) {
        add(issues, 'stair_floor_pair_invalid', 'Each stair must connect exactly one adjacent lower-to-upper floor pair.', [s.id, s.from, s.to]);
        add(issues, 'vertical_connection_extras', 'A stair record does not map to a valid adjacent floor pair.', [s.id, s.from, s.to]);
      } else {
        const sig = pairKey(s.from, s.to);
        pairCounts.set(sig, (pairCounts.get(sig) || 0) + 1);
        const lower = floors[fromIndex], upper = floors[toIndex];
        if (!finite(s.rise) || !finite(lower.elevation) || !finite(upper.elevation) || Math.abs(s.rise - (upper.elevation - lower.elevation)) > 0.01) {
          add(issues, 'stair_rise_mismatch', 'Stair rise must agree with the measured adjacent floor elevations.', [s.id, s.from, s.to], s.rise, finite(lower.elevation) && finite(upper.elevation) ? upper.elevation - lower.elevation : null);
        }
        if (![s.x,s.y,s.w,s.h].every(finite) || s.w <= 0 || s.h <= 0) add(issues, 'stair_footprint_invalid', 'Stair footprint must have finite coordinates and positive dimensions.', [s.id]);
        const v = findStairVoid(upper, s);
        if (!v || !['x','y','w','h'].every(k => finite(v[k])) || ['x','y','w','h'].some(k => !finite(s[k]) || Math.abs(s[k] - v[k]) > 0.01)) {
          add(issues, 'stair_void_alignment', 'Stair footprint and upper-floor slab opening must align within 10 mm.', [s.id, upper.id], {x:s.x,y:s.y,w:s.w,h:s.h}, v);
        }
        const fromRoom = roomById.get(s.fromRoomId), toRoom = roomById.get(s.toRoomId);
        if (!fromRoom || !toRoom || fromRoom.floorId !== s.from || toRoom.floorId !== s.to) {
          add(issues, 'stair_landing_association_invalid', 'Every stair must identify valid landing rooms on both connected floors, even when no egress graph is supplied.', [s.id, s.fromRoomId, s.toRoomId]);
        }
        validStairs.push(s);
      }

      const clearance = assessStairClearance(g, s);
      stairClearance.push(clearance);
      for (const blocker of clearance.releaseBlockers) releaseBlockers.push({stairId:s.id,...blocker});
      for (const blocker of clearance.regulatoryAssessment?.releaseBlockers || []) releaseBlockers.push({stairId:s.id,...blocker,domain:'regulatory'});
      for (const finding of clearance.issues) add(issues, finding.code, 'Continuous stair-clearance assessment identified a blocking finding.', [s.id], finding.measuredM ?? null, finding.requiredM ?? finding.geometryDerivedM ?? null);
      const h = s.headroom;
      if (!validHeadroom(h)) {
        add(issues, 'stair_headroom_unmeasured', 'Stair clear headroom lacks complete traceable measurement and obstruction-review evidence.', [s.id], h ?? null, 'valid measured headroom evidence');
      } else {
        headroomProcessed.add(s.id);
        // Measurement evidence is retained as geometry evidence only.
        // Regulatory comparison is performed separately by assessStairClearance.
      }
      if (s.obstructed === true || (Array.isArray(s.obstructionIds) && s.obstructionIds.length > 0)) {
        add(issues, 'stair_headroom_obstructed', 'A recorded overhead obstruction intersects the stair clear-headroom zone.', [s.id, ...(Array.isArray(s.obstructionIds) ? s.obstructionIds : [])]);
      }
    }
    if (multi) {
      for (let i = 0; i < floors.length - 1; i++) {
        const sig = pairKey(floors[i].id, floors[i + 1].id);
        if (!pairCounts.get(sig)) add(issues, 'vertical_connection_count', 'Every adjacent floor pair requires at least one explicitly modelled stair connection.', [floors[i].id, floors[i + 1].id], 0, 'one or more');
      }
    }
    for (const s of stairs) {
      if (objectRecord(s) && !headroomProcessed.has(s.id) && !issues.some(i => i.code === 'stair_headroom_unmeasured' && i.elementIds.includes(s.id))) {
        add(issues, 'stair_headroom_unprocessed', 'This stair did not receive headroom validation; its headroom status cannot pass.', [s.id], null, 'headroom validation completed');
      }
    }

    const headroomApplicable = multi;
    const headroomComplete = Array.isArray(g.stairs) && stairs.length > 0 && stairs.every(s => objectRecord(s) && headroomProcessed.has(s.id));
    let egressTopologyStatus = 'not_applicable';
    let egressRegulatoryStatus = 'not_applicable';
    let egressReachableNodes = null;
    if (multi) {
      const egress = g.egress;
      if (!objectRecord(egress)) {
        add(issues, 'egress_evidence_missing', 'Escape-route verification is not possible without explicit exits and route edges.', [], null, 'egress object', 'warning');
        egressTopologyStatus = 'not_checked';
        egressRegulatoryStatus = 'not_checked';
      } else if (!Array.isArray(egress.exits) || !Array.isArray(egress.edges) || egress.exits.length === 0) {
        add(issues, 'egress_structure_invalid', 'Egress evidence requires non-empty exits and an edges array.', [], null, 'exits and edges arrays');
        egressTopologyStatus = 'failed';
        egressRegulatoryStatus = 'not_checked';
      } else {
        const adjacency = new Map();
        const connect = (a, b) => {
          if (!adjacency.has(a)) adjacency.set(a, new Set());
          if (!adjacency.has(b)) adjacency.set(b, new Set());
          adjacency.get(a).add(b); adjacency.get(b).add(a);
        };
        const edgeSeen = new Set();
        const openingById = new Map();
        for (const f of floors) for (const opening of (Array.isArray(f.L?.O) ? f.L.O : [])) {
          if (objectRecord(opening) && nonEmpty(opening.id)) openingById.set(opening.id, {floorId:f.id, opening});
        }
        for (const edge of egress.edges) {
          if (!objectRecord(edge) || !nonEmpty(edge.from) || !nonEmpty(edge.to) || edge.from === edge.to || edge.blocked === true) {
            add(issues, 'egress_edge_invalid', 'Escape graph contains a malformed, self-referential or blocked route edge.', [edge?.id, edge?.from, edge?.to]);
            continue;
          }
          const from = roomById.get(edge.from), to = roomById.get(edge.to);
          if (!from || !to) { add(issues, 'egress_edge_invalid', 'Escape graph edge references a room that does not exist.', [edge.id, edge.from, edge.to]); continue; }
          const sig = pairKey(nodeKey(from.floorId, edge.from), nodeKey(to.floorId, edge.to));
          if (edgeSeen.has(sig)) { add(issues, 'egress_edge_invalid', 'Duplicate or contradictory escape graph edge.', [edge.id, edge.from, edge.to]); continue; }
          edgeSeen.add(sig);
          const stairEvidence = nonEmpty(edge.stairId) && validStairs.some(s => s.id === edge.stairId && s.fromRoomId === edge.from && s.toRoomId === edge.to && headroomProcessed.has(s.id));
          const openingRecord = nonEmpty(edge.sourceElementId) ? openingById.get(edge.sourceElementId) : null;
          const openingEvidence = !!openingRecord && openingRecord.floorId === from.floorId && from.floorId === to.floorId &&
            openingRecord.opening.t !== 'win' && openingRecord.opening.roomId === edge.from &&
            Array.isArray(openingRecord.opening.connectedRoomIds) && openingRecord.opening.connectedRoomIds.includes(edge.to);
          if (!stairEvidence && !openingEvidence) {
            add(issues, 'egress_edge_unverified', 'Escape graph edge has no matching validated stair or physical opening evidence.', [edge.id, edge.sourceElementId, edge.stairId]);
            continue;
          }
          connect(nodeKey(from.floorId, edge.from), nodeKey(to.floorId, edge.to));
        }
        const exitNodes = [];
        for (const exit of egress.exits) {
          const room = objectRecord(exit) ? roomById.get(exit.roomId) : null;
          if (!room || exit.type !== 'exterior_exit') add(issues, 'egress_exit_invalid', 'Each escape exit must reference an existing room and be classified as an exterior exit.', [exit?.id, exit?.roomId]);
          else exitNodes.push(nodeKey(room.floorId, exit.roomId));
        }
        for (const s of validStairs) {
          const from = roomById.get(s.fromRoomId), to = roomById.get(s.toRoomId);
          if (from && to && from.floorId === s.from && to.floorId === s.to && headroomProcessed.has(s.id) && s.blocked !== true) {
            connect(nodeKey(from.floorId, s.fromRoomId), nodeKey(to.floorId, s.toRoomId));
          }
        }
        const reached = reachable(exitNodes, adjacency);
        egressReachableNodes = reached;
        for (const [roomId, roomInfo] of roomById) {
          const node = nodeKey(roomInfo.floorId, roomId);
          if (!reached.has(node)) add(issues, 'egress_unreachable_room', 'Room has no validated graph path to a declared exterior exit.', [roomInfo.floorId, roomId]);
        }
        egressTopologyStatus = statusFor(issues, egressCodes, true, true);
        const rules = egress.ruleset;
        if (!objectRecord(rules) || !nonEmpty(rules.id) || !nonEmpty(rules.version) || !nonEmpty(rules.sourceUrl)) {
          add(issues, 'egress_ruleset_missing', 'Topology was assessed, but regulatory egress screening remains not checked without a sourced, versioned ruleset.', [], null, null, 'warning');
          egressRegulatoryStatus = 'not_checked';
        } else {
          // A ruleset record alone does not implement regulatory distance, exit separation, fire protection or accessibility checks.
          egressRegulatoryStatus = 'not_checked';
        }
      }
    }

    const coreStatuses = validateVerticalCores(g, floors, floorIndexById, issues, releaseBlockers, multi);
    const coreCirculationStatus = validateCoreCirculation(g, floors, roomById, g.egress, egressReachableNodes, issues, releaseBlockers, multi);
    const statuses = {
      floor_identity_and_elevations: statusFor(issues, floorIdentityCodes, multi, true),
      floor_coordinate_and_element_identity: statusFor(issues, coordinateCodes, multi, true),
      room_identity_and_geometry: statusFor(issues, roomCodes, multi, true),
      vertical_circulation_connections: statusFor(issues, circulationCodes, multi, true),
      measured_stair_headroom: statusFor(issues, headroomCodes, headroomApplicable, headroomComplete),
      continuous_stair_clearance: !multi ? 'not_applicable' : (stairClearance.length===0 ? 'not_checked' : (stairClearance.some(x=>x.status==='failed') ? 'failed' : (stairClearance.every(x=>x.status==='passed') ? 'passed' : 'not_checked'))),
      escape_route_graph: egressTopologyStatus,
      egress_regulatory_screening: egressRegulatoryStatus,
      vertical_core_geometry: coreStatuses.geometry,
      vertical_core_regulatory: coreStatuses.regulatory,
      vertical_core_circulation_connectivity: coreCirculationStatus
    };
    return makeResult(issues, statuses, stairClearance, releaseBlockers);
  } catch (error) {
    add(issues, 'validator_input_malformed', 'Malformed building data prevented safe validation; no approval can be inferred.', [], String(error?.message || 'unknown validation error'), 'valid structured building geometry');
    return makeResult(issues);
  }
}