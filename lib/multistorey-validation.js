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
const allChecks = ['floor_identity_and_elevations','floor_coordinate_and_element_identity','room_identity_and_geometry','vertical_circulation_connections','measured_stair_headroom','continuous_stair_clearance','escape_route_graph','egress_regulatory_screening'];
function statusFor(issues, codes, applicable = true, evidenceComplete = true) {
  if (!applicable) return 'not_applicable';
  if (issues.some(i => codes.includes(i.code) && i.severity === 'critical')) return 'failed';
  if (!evidenceComplete || issues.some(i => codes.includes(i.code))) return 'not_checked';
  return 'passed';
}
function makeResult(issues, statuses = {}, stairClearance = [], releaseBlockers = []) {
  return {
    issues,
    stairClearance,
    releaseBlockers,
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
    const headroomCodes = ['stair_identity_invalid','stair_identity_duplicate','stair_headroom_unmeasured','stair_headroom_below_threshold','stair_headroom_obstructed','stair_headroom_ruleset_missing','stair_headroom_unprocessed'];
    const egressCodes = ['egress_evidence_missing','egress_structure_invalid','egress_edge_invalid','egress_edge_unverified','egress_exit_invalid','egress_stair_link_missing','egress_unreachable_room'];

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
      for (const finding of clearance.issues) add(issues, finding.code, 'Continuous stair-clearance assessment identified a blocking finding.', [s.id], finding.measuredM ?? null, finding.requiredM ?? finding.geometryDerivedM ?? null);
      const h = s.headroom;
      if (!validHeadroom(h)) {
        add(issues, 'stair_headroom_unmeasured', 'Stair clear headroom lacks complete traceable measurement and obstruction-review evidence.', [s.id], h ?? null, 'valid measured headroom evidence');
      } else {
        headroomProcessed.add(s.id);
        const rules = g.designRuleset;
        if (!objectRecord(rules) || !nonEmpty(rules.id) || !nonEmpty(rules.version) ||
            !finite(rules.minimumStairHeadroomM) || rules.minimumStairHeadroomM <= 0 ||
            !nonEmpty(rules.source) || !nonEmpty(rules.sourceUrl)) {
          add(issues, 'stair_headroom_ruleset_missing', 'Measured headroom exists, but no complete versioned sourced ruleset is configured; threshold compliance remains not checked.', [s.id], h.clearanceM, null, 'warning');
        } else if (h.clearanceM + EPS < rules.minimumStairHeadroomM) {
          add(issues, 'stair_headroom_below_threshold', 'Measured stair headroom is below the configured sourced screening threshold.', [s.id], h.clearanceM, rules.minimumStairHeadroomM);
        }
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

    const statuses = {
      floor_identity_and_elevations: statusFor(issues, floorIdentityCodes, multi, true),
      floor_coordinate_and_element_identity: statusFor(issues, coordinateCodes, multi, true),
      room_identity_and_geometry: statusFor(issues, roomCodes, multi, true),
      vertical_circulation_connections: statusFor(issues, circulationCodes, multi, true),
      measured_stair_headroom: statusFor(issues, headroomCodes, headroomApplicable, headroomComplete),
      continuous_stair_clearance: !multi ? 'not_applicable' : (stairClearance.length===0 ? 'not_checked' : (stairClearance.some(x=>x.status==='failed') ? 'failed' : (stairClearance.every(x=>x.status==='passed') ? 'passed' : 'not_checked'))),
      escape_route_graph: egressTopologyStatus,
      egress_regulatory_screening: egressRegulatoryStatus
    };
    return makeResult(issues, statuses, stairClearance, releaseBlockers);
  } catch (error) {
    add(issues, 'validator_input_malformed', 'Malformed building data prevented safe validation; no approval can be inferred.', [], String(error?.message || 'unknown validation error'), 'valid structured building geometry');
    return makeResult(issues);
  }
}