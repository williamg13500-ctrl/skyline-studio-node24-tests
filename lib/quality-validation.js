// Independent measurements/checks: does not import the layout solver or trust its scores.
const E=1e-6,limits={Bed:[9,2.4,1.9,26],Bath:[3.6,1.5,2.3,10],Living:[22,3.2,2,65],Study:[6,2.1,2,18],Kitchen:[7,2.1,2,22],Dining:[8,2.3,2,24],Utility:[3,1.4,2.3,16],Entry:[3,1.25,2.4,12]};
const minimumItems={Bed:['bed','wardrobe'],Bath:['shower','toilet','basin'],Living:['sofa','dining table','kitchen counter'],Study:['desk'],Kitchen:['kitchen counter'],Dining:['dining table'],Utility:['storage']};
const itemDims={bed:[1.5,2],wardrobe:[.6,1.2],shower:[.9,.9],toilet:[.65,.75],basin:[.45,.6],sofa:[.9,2.1],'dining table':[.8,1.4],'kitchen counter':[.6,2.8],desk:[.6,1.2],storage:[.6,1.2]};
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>E&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>E;
const inside=(a,b)=>a.x>=b.x-E&&a.y>=b.y-E&&a.x+a.w<=b.x+b.w+E&&a.y+a.h<=b.y+b.h+E;
export function validateQuality(g){
 const seenItems=new Set();
 const issues=[],add=(code,message,ids=[],measured=null,expected=null,severity='critical')=>issues.push({code,message,elementIds:ids,measured,expected,severity});
 if(g.schemaVersion!==3)return {issues:[],checks:[{name:'clear_internal_areas',status:'not_checked'},{name:'furniture_fit',status:'not_checked'},{name:'door_swing_envelopes',status:'not_checked'}]};
 for(const f of g.floors){const {R,O,W,D}=f.L;const corridor=R.filter(r=>r.hall).reduce((n,r)=>n+r.w*r.h,0)/(W*D);
  if(corridor>.32+E)add('circulation_ratio','Circulation exceeds the studio concept limit.',[f.id],corridor,.32);
  for(const o of O){const ids=[o.roomId,...(o.connectedRoomIds||[])].filter(Boolean),rooms=R.filter(r=>ids.includes(r.id)),contains=p=>rooms.some(r=>p[0]>=r.x-E&&p[0]<=r.x+r.w+E&&p[1]>=r.y-E&&p[1]<=r.y+r.h+E);if(!contains(o.a)||!contains(o.b))add('opening_room_association','An opening is not contained on the boundary of its declared adjacent room(s).',[o.id,...ids]);}
  for(const r of R.filter(r=>!r.hall)){
   if(!O.some(o=>o.t==='door'&&(o.roomId===r.id||(o.connectedRoomIds||[]).includes(r.id))))add('door_metadata','A room has no associated internal access door.',[r.id]);
   const nx=r.x+(Math.abs(r.x)<E?.15:.06),ny=r.y+(Math.abs(r.y)<E?.15:.06),nw=r.w-(Math.abs(r.x)<E?.15:.06)-(Math.abs(r.x+r.w-W)<E?.15:.06),nh=r.h-(Math.abs(r.y)<E?.15:.06)-(Math.abs(r.y+r.h-D)<E?.15:.06),net={x:nx,y:ny,w:nw,h:nh,area:nw*nh};
   if(!r.net||['x','y','w','h','area'].some(k=>!Number.isFinite(r.net[k])||Math.abs(r.net[k]-net[k])>E))add('net_measurement','Stored clear dimensions disagree with the wall-centreline and thickness measurements.',[r.id]);
   const rule=limits[r.kind];if(!rule){add('room_type','Unsupported room type.',[r.id]);continue;}
   const [minArea,minSide,maxAspect,maxArea]=rule,lower=Math.max(minArea,(r.a||0)*.75),upper=Math.min(maxArea,Math.max(minArea,(r.a||maxArea)*1.25)),aspect=Math.max(nw/nh,nh/nw);
   if(!Number.isFinite(r.a)||r.a<minArea||r.a>maxArea||!Number.isFinite(net.area)||net.area<lower-E||net.area>upper+E||Math.min(nw,nh)<minSide-E||aspect>maxAspect+E)add('room_quality',`${r.name} violates clear area, dimension, target range or proportion limits. These are studio targets, not building-code approval.`,[r.id],{area:net.area,shortSide:Math.min(nw,nh),aspect},{minArea:lower,maxArea:upper,minSide,maxAspect},g.editorAuthored?'warning':'critical');
   const items=r.furniture||[];if((minimumItems[r.kind]||[]).some(type=>!items.some(item=>item.type===type)))add('furniture_missing',`${r.name} is missing a required schematic furniture or fixture footprint.`,[r.id]);
   for(const item of items){if(!item.id||seenItems.has(item.id))add('furniture_identity','Furniture needs unique stable element identities.',[r.id,item.id]);seenItems.add(item.id);const dims=itemDims[item.type];if(![item.x,item.y,item.w,item.h,item.height].every(Number.isFinite)||item.w<=0||item.h<=0||item.height<=0||item.height>g.height||!inside(item,net)||!dims||Math.min(item.w,item.h)<dims[0]-E||Math.max(item.w,item.h)<dims[1]-E)add('furniture_bounds','Furniture dimensions or containment in the clear room are invalid.',[r.id,item.id]);}
   for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(overlap(items[i],items[j]))add('furniture_overlap','Furniture footprints overlap.',[items[i].id,items[j].id]);
   for(const o of O.filter(o=>(o.swingRoomId||o.roomId)===r.id&&o.t!=='win')){
    const width=Math.hypot(o.a[0]-o.b[0],o.a[1]-o.b[1]),px=o.a[0]+o.in[0]*width,py=o.a[1]+o.in[1]*width,b={x:Math.min(o.a[0],o.b[0],px),y:Math.min(o.a[1],o.b[1],py),w:Math.max(o.a[0],o.b[0],px)-Math.min(o.a[0],o.b[0],px),h:Math.max(o.a[1],o.b[1],py)-Math.min(o.a[1],o.b[1],py)};
    if(!inside(b,r)||items.some(item=>overlap(b,item)))add('door_swing_collision','The conservative door-swing envelope leaves its room or intersects furniture.',[r.id,o.id]);
   }
   for(const o of O.filter(o=>(o.swingRoomId||o.roomId)===r.id&&o.t!=='win')){
    const width=Math.hypot(o.a[0]-o.b[0],o.a[1]-o.b[1]),cx=(o.a[0]+o.b[0])/2,cy=(o.a[1]+o.b[1])/2,depth=.6,half=width/2+.15;
    const approach=Math.abs(o.in[0])>.5?{x:cx-half,y:cy+(o.in[1]<0?-depth:0),w:2*half,h:depth}:{x:cx+(o.in[0]<0?-depth:0),y:cy-half,w:depth,h:2*half};
    if(items.some(item=>overlap(approach,item)))add('furniture_access','Furniture may obstruct the 0.6 m schematic approach zone at a doorway. Verify actual clearances and circulation.',[r.id,o.id],null,.6,'warning');
   }
   const windows=O.filter(o=>o.roomId===r.id&&o.t==='win'&&o.ext),glazing=windows.reduce((n,o)=>n+Math.hypot(o.a[0]-o.b[0],o.a[1]-o.b[1])*(o.head-o.sill),0);
   if(['Bed','Living','Study'].includes(r.kind)&&!windows.length)add('external_window','An occupied room has no modelled external window.',[r.id]);
   if(['Bed','Living','Study'].includes(r.kind)&&glazing/net.area<.08)add('glazing_proxy','Glazing is below the studio 8% proxy. This is not a daylight, ventilation or regulatory assessment.',[r.id],glazing/net.area,.08,'warning');
  }
 }
 const categories={clear_internal_areas:['net_measurement'],room_proportions_and_targets:['room_quality','room_type'],furniture_fit:['furniture_missing','furniture_bounds','furniture_overlap','furniture_identity'],door_swing_envelopes:['door_swing_collision','door_metadata','opening_room_association'],furniture_access_clearances:['furniture_access'],external_window_presence:['external_window'],circulation_ratio:['circulation_ratio']};
 return {issues,checks:Object.entries(categories).map(([name,codes])=>({name,status:issues.some(i=>i.severity==='critical'&&codes.includes(i.code))?'failed':issues.some(i=>i.severity==='warning'&&codes.includes(i.code))?'warning':'passed'}))};
}