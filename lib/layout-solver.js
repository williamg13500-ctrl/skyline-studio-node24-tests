// Bounded rectilinear constraint search. Planning targets are not building regulations.
const EPS=1e-6,HW=1.2;
const specs={Bed:{min:9,side:2.4,aspect:1.9,max:26},Bath:{min:3.6,side:1.5,aspect:2.3,max:10},Living:{min:22,side:3.2,aspect:2,max:65},Entry:{min:3,side:1.25,aspect:2.4,max:12},Study:{min:6,side:2.1,aspect:2,max:18},Kitchen:{min:7,side:2.1,aspect:2,max:22},Dining:{min:8,side:2.3,aspect:2,max:24},Utility:{min:3,side:1.4,aspect:2.3,max:16}};
export function targetBounds(kind){const s=specs[kind];return s?[s.min,s.max]:null;}
export function roomLimits(room){const s=specs[room.kind];return {...s,min:Math.max(s.min,room.a*.75),max:Math.min(s.max,Math.max(s.min,room.a*1.25))};}
export function clearRect(r,W,D){const l=r.x<EPS?.15:.06,t=r.y<EPS?.15:.06,rr=r.x+r.w>W-EPS?.15:.06,b=r.y+r.h>D-EPS?.15:.06;return {x:r.x+l,y:r.y+t,w:r.w-l-rr,h:r.h-t-b,area:(r.w-l-rr)*(r.h-t-b)};}
export function spaceProgram(v){
 const custom=v.rooms?.map(r=>({name:r.name,kind:r.kind,a:r.weight}));
 const privateRooms=custom||[...Array.from({length:v.beds},(_,i)=>({name:'Bedroom '+(i+1),kind:'Bed',a:i?12:15})),...Array.from({length:v.baths},(_,i)=>({name:'Bathroom '+(i+1),kind:'Bath',a:5.5})),...(v.study?[{name:'Study',kind:'Study',a:9}]:[])];
 const rooms=[...privateRooms];if(!rooms.some(r=>r.kind==='Living'))rooms.push({name:'Living / dining / kitchen',kind:'Living',a:30+v.beds*2});return rooms.map((r,i)=>({...r,key:i}));
}
function leaf(room,box,W,D){const net=clearRect(box,W,D),s=roomLimits(room),area=net.area,aspect=Math.max(net.w/net.h,net.h/net.w);
 if(Math.min(net.w,net.h)<s.side-EPS||area<s.min-EPS||area>s.max+EPS||aspect>s.aspect+EPS)return null;
 if(['Living','Bed','Study'].includes(room.kind)&&!(box.x<EPS||box.y<EPS||box.x+box.w>W-EPS||box.y+box.h>D-EPS))return null;
 if(room.kind==='Entry'&&Math.abs(box.y+box.h-D)>EPS)return null;
 return {score:Math.abs(area-room.a)/room.a+Math.max(0,aspect-1.3)*.25,R:[{...room,...box,net}],halls:[]};
}
const sum=(rooms,key)=>rooms.reduce((n,r)=>n+(key==='a'?r.a:roomLimits(r)[key]),0);
export function solveLayouts(v){
 const rooms=spaceProgram(v),gross=v.W*v.D;
 if(rooms.length>12||gross<sum(rooms,'min')/.8||gross>sum(rooms,'max')/.64)return [];
 const privateRooms=rooms.filter(r=>!['Living','Entry'].includes(r.kind)),living=rooms.find(r=>r.kind==='Living'),entry=rooms.find(r=>r.kind==='Entry');
 const orders=[];const sorted=[...privateRooms].sort((a,b)=>b.a-a.a);
 for(let k=0;k<Math.min(6,privateRooms.length+1);k++){let p=k===0?privateRooms:k===1?[...sorted]:[...privateRooms.slice(k-1),...privateRooms.slice(0,k-1)];orders.push([...p,living,entry].filter(Boolean));orders.push([living,...p,entry].filter(Boolean));}
 const candidates=[];
 for(let attempt=0;attempt<orders.length*2;attempt++){
  const order=orders[Math.floor(attempt/2)],axis=attempt%2;let budget=1500;const memo=new Map();
  function search(rs,box,ax,access={},root=false){
   if(--budget<0)return null;
   if(rs.length===1)return leaf(rs[0],box,v.W,v.D);
   const available=box.w*box.h;if(available<sum(rs,'min')/.95||available>sum(rs,'max')/.5)return null;
   const key=rs.map(r=>r.key).join(',')+'|'+[box.x,box.y,box.w,box.h,ax].map(x=>x.toFixed(2)).join(',')+JSON.stringify(access);if(memo.has(key))return memo.get(key);
   let best=null;
   const cuts=Array.from({length:rs.length-1},(_,i)=>i+1).sort((a,b)=>Math.abs(sum(rs.slice(0,a),'a')/sum(rs,'a')-.5)-Math.abs(sum(rs.slice(0,b),'a')/sum(rs,'a')-.5));
   for(const direction of root?[ax]:[ax,1-ax])for(const gap of root?[HW]:[0,HW]){
    if(gap&&!root&&!(direction===0?(access.N||access.S):(access.W||access.E)))continue;
    const aa=direction===0?{N:access.N,S:access.S,W:access.W,E:Boolean(gap)}:{N:access.N,S:Boolean(gap),W:access.W,E:access.E};
    const bb=direction===0?{N:access.N,S:access.S,W:Boolean(gap),E:access.E}:{N:Boolean(gap),S:access.S,W:access.W,E:access.E};
    if(!Object.values(aa).some(Boolean)||!Object.values(bb).some(Boolean))continue;
    const extent=direction===0?box.w:box.h;
    for(const cut of cuts){const a=rs.slice(0,cut),b=rs.slice(cut),ideal=sum(a,'a')/sum(rs,'a');
     for(const delta of [0,-.06,.06]){const ratio=Math.max(.12,Math.min(.88,ideal+delta)),first=(extent-gap)*ratio,last=extent-gap-first;
      if(Math.min(first,last)<1.5)continue;
      const left=direction===0?{...box,w:first}:{...box,h:first},right=direction===0?{...box,x:box.x+first+gap,w:last}:{...box,y:box.y+first+gap,h:last};
      const one=search(a,left,1-direction,aa);if(!one)continue;const two=search(b,right,1-direction,bb);if(!two)continue;
      const hall=direction===0?{x:box.x+first,y:box.y,w:gap,h:box.h}:{x:box.x,y:box.y+first,w:box.w,h:gap};
      const score=one.score+two.score+hall.w*hall.h/gross*4;
      if(!best||score<best.score)best={score,R:[...one.R,...two.R],halls:[...(gap?[hall]:[]),...one.halls,...two.halls]};
     }
    }
   }
   memo.set(key,best);return best;
  }
  const result=search(order,{x:0,y:0,w:v.W,h:v.D},axis,{},true);if(!result)continue;
  const hallArea=result.halls.reduce((n,r)=>n+r.w*r.h,0);if(hallArea/gross>.32)continue;
  const signature=result.R.map(r=>[r.key,r.x.toFixed(1),r.y.toFixed(1),r.w.toFixed(1),r.h.toFixed(1)].join(':')).join('|');
  if(!candidates.some(c=>c.signature===signature))candidates.push({...result,signature,hallArea});
 }
 candidates.sort((a,b)=>a.score-b.score);return candidates.slice(0,12);
}
function shared(a,b){
 if(Math.abs(a.x+a.w-b.x)<EPS||Math.abs(b.x+b.w-a.x)<EPS){const x=Math.abs(a.x+a.w-b.x)<EPS?b.x:a.x,lo=Math.max(a.y,b.y),hi=Math.min(a.y+a.h,b.y+b.h);if(hi-lo>EPS)return [x,lo,x,hi,0];}
 if(Math.abs(a.y+a.h-b.y)<EPS||Math.abs(b.y+b.h-a.y)<EPS){const y=Math.abs(a.y+a.h-b.y)<EPS?b.y:a.y,lo=Math.max(a.x,b.x),hi=Math.min(a.x+a.w,b.x+b.w);if(hi-lo>EPS)return [lo,y,hi,y,0];}
 return null;
}
function opening(w,r,width,ratio=.5){const vertical=Math.abs(w[0]-w[2])<EPS,len=Math.hypot(w[2]-w[0],w[3]-w[1]),start=.18+(len-width-.36)*ratio;
 if(len<width+.36)return null;
 const a=vertical?[w[0],Math.min(w[1],w[3])+start]:[Math.min(w[0],w[2])+start,w[1]],b=vertical?[a[0],a[1]+width]:[a[0]+width,a[1]];
 const inward=vertical?[r.x>=w[0]-EPS?1:-1,0]:[0,r.y>=w[1]-EPS?1:-1];return {a,b,in:inward};
}
export function swingBox(o){const width=Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1]),leaf=[o.a[0]+o.in[0]*width,o.a[1]+o.in[1]*width],x=Math.min(o.a[0],o.b[0],leaf[0]),y=Math.min(o.a[1],o.b[1],leaf[1]);return {x,y,w:Math.max(o.a[0],o.b[0],leaf[0])-x,h:Math.max(o.a[1],o.b[1],leaf[1])-y};}
const overlaps=(a,b,gap=0)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>-gap&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>-gap;
const furniture={Bed:[['bed',1.5,2,.55],['wardrobe',1.2,.6,2.1]],Bath:[['shower',.9,.9,.12],['toilet',.65,.75,.45],['basin',.6,.45,.8]],Living:[['sofa',2.1,.9,.8],['dining table',1.4,.8,.75],['kitchen counter',2.8,.6,.9]],Entry:[],Study:[['desk',1.2,.6,.75]],Kitchen:[['kitchen counter',2.8,.6,.9]],Dining:[['dining table',1.4,.8,.75]],Utility:[['storage',1.2,.6,1.8]]};
function furnish(r,doors){const net=r.net,placed=[],blocked=doors.map(swingBox),items=furniture[r.kind]||[];
 function pack(index){if(index===items.length)return true;const [type,ww,hh,height]=items[index];
  for(const [w,h]of [[ww,hh],[hh,ww]])for(const fromRight of [false,true])for(const fromBottom of [false,true]){
   for(let dx=0;dx<=net.w-w+EPS;dx+=.3)for(let dy=0;dy<=net.h-h+EPS;dy+=.3){const x=fromRight?net.x+net.w-w-dx:net.x+dx,y=fromBottom?net.y+net.h-h-dy:net.y+dy,obj={type,x,y,w,h,height};
    if(blocked.some(b=>overlaps(obj,b,.03))||placed.some(b=>overlaps(obj,b,.08)))continue;placed.push(obj);if(pack(index+1))return true;placed.pop();
   }
  }return false;
 }
 return pack(0)?placed:null;
}
export function compileLayout(candidate,v){
 const R=candidate.R.map(r=>({...r})),S=[[0,0,v.W,0,1],[v.W,0,v.W,v.D,1],[v.W,v.D,0,v.D,1],[0,v.D,0,0,1]],E=[],O=[];
 candidate.halls.forEach((r,i)=>R.push({...r,name:i===0?'Entry / hall':'Hall '+(i+1),kind:'Hall',hall:1}));R.forEach((r,i)=>r.id='f0-room-'+(i+1));
 for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){const edge=shared(R[i],R[j]);if(!edge)continue;if(R[i].hall&&R[j].hall)E.push(edge);else S.push(edge);}
 S.forEach((w,i)=>{w.id='f0-wall-'+(i+1);w[5]=w.id;});
 for(const r of R.filter(r=>!r.hall)){
  const hosts=R.filter(h=>h.hall).map(h=>shared(r,h)).filter(Boolean).sort((a,b)=>Math.hypot(b[2]-b[0],b[3]-b[1])-Math.hypot(a[2]-a[0],a[3]-a[1]));if(!hosts.length)return null;
  let accepted=null;
  for(const host of hosts)for(const ratio of [.2,.8,.5]){
   const door=opening(host,r,r.kind==='Bath'?.8:.9,ratio);if(!door)continue;door.t='door';door.roomId=r.id;
   const doors=[door];if(r.kind==='Entry'){
    const outer=[r.x,v.D,r.x+r.w,v.D,1],entrance=opening(outer,r,1,1-ratio);if(!entrance)continue;entrance.t='entry';entrance.ext=1;entrance.n=[0,1];entrance.roomId=r.id;if(overlaps(swingBox(door),swingBox(entrance),.05))continue;doors.push(entrance);
   }
   const items=furnish(r,doors);if(!items)continue;accepted={doors,items};break;
  }
  if(!accepted)return null;O.push(...accepted.doors);r.furniture=accepted.items.map((obj,i)=>({...obj,id:r.id+'-item-'+(i+1)}));
  const exteriors=[];if(r.x<EPS)exteriors.push({w:[0,r.y,0,r.y+r.h],n:[-1,0]});if(r.y<EPS)exteriors.push({w:[r.x,0,r.x+r.w,0],n:[0,-1]});if(r.x+r.w>v.W-EPS)exteriors.push({w:[v.W,r.y,v.W,r.y+r.h],n:[1,0]});if(r.y+r.h>v.D-EPS&&r.kind!=='Entry')exteriors.push({w:[r.x,v.D,r.x+r.w,v.D],n:[0,1]});
  if(r.kind!=='Entry')for(const edge of exteriors){const len=Math.hypot(edge.w[2]-edge.w[0],edge.w[3]-edge.w[1]),win=opening(edge.w,r,Math.min(3.2,len*.65),.5);if(win)O.push({...win,t:'win',ext:1,n:edge.n,roomId:r.id});}
 }
 const root=R.find(r=>r.hall);const edge=Math.abs(root.y)<EPS&&Math.abs(root.y+root.h-v.D)<EPS?[root.x,v.D,root.x+root.w,v.D,1]:[v.W,root.y,v.W,root.y+root.h,1];const vertical=Math.abs(edge[0]-edge[2])<EPS;const a=vertical?[edge[0],root.y+.15]:[root.x+.15,edge[1]],b=vertical?[a[0],a[1]+.9]:[a[0]+.9,a[1]];O.push({t:'entry',ext:1,a,b,in:vertical?[-1,0]:[0,-1],n:vertical?[1,0]:[0,1],roomId:root.id});
 O.forEach((o,i)=>{o.id='f0-opening-'+(i+1);o.sill=o.t==='win'?.9:0;o.head=2.1;const w=S.find(w=>point(o.a,w)&&point(o.b,w));o.wallId=w?.id;});
 return {W:v.W,D:v.D,R,S,O,E};
}
function point(p,w){return Math.abs(w[0]-w[2])<EPS?Math.abs(p[0]-w[0])<EPS&&p[1]>=Math.min(w[1],w[3])-EPS&&p[1]<=Math.max(w[1],w[3])+EPS:Math.abs(p[1]-w[1])<EPS&&p[0]>=Math.min(w[0],w[2])-EPS&&p[0]<=Math.max(w[0],w[2])+EPS;}