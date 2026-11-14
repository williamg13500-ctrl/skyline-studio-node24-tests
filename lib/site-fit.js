// Preliminary site-fit assessment for the existing single-storey solver output.
// This module never edits geometry and never applies assumed legal setbacks.
import { normalizeSiteContext, analyzeSiteContext } from './site-intelligence.js';

const EPS = 1e-8;
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;}
function intersects(a,b,c,d){
 const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
 if(((x1>EPS&&x2<-EPS)||(x1<-EPS&&x2>EPS))&&((x3>EPS&&x4<-EPS)||(x3<-EPS&&x4>EPS)))return true;
 return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
function inside(p,poly){
 let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if(onSegment(a,b,p))return true;
  if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x))hit=!hit;
 }
 return hit;
}
function distancePointSegment(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
 const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
 return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
}
function distanceSegments(a,b,c,d){
 if(intersects(a,b,c,d))return 0;
 return Math.min(distancePointSegment(a,c,d),distancePointSegment(b,c,d),distancePointSegment(c,a,b),distancePointSegment(d,a,b));
}
function rectangle(x,y,w,h){return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];}
function fits(poly,rect){
 if(!rect.every(p=>inside(p,poly)))return false;
 for(let i=0;i<4;i++){
  const a=rect[i],b=rect[(i+1)%4],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  if(!inside(mid,poly))return false;
  for(let j=0;j<poly.length;j++)if(intersects(a,b,poly[j],poly[(j+1)%poly.length]))return false;
 }
 return true;
}
function clearance(poly,rect){
 let min=Infinity;
 for(let i=0;i<4;i++)for(let j=0;j<poly.length;j++)
  min=Math.min(min,distanceSegments(rect[i],rect[(i+1)%4],poly[j],poly[(j+1)%poly.length]));
 return Number(min.toFixed(3));
}
export function assessSiteFit(siteInput, geometry){
 const analysis=analyzeSiteContext(siteInput),site=normalizeSiteContext(siteInput);
 if(!site.boundary)return {status:'blocked',decision:'boundary_required',candidates:[],findings:analysis.findings,disclaimer:'No footprint placement was tested because a parcel boundary is missing.'};
 if(!geometry||!Array.isArray(geometry.floors)||geometry.floors.length!==1)
  return {status:'blocked',decision:'unsupported_geometry_scope',candidates:[],findings:[{code:'SITE_FIT_SINGLE_STOREY_ONLY',severity:'blocking',message:'Site-fit assessment currently supports one generated ground-floor footprint only.'}],disclaimer:'No building geometry was changed.'};
 const layout=geometry.floors[0]?.L;
 if(!layout||!Number.isFinite(layout.W)||!Number.isFinite(layout.D)||layout.W<=0||layout.D<=0)
  return {status:'blocked',decision:'invalid_geometry',candidates:[],findings:[{code:'SITE_FIT_INVALID_GEOMETRY',severity:'blocking',message:'The generated footprint dimensions are unavailable or invalid.'}],disclaimer:'No building geometry was changed.'};
 const poly=site.boundary.vertices,bb=site.boundary.bounds;
 const exteriorThicknesses=(layout.S||[]).filter(w=>Array.isArray(w)&&w[4]).map(w=>Number(w.thickness)||0.30);
 const exteriorAllowanceM=Math.max(0.30,...exteriorThicknesses);
 const footprintWidthM=layout.W+exteriorAllowanceM,footprintDepthM=layout.D+exteriorAllowanceM;
 const parcelWidth=bb.maxX-bb.minX,parcelDepth=bb.maxY-bb.minY;
 const area=site.boundary.areaM2;
 const step=Math.max(.25,Math.sqrt(Math.max(area,1)/12000));
 const candidates=[];
 let examined=0;
 for(const rotation of [0,90]){
  const w=rotation===0?footprintWidthM:footprintDepthM,h=rotation===0?footprintDepthM:footprintWidthM;
  if(w>parcelWidth+EPS||h>parcelDepth+EPS)continue;
  for(let x=bb.minX;x<=bb.maxX-w+EPS;x+=step){
   for(let y=bb.minY;y<=bb.maxY-h+EPS;y+=step){
    if(++examined>24000)break;
    const rect=rectangle(Number(x.toFixed(4)),Number(y.toFixed(4)),w,h);
    if(fits(poly,rect))candidates.push({origin:{x:rect[0].x,y:rect[0].y},rotationDeg:rotation,widthM:w,depthM:h,minimumParcelEdgeClearanceM:clearance(poly,rect)});
   }
   if(examined>24000)break;
  }
  if(examined>24000)break;
 }
 candidates.sort((a,b)=>b.minimumParcelEdgeClearanceM-a.minimumParcelEdgeClearanceM);
 const findings=[];
 if(analysis.summary.verifiedBoundary!==true)findings.push({code:'SITE_BOUNDARY_NOT_VERIFIED',severity:'warning',message:'Candidate placements use the recorded boundary, which is not independently verified by an accepted survey or professional source.'});
 if(site.constraints.length)findings.push({code:'RECORDED_CONSTRAINTS_NOT_APPLIED',severity:'warning',message:'Recorded setbacks, easements, hazards and other constraints are displayed in the site record but are not applied to this geometric fit search.'});
 else findings.push({code:'SITE_CONSTRAINTS_UNKNOWN',severity:'warning',message:'No constraints were applied. Missing setback, easement, access and hazard data must not be interpreted as zero constraints.'});
 if(site.slope)findings.push({code:'SLOPE_NOT_ENGINEERED',severity:'warning',message:'Recorded slope is not used to calculate grading, foundations, drainage, retaining walls or access gradients.'});
 if(!site.access.length)findings.push({code:'ACCESS_NOT_ASSESSED',severity:'warning',message:'Vehicle, pedestrian and emergency access geometry has not been assessed.'});
 const found=candidates.length>0;
 return {
  status:found?'candidate_found':'no_candidate_found',
  decision:found?'footprint_fits_recorded_boundary_geometry':'no_footprint_candidate_found_in_recorded_boundary',
  geometry:{wallCentrelineWidthM:layout.W,wallCentrelineDepthM:layout.D,exteriorFootprintWidthM:footprintWidthM,exteriorFootprintDepthM:footprintDepthM,exteriorWallAllowanceM:exteriorAllowanceM,storeys:1,revision:geometry.revision||null},
  orientationReference:'Local site x/y axes only; north bearing is not used to infer geographic orientation.',
  parcel:{areaM2:Number(site.boundary.areaM2.toFixed(2)),bounds:site.boundary.bounds,evidence:site.boundary.evidence},
  search:{placementGridStepM:Number(step.toFixed(3)),rotationsTestedDeg:[0,90],placementsExamined:examined,searchLimitReached:examined>24000},
  candidates:candidates.slice(0,5),
  findings,
  geometryChanged:false,
  buildableEnvelopeCalculated:false,
  setbacksApplied:false,
  regulatoryComplianceVerified:false,
  structuralSuitabilityVerified:false,
  professionalApprovalGranted:false,
  disclaimer:'This is a preliminary geometric footprint-fit exploration against the recorded parcel polygon only. It is not a legal buildable envelope, cadastral or topographic verification, planning or zoning assessment, setback/easement/hazard check, access review, geotechnical or structural assessment, or professional approval. A candidate placement is not permission to build.'
 };
}