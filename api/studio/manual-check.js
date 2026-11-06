import { identify, requireBuild } from '../../lib/access.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='public';
export const methods=['POST'];
const rules={Bed:{minArea:9,minSide:2.4},Bath:{minArea:3.6,minSide:1.5},Living:{minArea:22,minSide:3.2},Study:{minArea:6,minSide:2.1},Kitchen:{minArea:7,minSide:2.1},Dining:{minArea:8,minSide:2.3},Utility:{minArea:3,minSide:1.4}};
export default async function(req,res){
 res.setHeader?.('Cache-Control','no-store');
 if(!await guardStudioRequest(req,res,{route:'studio.manual-check',limit:30,maxBytes:131072}))return;
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 if(!requireBuild(await identify(req),res))return;
 const b=req.body||{},W=Number(b.W),D=Number(b.D),rooms=b.rooms;
 if(!Number.isFinite(W)||!Number.isFinite(D)||W<6||W>40||D<6||D>40||!Array.isArray(rooms)||rooms.length<1||rooms.length>30)return res.status(400).json({error:'invalid_sketch',message:'Provide a 6–40 m footprint and up to 30 room rectangles.'});
 const issues=[],add=(code,message,index)=>issues.push({code,message,roomIndex:index});
 rooms.forEach((r,i)=>{
  if(!r||typeof r!=='object'||Array.isArray(r)){add('invalid_room','Room '+(i+1)+' is not a valid room.',i);return;}
  const rule=rules[r.kind],x=Number(r.x),y=Number(r.y),w=Number(r.w),h=Number(r.h),area=w*h;
  if(!rule||typeof r.name!=='string'||!r.name.trim()||r.name.length>40||![x,y,w,h].every(Number.isFinite)||w<=0||h<=0){add('invalid_room','Room '+(i+1)+' has invalid type, name or dimensions.',i);return;}
  if(x<0||y<0||x+w>W||y+h>D)add('outside_footprint',r.name+' extends beyond the '+W+' × '+D+' m footprint.',i);
  if(area<rule.minArea||Math.min(w,h)<rule.minSide)add('room_too_small',r.name+' is below the studio minimum area or minimum clear side.',i);
  if(Math.max(w/h,h/w)>4)add('room_proportion',r.name+' is too narrow or elongated for this manual sketch.',i);
  for(let j=0;j<i;j++){const q=rooms[j];if(!q||typeof q!=='object')continue;const qx=Number(q.x),qy=Number(q.y),qw=Number(q.w),qh=Number(q.h);if([qx,qy,qw,qh].every(Number.isFinite)&&Math.min(x+w,qx+qw)-Math.max(x,qx)>1e-6&&Math.min(y+h,qy+qh)-Math.max(y,qy)>1e-6)add('room_overlap',r.name+' overlaps '+q.name+'.',i);}
 });
 return res.json({status:issues.length?'failed':'room_rectangles_passed',criticalCount:issues.length,issues,checks:[{name:'room_rectangles_inside_footprint',status:issues.some(i=>i.code==='outside_footprint')?'failed':'passed'},{name:'room_overlap',status:issues.some(i=>i.code==='room_overlap')?'failed':'passed'},{name:'room_area_and_proportions',status:issues.some(i=>['room_too_small','room_proportion','invalid_room'].includes(i.code))?'failed':'passed'},{name:'walls_doors_windows_and_circulation',status:'not_checked'},{name:'furniture_access_daylight_ventilation_and_codes',status:'not_checked'}],exportAllowed:false,scope:'Room-rectangle sketch checks only. This is not a validated floor plan. Walls, openings, circulation, furniture access, daylight, ventilation, accessibility, structure and regulatory compliance are not checked. Plan and model export remain unavailable for manual sketches.'});
}