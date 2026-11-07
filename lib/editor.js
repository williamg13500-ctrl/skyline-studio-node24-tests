import { validateGeometry } from './validation.js';
import { clearRect, targetBounds } from './layout-solver.js';
const EPS=1e-6,clone=x=>JSON.parse(JSON.stringify(x));
const idOf=w=>w?.[5]||w?.id;
const furnitureSpec={
 bed:{w:1.5,h:2,height:.55},wardrobe:{w:.6,h:1.2,height:2.1},
 shower:{w:.9,h:.9,height:.12},toilet:{w:.65,h:.75,height:.45},basin:{w:.45,h:.6,height:.8},
 sofa:{w:2.1,h:.9,height:.8},'dining table':{w:1.4,h:.8,height:.75},
 'kitchen counter':{w:2.8,h:.6,height:.9},desk:{w:1.2,h:.6,height:.75},storage:{w:1.2,h:.6,height:1.8}
};
function fail(message){const e=new Error(message);e.status=422;throw e;}
function roomAndItem(g,roomId,itemId){const room=g.floors[0].L.R.find(r=>r.id===String(roomId)&&!r.hall);if(!room)fail('Select an editable room first.');const item=(room.furniture||[]).find(x=>x.id===String(itemId));return {room,item};}
function refreshRooms(g){for(const r of g.floors[0].L.R)if(!r.hall){r.net=clearRect(r,g.floors[0].L.W,g.floors[0].L.D);for(const item of r.furniture||[]){if(item.w>r.net.w+EPS||item.h>r.net.h+EPS)fail('This edit leaves insufficient clear space for '+item.type+'.');}}}
function clampFurniture(g){const {W,D}=g.floors[0].L;for(const r of g.floors[0].L.R)if(!r.hall){const net=clearRect(r,W,D);for(const item of r.furniture||[]){if(item.w>net.w+EPS||item.h>net.h+EPS)fail('This wall movement leaves insufficient clear space for '+item.type+'.');item.x=Math.max(net.x,Math.min(item.x,net.x+net.w-item.w));item.y=Math.max(net.y,Math.min(item.y,net.y+net.h-item.h));}}}
function rebuildTopology(L){
 const old=L.S,openings=L.O,rooms=L.R,W=L.W,D=L.D,oldOpen=L.E||[],walls=[[0,0,W,0,1],[W,0,W,D,1],[W,D,0,D,1],[0,D,0,0,1]],edges=[];
 const add=(a,b,exterior=false)=>{if(Math.hypot(b[0]-a[0],b[1]-a[1])<EPS)return;const q=[...a,...b,exterior?1:0],key=q.slice(0,4).map(n=>n.toFixed(5)).join(':');if(walls.some(w=>w.slice(0,4).map(n=>n.toFixed(5)).join(':')===key))return;walls.push(q);};
 const wasOpen=(vertical,fixed,lo,hi)=>oldOpen.some(e=>vertical?Math.abs(e[0]-fixed)<EPS&&Math.abs(e[2]-fixed)<EPS&&Math.min(e[1],e[3])<=lo+EPS&&Math.max(e[1],e[3])>=hi-EPS:Math.abs(e[1]-fixed)<EPS&&Math.abs(e[3]-fixed)<EPS&&Math.min(e[0],e[2])<=lo+EPS&&Math.max(e[0],e[2])>=hi-EPS);
 for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  const a=rooms[i],b=rooms[j],vertical=Math.abs(a.x+a.w-b.x)<EPS||Math.abs(b.x+b.w-a.x)<EPS,horizontal=Math.abs(a.y+a.h-b.y)<EPS||Math.abs(b.y+b.h-a.y)<EPS;
  if(vertical){const x=Math.abs(a.x+a.w-b.x)<EPS?a.x+a.w:b.x+b.w,lo=Math.max(a.y,b.y),hi=Math.min(a.y+a.h,b.y+b.h);if(hi>lo+EPS){if((a.hall&&b.hall)||wasOpen(true,x,lo,hi))edges.push([x,lo,x,hi]);else add([x,lo],[x,hi]);}}
  if(horizontal){const y=Math.abs(a.y+a.h-b.y)<EPS?a.y+a.h:b.y+b.h,lo=Math.max(a.x,b.x),hi=Math.min(a.x+a.w,b.x+b.w);if(hi>lo+EPS){if((a.hall&&b.hall)||wasOpen(false,y,lo,hi))edges.push([lo,y,hi,y]);else add([lo,y],[hi,y]);}}
 }
 walls.sort((a,b)=>a[4]-b[4]||a[1]-b[1]||a[0]-b[0]||a[3]-b[3]||a[2]-b[2]);
 walls.forEach((w,i)=>{w[5]='f0-wall-'+(i+1);w.id=w[5];const prior=old.find(p=>(p[0]===w[0]&&p[1]===w[1]&&p[2]===w[2]&&p[3]===w[3])||(p[0]===w[2]&&p[1]===w[3]&&p[2]===w[0]&&p[3]===w[1]));if(prior){const thickness=Number(prior[6])||Number(prior.thickness),material=prior[7]||prior.material;if(thickness){w[6]=thickness;w.thickness=thickness;}if(material){w[7]=material;w.material=material;}}});
 for(const o of openings){const host=walls.find(w=>pointOnSegment(o.a,w)&&pointOnSegment(o.b,w));if(!host)fail('A room boundary change would split or remove an existing opening. Move or remove that opening first.');o.wallId=host[5];o.ext=host[4]?1:0;const mid=[(o.a[0]+o.b[0])/2,(o.a[1]+o.b[1])/2],inside=[mid[0]+(o.in?.[0]||0)*.01,mid[1]+(o.in?.[1]||0)*.01],owner=rooms.find(r=>inside[0]>=r.x-EPS&&inside[0]<=r.x+r.w+EPS&&inside[1]>=r.y-EPS&&inside[1]<=r.y+r.h+EPS);if(owner)o.roomId=owner.id;}
 L.S=walls;L.E=edges;
}
function pointOnSegment(p,w){const vertical=Math.abs(w[0]-w[2])<EPS;return vertical?Math.abs(p[0]-w[0])<EPS&&p[1]>=Math.min(w[1],w[3])-EPS&&p[1]<=Math.max(w[1],w[3])+EPS:Math.abs(p[1]-w[1])<EPS&&p[0]>=Math.min(w[0],w[2])-EPS&&p[0]<=Math.max(w[0],w[2])+EPS;}
function autoFurnish(room,L){
 const programs={Bed:['bed','wardrobe'],Bath:['shower','toilet','basin'],Living:['sofa','dining table','kitchen counter'],Study:['desk'],Kitchen:['kitchen counter'],Dining:['dining table'],Utility:['storage']},net=clearRect(room,L.W,L.D),placed=[];
 for(const type of programs[room.kind]||[]){const spec=furnitureSpec[type];let found=null;
  for(const [w,h] of [[spec.w,spec.h],[spec.h,spec.w]]){for(let x=net.x;x<=net.x+net.w-w+EPS&&!found;x+=.1)for(let y=net.y;y<=net.y+net.h-h+EPS&&!found;y+=.1){const item={x,y,w,h};if(!placed.some(p=>Math.min(p.x+p.w,item.x+item.w)-Math.max(p.x,item.x)>EPS&&Math.min(p.y+p.h,item.y+item.h)-Math.max(p.y,item.y)>EPS))found={...item};}}
  if(!found)fail('The new '+room.kind+' room is too small for its required schematic furniture. Enlarge it or choose another room type.');
  placed.push({...found,type,id:room.id+'-auto-'+(placed.length+1),height:spec.height});
 }
 room.furniture=placed;
}
function ensureExteriorWindow(room,L){
 if(!['Bed','Living','Study'].includes(room.kind)||L.O.some(o=>o.t==='win'&&o.roomId===room.id))return;
 const edges=[{wall:L.S.find(w=>w[4]&&Math.abs(w[0])<EPS&&Math.abs(w[2])<EPS),a:[0,room.y],b:[0,room.y+room.h],inside:[1,0],normal:[-1,0]},{wall:L.S.find(w=>w[4]&&Math.abs(w[0]-L.W)<EPS&&Math.abs(w[2]-L.W)<EPS),a:[L.W,room.y],b:[L.W,room.y+room.h],inside:[-1,0],normal:[1,0]},{wall:L.S.find(w=>w[4]&&Math.abs(w[1])<EPS&&Math.abs(w[3])<EPS),a:[room.x,0],b:[room.x+room.w,0],inside:[0,1],normal:[0,-1]},{wall:L.S.find(w=>w[4]&&Math.abs(w[1]-L.D)<EPS&&Math.abs(w[3]-L.D)<EPS),a:[room.x,L.D],b:[room.x+room.w,L.D],inside:[0,-1],normal:[0,1]}].filter(e=>e.wall);
 edges.sort((a,b)=>Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1])-Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1]));
 for(const e of edges){const vertical=Math.abs(e.a[0]-e.b[0])<EPS,lo=vertical?Math.min(e.a[1],e.b[1]):Math.min(e.a[0],e.b[0]),hi=vertical?Math.max(e.a[1],e.b[1]):Math.max(e.a[0],e.b[0]);if(hi-lo<1.6)continue;const axis=vertical?1:0,occupied=L.O.filter(o=>o.wallId===e.wall[5]).map(o=>[Math.min(o.a[axis],o.b[axis]),Math.max(o.a[axis],o.b[axis])]);
  for(let mid=lo+.8;mid<=hi-.8+EPS;mid+=.25){const start=mid-.6,end=mid+.6;if(occupied.some(([a,b])=>start<b+.2&&end>a-.2))continue;const a=vertical?[e.a[0],start]:[start,e.a[1]],b=vertical?[e.a[0],end]:[end,e.a[1]];L.O.push({id:room.id+'-auto-window',wallId:e.wall[5],t:'win',ext:1,a,b,in:e.inside,n:e.normal,roomId:room.id,sill:.9,head:2.1});return;}
 }
 fail('This room type requires an exterior window, but no clear exterior wall span is available.');
}
function safeSplitDoorMidpoint(room,position,vertical){
 const width=.9,half=width/2,depth=width,start=vertical?room.y:room.x,end=vertical?room.y+room.h:room.x+room.w;
 let intervals=[[start+half,end-half]];
 for(const item of room.furniture||[]){
  const itemDepthStart=vertical?item.x:item.y,itemDepthEnd=itemDepthStart+(vertical?item.w:item.h);
  if(Math.min(position,itemDepthEnd)-Math.max(position-depth,itemDepthStart)<=EPS)continue;
  const itemStart=vertical?item.y:item.x,itemEnd=itemStart+(vertical?item.h:item.w),blockedStart=itemStart-half,blockedEnd=itemEnd+half,next=[];
  for(const [a,b] of intervals){
   if(blockedEnd<=a+EPS||blockedStart>=b-EPS)next.push([a,b]);
   else{
    if(blockedStart>a+EPS)next.push([a,Math.min(blockedStart,b)]);
    if(blockedEnd<b-EPS)next.push([Math.max(blockedEnd,a),b]);
   }
  }
  intervals=next;
 }
 intervals=intervals.filter(([a,b])=>b-a>EPS).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
 if(!intervals.length)fail('No clear 0.9 m door-swing position remains on this new partition. Move furniture before splitting the room.');
 return (intervals[0][0]+intervals[0][1])/2;
}
function splitRoom(g,op){
 const L=g.floors[0].L,room=L.R.find(r=>r.id===String(op.roomId)&&!r.hall);if(!room)fail('Select a non-circulation room to split.');
 const axis=op.axis==='y'?'y':'x',vertical=axis==='x',position=Math.round(Number(op.position)*4)/4,min=1.5,coord=vertical?room.x:room.y,extent=vertical?room.w:room.h;
 if(!Number.isFinite(position)||position<coord+min-EPS||position>coord+extent-min+EPS)fail('The new partition must leave at least 1.5 m on each side.');
 const kind=String(op.kind||'Bed'),name=String(op.name||'New '+kind).trim();if(!targetBounds(kind)||!name||name.length>40)fail('Choose a supported room type and a name of 1–40 characters.');
 const left=vertical?{x:room.x,y:room.y,w:position-room.x,h:room.h}:{x:room.x,y:room.y,w:room.w,h:position-room.y};
 const right=vertical?{x:position,y:room.y,w:room.x+room.w-position,h:room.h}:{x:room.x,y:position,w:room.w,h:room.y+room.h-position};
 const minArea=targetBounds(kind)[0];if(right.w*right.h<minArea-EPS)fail('The new room is below the studio minimum area for '+kind+'.');
 const existingFurniture=room.furniture||[],keep=[],move=[];
 for(const item of existingFurniture){const inside=(box)=>item.x>=box.x-EPS&&item.y>=box.y-EPS&&item.x+item.w<=box.x+box.w+EPS&&item.y+item.h<=box.y+box.h+EPS;if(inside(left))keep.push(item);else if(inside(right))move.push(item);else fail('The new partition would cut through existing furniture. Move the furniture first.');}
 room.x=left.x;room.y=left.y;room.w=left.w;room.h=left.h;room.furniture=keep;
 const nextId='f0-room-'+(Math.max(0,...L.R.map(r=>Number(String(r.id).split('-').pop())||0))+1);
 if(move.length)fail('Move existing furniture away from the proposed partition before splitting this room.');
 const created={...room,id:nextId,name,kind,x:right.x,y:right.y,w:right.w,h:right.h,a:right.w*right.h,net:clearRect(right,L.W,L.D),furniture:[]};
 L.R.push(created);g.editorAuthored=true;
 const adjusted=[];
 for(const opening of L.O){const host=L.S.find(w=>w[5]===opening.wallId),isVerticalWall=host&&Math.abs(host[0]-host[2])<EPS,lo=Math.min(opening.a[isVerticalWall?1:0],opening.b[isVerticalWall?1:0]),hi=Math.max(opening.a[isVerticalWall?1:0],opening.b[isVerticalWall?1:0]),crosses=opening.t==='win'&&host?.[4]&&(vertical?!isVerticalWall&&(Math.abs(host[1]-room.y)<EPS||Math.abs(host[1]-room.y-room.h)<EPS)&&lo<position-EPS&&hi>position+EPS:isVerticalWall&&(Math.abs(host[0]-room.x)<EPS||Math.abs(host[0]-room.x-room.w)<EPS)&&lo<position-EPS&&hi>position+EPS);
  if(!crosses){adjusted.push(opening);continue;}
  const gap=.12,leftEnd=position-gap/2,rightStart=position+gap/2;
  if(leftEnd-lo<.6-EPS||hi-rightStart<.6-EPS)fail('The new partition crosses a window that cannot be split into two safe schematic openings. Move or remove that window first.');
  const first=clone(opening),second=clone(opening);first.id=opening.id+'-a';second.id=opening.id+'-b';
  if(vertical){first.b[0]=leftEnd;second.a[0]=rightStart;}else{first.b[1]=leftEnd;second.a[1]=rightStart;}
  adjusted.push(first,second);
 }
 L.O=adjusted;
 rebuildTopology(L);ensureExteriorWindow(created,L);autoFurnish(created,L);
 const wall=L.S.find(w=>{const v=Math.abs(w[0]-w[2])<EPS;return v===vertical&&(vertical?Math.abs(w[0]-position)<EPS&&Math.abs(w[1]-room.y)<EPS&&Math.abs(w[3]-room.y-room.h)<EPS:Math.abs(w[1]-position)<EPS&&Math.abs(w[0]-room.x)<EPS&&Math.abs(w[2]-room.x-room.w)<EPS);});
 if(!wall)fail('The new partition could not be created.');
 const mid=safeSplitDoorMidpoint(room,position,vertical),a=vertical?[position,mid-.45]:[mid-.45,position],b=vertical?[position,mid+.45]:[mid+.45,position];
 L.O.push({id:'editor-split-door-'+nextId,wallId:wall[5],t:'door',ext:0,a,b,in:vertical?[-1,0]:[0,-1],n:vertical?[1,0]:[0,1],roomId:room.id,swingRoomId:room.id,connectedRoomIds:[room.id,created.id],sill:0,head:2.1});
}
function mergeRooms(g,op){
 const L=g.floors[0].L,a=L.R.find(r=>r.id===String(op.roomId)&&!r.hall),b=L.R.find(r=>r.id===String(op.otherRoomId)&&!r.hall);if(!a||!b||a===b)fail('Select two different non-circulation rooms.');
 if(a.kind!==b.kind)fail('Only rooms of the same type can be merged. Change their types first.');
 const vertical=Math.abs(a.x+a.w-b.x)<EPS||Math.abs(b.x+b.w-a.x)<EPS,horizontal=Math.abs(a.y+a.h-b.y)<EPS||Math.abs(b.y+b.h-a.y)<EPS;
 const fullVertical=vertical&&Math.abs(a.y-b.y)<EPS&&Math.abs(a.h-b.h)<EPS,fullHorizontal=horizontal&&Math.abs(a.x-b.x)<EPS&&Math.abs(a.w-b.w)<EPS;if(!fullVertical&&!fullHorizontal)fail('Rooms must share one complete edge and form a rectangular combined space.');
 const wallCoord=fullVertical?(Math.abs(a.x+a.w-b.x)<EPS?a.x+a.w:b.x+b.w):(Math.abs(a.y+a.h-b.y)<EPS?a.y+a.h:b.y+b.h),sharedStart=fullVertical?Math.max(a.y,b.y):Math.max(a.x,b.x),sharedEnd=fullVertical?Math.min(a.y+a.h,b.y+b.h):Math.min(a.x+a.w,b.x+b.w);
 const onShared=o=>{const w=L.S.find(w=>w[5]===o.wallId);if(!w)return false;const v=Math.abs(w[0]-w[2])<EPS,axis=fullVertical?1:0,lo=Math.min(o.a[axis],o.b[axis]),hi=Math.max(o.a[axis],o.b[axis]);return fullVertical?v&&Math.abs(w[0]-wallCoord)<EPS&&lo>=sharedStart-EPS&&hi<=sharedEnd+EPS:!v&&Math.abs(w[1]-wallCoord)<EPS&&lo>=sharedStart-EPS&&hi<=sharedEnd+EPS;};
 L.O=L.O.filter(o=>!onShared(o));
 const minX=Math.min(a.x,b.x),minY=Math.min(a.y,b.y),maxX=Math.max(a.x+a.w,b.x+b.w),maxY=Math.max(a.y+a.h,b.y+b.h);a.x=minX;a.y=minY;a.w=maxX-minX;a.h=maxY-minY;a.a=a.w*a.h;a.name=String(op.name||a.name).trim().slice(0,40)||a.name;a.furniture=[...(a.furniture||[]),...(b.furniture||[])];
 L.R=L.R.filter(r=>r!==b);g.editorAuthored=true;rebuildTopology(L);
}
function recognizeWallNetwork(g,op){
 const L=g.floors[0].L,raw=op.segments;
 if(!Array.isArray(raw)||!raw.length||raw.length>300)fail('Provide 1–300 orthogonal wall segments in the floor plan.');
 const segs=[];
 for(const item of raw){
  const a=Array.isArray(item)?item.slice(0,2):item?.a,b=Array.isArray(item)?item.slice(2,4):item?.b;
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2||![...a,...b].every(Number.isFinite))fail('Every wall segment needs two finite 2D endpoints.');
  const [x1,y1]=a,[x2,y2]=b;
  if(Math.hypot(x2-x1,y2-y1)<.05||((Math.abs(x2-x1)>EPS)&&(Math.abs(y2-y1)>EPS)))fail('Wall networks must contain non-zero horizontal or vertical segments only.');
  if(Math.min(x1,x2)<-EPS||Math.max(x1,x2)>L.W+EPS||Math.min(y1,y2)<-EPS||Math.max(y1,y2)>L.D+EPS)fail('Wall segments must remain inside the floor boundary.');
  segs.push([x1,y1,x2,y2]);
 }
 const lines=[...L.S.map(w=>w.slice(0,4)),...segs];
 const covered=(vertical,fixed,lo,hi)=>{
  const spans=lines.filter(s=>vertical?Math.abs(s[0]-s[2])<EPS&&Math.abs(s[0]-fixed)<EPS:Math.abs(s[1]-s[3])<EPS&&Math.abs(s[1]-fixed)<EPS).map(s=>vertical?[Math.min(s[1],s[3]),Math.max(s[1],s[3])]:[Math.min(s[0],s[2]),Math.max(s[0],s[2])]).filter(s=>s[1]>lo+EPS&&s[0]<hi-EPS).sort((a,b)=>a[0]-b[0]);
  let cursor=lo;for(const [a,b] of spans){if(a>cursor+EPS)return false;cursor=Math.max(cursor,b);if(cursor>=hi-EPS)return true;}return cursor>=hi-EPS;
 };
 const cells=[];
 for(const source of L.R){
  const local=segs.filter(s=>{const mx=(s[0]+s[2])/2,my=(s[1]+s[3])/2;return mx>=source.x-EPS&&mx<=source.x+source.w+EPS&&my>=source.y-EPS&&my<=source.y+source.h+EPS;});
  if(!local.length){cells.push({source,x:source.x,y:source.y,w:source.w,h:source.h});continue;}
  const xs=[...new Set([source.x,source.x+source.w,...local.flatMap(s=>[s[0],s[2]])].map(n=>n))].filter(x=>x>=source.x-EPS&&x<=source.x+source.w+EPS).sort((a,b)=>a-b);
  const ys=[...new Set([source.y,source.y+source.h,...local.flatMap(s=>[s[1],s[3]])].map(n=>n))].filter(y=>y>=source.y-EPS&&y<=source.y+source.h+EPS).sort((a,b)=>a-b);
  for(let xi=0;xi<xs.length-1;xi++)for(let yi=0;yi<ys.length-1;yi++){
   const x=xs[xi],y=ys[yi],w=xs[xi+1]-x,h=ys[yi+1]-y;if(w<EPS||h<EPS)continue;
   if(covered(true,x,y,y+h)&&covered(true,x+w,y,y+h)&&covered(false,y,x,x+w)&&covered(false,y+h,x,x+w))cells.push({source,x,y,w,h});
  }
 }
 if(!cells.length)fail('No enclosed rooms were found. Close the wall network against existing floor boundaries or other walls.');
 const previousRoomCount=L.R.length,nextRooms=[],groups=new Map();
 for(const c of cells){const list=groups.get(c.source.id)||[];list.push(c);groups.set(c.source.id,list);}
 for(const source of L.R){
  const list=(groups.get(source.id)||[]).sort((a,b)=>b.w*b.h-a.w*a.h);
  if(!list.length)fail('A room was lost during wall-network recognition; no changes were applied.');
  for(const item of source.furniture||[])if(!list.some(c=>item.x>=c.x-EPS&&item.y>=c.y-EPS&&item.x+item.w<=c.x+c.w+EPS&&item.y+item.h<=c.y+c.h+EPS))fail('A proposed wall would cut through existing furniture. Move furniture before recognizing this network.');
  for(let i=0;i<list.length;i++){
   const c=list[i],id=i===0?source.id:'f0-room-net-'+(nextRooms.length+1);
   const furniture=(source.furniture||[]).filter(item=>item.x>=c.x-EPS&&item.y>=c.y-EPS&&item.x+item.w<=c.x+c.w+EPS&&item.y+item.h<=c.y+c.h+EPS);
   const room={...clone(source),id,x:c.x,y:c.y,w:c.w,h:c.h,a:c.w*c.h,furniture};
   const preservesProgram=(source.furniture||[]).every(item=>item.x>=c.x-EPS&&item.y>=c.y-EPS&&item.x+item.w<=c.x+c.w+EPS&&item.y+item.h<=c.y+c.h+EPS);
   if(i>0||!preservesProgram){room.kind='Utility';room.name='Recognized Utility '+(i+1);room.furniture=[];}
   room.net=clearRect(room,L.W,L.D);if(i>0||!preservesProgram)autoFurnish(room,L);nextRooms.push(room);
  }
 }
 // Split an exterior window wherever a new orthogonal wall meets its host line.
 const windowPieces=[];
 for(const opening of L.O){
  const host=L.S.find(w=>w[5]===opening.wallId);
  if(opening.t!=='win'||!host){windowPieces.push(opening);continue;}
  const vertical=Math.abs(host[0]-host[2])<EPS,axis=vertical?1:0,lo=Math.min(opening.a[axis],opening.b[axis]),hi=Math.max(opening.a[axis],opening.b[axis]),cuts=[];
  for(const s of segs){const sv=Math.abs(s[0]-s[2])<EPS;if(sv===vertical)continue;if(vertical){const cut=s[1],spansHost=Math.min(s[0],s[2])<=host[0]+EPS&&Math.max(s[0],s[2])>=host[0]-EPS;if(spansHost&&cut>lo+EPS&&cut<hi-EPS)cuts.push(cut);}else{const cut=s[0],spansHost=Math.min(s[1],s[3])<=host[1]+EPS&&Math.max(s[1],s[3])>=host[1]-EPS;if(spansHost&&cut>lo+EPS&&cut<hi-EPS)cuts.push(cut);}}
  const unique=[...new Set(cuts)].sort((a,b)=>a-b);if(!unique.length){windowPieces.push(opening);continue;}
  const intervals=[];let cursor=lo;for(const cut of unique){const left=cut-.06;if(left-cursor>=.6-EPS)intervals.push([cursor,left]);cursor=cut+.06;}if(hi-cursor>=.6-EPS)intervals.push([cursor,hi]);
  if(intervals.length!==unique.length+1)fail('A new wall crosses an existing window too close to its end to preserve safe opening widths. Move or remove that window first.');
  intervals.forEach((range,index)=>{const piece=clone(opening);piece.id=opening.id+'-net-'+(index+1);piece.a=vertical?[host[0],range[0]]:[range[0],host[1]];piece.b=vertical?[host[0],range[1]]:[range[1],host[1]];windowPieces.push(piece);});
 }
 L.O=windowPieces;
 L.R=nextRooms;rebuildTopology(L);
 // Rebind every retained opening to the rooms that now physically touch its host wall.
 const contains=(r,p)=>p[0]>=r.x-EPS&&p[0]<=r.x+r.w+EPS&&p[1]>=r.y-EPS&&p[1]<=r.y+r.h+EPS;
 for(const o of L.O){
  const wall=L.S.find(w=>w[5]===o.wallId);if(!wall)fail('An existing opening lost its host wall during recognition.');
  const vertical=Math.abs(wall[0]-wall[2])<EPS,mid=[(o.a[0]+o.b[0])/2,(o.a[1]+o.b[1])/2],step=vertical?[.02,0]:[0,.02];
  const positive=L.R.find(r=>contains(r,[mid[0]+step[0],mid[1]+step[1]])),negative=L.R.find(r=>contains(r,[mid[0]-step[0],mid[1]-step[1]]));
  if(o.t==='win'){
   const inward=o.in|| (wall[4]?(vertical?[-1,0]:[0,1]):[0,0]),probe=[mid[0]+inward[0]*.02,mid[1]+inward[1]*.02],owner=L.R.find(r=>contains(r,probe));
   if(!owner)fail('An existing window cannot be assigned to a room after recognition. Move or remove that window first.');
   o.roomId=owner.id;delete o.connectedRoomIds;delete o.swingRoomId;
  }else{
   const inward=o.in||[0,0],probe=[mid[0]+inward[0]*.02,mid[1]+inward[1]*.02],owner=L.R.find(r=>contains(r,probe));
   if(o.ext){if(!owner)fail('An existing exterior entrance cannot be assigned to an interior room.');o.roomId=owner.id;o.swingRoomId=owner.id;delete o.connectedRoomIds;}
   else{if(!positive||!negative||positive.id===negative.id)fail('An existing door no longer connects two rooms after recognition. Move or remove that door first.');if(!owner||![positive.id,negative.id].includes(owner.id))fail('An existing door swing cannot be assigned to its adjacent rooms.');o.roomId=owner.id;o.swingRoomId=owner.id;o.connectedRoomIds=[positive.id,negative.id];}
  }
 }
 // Every new internal boundary receives a real, validator-visible connecting door.
 let doorSeq=0;
 for(let i=0;i<L.R.length;i++)for(let j=i+1;j<L.R.length;j++){
  const a=L.R[i],b=L.R[j],vertical=Math.abs(a.x+a.w-b.x)<EPS||Math.abs(b.x+b.w-a.x)<EPS,horizontal=Math.abs(a.y+a.h-b.y)<EPS||Math.abs(b.y+b.h-a.y)<EPS;
  let wall=null,lo=0,hi=0,axis=0;
  if(vertical){const x=Math.abs(a.x+a.w-b.x)<EPS?a.x+a.w:b.x+b.w;lo=Math.max(a.y,b.y);hi=Math.min(a.y+a.h,b.y+b.h);axis=1;if(hi>lo+EPS)wall=L.S.find(w=>!w[4]&&Math.abs(w[0]-x)<EPS&&Math.abs(w[2]-x)<EPS&&Math.abs(Math.min(w[1],w[3])-lo)<EPS&&Math.abs(Math.max(w[1],w[3])-hi)<EPS);}
  else if(horizontal){const y=Math.abs(a.y+a.h-b.y)<EPS?a.y+a.h:b.y+b.h;lo=Math.max(a.x,b.x);hi=Math.min(a.x+a.w,b.x+b.w);axis=0;if(hi>lo+EPS)wall=L.S.find(w=>!w[4]&&Math.abs(w[1]-y)<EPS&&Math.abs(w[3]-y)<EPS&&Math.abs(Math.min(w[0],w[2])-lo)<EPS&&Math.abs(Math.max(w[0],w[2])-hi)<EPS);}
  if(!wall)continue;
  const existing=L.O.some(o=>o.t!=='win'&&o.wallId===wall[5]&&Math.min(Math.max(o.a[axis],o.b[axis]),hi)-Math.max(Math.min(o.a[axis],o.b[axis]),lo)>=.7-EPS);
  if(existing)continue;
  const occupied=L.O.filter(o=>o.wallId===wall[5]).map(o=>[Math.min(o.a[axis],o.b[axis]),Math.max(o.a[axis],o.b[axis])]);
  const width=Math.min(.9,hi-lo-.2);if(width<.7-EPS)fail('A new room boundary is too short to provide a valid internal door. Widen the boundary before recognition.');
  let centre=(lo+hi)/2;
  for(const [u,v] of occupied)if(centre+width/2>u-.1&&centre-width/2<v+.1)centre=Math.max(lo+width/2+.1,Math.min(hi-width/2-.1,v+.1+width/2));
  const start=centre-width/2,end=centre+width/2;
  if(start<lo+EPS||end>hi-EPS||occupied.some(([u,v])=>Math.min(end,v)-Math.max(start,u)>EPS))fail('There is no clear opening span for an automatic connecting door. Move nearby openings first.');
  let chosen=null;const base=(vertical?wall[0]:wall[1]);
  for(let c=lo+width/2+.05;c<=hi-width/2-.05+EPS&&!chosen;c+=.1){const aa=c-width/2,bb=c+width/2,mid=vertical?[wall[0],c]:[c,wall[1]],p1=vertical?[wall[0],aa]:[aa,wall[1]],p2=vertical?[wall[0],bb]:[bb,wall[1]];
   for(const owner of [a,b]){const other=owner===a?b:a,inward=vertical?(owner.x+owner.w/2<base?[-1,0]:[1,0]):(owner.y+owner.h/2<base?[0,-1]:[0,1]),px=p1[0]+inward[0]*width,py=p1[1]+inward[1]*width,box={x:Math.min(p1[0],p2[0],px),y:Math.min(p1[1],p2[1],py),w:Math.max(p1[0],p2[0],px)-Math.min(p1[0],p2[0],px),h:Math.max(p1[1],p2[1],py)-Math.min(p1[1],p2[1],py)};
    const approach=vertical?{x:mid[0]+(inward[0]<0?-0.6:0),y:c-width/2-.15,w:.6,h:width+.3}:{x:c-width/2-.15,y:mid[1]+(inward[1]<0?-.6:0),w:width+.3,h:.6};
    const fits=box.x>=owner.x-EPS&&box.y>=owner.y-EPS&&box.x+box.w<=owner.x+owner.w+EPS&&box.y+box.h<=owner.y+owner.h+EPS&&!((owner.furniture||[]).some(it=>Math.min(box.x+box.w,it.x+it.w)-Math.max(box.x,it.x)>EPS&&Math.min(box.y+box.h,it.y+it.h)-Math.max(box.y,it.y)>EPS))&&!((owner.furniture||[]).some(it=>Math.min(approach.x+approach.w,it.x+it.w)-Math.max(approach.x,it.x)>EPS&&Math.min(approach.y+approach.h,it.y+it.h)-Math.max(approach.y,it.y)>EPS));
    if(fits){chosen={owner,inward,p1,p2};break;}
   }
  }
  if(!chosen)fail('No safe door-swing and approach position is available on a new room boundary. Move nearby furniture or widen the wall span.');
  const {owner,inward,p1,p2}=chosen;
  L.O.push({id:'editor-network-door-'+(++doorSeq)+'-'+a.id+'-'+b.id,wallId:wall[5],t:'door',ext:0,a:p1,b:p2,in:inward,n:[-inward[0],-inward[1]],roomId:owner.id,swingRoomId:owner.id,connectedRoomIds:[a.id,b.id],sill:0,head:2.1});
 }
 g.editorAuthored=true;
 return {roomsCreated:Math.max(0,L.R.length-previousRoomCount),recognizedRooms:L.R.length,doorsAdded:doorSeq};
}
function recognizeRoomBoundary(g,op){
 const L=g.floors[0].L,room=L.R.find(r=>r.id===String(op.roomId)&&!r.hall),pts=op.points;
 if(!room||!Array.isArray(pts)||pts.length!==5||pts.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))fail('Draw a closed four-corner boundary inside one selected room.');
 if(Math.hypot(pts[0][0]-pts[4][0],pts[0][1]-pts[4][1])>EPS)fail('The room boundary must be closed: its last point must meet its first point.');
 const xs=[...new Set(pts.slice(0,4).map(p=>p[0]))].sort((a,b)=>a-b),ys=[...new Set(pts.slice(0,4).map(p=>p[1]))].sort((a,b)=>a-b);
 if(xs.length!==2||ys.length!==2||pts.slice(0,4).some((p,i)=>{const q=pts[(i+1)%4];return Math.abs(p[0]-q[0])>EPS&&Math.abs(p[1]-q[1])>EPS;}))fail('Automatic recognition currently supports closed, orthogonal rectangular room boundaries.');
 const [x1,x2]=xs,[y1,y2]=ys,attachedRight=Math.abs(x2-(room.x+room.w))<EPS&&Math.abs(y1-room.y)<EPS&&Math.abs(y2-(room.y+room.h))<EPS,attachedBottom=Math.abs(y2-(room.y+room.h))<EPS&&Math.abs(x1-room.x)<EPS&&Math.abs(x2-(room.x+room.w))<EPS;
 if(!attachedRight&&!attachedBottom)fail('For automatic room creation, draw a closed rectangle that meets one complete side of the selected room. This keeps the remaining floor zoning rectangular and connected.');
 const axis=attachedRight?'x':'y',position=attachedRight?x1:y1;if(position<(attachedRight?room.x:room.y)+1.5-EPS)fail('The recognized room must be at least 1.5 m wide.');
 splitRoom(g,{...op,axis,position});return true;
}
export function applyGeometryEdit(source,op){
 const g=clone(source),f=g.floors?.[0],L=f?.L;
 if(!L)fail('Only the current single-storey residential model can be edited.');
 if(!op||typeof op!=='object')fail('Choose an editing operation.');
 if(op.type==='resize-room-edge'){
  const room=L.R.find(r=>r.id===String(op.roomId)&&!r.hall),edge=String(op.edge||'');if(!room||!['left','right','top','bottom'].includes(edge))fail('Select a room and one of its four edges.');
  const vertical=edge==='left'||edge==='right',coord=edge==='left'?room.x:edge==='right'?room.x+room.w:edge==='top'?room.y:room.y+room.h,lo=vertical?room.y:room.x,hi=vertical?room.y+room.h:room.x+room.w;
  const wall=L.S.find(w=>Math.abs(w[vertical?0:1]-coord)<EPS&&Math.abs(w[vertical?2:3]-coord)<EPS&&Math.abs(Math.min(w[vertical?1:0],w[vertical?3:2])-lo)<EPS&&Math.abs(Math.max(w[vertical?1:0],w[vertical?3:2])-hi)<EPS);
  if(!wall)fail('This edge is not a complete movable wall boundary.');op={...op,type:'move-wall',wallId:idOf(wall),delta:Number(op.delta)*(edge==='left'||edge==='top'?-1:1)};
 }
 const wall=L.S.find(w=>idOf(w)===String(op.wallId||''));
 if(op.type==='recognize-wall-network'){recognizeWallNetwork(g,op);
 }else if(op.type==='recognize-room-boundary'){recognizeRoomBoundary(g,op);
 }else if(op.type==='split-room'||op.type==='create-room'){splitRoom(g,op);
 }else if(op.type==='merge-rooms'){mergeRooms(g,op);
 }else if(op.type==='move-wall'){
  if(!wall||wall[4])fail('Select an internal partition wall, not an exterior wall.');
  const vertical=Math.abs(wall[0]-wall[2])<EPS,delta=Math.round(Number(op.delta)*4)/4;
  if(!Number.isFinite(delta)||Math.abs(delta)<.25||Math.abs(delta)>1)fail('Move a wall by 0.25–1.0 m, snapped to 0.25 m increments.');
  const coord=vertical?wall[0]:wall[1],a=Math.min(wall[vertical?1:0],wall[vertical?3:2]),b=Math.max(wall[vertical?1:0],wall[vertical?3:2]);
  const pair=L.R.filter(r=>(vertical?(Math.abs(r.x+r.w-coord)<EPS||Math.abs(r.x-coord)<EPS):(Math.abs(r.y+r.h-coord)<EPS||Math.abs(r.y-coord)<EPS)));
  const left=pair.find(r=>Math.abs((vertical?r.x+r.w:r.y+r.h)-coord)<EPS&&Math.abs((vertical?r.y:r.x)-a)<EPS&&Math.abs((vertical?r.y+r.h:r.x+r.w)-b)<EPS);
  const right=pair.find(r=>Math.abs((vertical?r.x:r.y)-coord)<EPS&&Math.abs((vertical?r.y:r.x)-a)<EPS&&Math.abs((vertical?r.y+r.h:r.x+r.w)-b)<EPS);
  if(!left||!right)fail('This wall is not a full shared rectangular room boundary and cannot be moved safely yet.');
  const next=coord+delta;
  if(vertical){if(next-left.x<(left.hall?1.2:1.5)||right.x+right.w-next<(right.hall?1.2:1.5))fail('Moving this wall would leave insufficient clear room or circulation width.');left.w+=delta;right.x+=delta;right.w-=delta;wall[0]=wall[2]=next;}
  else{if(next-left.y<(left.hall?1.2:1.5)||right.y+right.h-next<(right.hall?1.2:1.5))fail('Moving this wall would leave insufficient clear room or circulation depth.');left.h+=delta;right.y+=delta;right.h-=delta;wall[1]=wall[3]=next;}
  for(const w of L.S){if(w===wall)continue;for(const endpoint of [[0,1],[2,3]]){const x=w[endpoint[0]],y=w[endpoint[1]],along=vertical?y:x,fixed=vertical?x:y;if(Math.abs(fixed-coord)<EPS&&(Math.abs(along-a)<EPS||Math.abs(along-b)<EPS)){if(vertical)w[endpoint[0]]=next;else w[endpoint[1]]=next;}}}
  for(const o of L.O.filter(o=>o.wallId===idOf(wall))){if(vertical){o.a[0]=next;o.b[0]=next;}else{o.a[1]=next;o.b[1]=next;}}
  clampFurniture(g);
 }else if(op.type==='set-wall-properties'){
  if(!wall)fail('Select a wall first.');const thickness=Number(op.thickness),material=String(op.material||'plaster');
  if(!Number.isFinite(thickness)||thickness<.08||thickness>.5)fail('Wall thickness must be between 0.08 m and 0.50 m.');
  if(!['plaster','brick','concrete','timber','stone','glass'].includes(material))fail('Choose a supported wall material.');wall[6]=thickness;wall[7]=material;wall.thickness=thickness;wall.material=material;
 }else if(op.type==='edit-opening'){
  const opening=L.O.find(o=>o.id===String(op.openingId||''));if(!opening)fail('Select a door or window first.');const host=L.S.find(w=>w[5]===opening.wallId);if(!host)fail('The selected opening has no host wall.');
  const vertical=Math.abs(host[0]-host[2])<EPS,axis=vertical?1:0,lo=Math.min(host[axis],host[axis+2]),hi=Math.max(host[axis],host[axis+2]),width=Number(op.width??Math.hypot(opening.b[0]-opening.a[0],opening.b[1]-opening.a[1])),position=Number(op.position??(opening.a[axis]+opening.b[axis])/2),sill=Number(op.sill??opening.sill),head=Number(op.head??opening.head);
  if(!Number.isFinite(width)||width<(opening.t==='win'?.6:.7)||width>hi-lo-.1||!Number.isFinite(position)||!Number.isFinite(sill)||!Number.isFinite(head)||sill<0||head<=sill||head>g.height)fail('Check opening width, position, sill and head heights.');
  const start=position-width/2,end=position+width/2;if(start<lo+EPS||end>hi-EPS)fail('The opening must remain fully inside its host wall.');
  for(const other of L.O)if(other!==opening&&other.wallId===opening.wallId){const a=Math.min(other.a[axis],other.b[axis]),b=Math.max(other.a[axis],other.b[axis]);if(Math.min(end,b)-Math.max(start,a)>EPS&&Math.min(head,other.head)>Math.max(sill,other.sill))fail('This opening would overlap another opening.');}
  opening.a=vertical?[host[0],start]:[start,host[1]];opening.b=vertical?[host[0],end]:[end,host[1]];opening.sill=sill;opening.head=head;if(op.flipSwing&&opening.t!=='win'){opening.in=[-opening.in[0],-opening.in[1]];const mx=(start+end)/2,px=vertical?host[0]+opening.in[0]*.02:mx,py=vertical?mx:host[1]+opening.in[1]*.02,owner=L.R.find(r=>px>=r.x-EPS&&px<=r.x+r.w+EPS&&py>=r.y-EPS&&py<=r.y+r.h+EPS);if(!owner)fail('The opposite door swing has no adjacent room or circulation space.');opening.swingRoomId=owner.id;}
 }else if(op.type==='add-door'||op.type==='add-window'){
  if(!wall)fail('Select a valid wall first.');
  const vertical=Math.abs(wall[0]-wall[2])<EPS,lo=Math.min(wall[vertical?1:0],wall[vertical?3:2]),hi=Math.max(wall[vertical?1:0],wall[vertical?3:2]),width=op.type==='add-door'?.9:1.2,ext=Boolean(wall[4]);
  if(op.type==='add-door'&&ext)fail('Doors can only be added to internal partition walls.');
  if(op.type==='add-window'&&!ext)fail('Windows can only be added to exterior walls.');
  const axis=vertical?1:0,occupied=L.O.filter(o=>o.wallId===idOf(wall)).map(o=>[Math.min(o.a[axis],o.b[axis]),Math.max(o.a[axis],o.b[axis])]).sort((a,b)=>a[0]-b[0]);
  const adjacent=L.R.filter(r=>!r.hall&&(vertical?(Math.abs(r.x+r.w-wall[0])<EPS||Math.abs(r.x-wall[0])<EPS):(Math.abs(r.y+r.h-wall[1])<EPS||Math.abs(r.y-wall[1])<EPS)));
  let best=null;
  for(const candidate of adjacent){const start=Math.max(lo,vertical?candidate.y:candidate.x),end=Math.min(hi,vertical?candidate.y+candidate.h:candidate.x+candidate.w);let cursor=start;
   for(const [a0,b0] of [...occupied,[end,end]]){const gapEnd=Math.min(a0,end);if(gapEnd-cursor>=width+.4&&(!best||gapEnd-cursor>best.length))best={start:cursor+.2,end:gapEnd-.2,length:gapEnd-cursor-.4};if(b0>cursor)cursor=Math.min(end,b0);if(cursor>=end)break;}}
  if(!best)fail('There is no clear section of this wall long enough for the selected opening.');
  const requested=Number(op.position),mid=Number.isFinite(requested)?Math.max(best.start+width/2,Math.min(best.end-width/2,requested)):(best.start+best.end)/2,start=mid-width/2,end=mid+width/2;
  const a=vertical?[wall[0],start]:[start,wall[1]],b=vertical?[wall[0],end]:[end,wall[1]],point=(start+end)/2;
  const room=adjacent.find(r=>point>=(vertical?r.y:r.x)-EPS&&point<=(vertical?r.y+r.h:r.x+r.w)+EPS);
  if(!room)fail('Could not identify a room connected to this wall.');
  const inward=vertical?(room.x+room.w/2<wall[0]?[-1,0]:[1,0]):(room.y+room.h/2<wall[1]?[0,-1]:[0,1]);
  L.O.push({id:'editor-opening-'+(L.O.length+1),wallId:idOf(wall),t:op.type==='add-door'?'door':'win',ext:ext?1:0,a,b,in:inward,n:[-inward[0],-inward[1]],roomId:room.id,sill:op.type==='add-door'?0:.9,head:2.1});
 }else if(op.type==='rename-room'){
  const room=L.R.find(r=>r.id===String(op.roomId||'')&&!r.hall);if(!room)fail('Select a room first.');
  const name=String(op.name||'').trim();if(!name||name.length>40)fail('Room names must be 1–40 characters.');room.name=name;
 }else if(op.type==='add-furniture'){
  const room=L.R.find(r=>r.id===String(op.roomId||'')&&!r.hall);if(!room)fail('Select an editable room first.');
  const type=String(op.itemType||''),spec=furnitureSpec[type],allowed={Bed:['bed','wardrobe','desk','storage'],Bath:['shower','toilet','basin'],Living:['sofa','dining table','kitchen counter','storage'],Study:['desk','storage'],Kitchen:['kitchen counter','storage'],Dining:['dining table','storage'],Utility:['storage']};if(!spec||!(allowed[room.kind]||[]).includes(type))fail('Choose furniture or a fixture appropriate to the selected room type.');
  const w=op.rotate?spec.h:spec.w,h=op.rotate?spec.w:spec.h,x=Number(op.x),y=Number(op.y);
  if(!Number.isFinite(x)||!Number.isFinite(y))fail('Place the furniture inside the selected room.');
  room.furniture=room.furniture||[];room.furniture.push({id:room.id+'-placed-'+(room.furniture.length+1)+'-'+Date.now().toString(36),type,x,y,w,h,height:spec.height});
 }else if(op.type==='move-furniture'||op.type==='remove-furniture'){
  const {room,item}=roomAndItem(g,op.roomId,op.itemId);if(!item)fail('Select a furniture item first.');
  if(op.type==='remove-furniture')room.furniture=room.furniture.filter(x=>x.id!==item.id);
  else{const x=Number(op.x),y=Number(op.y);if(!Number.isFinite(x)||!Number.isFinite(y))fail('Choose a valid furniture position.');item.x=x;item.y=y;}
 }else fail('Unsupported editor operation.');
 refreshRooms(g);
 const result=validateGeometry(g);
 if(result.criticalCount)fail('Edit rejected by independent geometry validation: '+result.issues.filter(i=>i.severity==='critical').slice(0,3).map(i=>i.code+': '+i.message+' ['+(i.elementIds||[]).join(', ')+']').join(' '));
 return g;
}