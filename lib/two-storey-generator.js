// Deterministic test-only residential two-storey room-layout generator.
// All layout dimensions below are explicit schematic placeholders, not code requirements.
import { validateMultiStorey } from './multistorey-validation.js';
export const TWO_STOREY_GENERATOR_FEATURE_FLAG = Object.freeze({ enabled: false });
export const TWO_STOREY_PLACEHOLDER_ROOM_PROGRAM = Object.freeze({
  label: 'PLACEHOLDER, not a code requirement',
  floors: {
    'ground-floor': [
      { name: 'Living room', minimumAreaM2: 18 },
      { name: 'Kitchen', minimumAreaM2: 9 },
      { name: 'Dining room', minimumAreaM2: 8 },
      { name: 'Bathroom', minimumAreaM2: 4 }
    ],
    'first-floor': [
      { name: 'Bedroom 1', minimumAreaM2: 12 },
      { name: 'Bedroom 2', minimumAreaM2: 12 },
      { name: 'Bathroom', minimumAreaM2: 4 },
      { name: 'Family lounge', minimumAreaM2: 8 }
    ]
  }
});
const EPS = 1e-8;
const PLACEHOLDER = 'PLACEHOLDER, not a code requirement';
const HALL_WIDTH_M = 1.0;
const EXTERIOR_WALL_THICKNESS_M = 0.20;
const INTERIOR_WALL_THICKNESS_M = 0.12;
const DOOR_WIDTH_M = 0.90;
const WINDOW_WIDTH_M = 1.20;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const round = value => Number(value.toFixed(9));

function validateInput(input) {
  if (!record(input)) throw new TypeError('input must be an object');
  if (input.floorCount !== 2) throw new RangeError('only exactly two floors are supported');
  const footprint = input.footprint;
  if (!record(footprint) || !finite(footprint.widthM) || !finite(footprint.depthM) ||
      footprint.widthM <= 0 || footprint.depthM <= 0) {
    throw new RangeError('footprint widthM and depthM must be finite positive metre values');
  }
  if (!finite(input.floorToFloorHeightM) || input.floorToFloorHeightM <= 0) {
    throw new RangeError('floorToFloorHeightM must be finite and positive');
  }
  if (input.useType !== 'residential') {
    throw new RangeError('Phase 5A currently supports residential use only');
  }
  const core = input.corePosition;
  if (!record(core) || !['xM','yM','widthM','depthM'].every(key => finite(core[key])) ||
      core.widthM <= 0 || core.depthM <= 0 || core.xM < 0 || core.yM < 0 ||
      core.xM + core.widthM > footprint.widthM || core.yM + core.depthM > footprint.depthM) {
    throw new RangeError('corePosition must define a positive stair footprint inside the building footprint');
  }
  if (!record(input.roomProgram) || !record(input.roomProgram.floors)) {
    throw new TypeError('roomProgram.floors is required; room areas are never invented by the generator');
  }
}

function normalizeProgram(input) {
  const label = typeof input.roomProgram.label === 'string' && input.roomProgram.label.trim()
    ? input.roomProgram.label.trim()
    : 'User-supplied room program; not a code determination';
  const floors = {};
  for (const floorId of ['ground-floor','first-floor']) {
    const list = input.roomProgram.floors[floorId];
    if (!Array.isArray(list) || list.length === 0) {
      throw new TypeError('roomProgram.floors.' + floorId + ' must be a non-empty array');
    }
    floors[floorId] = list.map((item, index) => {
      if (!record(item) || typeof item.name !== 'string' || !item.name.trim() ||
          !finite(item.minimumAreaM2) || item.minimumAreaM2 <= 0) {
        throw new TypeError('each room requires a name and finite positive minimumAreaM2');
      }
      return {
        index,
        name: item.name.trim(),
        minimumAreaM2: item.minimumAreaM2,
        areaBasis: label
      };
    });
  }
  return { label, floors };
}

// Fit each floor's room program into one or both side bands beside the stair core.
// The 1.0 m circulation strip is a schematic placeholder, not a regulatory width.
function allocateRooms(program, input) {
  const core = input.corePosition;
  const width = input.footprint.widthM;
  const depth = input.footprint.depthM;
  const candidates = [
    {
      side: 'right',
      roomX: core.xM + core.widthM + HALL_WIDTH_M,
      roomWidth: width - (core.xM + core.widthM + HALL_WIDTH_M),
      hallX: core.xM + core.widthM
    },
    {
      side: 'left',
      roomX: 0,
      roomWidth: core.xM - HALL_WIDTH_M,
      hallX: core.xM - HALL_WIDTH_M
    }
  ].filter(bin => bin.roomWidth > EPS);
  const bins = candidates.map(bin => ({ ...bin, remainingArea: bin.roomWidth * depth, rooms: [] }));
  const ordered = [...program].sort((a,b) => b.minimumAreaM2 - a.minimumAreaM2 || a.index - b.index);
  for (const item of ordered) {
    const choices = bins.filter(bin => bin.remainingArea + EPS >= item.minimumAreaM2)
      .sort((a,b) => b.remainingArea - a.remainingArea || a.side.localeCompare(b.side));
    if (!choices.length) {
      const available = bins.reduce((sum, bin) => sum + bin.remainingArea, 0);
      throw new RangeError('room program does not fit the available footprint around the stair core (required ' +
        round(ordered.reduce((sum, room) => sum + room.minimumAreaM2, 0)) +
        ' m²; available schematic room area ' + round(available) +
        ' m²); no room was reduced');
    }
    choices[0].rooms.push(item);
    choices[0].remainingArea -= item.minimumAreaM2;
  }
  for (const bin of bins) {
    if (!bin.rooms.length) continue;
    bin.rooms.sort((a,b) => a.index - b.index);
    let y = 0;
    bin.placed = bin.rooms.map((item,index) => {
      const isLast = index === bin.rooms.length - 1;
      const height = isLast ? depth - y : item.minimumAreaM2 / bin.roomWidth;
      if (!finite(height) || height <= EPS) {
        throw new RangeError('room program cannot be placed without reducing a room; no room was reduced');
      }
      const placed = {
        id: null,
        name: item.name,
        kind: 'Land',
        spaceUse: 'habitable',
        x: round(bin.roomX),
        y: round(y),
        w: round(bin.roomWidth),
        h: round(height),
        minimumAreaM2: item.minimumAreaM2,
        areaBasis: item.areaBasis,
        programIndex: item.index,
        side: bin.side
      };
      y += height;
      return placed;
    });
  }
  return bins.filter(bin => bin.rooms.length);
}

function room(id, name, rect, spaceUse, extra = {}) {
  return {
    id, name, kind: 'Land', spaceUse,
    x: round(rect.x), y: round(rect.y), w: round(rect.w), h: round(rect.h),
    ...extra
  };
}
function wall(id, x1, y1, x2, y2, exterior = false) {
  return [
    round(x1), round(y1), round(x2), round(y2), 0, id,
    exterior ? EXTERIOR_WALL_THICKNESS_M : INTERIOR_WALL_THICKNESS_M,
    exterior ? 'exterior-wall-placeholder' : 'interior-wall-placeholder',
    PLACEHOLDER
  ];
}
function opening(id, type, wallId, roomId, connectedRoomIds, a, b, extra = {}) {
  return {
    id, t: type, wallId, roomId, connectedRoomIds,
    a: a.map(round), b: b.map(round),
    dimensionBasis: PLACEHOLDER,
    ...extra
  };
}
function doorLength(roomHeight) {
  return Math.min(DOOR_WIDTH_M, roomHeight * 0.6);
}
function windowLength(roomHeight) {
  return Math.min(WINDOW_WIDTH_M, roomHeight * 0.6);
}

function buildFloor(input, floorId, program, elevation) {
  const footprint = input.footprint;
  const corePosition = input.corePosition;
  const bins = allocateRooms(program, input);
  const floorsRooms = [];
  const walls = [];
  const openings = [];
  const corridorRooms = [];
  const coreRoom = room(
    floorId + '-stair-core',
    'Stair core',
    { x: corePosition.xM, y: corePosition.yM, w: corePosition.widthM, h: corePosition.depthM },
    'circulation',
    { coreId: 'vertical-core-1' }
  );
  const addWall = (...args) => walls.push(wall(...args));
  const addDoor = (id, wallId, fromRoom, toRoom, a, b, extra = {}) => {
    openings.push(opening(id, 'door', wallId, fromRoom.id, [toRoom.id], a, b, extra));
  };

  // Exterior envelope: every generated wall has an explicit placeholder thickness.
  addWall(floorId + '-exterior-south', 0, 0, footprint.widthM, 0, true);
  addWall(floorId + '-exterior-east', footprint.widthM, 0, footprint.widthM, footprint.depthM, true);
  addWall(floorId + '-exterior-north', 0, footprint.depthM, footprint.widthM, footprint.depthM, true);
  addWall(floorId + '-exterior-west', 0, 0, 0, footprint.depthM, true);

  const coreDoorCandidates = [];
  for (const bin of bins) {
    const hallId = floorId + '-circulation-' + bin.side;
    const hall = room(
      hallId,
      bin.side === 'right' ? 'Right-side circulation' : 'Left-side circulation',
      { x: bin.hallX, y: 0, w: HALL_WIDTH_M, h: footprint.depthM },
      'circulation',
      { layoutBasis: PLACEHOLDER }
    );
    corridorRooms.push(hall);
    for (const placed of bin.placed) {
      placed.id = floorId + '-room-' + String(placed.programIndex + 1).padStart(2,'0');
      floorsRooms.push(placed);
      const roomInnerX = bin.side === 'right' ? bin.roomX : bin.roomX + bin.roomWidth;
      const wallId = floorId + '-room-hall-wall-' + placed.id;
      addWall(wallId, roomInnerX, placed.y, roomInnerX, placed.y + placed.h);
      const length = doorLength(placed.h);
      const centerY = placed.y + placed.h / 2;
      addDoor(
        'door-' + placed.id,
        wallId,
        placed,
        hall,
        [roomInnerX, centerY - length / 2],
        [roomInnerX, centerY + length / 2]
      );

      const exteriorX = bin.side === 'right' ? footprint.widthM : 0;
      const exteriorWallId = bin.side === 'right'
        ? floorId + '-exterior-east'
        : floorId + '-exterior-west';
      const windowSize = windowLength(placed.h);
      openings.push(opening(
        'window-' + placed.id,
        'win',
        exteriorWallId,
        placed.id,
        [],
        [exteriorX, centerY - windowSize / 2],
        [exteriorX, centerY + windowSize / 2]
      ));
    }
    // Partition between adjacent rooms in the room band.
    for (let index = 1; index < bin.placed.length; index++) {
      const y = bin.placed[index].y;
      addWall(
        floorId + '-room-partition-' + bin.side + '-' + index,
        bin.roomX, y, bin.roomX + bin.roomWidth, y
      );
    }

    // A door connects each circulation strip to the stacked stair core.
    const coreWallId = floorId + '-core-wall-' + bin.side;
    const coreEdgeX = bin.side === 'right'
      ? corePosition.xM + corePosition.widthM
      : corePosition.xM;
    addWall(
      coreWallId,
      coreEdgeX,
      corePosition.yM,
      coreEdgeX,
      corePosition.yM + corePosition.depthM
    );
    const coreDoorSize = Math.min(DOOR_WIDTH_M, corePosition.depthM * 0.6);
    const coreDoorY = corePosition.yM + corePosition.depthM / 2;
    const coreDoorId = 'door-' + hall.id + '-to-core';
    const primaryCoreLink = coreDoorCandidates.length === 0;
    addDoor(
      coreDoorId,
      coreWallId,
      hall,
      coreRoom,
      [coreEdgeX, coreDoorY - coreDoorSize / 2],
      [coreEdgeX, coreDoorY + coreDoorSize / 2],
      primaryCoreLink ? { coreLink: true } : {}
    );
    if (primaryCoreLink) coreDoorCandidates.push({ hall, doorId: coreDoorId });
  }

  floorsRooms.push(...corridorRooms, coreRoom);

  // The graph is constructed from physical door records, never authored independently.
  const edges = [];
  for (const door of openings.filter(item => item.t === 'door')) {
    for (const connectedRoomId of door.connectedRoomIds) {
      const edge = {
        id: 'egress-' + door.id,
        from: door.roomId,
        to: connectedRoomId,
        sourceElementId: door.id
      };
      if (door.coreLink === true) {
        edge.coreId = 'vertical-core-1';
        edge.floorId = floorId;
      }
      edges.push(edge);
    }
  }
  const primaryHall = coreDoorCandidates[0]?.hall;
  if (!primaryHall) throw new RangeError('a circulation door to the stair core could not be generated');

  const floor = {
    id: floorId,
    elevation,
    ...(floorId === 'first-floor' ? { floorToFloorHeightM: input.floorToFloorHeightM } : {}),
    coordinateFrameId: 'building-frame-1',
    footprintRelationship: { type: 'same_as_building_footprint' },
    useType: 'residential',
    ...(floorId === 'first-floor'
      ? { void: { x: corePosition.xM, y: corePosition.yM, w: corePosition.widthM, h: corePosition.depthM } }
      : {}),
    L: {
      W: footprint.widthM,
      D: footprint.depthM,
      R: floorsRooms,
      S: walls,
      O: openings,
      E: []
    }
  };
  return { floor, primaryHall, coreRoom, edges };
}

export function generateTwoStoreyBuilding(input, options = {}) {
  if ((options.enabled ?? TWO_STOREY_GENERATOR_FEATURE_FLAG.enabled) !== true) {
    return { generated: false, reason: 'feature_flag_off' };
  }
  validateInput(input);
  const program = normalizeProgram(input);
  const ground = buildFloor(input, 'ground-floor', program.floors['ground-floor'], 0);
  const first = buildFloor(input, 'first-floor', program.floors['first-floor'], input.floorToFloorHeightM);
  const floorIds = ['ground-floor','first-floor'];
  const core = input.corePosition;
  const building = {
    units: 'm',
    coordinateFrameId: 'building-frame-1',
    height: input.floorToFloorHeightM * 2,
    floorToFloorHeightM: input.floorToFloorHeightM,
    footprint: { ...input.footprint },
    useType: 'residential',
    roomProgram: {
      label: program.label,
      floors: program.floors
    },
    layoutAssumptions: {
      roomAreas: program.label,
      corridorWidth: PLACEHOLDER + ' (' + HALL_WIDTH_M + ' m)',
      exteriorWallThickness: PLACEHOLDER + ' (' + EXTERIOR_WALL_THICKNESS_M + ' m)',
      interiorWallThickness: PLACEHOLDER + ' (' + INTERIOR_WALL_THICKNESS_M + ' m)',
      doorWidth: PLACEHOLDER + ' (maximum ' + DOOR_WIDTH_M + ' m)',
      windowWidth: PLACEHOLDER + ' (maximum ' + WINDOW_WIDTH_M + ' m)'
    },
    floors: [ground.floor, first.floor],
    stairs: [{
      id: 'stair-ground-to-first',
      from: floorIds[0],
      to: floorIds[1],
      fromRoomId: ground.coreRoom.id,
      toRoomId: first.coreRoom.id,
      x: core.xM,
      y: core.yM,
      w: core.widthM,
      h: core.depthM,
      rise: input.floorToFloorHeightM
    }],
    verticalCores: [{
      id: 'vertical-core-1',
      kind: 'stair',
      coordinateFrameId: 'building-frame-1',
      servedFloorRange: { fromFloorId: floorIds[0], toFloorId: floorIds[1] },
      floorsServed: [...floorIds],
      footprints: floorIds.map(floorId => ({
        floorId,
        x: core.xM,
        y: core.yM,
        w: core.widthM,
        h: core.depthM,
        coordinateFrameId: 'building-frame-1'
      })),
      circulationConnections: [
        { floorId: floorIds[0], roomId: ground.primaryHall.id },
        { floorId: floorIds[1], roomId: first.primaryHall.id }
      ]
    }],
    egress: {
      accessMode: 'stair_access_only',
      exits: [],
      edges: [...ground.edges, ...first.edges]
    }
  };
  return { generated: true, building, validation: validateMultiStorey(building) };
}
