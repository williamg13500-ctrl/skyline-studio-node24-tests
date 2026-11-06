// Stage 2B: continuous, geometry-derived stair headroom assessment.
// All geometry is in metres. No fixed sampling, inferred tolerance or inferred code threshold is used.
const EPS = 1e-9;
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const point3 = p => record(p) && finite(p.x) && finite(p.y) && finite(p.z);
const point2 = p => record(p) && finite(p.x) && finite(p.y);
const same2 = (a,b) => Math.abs(a.x-b.x)<=EPS && Math.abs(a.y-b.y)<=EPS;
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const cleanPolygon = poly => {
 const out=[];
 for(const p of poly) if(!out.length || !same2(out[out.length-1],p)) out.push({x:p.x,y:p.y});
 if(out.length>1 && same2(out[0],out[out.length-1])) out.pop();
 return out;
};
function signedArea(poly){let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p.x*q.y-q.x*p.y;}return a/2;}
function convex(poly){
 if(!Array.isArray(poly)||poly.length<3||!poly.every(point2))return false;
 let sign=0;
 for(let i=0;i<poly.length;i++){const c=cross(poly[i],poly[(i+1)%poly.length],poly[(i+2)%poly.length]);if(Math.abs(c)>EPS){const s=Math.sign(c);if(sign&&s!==sign)return false;sign=s;}}
 return sign!==0 && Math.abs(signedArea(poly))>EPS;
}
function inside(p,a,b,orientation){return orientation*cross(a,b,p)>=-EPS;}
function lineIntersection(s,e,a,b){
 const dx=e.x-s.x,dy=e.y-s.y, ex=b.x-a.x,ey=b.y-a.y;
 const den=dx*ey-dy*ex;
 if(Math.abs(den)<=EPS)return {x:e.x,y:e.y};
 const t=((a.x-s.x)*ey-(a.y-s.y)*ex)/den;
 return {x:s.x+t*dx,y:s.y+t*dy};
}
function intersectConvex(subject,clip){
 if(subject.length<3||clip.length<3)return [];
 let out=subject.map(p=>({x:p.x,y:p.y}));
 const orientation=Math.sign(signedArea(clip));
 for(let i=0;i<clip.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],input=out;out=[];
  if(!input.length)break;
  let s=input[input.length-1];
  for(const e of input){
   const ei=inside(e,a,b,orientation),si=inside(s,a,b,orientation);
   if(ei){if(!si)out.push(lineIntersection(s,e,a,b));out.push(e);}
   else if(si)out.push(lineIntersection(s,e,a,b));
   s=e;
  }
  out=cleanPolygon(out);
 }
 return out;
}
function pathPlane(a,b){
 const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
 if(l2<=EPS)return null;
 const dz=b.z-a.z,aa=dz*dx/l2,bb=dz*dy/l2;
 return {a:aa,b:bb,c:a.z-aa*a.x-bb*a.y};
}
const zAt=(plane,p)=>plane.a*p.x+plane.b*p.y+plane.c;
function corridor(a,b,width){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 if(len<=EPS)return null;
 const ox=-dy/len*width/2,oy=dx/len*width/2;
 return cleanPolygon([{x:a.x+ox,y:a.y+oy},{x:b.x+ox,y:b.y+oy},{x:b.x-ox,y:b.y-oy},{x:a.x-ox,y:a.y-oy}]);
}
function pathSegments(stair){
 const parts=new Map((Array.isArray(stair.geometryParts)?stair.geometryParts:[]).filter(record).map(p=>[p.id,p]));
 const seq=stair.path?.sequence;
 if(!Array.isArray(seq)||!seq.length)return {error:'path_sequence_missing'};
 const result=[];
 for(const ref of seq){
  if(!record(ref)||typeof ref.geometryRef!=='string')return {error:'path_reference_invalid'};
  const part=parts.get(ref.geometryRef);
  if(!part||!record(part.clearancePath))return {error:'path_geometry_missing'};
  const cp=part.clearancePath, pts=cp.centerline3d;
  if(!Array.isArray(pts)||pts.length!==2||!pts.every(point3)||!finite(cp.widthM)||cp.widthM<=0)return {error:'path_geometry_invalid'};
  if(!['approach','flight','transition','landing','opening_edge'].includes(part.kind))return {error:'path_segment_kind_invalid'};
  if(typeof part.floorId!=='string'||!part.floorId)return {error:'path_floor_missing'};
  const polygon=corridor(pts[0],pts[1],cp.widthM),plane=pathPlane(pts[0],pts[1]);
  if(!polygon||!plane)return {error:'path_segment_degenerate'};
  result.push({id:part.id,kind:part.kind,floorId:part.floorId,polygon,plane,start:pts[0],end:pts[1]});
 }
 for(let i=1;i<result.length;i++){
  const p=result[i-1].end,q=result[i].start;
  if(Math.abs(p.x-q.x)>EPS||Math.abs(p.y-q.y)>EPS||Math.abs(p.z-q.z)>EPS)return {error:'path_sequence_disconnected'};
 }
 const refs=new Set(seq.map(x=>x?.geometryRef));
 for(const key of ['flights','landings']){
  if(!Array.isArray(stair.path[key])||!stair.path[key].length)return {error:'path_flights_or_landings_missing'};
  for(const r of stair.path[key])if(!refs.has(r?.geometryRef))return {error:'path_sequence_omits_flight_or_landing'};
 }
 return {segments:result};
}
function boxFootprint(g){return [{x:g.min.x,y:g.min.y},{x:g.max.x,y:g.min.y},{x:g.max.x,y:g.max.y},{x:g.min.x,y:g.max.y}];}
function clipSegment(a,b,poly){
 const orient=Math.sign(signedArea(poly));let lo=0,hi=1;
 const dx=b.x-a.x,dy=b.y-a.y;
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length];
  const c0=orient*cross(p,q,a), cd=orient*((q.x-p.x)*dy-(q.y-p.y)*dx);
  if(Math.abs(cd)<=EPS){if(c0 < -EPS)return null;continue;}
  const t=(-EPS-c0)/cd;
  if(cd>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
  if(lo>hi+EPS)return null;
 }
 return [Math.max(0,lo),Math.min(1,hi)];
}
function evaluateObstruction(element,segment){
 const g=element.geometry;
 if(element.type==='beam'||element.type==='soffit'||element.type==='ceiling_drop'){
  let footprint, underside;
  if(g?.type==='box3d'&&point3(g.min)&&point3(g.max)){
   footprint=boxFootprint(g);underside=()=>g.min.z;
  }else if(g?.type==='plane3d'&&finite(g.a)&&finite(g.b)&&finite(g.c)&&convex(g.footprint)){
   footprint=g.footprint;underside=p=>g.a*p.x+g.b*p.y+g.c;
  }else return {invalid:true};
  const overlap=intersectConvex(segment.polygon,footprint);
  if(!overlap.length)return null;
  let minimum=Infinity,at=null;
  for(const p of overlap){const gap=underside(p)-zAt(segment.plane,p);if(gap<minimum){minimum=gap;at=p;}}
  return {elementId:element.id,minimumClearanceM:minimum,at,segmentId:segment.id};
 }
 if(element.type==='stair_opening_edge'&&g?.type==='polyline3d'&&Array.isArray(g.points)&&g.points.length>=2){
  let best=null;
  for(let i=1;i<g.points.length;i++){
   const a=g.points[i-1],b=g.points[i];
   if(!point3(a)||!point3(b))return {invalid:true};
   const sameXY=Math.hypot(b.x-a.x,b.y-a.y)<=EPS;
   let samples;
   if(sameXY){
    const p={x:a.x,y:a.y};
    if(intersectConvex(segment.polygon,[p,{x:p.x+EPS,y:p.y},{x:p.x,y:p.y+EPS}]).length===0 &&
       !pointInConvex(p,segment.polygon))continue;
    samples=[a,b];
   }else{
    const clipped=clipSegment(a,b,segment.polygon);if(!clipped)continue;
    samples=[{x:a.x+(b.x-a.x)*clipped[0],y:a.y+(b.y-a.y)*clipped[0],z:a.z+(b.z-a.z)*clipped[0]},
             {x:a.x+(b.x-a.x)*clipped[1],y:a.y+(b.y-a.y)*clipped[1],z:a.z+(b.z-a.z)*clipped[1]}];
   }
   for(const p of samples){const gap=p.z-zAt(segment.plane,p);if(!best||gap<best.minimumClearanceM)best={elementId:element.id,minimumClearanceM:gap,at:{x:p.x,y:p.y},segmentId:segment.id};}
  }
  return best;
 }
 return {invalid:true};
}
function pointInConvex(p,poly){const o=Math.sign(signedArea(poly));for(let i=0;i<poly.length;i++)if(o*cross(poly[i],poly[(i+1)%poly.length],p)<-EPS)return false;return true;}
export function assessStairClearance(building,stair){
 const blockers=[],issues=[],addBlocker=(code,message)=>{blockers.push({code,message});};
 const result={stairId:stair?.id||null,status:'not_checked',geometryDerivedClearanceM:null,measuredClearanceM:null,measurementStatus:'missing',disagreementM:null,toleranceM:null,obstructionIds:[],minimumAt:null,releaseBlockers:blockers,issues};
 if(!record(building)||!record(stair)){addBlocker('clearance_input_missing','Building or stair geometry is missing.');return result;}
 const revision=building.geometryRevision;
 const review=building.overheadGeometryReview;
 if(!Array.isArray(building.overheadElements)||!building.overheadElements.length||
    !record(review)||review.status!=='complete'||!review.reviewId||
    !revision||review.geometryRevision!==revision){
  addBlocker('overhead_geometry_not_complete','Complete overhead geometry tied to the current geometry revision is required.');
  return result;
 }
 const path=pathSegments(stair);
 if(path.error){addBlocker(path.error,'A complete, connected 3D clearance path for approaches, flights, transitions, landings and opening edge is required.');return result;}
 const elements=building.overheadElements;
 const candidates=[];
 for(const segment of path.segments){
  for(const element of elements){
   if(!record(element)||element.floorId!==segment.floorId)continue;
   const hit=evaluateObstruction(element,segment);
   if(hit?.invalid){addBlocker('overhead_geometry_invalid','An overhead element has unsupported or malformed geometry.');continue;}
   if(hit)candidates.push(hit);
  }
 }
 if(!candidates.length){addBlocker('no_overhead_intersection','No represented overhead surface or opening edge intersects the usable path; a finite headroom value cannot be derived.');return result;}
 candidates.sort((a,b)=>a.minimumClearanceM-b.minimumClearanceM);
 result.geometryDerivedClearanceM=candidates[0].minimumClearanceM;
 result.minimumAt={elementId:candidates[0].elementId,segmentId:candidates[0].segmentId,point:candidates[0].at};
 result.obstructionIds=[...new Set(candidates.map(c=>c.elementId))];
 const measurement=stair.headroom;
 if(!record(measurement)||!finite(measurement.clearanceM)||!measurement.measurementId||
    !measurement.method||!Array.isArray(measurement.measurementPoints)||measurement.measurementPoints.length<2){
  addBlocker('measured_clearance_missing','A separate traceable measured-clearance record is required.');
 }else{
  result.measuredClearanceM=measurement.clearanceM;
  if(measurement.geometryRevision!==revision){
   result.measurementStatus='stale';
   addBlocker('measurement_stale','The measured clearance references a different geometry revision.');
  }else result.measurementStatus='current';
 }
 if(!finite(building.clearanceMeasurementToleranceM)||building.clearanceMeasurementToleranceM<0){
  addBlocker('measurement_tolerance_missing','An explicit non-negative measurement comparison tolerance is required.');
 }else result.toleranceM=building.clearanceMeasurementToleranceM;
 if(result.measuredClearanceM!==null&&result.geometryDerivedClearanceM!==null&&result.toleranceM!==null){
  result.disagreementM=Math.abs(result.measuredClearanceM-result.geometryDerivedClearanceM);
  if(result.disagreementM>result.toleranceM){
   issues.push({code:'computed_measured_disagreement',measuredM:result.measuredClearanceM,geometryDerivedM:result.geometryDerivedClearanceM,differenceM:result.disagreementM,toleranceM:result.toleranceM});
   addBlocker('computed_measured_disagreement','Measured and geometry-derived clearance disagree beyond the declared tolerance.');
  }
 }
 const rules=building.designRuleset;
 if(!record(rules)||!rules.id||!rules.version||!finite(rules.minimumStairHeadroomM)||rules.minimumStairHeadroomM<=0||!rules.source||!rules.sourceUrl){
  addBlocker('sourced_ruleset_missing','A versioned, sourced headroom ruleset is required before threshold screening can pass.');
 }else if(result.geometryDerivedClearanceM+EPS<rules.minimumStairHeadroomM){
  issues.push({code:'below_sourced_threshold',measuredM:result.geometryDerivedClearanceM,requiredM:rules.minimumStairHeadroomM,rulesetId:rules.id});
  addBlocker('below_sourced_threshold','Geometry-derived clearance is below the explicitly configured sourced threshold.');
 }
 if(candidates.some(c=>c.minimumClearanceM<=0))addBlocker('path_obstruction_intersection','An overhead element intersects or penetrates the walking surface.');
 if(blockers.length===0)result.status='passed';
 else result.status=issues.length?'failed':'not_checked';
 return result;
}
