import {validateQuality} from './quality-validation.js';
import {targetBounds,clearRect} from './layout-solver.js';
import {validateMultiStorey} from './multistorey-validation.js';
// Deterministic validator. It does not use generation heuristics or AI assertions.
const EPS=1e-6;
const idOf=x=>x.id || (Array.isArray(x)?x[5]:null);
export function pointOnWall(p,w){
 if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))return false;
 const vertical=Math.abs(w[0]-w[2])<EPS;
 return vertical?Math.abs(p[0]-w[0])<EPS && p[1]>=Math.min(w[1],w[3])-EPS && p[1]<=Math.max(w[1],w[3])+EPS:
 Math.abs(p[1]-w[1])<EPS && p[0]>=Math.min(w[0],w[2])-EPS && p[0]<=Math.max(w[0],w[2])+EPS;
}
const contains=(r,p)=>p[0]>r.x-EPS&&p[0]<r.x+r.w+EPS&&p[1]>r.y-EPS&&p[1]<r.y+r.h+EPS;
export function validateGeometry(g){
 const issues=[],checks=[],seen=new Set();
 const issue=(code,severity,message,elementIds=[],measured=null,expected=null)=>issues.push({id:`issue-${issues.length+1}`,code,severity,message,elementIds,measured,expected});
 const id=x=>{const value=idOf(x);if(!value||seen.has(value))issue('element_id','critical','Every element needs a unique identity.',[value].filter(Boolean));seen.add(value);};
 if(g.units!=='m')issue('units','critical','Geometry must use explicit metre units.');
 if(g.floors.length!==1)issue('unsupported_storeys','critical','New multi-storey generation is paused until stair headroom and escape-route checks are verified.');
 const stairs=g.stairs||[];
 if(stairs.length!==g.floors.length-1)issue('stair_count','critical','Each adjacent pair of floors needs a stair connection.');
 for(let k=0;k<g.floors.length-1;k++){
  const a=g.floors[k],b=g.floors[k+1],s=stairs.find(s=>s.from===a.id&&s.to===b.id),q=b.void;
  if(s)id(s);
  if(!s||!q){issue('stair_connection','critical','A vertical connection or upper-floor opening is missing.');continue;}
  if(![s.x,s.y,s.w,s.h,s.rise,s.risers,s.tread,s.flightWidth,s.landing].every(Number.isFinite)||s.x<0||s.y<0||s.x+s.w>a.L.W||s.y+s.h>a.L.D||s.w<2*s.flightWidth||s.h+EPS<8*s.tread+s.landing||s.risers!==18||Math.abs(s.rise-(b.elevation-a.elevation))>EPS||s.rise/s.risers<.1||s.rise/s.risers>.2||s.tread<.25||s.flightWidth<1||s.landing<1)issue('stair_geometry','critical','Stair dimensions or floor elevations are inconsistent with this schematic core.',[s.id]);
  if(['x','y','w','h'].some(key=>Math.abs(s[key]-q[key])>EPS))issue('stair_alignment','critical','Upper floor opening does not align with the stairwell.',[s.id,b.id]);
  for(const f of [a,b])if(!f.L.R.some(r=>['Entry','Land'].includes(r.kind)&&s.x>=r.x&&s.y>=r.y&&s.x+s.w<=r.x+r.w&&s.y+s.h<=r.y+r.h))issue('stair_room','critical','Stairwell lies outside its circulation room.',[s.id,f.id]);
 }
 if(g.floors.length>1)issue('stair_review','warning','Stair core dimensions and alignment checked against studio targets only. Headroom, guards, fire escape, accessibility and engineering require professional review.');
 for(const f of g.floors){
  const {W,D,R,S,O}=f.L;id(f);
  if(![W,D,g.height].every(n=>Number.isFinite(n)&&n>0))issue('extent','critical','The model has invalid dimensions.',[f.id]);
  for(const r of R){id(r);
   if(![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0){issue('room_geometry','critical','Room geometry must be finite and positive.',[r.id]);continue;}
   if(r.x< -EPS||r.y< -EPS||r.x+r.w>W+EPS||r.y+r.h>D+EPS)issue('room_bounds','critical',`${r.name} extends outside the footprint.`,[r.id]);
   if(!r.hall&&!['Entry','Land','Living'].includes(r.kind)&&r.a&&r.w*r.h>r.a*2.5)issue('room_oversized','warning',`${r.name} is more than 2.5 times its target area. The floor program is sparse; consider reducing the footprint or editing the room program.`,[r.id],r.w*r.h,r.a);
   if(!r.hall&&((r.ma&&r.w*r.h<r.ma)||(r.ms&&Math.min(r.w,r.h)<r.ms)))issue('room_size','warning',`${r.name} is below the studio planning target. Enlarge the footprint or reduce the room count.`,[r.id],{area:r.w*r.h,shortSide:Math.min(r.w,r.h)},{area:r.ma,shortSide:r.ms,source:'Studio planning targets, not building regulations'});
   if(!r.hall){const bounds=targetBounds(r.kind),net=clearRect(r,W,D);if(bounds&&net.area<bounds[0]-EPS)issue('room_clear_area','warning',`${r.name} is below the studio target clear area for ${r.kind}.`,[r.id],net.area,{minimumClearArea:bounds[0],source:'Studio planning target, not building regulations'});if(Math.min(net.w,net.h)<1.5-EPS)issue('room_clear_width','warning',`${r.name} has a clear dimension below the studio 1.5 m design-screening threshold.`,[r.id],Math.min(net.w,net.h),1.5);}
  }
  for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){
   const a=R[i],b=R[j],overlap=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),depth=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
   if(overlap>EPS&&depth>EPS)issue('room_overlap','critical',`${a.name} overlaps ${b.name}.`,[a.id,b.id],overlap*depth,0);
  }
  const area=R.reduce((n,r)=>n+r.w*r.h,0);
  if(Math.abs(area-W*D)>EPS)issue('area_coverage','critical','Room zoning does not cover the footprint exactly.',[f.id],area,W*D);
  for(const w of S){id(w);
   if(w[4]&&!((Math.abs(w[0])<EPS&&Math.abs(w[2])<EPS)||(Math.abs(w[0]-W)<EPS&&Math.abs(w[2]-W)<EPS)||(Math.abs(w[1])<EPS&&Math.abs(w[3])<EPS)||(Math.abs(w[1]-D)<EPS&&Math.abs(w[3]-D)<EPS)))issue('wall_exterior_flag','critical','An exterior wall is not on the footprint boundary.',[idOf(w)]);
   if(!w.slice(0,4).every(Number.isFinite)||Math.hypot(w[2]-w[0],w[3]-w[1])<EPS || (Math.abs(w[0]-w[2])>EPS&&Math.abs(w[1]-w[3])>EPS))issue('wall_geometry','critical','Wall must be a finite non-zero axis-aligned segment.',[idOf(w)]);
   if([w[0],w[2]].some(x=>x< -EPS||x>W+EPS)||[w[1],w[3]].some(y=>y< -EPS||y>D+EPS))issue('wall_bounds','critical','Wall extends outside the footprint.',[idOf(w)]);
  }
  // The external wall centreline must cover all four footprint edges exactly once.
  const boundaries=[{axis:0,fixed:0,value:0,length:D},{axis:0,fixed:0,value:W,length:D},{axis:1,fixed:1,value:0,length:W},{axis:1,fixed:1,value:D,length:W}];
  for(const side of boundaries){
   const fixed=side.fixed,axis=1-fixed;
   const spans=S.filter(w=>w[4]&&Math.abs(w[fixed]-side.value)<EPS&&Math.abs(w[fixed+2]-side.value)<EPS).map(w=>[Math.min(w[axis],w[axis+2]),Math.max(w[axis],w[axis+2])]).sort((a,b)=>a[0]-b[0]);
   let cursor=0,valid=true;for(const [a,b]of spans){if(Math.abs(a-cursor)>EPS)valid=false;cursor=b;}
   if(!valid||Math.abs(cursor-side.length)>EPS)issue('envelope','critical','Exterior walls do not form one complete rectangular envelope.',[f.id]);
  }
  for(const w of S){
   const vertical=Math.abs(w[0]-w[2])<EPS;
   for(const r of R){const cross=vertical?w[0]>r.x+EPS&&w[0]<r.x+r.w-EPS&&Math.min(Math.max(w[1],w[3]),r.y+r.h)-Math.max(Math.min(w[1],w[3]),r.y)>EPS:
    w[1]>r.y+EPS&&w[1]<r.y+r.h-EPS&&Math.min(Math.max(w[0],w[2]),r.x+r.w)-Math.max(Math.min(w[0],w[2]),r.x)>EPS;
    if(cross)issue('wall_bisects_room','critical','A wall crosses the interior of a room zone.',[idOf(w),r.id]);
   }
  }
  const graph=new Map(R.map(r=>[r.id,new Set()])),entrances=new Set();
  const join=(a,b)=>{graph.get(a)?.add(b);graph.get(b)?.add(a);};
  for(const w of S.filter(w=>!w[4])){
   const vertical=Math.abs(w[0]-w[2])<EPS,axis=vertical?1:0,fixed=vertical?w[0]:w[1],lo=Math.min(w[axis],w[axis+2]),hi=Math.max(w[axis],w[axis+2]),supported=[];
   for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){
    const a=R[i],b=R[j],edge=vertical?Math.abs(a.x+a.w-fixed)<EPS&&Math.abs(b.x-fixed)<EPS||Math.abs(b.x+b.w-fixed)<EPS&&Math.abs(a.x-fixed)<EPS:Math.abs(a.y+a.h-fixed)<EPS&&Math.abs(b.y-fixed)<EPS||Math.abs(b.y+b.h-fixed)<EPS&&Math.abs(a.y-fixed)<EPS;
    if(!edge)continue;
    const start=vertical?Math.max(a.y,b.y):Math.max(a.x,b.x),end=vertical?Math.min(a.y+a.h,b.y+b.h):Math.min(a.x+a.w,b.x+b.w),from=Math.max(lo,start),to=Math.min(hi,end);
    if(to>from+EPS)supported.push([from,to]);
   }
   supported.sort((a,b)=>a[0]-b[0]);let cursor=lo;
   for(const [from,to] of supported){if(to<=cursor+EPS)continue;if(from>cursor+EPS)break;cursor=Math.max(cursor,to);}
   if(cursor<hi-EPS)issue('wall_topology','critical','An internal wall must be continuously supported by shared room boundaries; freehand partitions are not yet supported.',[idOf(w)]);
  }
  for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){
   const a=R[i],b=R[j],vertical=Math.abs(a.x+a.w-b.x)<EPS||Math.abs(b.x+b.w-a.x)<EPS,horizontal=Math.abs(a.y+a.h-b.y)<EPS||Math.abs(b.y+b.h-a.y)<EPS;
   if(vertical){const x=Math.abs(a.x+a.w-b.x)<EPS?a.x+a.w:b.x+b.w,lo=Math.max(a.y,b.y),hi=Math.min(a.y+a.h,b.y+b.h);if(hi>lo+EPS&&!(a.hall&&b.hall)&&!f.L.E.some(e=>Math.abs(e[0]-x)<EPS&&Math.abs(e[2]-x)<EPS&&Math.min(e[1],e[3])<=lo+EPS&&Math.max(e[1],e[3])>=hi-EPS)&&!S.some(w=>!w[4]&&Math.abs(w[0]-x)<EPS&&Math.abs(w[2]-x)<EPS&&Math.min(w[1],w[3])<=lo+EPS&&Math.max(w[1],w[3])>=hi-EPS))issue('missing_internal_wall','critical','Adjacent rooms are missing their shared partition wall or explicitly modelled open connection.',[a.id,b.id]);}
   if(horizontal){const y=Math.abs(a.y+a.h-b.y)<EPS?a.y+a.h:b.y+b.h,lo=Math.max(a.x,b.x),hi=Math.min(a.x+a.w,b.x+b.w);if(hi>lo+EPS&&!(a.hall&&b.hall)&&!f.L.E.some(e=>Math.abs(e[1]-y)<EPS&&Math.abs(e[3]-y)<EPS&&Math.min(e[0],e[2])<=lo+EPS&&Math.max(e[0],e[2])>=hi-EPS)&&!S.some(w=>!w[4]&&Math.abs(w[1]-y)<EPS&&Math.abs(w[3]-y)<EPS&&Math.min(w[0],w[2])<=lo+EPS&&Math.max(w[0],w[2])>=hi-EPS))issue('missing_internal_wall','critical','Adjacent rooms are missing their shared partition wall or explicitly modelled open connection.',[a.id,b.id]);}
  }
  for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
   const a=S[i],b=S[j],same=(Math.abs(a[0]-b[0])<EPS&&Math.abs(a[1]-b[1])<EPS&&Math.abs(a[2]-b[2])<EPS&&Math.abs(a[3]-b[3])<EPS)||(Math.abs(a[0]-b[2])<EPS&&Math.abs(a[1]-b[3])<EPS&&Math.abs(a[2]-b[0])<EPS&&Math.abs(a[3]-b[1])<EPS);
   if(same)issue('duplicate_wall','critical','Two wall elements occupy the same segment.',[idOf(a),idOf(b)]);else{const av=Math.abs(a[0]-a[2])<EPS,bv=Math.abs(b[0]-b[2])<EPS;if(av===bv&&(av?Math.abs(a[0]-b[0])<EPS:Math.abs(a[1]-b[1])<EPS)){const overlap=av?Math.min(Math.max(a[1],a[3]),Math.max(b[1],b[3]))-Math.max(Math.min(a[1],a[3]),Math.min(b[1],b[3])):Math.min(Math.max(a[0],a[2]),Math.max(b[0],b[2]))-Math.max(Math.min(a[0],a[2]),Math.min(b[0],b[2]));if(overlap>EPS)issue('wall_overlap','critical','Collinear wall segments overlap instead of meeting at a clean junction.',[idOf(a),idOf(b)],overlap,0);}}
  }
  for(const o of O){id(o);const wall=S.find(w=>idOf(w)===o.wallId);
   if(!wall||!pointOnWall(o.a,wall)||!pointOnWall(o.b,wall)){issue('opening_host','critical','An opening is not fully contained by its host wall.',[o.id,o.wallId].filter(Boolean));continue;}
   const width=Math.hypot(o.a[0]-o.b[0],o.a[1]-o.b[1]),minimum=o.t==='entry'?.8:o.t==='win'?.6:.7;
   if(!['door','entry','win'].includes(o.t)||width<minimum-EPS||!Number.isFinite(o.sill)||!Number.isFinite(o.head)||o.sill<0||o.head<=o.sill||o.head>g.height)issue('opening_size','critical','Opening type, clear width and vertical limits must be valid.',[o.id],width,{minimumWidth:minimum,maxHead:g.height});
   if(Boolean(o.ext)!==Boolean(wall[4]))issue('opening_exterior','critical','Opening exterior flag conflicts with its host wall.',[o.id,idOf(wall)]);
   if(o.t!=='win'){
    const mid=[(o.a[0]+o.b[0])/2,(o.a[1]+o.b[1])/2],vertical=Math.abs(wall[0]-wall[2])<EPS,delta=vertical?[.001,0]:[0,.001];
    const a=R.find(r=>contains(r,[mid[0]+delta[0],mid[1]+delta[1]])),b=R.find(r=>contains(r,[mid[0]-delta[0],mid[1]-delta[1]]));
    if(o.ext){if(a||b)entrances.add((a||b).id);else issue('entrance','critical','Entrance does not connect to an interior space.',[o.id]);}
    else if(a&&b&&a.id!==b.id)join(a.id,b.id);else issue('door_connection','critical','Internal door does not connect two rooms.',[o.id]);
    const leaf=[o.a[0]+o.in[0]*width,o.a[1]+o.in[1]*width];
    if(!R.some(r=>contains(r,leaf)))issue('door_leaf','critical','Door leaf extends outside the layout.',[o.id]);
   }
  }
  for(let i=0;i<O.length;i++)for(let j=i+1;j<O.length;j++){
   const a=O[i],b=O[j];if(a.wallId!==b.wallId||!a.wallId)continue;const w=S.find(w=>idOf(w)===a.wallId);if(!w)continue;
   const axis=Math.abs(w[0]-w[2])<EPS?1:0;
   if(Math.min(Math.max(a.a[axis],a.b[axis]),Math.max(b.a[axis],b.b[axis]))-Math.max(Math.min(a.a[axis],a.b[axis]),Math.min(b.a[axis],b.b[axis]))>EPS && Math.min(a.head,b.head)>Math.max(a.sill,b.sill))issue('opening_overlap','critical','Openings overlap on the same wall.',[a.id,b.id]);
  }
  // Open public-space boundaries are explicit E segments, not walls.
  for(const edge of f.L.E){const mid=[(edge[0]+edge[2])/2,(edge[1]+edge[3])/2];const adjacent=R.filter(r=>contains(r,mid));if(adjacent.length===2)join(adjacent[0].id,adjacent[1].id);}
  if(g.floors.indexOf(f)>0&&(g.stairs||[]).some(s=>s.to===f.id)){const landing=R.find(r=>r.kind==='Land');if(landing)entrances.add(landing.id);}
  if(!entrances.size)issue('no_entrance','critical','No exterior entrance is connected to the layout.',[f.id]);
  const reached=new Set(entrances),queue=[...entrances];while(queue.length){for(const n of graph.get(queue.shift())||[])if(!reached.has(n)){reached.add(n);queue.push(n);}}
  for(const r of R)if(!reached.has(r.id))issue('unreachable_room','critical',`${r.name} has no connected route to the entrance.`,[r.id]);
 }
 const categories={room_geometry:['room_geometry','room_bounds','room_overlap','area_coverage','extent','units','element_id','room_clear_area','room_clear_width'],walls:['wall_geometry','wall_bounds','envelope','wall_bisects_room','wall_exterior_flag','wall_topology','duplicate_wall','missing_internal_wall','wall_overlap'],openings:['opening_host','opening_size','opening_exterior','opening_overlap','door_connection','door_leaf'],connectivity:['no_entrance','entrance','unreachable_room'],scope:['unsupported_storeys'],stair_geometry:['stair_count','stair_connection','stair_geometry','stair_alignment','stair_room']};
 for(const [name,codes]of Object.entries(categories))checks.push({name,status:name==='stair_geometry'&&g.floors.length===1?'not_applicable':issues.some(i=>codes.includes(i.code)&&i.severity==='critical')?'failed':'passed'});
 const quality=validateQuality(g);quality.issues.forEach(i=>issues.push({...i,id:'issue-'+(issues.length+1)}));checks.push(...quality.checks);
 for(const name of ['daylight_and_ventilation','accessibility','regulatory_compliance','structure','elevations_and_sections','professional_review'])checks.push({name,status:'not_checked'});\n checks.push({name:'stair_headroom_and_egress',status:g.floors.length===1?'not_applicable':'not_checked'});\n checks.push({name:'furniture_access_clearances',status:'not_checked'});
 const multiStorey=validateMultiStorey(g);
 multiStorey.issues.forEach(i=>issues.push({...i,id:'issue-'+(issues.length+1)}));
 checks.push(...multiStorey.checks);
 const critical=issues.filter(i=>i.severity==='critical').length;
 return {status:critical?'failed':issues.length?'warnings':'passed',approval:'not_approved',constructionExportAllowed:false,criticalCount:critical,uncheckedCount:checks.filter(c=>c.status==='not_checked').length,issues,checks,
 scope:'Single-storey rectangular residential concepts from a bounded partition solver. Clear rectangular room areas exclude assumed wall thickness; hallway areas and door thresholds are not included in that total. Furniture footprint containment and conservative door-swing envelopes are checked. Furniture access clearances, daylight performance, ventilation, regulations, structure and approval remain unverified. No claim of a globally optimal architectural layout is made.',
 assumptions:['Metres; footprint dimensions are wall centreline dimensions.','North at top; orientation is assumed.','Wall height 2.7 m, exterior thickness 0.30 m, interior thickness 0.12 m.','Window sill 0.90 m and opening head 2.10 m are schematic assumptions.','No jurisdiction or regulatory ruleset has been selected.']};
}