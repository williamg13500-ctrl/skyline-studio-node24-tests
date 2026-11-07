// Deterministic schematic two-storey generator. No API route imports this module.
import { validateMultiStorey } from './multistorey-validation.js';
export const TWO_STOREY_GENERATOR_FEATURE_FLAG = Object.freeze({ enabled: false });
const finite = v => typeof v === 'number' && Number.isFinite(v);
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
function validateInput(input) {
  if (!record(input)) throw new TypeError('input must be an object');
  if (input.floorCount !== 2) throw new RangeError('only exactly two floors are supported');
  const f=input.footprint;
  if (!record(f)||!finite(f.widthM)||!finite(f.depthM)||f.widthM<=0||f.depthM<=0) throw new RangeError('footprint widthM and depthM must be finite positive metres');
  if (!finite(input.floorToFloorHeightM)||input.floorToFloorHeightM<=0) throw new RangeError('floorToFloorHeightM must be a finite positive metre value');
  if (typeof input.useType!=='string'||!input.useType.trim()) throw new TypeError('useType must be a non-empty string');
  const c=input.corePosition;
  if (!record(c)||!['xM','yM','widthM','depthM'].every(k=>finite(c[k]))||c.widthM<=0||c.depthM<=0||c.xM<0||c.yM<0||c.xM+c.widthM>f.widthM||c.yM+c.depthM>f.depthM) throw new RangeError('corePosition must define a positive stair footprint inside the building footprint');
}
export function generateTwoStoreyBuilding(input, options={}) {
  if ((options.enabled ?? TWO_STOREY_GENERATOR_FEATURE_FLAG.enabled)!==true) return {generated:false,reason:'feature_flag_off'};
  validateInput(input);
  const {widthM:width,depthM:depth}=input.footprint, height=input.floorToFloorHeightM, c=input.corePosition;
  const frameId='building-frame-1', floorIds=['ground-floor','first-floor'];
  const rooms=floorIds.map((id,i)=>({id:`room-${i+1}-circulation`,name:i?'First floor circulation':'Ground floor circulation',kind:'Land',spaceUse:'circulation',x:0,y:0,w:width,h:depth,hall:true}));
  const floors=floorIds.map((id,i)=>({id,elevation:i*height,...(i?{floorToFloorHeightM:height}:{}),coordinateFrameId:frameId,footprintRelationship:{type:'same_as_building_footprint'},useType:input.useType,...(i?{void:{x:c.xM,y:c.yM,w:c.widthM,h:c.depthM}}:{}),L:{W:width,D:depth,R:[rooms[i]],S:[],O:[],E:[]}}));
  const stair={id:'stair-ground-to-first',from:floorIds[0],to:floorIds[1],fromRoomId:rooms[0].id,toRoomId:rooms[1].id,x:c.xM,y:c.yM,w:c.widthM,h:c.depthM,rise:height};
  const verticalCore={id:'vertical-core-1',kind:'stair',coordinateFrameId:frameId,servedFloorRange:{fromFloorId:floorIds[0],toFloorId:floorIds[1]},floorsServed:[...floorIds],footprints:floorIds.map(floorId=>({floorId,x:c.xM,y:c.yM,w:c.widthM,h:c.depthM,coordinateFrameId:frameId})),circulationConnections:floorIds.map((floorId,i)=>({floorId,roomId:rooms[i].id}))};
  const building={units:'m',coordinateFrameId:frameId,height,footprint:{widthM:width,depthM:depth},useType:input.useType,floors,stairs:[stair],verticalCores:[verticalCore]};
  return {generated:true,building,validation:validateMultiStorey(building)};
}
