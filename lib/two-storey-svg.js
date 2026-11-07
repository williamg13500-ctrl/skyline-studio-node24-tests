// Deterministic, local-only SVG sheets for the test-reachable two-storey schematic generator.
// No external libraries, fonts, assets, network calls, API imports or production entry points.
export const TWO_STOREY_SVG_FEATURE_FLAG = Object.freeze({ enabled: false });
const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const n = value => Number(value.toFixed(3));
const txt = (x,y,value,size=14,weight='normal',anchor='start') => `<text x="${n(x)}" y="${n(y)}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="#172033">${esc(value)}</text>`;
const box = (x,y,w,h,fill='none',stroke='#172033',sw=2) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const ln = (x1,y1,x2,y2,stroke='#172033',sw=2) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${sw}"/>`;
function validationState(validation) {
 const checks=Array.isArray(validation?.checks)?validation.checks:[];
 const failed=checks.some(c=>c?.status==='failed'),unknown=checks.some(c=>c?.status==='not_checked');
 const status=failed?'FAILED':(unknown||!checks.length?'NOT CHECKED':'PASSED');
 const rows=checks.filter(c=>c?.status==='failed'||c?.status==='not_checked').map(c=>'CHECK '+c.name+': '+c.status);
 if(!checks.length) rows.push('CHECKS: validator output unavailable; not_checked');
 return {status,rows,failed,unknown};
}
function warningBanner(rows) {
 const y=18,h=42+rows.length*19;
 return {height:h,svg:box(20,y,920,h,'#fff0ed','#a92d22',2)+txt(34,y+25,'VALIDATION WARNING — NOT APPROVED',15,'bold')+rows.map((r,i)=>txt(34,y+43+i*19,r,12)).join('')};
}
function titleBlock(y,status,floors) {
 const h=88;
 return {height:h,svg:box(20,y,920,h,'#f4f6f9','#596579',1)+txt(36,y+22,'SKYLINE STUDIO BUILD · SCHEMATIC SHEET',12,'bold')+txt(36,y+44,'Version: 4B-SVG-1',12)+txt(290,y+44,'Floor count: '+floors,12)+txt(500,y+44,'Validation status: '+status,12,'bold')+txt(36,y+70,'Schematic design only. Not for construction.',13,'bold')};
}
function makeSheet(generated,name,title,kind) {
 const b=generated.building,state=validationState(generated.validation);
 const warning=state.failed||state.unknown, banner=warning?warningBanner(state.rows):{height:0,svg:''};
 const drawTop=18+banner.height+22,drawHeight=330,titleY=drawTop+drawHeight+18;
 const titleBox=titleBlock(titleY,state.status,b.floors.length),height=titleY+titleBox.height+18;
 const W=Number(b.footprint.widthM),D=Number(b.footprint.depthM);let drawing='';
 if(kind==='plan') {
  const scale=Math.min(820/W,270/D),w=W*scale,h=D*scale,x=(960-w)/2,y=drawTop+(drawHeight-h)/2;
  const floor=b.floors.find(f=>f.id===name),room=(floor?.L?.R||[])[0],core=b.verticalCores?.[0]?.footprints?.find(f=>f.floorId===name);
  drawing+=txt(480,drawTop+18,title,20,'bold','middle')+box(x,y,w,h,'#ffffff','#18243a',3);
  if(room) drawing+=txt(x+w/2,y+h/2,(room.name||'Room')+' · modelled area',14,'normal','middle');
  if(core) {const cx=x+core.x*scale,cy=y+(D-core.y-core.h)*scale,cw=core.w*scale,ch=core.h*scale;drawing+=box(cx,cy,cw,ch,'#dce7f5','#244a75',2)+txt(cx+cw/2,cy+ch/2-4,'STAIR',13,'bold','middle')+txt(cx+cw/2,cy+ch/2+14,'CORE',11,'bold','middle');}
  drawing+=txt(x,y+h+22,'Footprint: '+W+' m × '+D+' m · schematic plan view',12);
 } else if(kind==='elevation') {
  const sx=Math.min(58,820/W),sy=38,w=W*sx,h=b.floors.length*b.floorToFloorHeightM*sy,x=(960-w)/2,y=drawTop+drawHeight-h-20,upper=y+h-b.floorToFloorHeightM*sy;
  drawing+=txt(480,drawTop+18,title,20,'bold','middle')+box(x,y,w,h,'#f7f8fa','#18243a',3)+ln(x,y+h,x+w,y+h,'#18243a',4)+ln(x,upper,x+w,upper,'#18243a',3);
  const core=b.verticalCores?.[0]?.footprints?.[0];if(core){const cx=x+core.x*sx,cw=core.w*sx;drawing+=box(cx,y,cw,h,'#dce7f5','#244a75',2)+txt(cx+cw/2,y+h/2,'STAIR CORE',12,'bold','middle');}
  drawing+=txt(x-12,y+h+5,'GROUND FLOOR',11,'bold','end')+txt(x-12,upper+5,'FIRST FLOOR',11,'bold','end')+txt(480,y-12,'Two-storey elevation · declared floor-to-floor height '+b.floorToFloorHeightM+' m',12,'normal','middle');
 } else {
  const gap=b.floorToFloorHeightM*38,base=drawTop+drawHeight-25,upper=base-gap,core=b.verticalCores?.[0]?.footprints?.[0]||{w:1},x=350,cw=Math.max(110,core.w*42),right=x+cw;
  drawing+=txt(480,drawTop+18,title,20,'bold','middle')+ln(180,base,780,base,'#18243a',4)+ln(180,upper,780,upper,'#18243a',4)+box(x,upper,cw,base-upper,'#e8eef7','#244a75',2)+ln(x+15,base-8,right-15,upper+8,'#244a75',4);
  drawing+=txt(480,upper-14,'FIRST FLOOR',12,'bold','middle')+txt(480,base+20,'GROUND FLOOR',12,'bold','middle')+txt(right+18,(base+upper)/2,'Stair core',13,'bold')+txt(480,base+42,'Schematic section through stair and vertical core; stair detailing not modelled',12,'normal','middle');
 }
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="'+height+'" viewBox="0 0 960 '+height+'" role="img" aria-label="'+esc(title)+'">'+banner.svg+drawing+titleBox.svg+'</svg>';
 return {name,svg};
}
export function renderTwoStoreySvgSheets(generated,options={}) {
 if(options.enabled!==true||TWO_STOREY_SVG_FEATURE_FLAG.enabled!==true)return [];
 if(!generated?.generated||!generated.building||!generated.validation)throw new TypeError('generated building and validator output are required');
 const b=generated.building;if(!Array.isArray(b.floors)||b.floors.length!==2)throw new TypeError('exactly two generated floors are required');
 const sheets=b.floors.map(f=>makeSheet(generated,f.id,f.id==='ground-floor'?'Ground floor plan':'First floor plan','plan'));
 sheets.push(makeSheet(generated,'elevation','Building elevation','elevation'));
 sheets.push(makeSheet(generated,'stair-core-section','Section through stair and core','section'));
 return sheets;
}
