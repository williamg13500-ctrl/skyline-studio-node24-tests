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
function overlapsPolygon(a,b){
 if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(intersects(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;
 return false;
}
function fits(poly,rect,exclusions=[]){
 if(!rect.every(p=>inside(p,poly)))return false;
 for(let i=0;i<4;i++){
  const a=rect[i],b=rect[(i+1)%4],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  if(!inside(mid,poly))return false;
  for(let j=0;j<poly.length;j++)if(intersects(a,b,poly[j],poly[(j+1)%poly.length]))return false;
 }
 return !exclusions.some(zone=>overlapsPolygon(rect,zone.vertices));
}
function clearance(poly,rect){
 let min=Infinity;
 for(let i=0;i<4;i++)for(let j=0;j<poly.length;j++)
  min=Math.min(min,distanceSegments(rect[i],rect[(i+1)%4],poly[j],poly[(j+1)%poly.length]));
 return Number(min.toFixed(3));
}
function distanceToCandidateRect(point,rect){
 const dx=Math.max(rect.x-point.x,0,point.x-(rect.x+rect.widthM));
 const dy=Math.max(rect.y-point.y,0,point.y-(rect.y+rect.depthM));
 return Number(Math.hypot(dx,dy).toFixed(3));
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
 const acceptedSources=['survey','title_plan','authority_record','professional_observation'];
 const verifiedExclusionZones=site.exclusionZones.filter(z=>z.evidence.status==='verified'&&acceptedSources.includes(z.evidence.source));
 const unverifiedExclusionZones=site.exclusionZones.filter(z=>!verifiedExclusionZones.includes(z));
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
    if(fits(poly,rect,verifiedExclusionZones))candidates.push({origin:{x:rect[0].x,y:rect[0].y},rotationDeg:rotation,widthM:w,depthM:h,minimumParcelEdgeClearanceM:clearance(poly,rect)});
   }
   if(examined>24000)break;
  }
  if(examined>24000)break;
 }
 candidates.sort((a,b)=>b.minimumParcelEdgeClearanceM-a.minimumParcelEdgeClearanceM);
 const findings=[];
 if(analysis.summary.verifiedBoundary!==true)findings.push({code:'SITE_BOUNDARY_NOT_VERIFIED',severity:'warning',message:'Candidate placements use the recorded boundary, which is not independently verified by an accepted survey or professional source.'});
 if(site.constraints.length)findings.push({code:'RECORDED_CONSTRAINTS_NOT_APPLIED',severity:'warning',message:'Recorded side/distance constraints are displayed but are not converted into legal setback bands. No setback distance is inferred or applied.'});
 else findings.push({code:'SITE_CONSTRAINTS_UNKNOWN',severity:'warning',message:'No setbacks, easements, rights-of-way or hazard constraints have been confirmed. Missing data must not be interpreted as zero constraints.'});
 if(verifiedExclusionZones.length)findings.push({code:'VERIFIED_EXCLUSION_ZONES_APPLIED',severity:'info',message:verifiedExclusionZones.length+' verified source-backed exclusion zone(s) were applied as geometric no-build areas in this preliminary footprint search.'});
 if(unverifiedExclusionZones.length)findings.push({code:'EXCLUSION_ZONE_UNVERIFIED_NOT_APPLIED',severity:'warning',message:unverifiedExclusionZones.length+' unverified or unsupported-source exclusion zone(s) were retained in the record but not applied to candidate placement.'});
 if(site.slope)findings.push({code:'SLOPE_NOT_ENGINEERED',severity:'warning',message:'Recorded slope is not used to calculate grading, foundations, drainage, retaining walls or access gradients.'});
 if(!site.access.length)findings.push({code:'ACCESS_NOT_ASSESSED',severity:'warning',message:'Vehicle, pedestrian and emergency access geometry has not been assessed.'});
 const found=candidates.length>0;
 const measuredDimensions={
  localAxisAlignedBounds:{widthM:bb.widthM,depthM:bb.depthM},
  basis:'axis_aligned_bounds_of_recorded_local_boundary_vertices',
  evidence:site.boundary.evidence,
  usedAsSearchPrefilter:true,
  legalOrSurveyCertification:false
 };
 const orientationObservation=site.orientation?{
  northBearingDeg:site.orientation.northBearingDeg,
  evidence:site.orientation.evidence,
  appliedToCandidateRotation:false,
  appliedToSolarOrDaylightAnalysis:false,
  coordinateFrameGeoreferenced:false,
  note:'Recorded as orientation metadata only. Candidate rotation remains relative to local site x/y axes; no geographic or solar inference is made.'
 }:{
  northBearingDeg:null,evidence:null,appliedToCandidateRotation:false,
  appliedToSolarOrDaylightAnalysis:false,coordinateFrameGeoreferenced:false,
  note:'North orientation was not supplied.'
 };
 const candidateSummaries=candidates.slice(0,5).map(candidate=>({
  ...candidate,
  accessObservations:site.access.map(access=>({
   type:access.type,label:access.label,point:access.point,evidence:access.evidence,
   straightLineDistanceToCandidateM:access.point?distanceToCandidateRect(access.point,{
    x:candidate.origin.x,y:candidate.origin.y,widthM:candidate.widthM,depthM:candidate.depthM
   }):null,
   measurementBasis:'straight_line_distance_to_axis_aligned_candidate_footprint',
   usedForFiltering:false,usedForRanking:false,routeFeasibilityAssessed:false
  }))
 }));
 if(site.orientation)findings.push({code:'ORIENTATION_REFERENCE_ONLY',severity:'info',message:'North bearing '+site.orientation.northBearingDeg+'° is retained with its evidence status but is not used to rotate candidates or infer solar/daylight performance.'});
 else findings.push({code:'ORIENTATION_NOT_RECORDED',severity:'warning',message:'No north-bearing observation is available; candidate rotations are local-axis rotations only.'});
 if(site.access.length)findings.push({code:'ACCESS_OBSERVATIONS_ADVISORY_ONLY',severity:'info',message:'Access points are reported as straight-line distances to candidate footprints only. They do not filter or rank candidates and do not establish a usable vehicle, pedestrian or emergency route.'});
 return {
  status:found?'candidate_found':'no_candidate_found',
  decision:found?'footprint_fits_recorded_boundary_geometry':'no_footprint_candidate_found_in_recorded_boundary',
  geometry:{wallCentrelineWidthM:layout.W,wallCentrelineDepthM:layout.D,exteriorFootprintWidthM:footprintWidthM,exteriorFootprintDepthM:footprintDepthM,exteriorWallAllowanceM:exteriorAllowanceM,storeys:1,revision:geometry.revision||null},
  orientationReference:'Local site x/y axes only; north bearing is retained as advisory metadata and is not used to infer geographic orientation.',
  orientationObservation,
  measuredDimensions,
  parcel:{areaM2:Number(site.boundary.areaM2.toFixed(2)),bounds:site.boundary.bounds,evidence:site.boundary.evidence},
  search:{placementGridStepM:Number(step.toFixed(3)),rotationsTestedDeg:[0,90],placementsExamined:examined,searchLimitReached:examined>24000},
  candidates:candidateSummaries,
  findings,
  exclusionZonesApplied:verifiedExclusionZones.length>0,
  verifiedExclusionZonesApplied:verifiedExclusionZones.length,
  unverifiedExclusionZonesNotApplied:unverifiedExclusionZones.length,
  geometryChanged:false,
  buildableEnvelopeCalculated:false,
  setbacksApplied:false,
  regulatoryComplianceVerified:false,
  structuralSuitabilityVerified:false,
  professionalApprovalGranted:false,
  disclaimer:'This is a preliminary geometric footprint-fit exploration against the recorded parcel polygon and only those exclusion-zone polygons supported by accepted verified evidence. Side/distance setbacks are not applied. It is not a legal buildable envelope, cadastral or topographic verification, planning or zoning assessment, complete easement/hazard check, access review, geotechnical or structural assessment, or professional approval. A candidate placement is not permission to build.'
 };
}