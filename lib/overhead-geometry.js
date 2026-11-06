// Stage 2A: structural data contract only. This module does not calculate clearance or code compliance.
export const OVERHEAD_ELEMENT_TYPES = Object.freeze(['beam','soffit','ceiling_drop','stair_opening_edge']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const finitePoint = p => record(p) && ['x','y','z'].every(k => Number.isFinite(p[k]));
const samePoint = (a,b) => a.x===b.x && a.y===b.y && a.z===b.z;
function validateBox3d(g){return record(g)&&g.type==='box3d'&&finitePoint(g.min)&&finitePoint(g.max)&&['x','y','z'].every(k=>g.max[k]>g.min[k]);}
function validatePlane3d(g){return record(g)&&g.type==='plane3d'&&['a','b','c'].every(k=>Number.isFinite(g[k]))&&Array.isArray(g.footprint)&&g.footprint.length>=3&&g.footprint.every(p=>record(p)&&Number.isFinite(p.x)&&Number.isFinite(p.y));}
function validatePolyline3d(g){return record(g)&&g.type==='polyline3d'&&Array.isArray(g.points)&&g.points.length>=2&&g.points.every(finitePoint)&&g.points.some((p,i)=>i>0&&!samePoint(p,g.points[i-1]));}
function issue(code,elementId,message){return {code,elementId:elementId||null,message};}
export function inspectOverheadGeometry(building){
 if(!record(building))return {status:'invalid',issues:[issue('building_invalid',null,'Building geometry must be an object.')],elements:[],stairs:[]};
 const hasOverhead=Object.prototype.hasOwnProperty.call(building,'overheadElements');
 const hasStairPath=Array.isArray(building.stairs)&&building.stairs.some(s=>record(s)&&record(s.path));
 if(!hasOverhead&&!hasStairPath)return {status:'not_checked',issues:[],elements:[],stairs:[]};
 const issues=[],floors=new Map((Array.isArray(building.floors)?building.floors:[]).filter(f=>record(f)&&nonEmpty(f.id)).map(f=>[f.id,f]));
 const frames=new Map();
 for(const f of Array.isArray(building.coordinateFrames)?building.coordinateFrames:[])if(record(f)&&nonEmpty(f.id)&&!frames.has(f.id))frames.set(f.id,f);
 for(const f of floors.values())if(nonEmpty(f.coordinateFrameId)&&!frames.has(f.coordinateFrameId))frames.set(f.coordinateFrameId,{id:f.coordinateFrameId,floorId:f.id,units:f.units});
 const elements=Array.isArray(building.overheadElements)?building.overheadElements:[];
 if(hasOverhead&&!Array.isArray(building.overheadElements))issues.push(issue('overhead_elements_invalid',null,'overheadElements must be an array when supplied.'));
 const elementIds=new Set();
 for(const e of elements){
  if(!record(e)){issues.push(issue('element_invalid',null,'Every overhead element must be an object.'));continue;}
  if(!nonEmpty(e.id))issues.push(issue('element_id_missing',null,'Every overhead element requires a non-empty ID.'));
  else if(elementIds.has(e.id))issues.push(issue('element_id_duplicate',e.id,'Overhead element IDs must be unique.'));
  else elementIds.add(e.id);
  if(!OVERHEAD_ELEMENT_TYPES.includes(e.type)){issues.push(issue('element_type_invalid',e.id,'Overhead element type is not supported.'));continue;}
  if(!nonEmpty(e.floorId)||!floors.has(e.floorId))issues.push(issue('floor_reference_invalid',e.id,'floorId must resolve to a floor in this project.'));
  const frame=frames.get(e.coordinateFrameId);
  if(!nonEmpty(e.coordinateFrameId)||!frame||frame.floorId!==e.floorId||frame.units!=='m')issues.push(issue('coordinate_frame_mismatch',e.id,'coordinateFrameId must resolve to a metre-based coordinate frame declared for the same floor.'));
  if(e.units!=='m')issues.push(issue('units_invalid',e.id,'Overhead geometry units must be metres (m).'));
  const geometryOk=e.type==='stair_opening_edge'?validatePolyline3d(e.geometry):(e.type==='soffit'&&e.geometry?.type==='plane3d'?validatePlane3d(e.geometry):validateBox3d(e.geometry));
  if(!geometryOk)issues.push(issue('geometry_3d_invalid',e.id,e.type==='stair_opening_edge'?'stair_opening_edge requires a finite 3D polyline with at least two distinct consecutive points.':'This element requires a finite, positive-volume 3D box.'));
  const src=e.source;if(!record(src)||!nonEmpty(src.kind)||!nonEmpty(src.referenceId)||!nonEmpty(src.revision))issues.push(issue('source_record_invalid',e.id,'Every overhead element requires source.kind, source.referenceId and source.revision.'));
 }
 const stairIds=new Set();
 for(const s of Array.isArray(building.stairs)?building.stairs:[]){
  if(!record(s)||!record(s.path))continue;
  if(!nonEmpty(s.id)){issues.push(issue('stair_id_missing',null,'A stair with an explicit path requires an ID.'));continue;}
  if(stairIds.has(s.id))issues.push(issue('stair_id_duplicate',s.id,'Stair IDs must be unique.'));stairIds.add(s.id);
  if(!floors.has(s.from)||!floors.has(s.to)||s.from===s.to)issues.push(issue('stair_floor_reference_invalid',s.id,'A stair path must connect two distinct existing floors.'));
  const parts=Array.isArray(s.geometryParts)?s.geometryParts:[],byId=new Map();
  for(const p of parts){
   if(!record(p)||!nonEmpty(p.id)||byId.has(p.id)){issues.push(issue('stair_geometry_part_invalid',s.id,'Stair geometry parts require unique non-empty IDs.'));continue;}
   byId.set(p.id,p);
   if(!['flight','landing','transition','approach','opening_edge'].includes(p.kind)||!validateBox3d(p.geometry))issues.push(issue('stair_geometry_part_invalid',p.id,'A stair geometry part must be a flight or landing with valid 3D box geometry.'));
   const frame=frames.get(p.coordinateFrameId);
   if(!nonEmpty(p.floorId)||![s.from,s.to].includes(p.floorId)||!floors.has(p.floorId)||!nonEmpty(p.coordinateFrameId)||!frame||frame.floorId!==p.floorId||frame.units!=='m'||p.units!=='m')issues.push(issue('stair_geometry_frame_invalid',p.id,'Stair geometry parts require an endpoint floor, matching metre-based coordinate frame and metre units.'));
  }
  if(!Array.isArray(s.path.sequence)||!s.path.sequence.length)issues.push(issue('stair_path_sequence_missing',s.id,'Stage 2B requires an ordered path.sequence covering every usable segment.'));
  for(const key of ['flights','landings']){
   const expected=key==='flights'?'flight':'landing',refs=s.path[key];
   if(!Array.isArray(refs)||!refs.length){issues.push(issue('stair_path_incomplete',s.id,'An explicit stair path requires at least one flight and one landing.'));continue;}
   const seen=new Set();
   for(const ref of refs){
    if(!record(ref)||!nonEmpty(ref.id)||!nonEmpty(ref.geometryRef)){issues.push(issue('stair_path_reference_missing',s.id,'Every stair path segment requires its own ID and a geometryRef.'));continue;}
    if(seen.has(ref.geometryRef))issues.push(issue('stair_path_reference_duplicate',ref.geometryRef,'A geometry part may appear only once in each stair path segment list.'));
    seen.add(ref.geometryRef);const part=byId.get(ref.geometryRef);
    if(!part||part.kind!==expected)issues.push(issue('stair_path_reference_unresolved',ref.geometryRef,'Stair path geometryRef must resolve to a real geometry part of the matching kind.'));
   }
  }
 }
 if(!elements.length||!hasStairPath)return {status:issues.length?'invalid':'not_checked',issues,elements:elements.length,stairs:(building.stairs||[]).length};
 return {status:issues.length?'invalid':'model_valid',issues,elements:elements.length,stairs:(building.stairs||[]).filter(s=>record(s)&&record(s.path)).length};
}
