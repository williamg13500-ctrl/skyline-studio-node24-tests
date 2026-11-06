// Skyline Site Intelligence — evidence-first site context foundation.
// This module does not generate or alter building geometry and does not certify compliance.
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clampText = (v, max=240) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const SOURCES = new Set(['owner_input','survey','title_plan','authority_record','professional_observation','map_reference','unknown']);
const STATUSES = new Set(['provided','verified','estimated','unknown','conflicting']);
export class SiteInputError extends Error {
  constructor(field, message) { super(message); this.name='SiteInputError'; this.field=field; this.status=400; }
}
function point(p, field) {
  if (!p || !finite(p.x) || !finite(p.y) || Math.abs(p.x)>100000 || Math.abs(p.y)>100000) throw new SiteInputError(field,'Each site point needs finite local x/y coordinates in metres within the supported range.');
  return {x:Number(p.x),y:Number(p.y)};
}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)-1e-8&&p.x<=Math.max(a.x,b.x)+1e-8&&p.y>=Math.min(a.y,b.y)-1e-8&&p.y<=Math.max(a.y,b.y)+1e-8;}
function intersects(a,b,c,d){
 const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
 if(((x1>0&&x2<0)||(x1<0&&x2>0))&&((x3>0&&x4<0)||(x3<0&&x4>0)))return true;
 return (Math.abs(x1)<1e-8&&onSegment(a,b,c))||(Math.abs(x2)<1e-8&&onSegment(a,b,d))||(Math.abs(x3)<1e-8&&onSegment(c,d,a))||(Math.abs(x4)<1e-8&&onSegment(c,d,b));
}
function polygonMetrics(vertices){
 let twice=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];twice+=a.x*b.y-b.x*a.y;minX=Math.min(minX,a.x);minY=Math.min(minY,a.y);maxX=Math.max(maxX,a.x);maxY=Math.max(maxY,a.y);}
 return {areaM2:Math.abs(twice)/2,bounds:{minX,minY,maxX,maxY,widthM:maxX-minX,depthM:maxY-minY},winding:twice>=0?'counterclockwise':'clockwise'};
}
function evidence(input, field){
 if(input===undefined||input===null)return {status:'unknown',source:'unknown',note:'Not supplied'};
 if(typeof input!=='object'||Array.isArray(input))throw new SiteInputError(field,'Evidence must be an object with a value, source and status.');
 if(input.source!==undefined&&!SOURCES.has(input.source))throw new SiteInputError(field+'.source','Unsupported evidence source. Choose a supported source or unknown.');
 if(input.status!==undefined&&!STATUSES.has(input.status))throw new SiteInputError(field+'.status','Unsupported evidence status. Choose a supported status.');
 const source=input.source??'unknown',status=input.status??'unknown';
 return {status,source,reference:clampText(input.reference,160),observedAt:clampText(input.observedAt,40),note:clampText(input.note,240)};
}
export function normalizeSiteContext(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SiteInputError('siteContext','Site context must be an object.');
 const boundaryRaw=raw.boundary;
 let boundary=null;
 if(boundaryRaw!==undefined&&boundaryRaw!==null){
  if(!Array.isArray(boundaryRaw.vertices)||boundaryRaw.vertices.length<3||boundaryRaw.vertices.length>200)throw new SiteInputError('boundary','A site boundary needs 3–200 surveyed or owner-supplied vertices.');
  const vertices=boundaryRaw.vertices.map((p,i)=>point(p,'boundary.vertices.'+i));
  for(let i=0;i<vertices.length;i++){
   const a=vertices[i],b=vertices[(i+1)%vertices.length],c=vertices[(i+2)%vertices.length];
   const dx1=b.x-a.x,dy1=b.y-a.y,dx2=c.x-b.x,dy2=c.y-b.y;
   if(Math.hypot(dx1,dy1)<1e-6)throw new SiteInputError('boundary.vertices.'+((i+1)%vertices.length),'Boundary contains a zero-length edge or repeated adjacent point.');
   if(Math.abs(cross(a,b,c))<1e-8&&dx1*dx2+dy1*dy2< -1e-8)throw new SiteInputError('boundary.vertices.'+((i+1)%vertices.length),'Adjacent boundary edges overlap by reversing direction. Remove the backtracking point.');
  }
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++){
   if(j===i||j===(i+1)%vertices.length||i===(j+1)%vertices.length)continue;
   if(intersects(vertices[i],vertices[(i+1)%vertices.length],vertices[j],vertices[(j+1)%vertices.length]))throw new SiteInputError('boundary','The boundary crosses itself or contains overlapping edges. Correct the boundary before analysis.');
  }
  const metrics=polygonMetrics(vertices);
  if(metrics.areaM2<9||metrics.areaM2>100000000)throw new SiteInputError('boundary','The boundary area must be between 9 m² and 100,000,000 m².');
  boundary={vertices,...metrics,evidence:evidence(boundaryRaw.evidence,'boundary.evidence')};
 }
 const orientation=raw.orientation==null?null:(()=>{
  const bearing=raw.orientation?.northBearingDeg;
  if(!finite(bearing)||bearing<0||bearing>=360)throw new SiteInputError('orientation','North bearing must be from 0° up to but not including 360°.');
  return {northBearingDeg:bearing,evidence:evidence(raw.orientation.evidence,'orientation.evidence')};
 })();
 const slope=raw.slope==null?null:(()=>{
  const percent=raw.slope?.percent;
  if(!finite(percent)||percent<0||percent>100)throw new SiteInputError('slope','Slope must be a percentage from 0 to 100.');
  const direction=raw.slope.direction==null?null:point(raw.slope.direction,'slope.direction');
  return {percent,direction,evidence:evidence(raw.slope.evidence,'slope.evidence')};
 })();
 const access=Array.isArray(raw.access)?raw.access.slice(0,20).map((a,i)=>{
  if(!a||!['road','pedestrian','service','unknown'].includes(a.type))throw new SiteInputError('access.'+i,'Access type must be road, pedestrian, service or unknown.');
  return {type:a.type,point:a.point?point(a.point,'access.'+i+'.point'):null,label:clampText(a.label,80),evidence:evidence(a.evidence,'access.'+i+'.evidence')};
 }):[];
 if(raw.access!==undefined&&!Array.isArray(raw.access))throw new SiteInputError('access','Access must be a list.');
 const constraints=Array.isArray(raw.constraints)?raw.constraints.slice(0,100).map((c,i)=>{
  if(!c||!['setback','easement','watercourse','protected_tree','utility','right_of_way','hazard','other'].includes(c.type))throw new SiteInputError('constraints.'+i,'Unsupported site constraint type.');
  const distance=c.distanceM===undefined?null:c.distanceM;
  if(distance!==null&&(!finite(distance)||distance<0||distance>10000))throw new SiteInputError('constraints.'+i+'.distanceM','Constraint distance must be a non-negative measured value in metres.');
  return {type:c.type,label:clampText(c.label,100),distanceM:distance,side:['north','east','south','west','all','unknown'].includes(c.side)?c.side:'unknown',evidence:evidence(c.evidence,'constraints.'+i+'.evidence')};
 }):[];
 if(raw.constraints!==undefined&&!Array.isArray(raw.constraints))throw new SiteInputError('constraints','Constraints must be a list.');
 const exclusionZones=Array.isArray(raw.exclusionZones)?raw.exclusionZones.slice(0,100).map((z,i)=>{
  if(!z||!['easement','watercourse','protected_tree','utility','right_of_way','hazard','other'].includes(z.type))throw new SiteInputError('exclusionZones.'+i+'.type','Unsupported exclusion-zone type.');
  if(!Array.isArray(z.vertices)||z.vertices.length<3||z.vertices.length>200)throw new SiteInputError('exclusionZones.'+i+'.vertices','An exclusion zone needs 3–200 local-metre vertices.');
  const vertices=z.vertices.map((p,j)=>point(p,'exclusionZones.'+i+'.vertices.'+j));
  for(let j=0;j<vertices.length;j++){
   const a=vertices[j],b=vertices[(j+1)%vertices.length],c=vertices[(j+2)%vertices.length];
   if(Math.hypot(b.x-a.x,b.y-a.y)<1e-6)throw new SiteInputError('exclusionZones.'+i+'.vertices.'+((j+1)%vertices.length),'Exclusion zone contains a zero-length edge or repeated adjacent point.');
   if(Math.abs(cross(a,b,c))<1e-8&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)<-1e-8)throw new SiteInputError('exclusionZones.'+i+'.vertices.'+((j+1)%vertices.length),'Exclusion zone contains a backtracking edge.');
  }
  for(let j=0;j<vertices.length;j++)for(let k=j+1;k<vertices.length;k++){
   if(k===j+1||j===(k+1)%vertices.length)continue;
   if(intersects(vertices[j],vertices[(j+1)%vertices.length],vertices[k],vertices[(k+1)%vertices.length]))throw new SiteInputError('exclusionZones.'+i+'.vertices','Exclusion-zone polygon crosses itself or contains overlapping edges.');
  }
  const metrics=polygonMetrics(vertices);if(metrics.areaM2<=1e-8)throw new SiteInputError('exclusionZones.'+i+'.vertices','Exclusion-zone polygon must enclose a positive area.');
  return {type:z.type,label:clampText(z.label,100),vertices,areaM2:metrics.areaM2,evidence:evidence(z.evidence,'exclusionZones.'+i+'.evidence')};
 }):[];
 if(raw.exclusionZones!==undefined&&!Array.isArray(raw.exclusionZones))throw new SiteInputError('exclusionZones','Exclusion zones must be a list.');
 return {schemaVersion:1,coordinateSystem:'local_site_metres',boundary,orientation,slope,access,constraints,exclusionZones,notes:clampText(raw.notes,1000)};
}
export function analyzeSiteContext(raw){
 const site=normalizeSiteContext(raw),findings=[];
 const add=(code,severity,message,field)=>findings.push({code,severity,message,field});
 if(!site.boundary)add('SITE_BOUNDARY_MISSING','blocking','A site boundary is required before any site-fit analysis.','boundary');
 else if(site.boundary.evidence.status!=='verified'||!['survey','title_plan','professional_observation'].includes(site.boundary.evidence.source))add('SITE_BOUNDARY_UNVERIFIED','warning','Boundary geometry is present but is not verified by an accepted survey or professional source.','boundary');
 if(!site.orientation)add('NORTH_ORIENTATION_MISSING','warning','North orientation is unknown; solar and daylight observations cannot be site-specific.','orientation');
 if(!site.slope)add('TOPOGRAPHY_MISSING','warning','Slope and levels are unknown; drainage, access gradients and cut/fill cannot be assessed.','slope');
 if(!site.access.length)add('SITE_ACCESS_MISSING','warning','No road, pedestrian or service access has been recorded.','access');
 if(!site.constraints.length)add('SITE_CONSTRAINTS_UNCONFIRMED','warning','No setbacks, easements, rights-of-way or hazard constraints have been recorded. This does not mean none exist.','constraints');
 for(const c of site.constraints)if(c.evidence.status!=='verified')add('CONSTRAINT_UNVERIFIED','warning',c.type+' constraint is recorded but not verified.','constraints');
 for(const z of site.exclusionZones)if(z.evidence.status!=='verified'||!['survey','title_plan','authority_record','professional_observation'].includes(z.evidence.source))add('EXCLUSION_ZONE_UNVERIFIED','warning',z.type+' exclusion zone is recorded but is not supported by an accepted verified source. It will not be applied to footprint candidates.','exclusionZones');
 const verifiedBoundary=!!site.boundary&&site.boundary.evidence.status==='verified'&&['survey','title_plan','professional_observation'].includes(site.boundary.evidence.source);
 return {schemaVersion:1,site,summary:{boundaryAreaM2:site.boundary?Number(site.boundary.areaM2.toFixed(2)):null,verifiedBoundary,siteFitReady:false,geometryMayBeGeneratedFromSite:false,regulatoryComplianceVerified:false},findings,decision:'brief_only',disclaimer:'Site context is evidence-led preliminary information. It is not a cadastral survey, topographic survey, planning approval, code determination, geotechnical assessment or professional design review.'};
}