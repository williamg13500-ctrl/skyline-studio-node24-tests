import { solveLayouts, compileLayout, targetBounds, clearRect } from './layout-solver.js';
import { validateGeometry, pointOnWall } from './validation.js';
const f1 = v => v.toFixed(1);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { Entry: '#3a3a38', Living: '#3b4048', Bed: '#42403a', Bath: '#34444a', Study: '#403a45', Hall: '#2a2b2e', Land: '#33353a' };
const FLC = { Entry: '#77736a', Living: '#8a8576', Bed: '#7d7667', Bath: '#6f8b93', Study: '#857a8c', Hall: '#6b685f', Land: '#7a7a80' };
export class InputError extends Error { constructor(fields,status=400) { super('Check the project brief.'); this.fields=fields;this.status=status; } }
export function parseBrief(b = {}) {
  const errors = {};
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new InputError({brief:'Expected a project brief.'});
  const number = (key,min,max,integer=false) => {
    const raw=b[key], n=Number(raw);
    if(raw===null || typeof raw==='boolean' || (typeof raw!=='number' && typeof raw!=='string') || String(raw).trim()==='' || !Number.isFinite(n) || n<min || n>max || (integer&&!Number.isInteger(n)))errors[key]=`Enter ${integer?'a whole number':'a number'} from ${min} to ${max}.`;
    return n;
  };
  const v={name:typeof b.name==='string'?b.name.trim():'',W:number('W',6,40),D:number('D',6,40),storeys:number('storeys',1,3,true),beds:number('beds',1,5,true),baths:number('baths',1,4,true)};
  if(!v.name || v.name.length>60)errors.name='Enter a project name of 1–60 characters.';
  for(const key of ['study','roof','low']){if(b[key]!==undefined && typeof b[key]!=='boolean')errors[key]='Expected true or false.'; v[key]=b[key]===true;}
  v.style=b.style??'modern';
  if(!['modern','warm','traditional'].includes(v.style))errors.style='Choose modern, warm or traditional materials.';
  if(v.storeys>1)errors.storeys='New multi-storey generation is temporarily paused pending stair headroom, escape-route and floor-coordination verification. Existing saved projects are preserved.';
  v.layoutOption=b.layoutOption===undefined?0:number('layoutOption',0,2,true);
  if(b.rooms!==undefined){
   if(!Array.isArray(b.rooms)||b.rooms.length<1||b.rooms.length>12)errors.rooms='Supply 1–12 room program entries.';
   else v.rooms=b.rooms.map((r,i)=>{
    if(!r||typeof r!=='object') {errors.rooms='Invalid room entry.';return {};}
    const room={name:typeof r.name==='string'?r.name.trim():'',kind:r.kind,floor:Number(r.floor),weight:Number(r.weight)};
    if(!room.name||room.name.length>40||!['Bed','Bath','Study','Living','Kitchen','Dining','Utility'].includes(room.kind)||!Number.isInteger(room.floor)||room.floor<0||room.floor>=v.storeys||!Number.isFinite(room.weight)||room.weight<3||room.weight>120)errors.rooms='Each room needs a name, supported type, existing floor and target area from 3–120 m².';
    const bounds=targetBounds(room.kind);if(bounds&&(room.weight<bounds[0]||room.weight>bounds[1]))errors.rooms=`Target clear area for ${room.name} must be ${bounds[0]}–${bounds[1]} m² under the studio room-type limits.`;
    return room;
   });
   if(v.rooms)for(let k=0;k<v.storeys;k++)if(!v.rooms.some(r=>r.floor===k))errors.rooms='Every floor must contain at least one programmed room.';
   if(v.rooms&&v.rooms.filter(r=>r.kind==='Bed').length!==v.beds)errors.rooms='Custom bedroom count must match Bedrooms.';
   if(v.rooms&&v.rooms.filter(r=>r.kind==='Bath').length!==v.baths)errors.rooms='Custom bathroom count must match Bathrooms.';
  }
  if(Object.keys(errors).length)throw new InputError(errors,v.storeys>1?422:400);
  return v;
}
function svgPlan(L, label, v) {
  const { W, D } = L, m = 2.4, vw = W + 2 * m, vh = D + m + 4;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" font-family="DM Sans,Arial,sans-serif"><rect width="${vw}" height="${vh}" fill="#191a1d"/><g transform="translate(${m} ${m})">`;
  L.R.forEach(r => s += `<rect role="button" tabindex="0" aria-label="Inspect ${esc(r.name)}, ${f1(r.net?.area??r.w*r.h)} square metres" data-element-id="${r.id}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${COL[r.kind]||'#403d38'}"/>`);
  L.E.forEach(e => s += `<line x1="${e[0]}" y1="${e[1]}" x2="${e[2]}" y2="${e[3]}" stroke="#6f6a5f" stroke-width=".04" stroke-dasharray=".25 .2"/>`);
  L.S.forEach(g => s += `<line data-element-id="${g.id}" role="button" tabindex="0" aria-label="${g[4] ? "Exterior wall" : "Internal partition"} ${g.id}" x1="${g[0]}" y1="${g[1]}" x2="${g[2]}" y2="${g[3]}" stroke="${({brick:"#a96f58",concrete:"#96999a",timber:"#9b7652",stone:"#aaa394",glass:"#9fc3d6"}[g.material]||"#e6dfd0")}" stroke-width="${g.thickness||(g[4] ? .3 : .12)}" stroke-linecap="square"/>`);
  L.O.forEach(o => {
    const t = o.ext ? .3 : .12, a = o.a, b = o.b;
    s += `<line data-element-id="${o.id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#191a1d" stroke-width="${t + .04}"/>`;
    if (o.t == 'win') s += `<line data-element-id="${o.id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#9fc3d6" stroke-width="${t * .35}"/>`;
    else {
      const w = Math.hypot(b[0] - a[0], b[1] - a[1]), i = o.in, le = [a[0] + i[0] * w, a[1] + i[1] * w], cr = (b[0] - a[0]) * i[1] - (b[1] - a[1]) * i[0];
      s += `<line data-element-id="${o.id}" x1="${a[0]}" y1="${a[1]}" x2="${le[0]}" y2="${le[1]}" stroke="#c7a875" stroke-width=".05"/><path d="M${le[0]} ${le[1]} A${w} ${w} 0 0 ${cr > 0 ? 0 : 1} ${b[0]} ${b[1]}" fill="none" stroke="#c7a875" stroke-width=".03"/>`;
    }
  });
  if(v.storeys>1){const x=.6,y=D-5.4;for(let i=0;i<=8;i++)s+=`<path d="M${x} ${y+i*.28}h1.1 M${x+1.3} ${y+i*.28}h1.1" stroke="#c7a875" stroke-width=".04"/>`;s+=`<rect x="${x}" y="${y+2.24}" width="2.4" height="1.2" fill="none" stroke="#c7a875" stroke-width=".05"/><text x="${x}" y="${y-.25}" font-size=".24" fill="#c7a875">18 risers · 164 mm · ${v.level===v.storeys-1?'DN':v.level===0?'UP':'UP / DN'}</text>`;}
  L.R.forEach(r=>(r.furniture||[]).forEach(item=>{const {x,y,w,h}=item;s+=`<g data-element-id="${item.id}" data-room-id="${r.id}" role="button" tabindex="0" aria-label="${esc(item.type)} in ${esc(r.name)}" stroke="#d7c8ad" stroke-width=".035"><title>${esc(item.type)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#6a665d"/>`;
   if(item.type==='bed')s+=h>=w?`<rect x="${x+.1}" y="${y+.1}" width="${w-.2}" height=".38" fill="none"/>`:`<rect x="${x+.1}" y="${y+.1}" width=".38" height="${h-.2}" fill="none"/>`;
   if(['toilet','basin'].includes(item.type))s+=`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w*.32}" ry="${h*.32}" fill="none"/>`;
   if(item.type==='shower')s+=`<path d="M${x} ${y}l${w} ${h} M${x+w} ${y}l${-w} ${h}"/>`;
   if(item.type==='wardrobe')s+=`<path d="M${x+w/2} ${y}v${h}"/>`;
   s+='</g>';}));
  L.R.forEach(r => {
    if(r.hall){const cx=r.x+r.w/2,cy=r.y+r.h/2;s+=`<text x="${cx}" y="${cy}" transform="rotate(${r.h>r.w?-90:0} ${cx} ${cy})" font-size=".22" text-anchor="middle" fill="#aaa8a2">${esc(r.name)}</text>`;return;} const fs = Math.min(.42, r.w / (r.name.length * .6), r.h / 3), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    s += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="${fs}" fill="#f1eee7">${esc(r.name)}</text><text x="${cx}" y="${cy + fs * 1.35}" text-anchor="middle" font-size="${fs * .85}" fill="#c7a875">${f1(r.net?.area??r.w*r.h)} m² clear</text><text x="${cx}" y="${cy+fs*2.6}" text-anchor="middle" font-size="${fs*.65}" fill="#ddd5c6">${r.net?f1(r.net.w)+' × '+f1(r.net.h)+' m clear':''}</text>`;
  });
  s += `<g stroke="#c7a875" stroke-width=".05" fill="#c7a875"><line x1="0" y1="-1" x2="${W}" y2="-1"/><line x1="0" y1="-1.25" x2="0" y2="-.75"/><line x1="${W}" y1="-1.25" x2="${W}" y2="-.75"/><text stroke="none" x="${W / 2}" y="-1.25" font-size=".4" text-anchor="middle">${W} m</text>` +
    `<line x1="-1" y1="0" x2="-1" y2="${D}"/><line x1="-1.25" y1="0" x2="-.75" y2="0"/><line x1="-1.25" y1="${D}" x2="-.75" y2="${D}"/><text stroke="none" transform="translate(-1.3 ${D / 2}) rotate(-90)" font-size=".4" text-anchor="middle">${D} m</text>` +
    `<line x1="0" y1="${D + 1.2}" x2="4" y2="${D + 1.2}"/><line x1="0" y1="${D + 1.05}" x2="0" y2="${D + 1.35}"/><line x1="4" y1="${D + 1.05}" x2="4" y2="${D + 1.35}"/><text stroke="none" x="2" y="${D + 1.0}" font-size=".32" text-anchor="middle">4 m</text>` +
    `<path stroke="none" d="M${W + 1} -1.4 L${W + .7} -.5 L${W + 1} -.75 L${W + 1.3} -.5Z"/><text stroke="none" x="${W + 1}" y="-1.6" font-size=".4" text-anchor="middle">N</text></g>` +
    `<text x="0" y="${D + 2.1}" font-size="${Math.min(.3,(W+1)/((v.name.length+label.length+3)*.6))}" fill="#aaa8a2">${esc(v.name)} · ${label}</text><text x="0" y="${D + 2.6}" font-size="${Math.min(.25,(W+1)/29)}" fill="#aaa8a2">Clear room dimensions exclude modelled wall thickness. Not surveyed.</text><text x="0" y="${D + 3.0}" font-size="${Math.min(.25,(W+1)/29)}" fill="#aaa8a2">Not for construction, permitting or engineering.</text></g></svg>`;
  return s;
}

function build3D(fl, v, roof, low) {
  const H = 2.7, SL = .25, F = [], W = v.W, D = v.D, hh = low ? 1.2 : H; let K = 0, FL = 0, sourceId = '';
  const add = (p, n, c, b) => F.push({ p, n, c, b: b || 0, k: K, fl: FL, sourceId });
  const box = (x0, x1, y0, y1, z0, z1, c) => {
    add([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c);
    add([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], c); add([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c);
    add([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], c); add([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], c);
  };
  fl.forEach((f, k) => {
    const z0 = k * (H + SL); K = k; FL = 1; if(k){const q=f.void;sourceId=f.id+'-slab';if(q){box(0,q.x,0,D,z0-SL,z0,'#bdb6a6');box(q.x+q.w,W,0,D,z0-SL,z0,'#bdb6a6');box(q.x,q.x+q.w,0,q.y,z0-SL,z0,'#bdb6a6');box(q.x,q.x+q.w,q.y+q.h,D,z0-SL,z0,'#bdb6a6');}else box(0,W,0,D,z0-SL,z0,'#bdb6a6');}
    f.L.R.forEach(r=>{sourceId=r.id;const face=(x,y,w,h)=>add([[x,y,z0+.01],[x+w,y,z0+.01],[x+w,y+h,z0+.01],[x,y+h,z0+.01]],[0,0,1],FLC[r.kind]||'#7d7667');const q=f.void;if(q&&q.x>=r.x&&q.x+q.w<=r.x+r.w&&q.y>=r.y&&q.y+q.h<=r.y+r.h){face(r.x,r.y,q.x-r.x,r.h);face(q.x+q.w,r.y,r.x+r.w-q.x-q.w,r.h);face(q.x,r.y,q.w,q.y-r.y);face(q.x,q.y+q.h,q.w,r.y+r.h-q.y-q.h);}else face(r.x,r.y,r.w,r.h);});
    if(k<fl.length-1){sourceId='stair-'+k;FL=0;const x=.6,y=D-5.4,rise=2.95/18;for(let i=0;i<8;i++){box(x,x+1.1,y+i*.28,y+(i+1)*.28,z0,z0+(i+1)*rise,'#b59d78');box(x+1.3,x+2.4,y+i*.28,y+(i+1)*.28,z0+9*rise,z0+(17-i)*rise,'#b59d78');}box(x,x+2.4,y+2.24,y+3.44,z0+8*rise,z0+9*rise,'#b59d78');box(x+1.3,x+2.4,y-.28,y,z0+17*rise,z0+18*rise,'#b59d78');FL=1;}
    FL = 0;
    f.L.R.forEach(r=>(r.furniture||[]).forEach(item=>{sourceId=item.id;box(item.x,item.x+item.w,item.y,item.y+item.h,z0+.02,z0+item.height,item.type==='shower'?'#84a6ad':item.type==='bed'?'#c3bfb2':'#a58f72');}));
    // Split wall solids around openings; 2D and 3D share these exact segments.
    f.L.S.forEach(g => {
      sourceId = g.id;
      const vertical = Math.abs(g[0]-g[2]) < 1e-7, axis = vertical ? 1 : 0;
      const lo = Math.min(g[axis],g[axis+2]), hi = Math.max(g[axis],g[axis+2]);
      const holes = f.L.O.filter(o=>o.wallId===g.id).sort((a,b)=>a.a[axis]-b.a[axis]);
      const thick = Number(g.thickness)||(g[4] ? .3 : .12),wallPalette={plaster:'#e8e2d6',brick:'#a96f58',concrete:'#96999a',timber:'#9b7652',stone:'#aaa394',glass:'#9fc3d6'},wallColor=wallPalette[g.material]||wallPalette.plaster;
      const piece = (a,b,zA,zB) => {
        if(b-a<1e-7 || zB-zA<1e-7)return;
        if(vertical)box(g[0]-thick/2,g[0]+thick/2,a,b,z0+zA,z0+zB,wallColor);
        else box(a,b,g[1]-thick/2,g[1]+thick/2,z0+zA,z0+zB,wallColor);
      };
      let cursor=lo;
      holes.forEach(o=>{const a=Math.max(lo,Math.min(o.a[axis],o.b[axis])),b=Math.min(hi,Math.max(o.a[axis],o.b[axis]));
        piece(cursor,a,0,hh);piece(a,b,0,Math.min(o.sill,hh));piece(a,b,Math.min(o.head,hh),hh);cursor=Math.max(cursor,b);});
      piece(cursor,hi,0,hh);
    });
    if (!low) f.L.O.forEach(o => {
      sourceId = o.id;const [nx,ny]=o.n||[0,0],e=.16,za=o.t==='win'?o.sill:0,zb=o.head,p=(q,z)=>[q[0]+nx*e,q[1]+ny*e,z0+z];
      if(o.ext)add([p(o.a,za),p(o.b,za),p(o.b,zb),p(o.a,zb)],[nx,ny,0],o.t==='win'?'#7fa3b5':'#2b2118',.3);
      if(o.t==='door'){const leafWidth=Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1]),leafEnd=[o.a[0]+o.in[0]*leafWidth,o.a[1]+o.in[1]*leafWidth],host=f.L.S.find(w=>w[5]===o.wallId),vertical=host&&Math.abs(host[0]-host[2])<1e-7,doorNormal=vertical?[0,1,0]:[1,0,0];add([[o.a[0],o.a[1],z0+.03],[leafEnd[0],leafEnd[1],z0+.03],[leafEnd[0],leafEnd[1],z0+Math.min(o.head,2.1)],[o.a[0],o.a[1],z0+Math.min(o.head,2.1)]],doorNormal,'#9b7652',.22);}
    });
  });
  sourceId = 'roof'; const top = (fl.length - 1) * (H + SL) + hh; K = fl.length; FL = 0; if (roof && !low) box(-.5, W + .5, -.5, D + .5, top, top + .25, '#d3cdbf');
  return { F, W, D, H: Math.max(top+.3,...F.flatMap(f=>f.p.map(p=>p[2]+.3))) };
}


function validLayouts(v,limit=3){
 const candidates=solveLayouts(v),valid=[];
 for(const candidate of candidates){const L=compileLayout(candidate,v);if(!L)continue;
  const geometry={schemaVersion:3,units:'m',height:2.7,brief:v,floors:[{id:'floor-0',label:'Ground floor',elevation:0,void:null,L}],stairs:[],solver:{version:'3.0.0',targetAreaTolerance:.25,score:candidate.score,circulationRatio:candidate.hallArea/(v.W*v.D)}};
  if(validateGeometry(geometry).criticalCount===0)valid.push(geometry);
  if(valid.length>=limit)break;
 }
 return valid;
}
function suggestFit(v){
 const ok=x=>validLayouts({...x,layoutOption:0},1).length>0,r5=n=>Math.round(n*2)/2,out=[];
 if(!v.rooms){
  const tries=[];for(let b=1;b<=5;b++)for(let a=Math.max(1,v.baths-1);a<=Math.min(4,v.baths+1);a++)if(b!==v.beds||a!==v.baths)tries.push([b,a,Math.abs(b-v.beds)*2+Math.abs(a-v.baths)]);
  tries.sort((x,y)=>x[2]-y[2]);let n=0;
  for(const [b,a] of tries){if(n>=2)break;if(ok({...v,beds:b,baths:a})){out.push(b+' bedroom'+(b>1?'s':'')+' and '+a+' bathroom'+(a>1?'s':'')+' at '+v.W+' \u00d7 '+v.D+' m');n++;}}
 }
 let n=0;
 for(const f of [.95,.9,.85,.8,.75,.7,.65,1.05,1.1,1.15,1.2,1.3,1.4,1.5]){if(n>=2)break;const W=r5(v.W*f),D=r5(v.D*f);if(W<6||D<6||W>40||D>40||(W===v.W&&D===v.D))continue;if(ok({...v,W,D})){out.push(W+' \u00d7 '+D+' m for this room program');n++;}}
 return out.length?' Nearby briefs that fit: '+out.join('; ')+'.':' No nearby combination was found; try a different footprint shape.';
}
export function createGeometry(v) {
 const valid=validLayouts(v);
 if(!valid.length)throw new InputError({fit:'No feasible layout was found within the studio limits for clear room sizes, proportions, exterior windows, circulation and furniture fit. Change the footprint or reduce the room program. Very large footprints also need a fuller program. This bounded solver cannot establish that no architectural solution exists.'+suggestFit(v)},422);
 if(v.layoutOption>=valid.length)throw new InputError({layoutOption:'That alternative is unavailable for this brief. Choose option 1.'},422);
 const selected=valid[v.layoutOption];selected.solver.alternatives=valid.map((g,i)=>({index:i,label:'Layout '+(i+1),score:Number(g.solver.score.toFixed(2)),circulationPercent:Number((g.solver.circulationRatio*100).toFixed(1)),clearRoomArea:Number(g.floors[0].L.R.filter(r=>!r.hall).reduce((n,r)=>n+r.net.area,0).toFixed(1))}));
 return selected;
}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
export async function revisionFor(geometry) {
 const bytes=new TextEncoder().encode(canonical(geometry));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function buildDraft(body) {
 const brief=parseBrief(body), geometry=createGeometry(brief);
 return buildDraftFromGeometry(geometry,brief);
}
function rejectGeometry(message,elementId=null,suggestion='Correct the geometry element and retry.'){
 const error=new InputError({geometry:message},422);error.elementId=elementId;error.suggestion=suggestion;throw error;
}
function validDirection(v){return Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&Math.abs(Math.hypot(v[0],v[1])-1)<.05;}
function normalizeGeometry(source,brief){
 const repairs=[],note=(field,element_id=null)=>repairs.push({field,element_id});
 if(!source||typeof source!=='object'||Array.isArray(source))rejectGeometry('The saved geometry record is missing or malformed.',null,'Open a valid saved revision or generate a new concept.');
 let g;try{g=JSON.parse(JSON.stringify(source));}catch{rejectGeometry('The saved geometry could not be read.',null,'Restore a valid saved revision.');}
 if(!Array.isArray(g.floors)||!g.floors.length)rejectGeometry('The geometry has no floor records.',null,'Generate a new concept or restore a complete saved revision.');
 if(!g.units){g.units='m';note('units');}if(!Number.isFinite(g.height)||g.height<=0){g.height=2.7;note('height');}g.brief=brief;if(!g.solver||typeof g.solver!=='object'){g.solver={};note('solver');}
 g.floors.forEach((floor,fi)=>{
  if(!floor||typeof floor!=='object'||!floor.L)rejectGeometry('A floor is missing its editable layout record.',floor?.id||null,'Restore a complete floor layout.');
  const L=floor.L;
  if(!Number.isFinite(L.W)||!Number.isFinite(L.D)||L.W<=0||L.D<=0)rejectGeometry('A floor has invalid footprint dimensions.',floor.id||null,'Restore valid positive width and depth values.');
  if(!Array.isArray(L.R)||!L.R.length||!Array.isArray(L.S))rejectGeometry('A floor must contain room and wall arrays before it can be rendered.',floor.id||null,'Restore the missing room or wall records.');
  if(!Array.isArray(L.O)){L.O=[];note('floors['+fi+'].L.O',floor.id||null);}if(!Array.isArray(L.E)){L.E=[];note('floors['+fi+'].L.E',floor.id||null);}
  if(!floor.id){floor.id='legacy-floor-'+fi;note('floors['+fi+'].id',floor.id);}if(!floor.label){floor.label='Floor '+(fi+1);note('floors['+fi+'].label',floor.id);}
  L.R.forEach((room,ri)=>{
   if(!room||typeof room!=='object'||![room.x,room.y,room.w,room.h].every(Number.isFinite)||room.w<=0||room.h<=0)rejectGeometry('A room has missing or invalid rectangular geometry.',room?.id||null,'Restore valid room coordinates and positive dimensions.');
   if(!room.id){room.id='legacy-room-'+fi+'-'+ri;note('room.id',room.id);}if(!room.name){room.name='Room '+(ri+1);note('room.name',room.id);}if(!Array.isArray(room.furniture)){room.furniture=[];note('room.furniture',room.id);}
   room.furniture.forEach((item,ii)=>{if(!item||![item.x,item.y,item.w,item.h].every(Number.isFinite)||item.w<=0||item.h<=0)rejectGeometry('A furniture item has missing or invalid dimensions.',item?.id||room.id,'Remove or repair the invalid furniture item.');if(!item.id){item.id=room.id+'-legacy-item-'+ii;note('furniture.id',item.id);}if(!Number.isFinite(item.height)||item.height<=0){item.height=.75;note('furniture.height',item.id);}});
   if(!room.hall){const net=clearRect(room,L.W,L.D);if(!room.net||['w','h','area'].some(k=>!Number.isFinite(room.net[k])||Math.abs(room.net[k]-net[k])>1e-6))note('room.net',room.id);room.net=net;}
  });
  L.S.forEach((wall,wi)=>{
   if(!Array.isArray(wall)||wall.length<4||!wall.slice(0,4).every(Number.isFinite)||Math.hypot(wall[2]-wall[0],wall[3]-wall[1])<1e-7)rejectGeometry('A wall has missing or invalid endpoints.',wall?.id||null,'Restore a finite, non-zero wall segment.');
   if(wall[4]===undefined){wall[4]=Math.abs(wall[0]-wall[2])<1e-7?(Math.abs(wall[0])<1e-7||Math.abs(wall[0]-L.W)<1e-7):(Math.abs(wall[1])<1e-7||Math.abs(wall[1]-L.D)<1e-7);note('wall.boundary_flag',wall.id||null);}
   if(!wall[5]&&!wall.id){wall[5]='legacy-wall-'+fi+'-'+wi;note('wall.id',wall[5]);}wall[5]=wall[5]||wall.id;wall.id=wall[5];if(wall[6]!==undefined){const thickness=Number(wall[6]);if(!Number.isFinite(thickness)||thickness<.08||thickness>.5)rejectGeometry('A wall has an unsupported thickness value.',wall.id,'Use a wall thickness from 0.08 m to 0.50 m.');wall[6]=thickness;wall.thickness=thickness;}if(wall[7]!==undefined){if(!['plaster','brick','concrete','timber','stone','glass'].includes(wall[7]))rejectGeometry('A wall has an unsupported material value.',wall.id,'Choose a supported wall material.');wall.material=wall[7];}
  });
  L.O.forEach((opening,oi)=>{
   if(!opening||!Array.isArray(opening.a)||!Array.isArray(opening.b)||opening.a.length!==2||opening.b.length!==2||![...opening.a,...opening.b].every(Number.isFinite)||!['door','entry','win'].includes(opening.t))rejectGeometry('An opening has missing endpoints or an unsupported type.',opening?.id||null,'Restore valid opening endpoints and type.');
   const host=L.S.find(w=>w[5]===opening.wallId||w.id===opening.wallId)||L.S.find(w=>pointOnWall(opening.a,w)&&pointOnWall(opening.b,w));
   if(!host||!pointOnWall(opening.a,host)||!pointOnWall(opening.b,host))rejectGeometry('An opening is not attached to a valid host wall.',opening.id||null,'Move the opening onto a valid wall or remove it.');
   if(!opening.id){opening.id='legacy-opening-'+fi+'-'+oi;note('opening.id',opening.id);}if(opening.wallId!==host[5]){opening.wallId=host[5];note('opening.wallId',opening.id);}if(opening.ext===undefined){opening.ext=host[4]?1:0;note('opening.ext',opening.id);}
   if(!Number.isFinite(opening.sill)){opening.sill=opening.t==='win'?.9:0;note('opening.sill',opening.id);}if(!Number.isFinite(opening.head)){opening.head=Math.min(2.1,g.height);note('opening.head',opening.id);}
   const mid=[(opening.a[0]+opening.b[0])/2,(opening.a[1]+opening.b[1])/2],vertical=Math.abs(host[0]-host[2])<1e-7;
   const sides=vertical?[{room:L.R.find(r=>mid[0]+.02>=r.x-1e-6&&mid[0]+.02<=r.x+r.w+1e-6&&mid[1]>=r.y-1e-6&&mid[1]<=r.y+r.h+1e-6),dir:[1,0]},{room:L.R.find(r=>mid[0]-.02>=r.x-1e-6&&mid[0]-.02<=r.x+r.w+1e-6&&mid[1]>=r.y-1e-6&&mid[1]<=r.y+r.h+1e-6),dir:[-1,0]}]:[{room:L.R.find(r=>mid[1]+.02>=r.y-1e-6&&mid[1]+.02<=r.y+r.h+1e-6&&mid[0]>=r.x-1e-6&&mid[0]<=r.x+r.w+1e-6),dir:[0,1]},{room:L.R.find(r=>mid[1]-.02>=r.y-1e-6&&mid[1]-.02<=r.y+r.h+1e-6&&mid[0]>=r.x-1e-6&&mid[0]<=r.x+r.w+1e-6),dir:[0,-1]}];
   const preferred=opening.roomId||opening.swingRoomId,side=sides.find(s=>s.room&&(s.room.id===preferred||(opening.connectedRoomIds||[]).includes(s.room.id)))||sides.find(s=>s.room);
   if(!side)rejectGeometry('An opening cannot be assigned to an adjacent room.',opening.id,'Reconnect the opening to a room or remove it.');
   if(opening.roomId!==side.room.id){opening.roomId=side.room.id;note('opening.roomId',opening.id);}if(!validDirection(opening.in)){opening.in=side.dir;note('opening.in',opening.id);}if(!validDirection(opening.n)){opening.n=[-opening.in[0],-opening.in[1]];note('opening.n',opening.id);}
  });
 });
 if(!Array.isArray(g.solver.alternatives)||!g.solver.alternatives.length){const rooms=g.floors.flatMap(f=>f.L.R.filter(r=>!r.hall));g.solver.alternatives=[{index:0,label:'Restored saved layout',score:Number(g.solver.score)||0,circulationPercent:Number(((Number(g.solver.circulationRatio)||0)*100).toFixed(1)),clearRoomArea:Number(rooms.reduce((sum,r)=>sum+(r.net?.area||0),0).toFixed(1))}];note('solver.alternatives');}
 return {geometry:g,repairs};
}
function assertBuild3DSchema(g){
 if(!Array.isArray(g.floors)||!g.floors.length)rejectGeometry('The model has no floors to render.');
 for(const floor of g.floors){const L=floor?.L;if(!L||!Array.isArray(L.R)||!Array.isArray(L.S)||!Array.isArray(L.O))rejectGeometry('The floor is missing required room, wall or opening data.',floor?.id||null,'Restore a complete floor record before rendering.');
  for(const opening of L.O)if(!validDirection(opening.in)||!validDirection(opening.n))rejectGeometry('An opening is missing a valid direction or surface normal.',opening.id,'Restore the opening direction or remove the malformed opening.');
 }
}
export async function buildDraftFromGeometry(source,briefInput) {
 const brief=parseBrief(briefInput),normalized=normalizeGeometry(source,brief),geometry=normalized.geometry;assertBuild3DSchema(geometry);
 const baseValidation=validateGeometry(geometry);
 if(baseValidation.criticalCount)throw new InputError({geometry:'Edited geometry failed independent validation.'},422);
 const revision=await revisionFor(geometry);
 const validation={...baseValidation,revision,engineVersion:'3.0.0'};
 const plans=geometry.floors.map((f,k)=>({label:f.label,svg:svgPlan(f.L,f.label,{...brief,level:k}).replace('</svg>',`<text x="2.4" y="${brief.D+6}" font-size=".25" fill="#c7a875">DRAFT · ${revision.slice(0,12)} · ${validation.status.toUpperCase()} · NOT APPROVED</text></svg>`)}));
 const model=build3D(geometry.floors,brief,brief.roof,brief.low);
 if(brief.style==='warm')model.F.forEach(f=>{if(f.c==='#e8e2d6')f.c='#d6bb94';});if(brief.style==='traditional')model.F.forEach(f=>{if(f.c==='#e8e2d6')f.c='#c09882';});model.style=brief.style;model.revision=revision;model.watermark='CONCEPT ONLY · NOT APPROVED · '+revision.slice(0,12);
 const rows=geometry.floors.flatMap(f=>f.L.R.map(r=>({id:r.id,floor:f.label,name:r.name,w:r.net?f1(r.net.w):'—',h:r.net?f1(r.net.h):'—',area:r.net?f1(r.net.area):'—',nominalArea:f1(r.w*r.h)})));
 return {brief,geometry,revision,validation,plans,model,rows,alternatives:geometry.solver.alternatives,normalizationRepairs:normalized.repairs,clearRoomTotal:f1(geometry.floors[0].L.R.filter(r=>!r.hall).reduce((n,r)=>n+r.net.area,0)),total:f1(brief.W*brief.D*brief.storeys),warnings:validation.issues.filter(i=>i.severity==='warning').map(i=>i.message)};
}
export function checkExport(draft, format, expectedRevision) {
 if(!['svg','report','model','construction'].includes(format))return {status:400,error:'unsupported_format'};
 if(expectedRevision!==draft.revision)return {status:409,error:'stale_revision',message:'The brief changed. Generate and review the current revision.'};
 if(format==='construction')return {status:422,error:'professional_review_unavailable',message:'Construction-document export is unavailable. No professional approval workflow is connected.'};
 if(draft.validation.status==='failed' && format!=='report')return {status:422,error:'critical_validation_failure',message:'Resolve critical geometry issues before exporting drawings or a model. The issue report remains available.'};
 return null;
}

export function combinedPlans(draft){const w=draft.brief.W+4.8,h=draft.brief.D+6.4;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h*draft.plans.length}">${draft.plans.map((p,k)=>p.svg.replace('<svg ',`<svg y="${k*h}" width="${w}" height="${h}" `)).join('')}</svg>`;}