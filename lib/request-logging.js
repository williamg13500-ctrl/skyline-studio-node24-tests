function safeText(value,max=80){return typeof value==='string'&&/^[A-Za-z0-9_.:-]+$/.test(value)?value.slice(0,max):null;}
function safeStack(error){const stack=typeof error?.stack==='string'?error.stack:'';const i=stack.indexOf(String.fromCharCode(10));return i>=0?stack.slice(i+1,i+2400):'[stack unavailable]';}
function geometryCounts(g){
 const floors=Array.isArray(g?.floors)?g.floors:[];let rooms=0,walls=0,openings=0,furniture=0;
 for(const floor of floors){const L=floor?.L||{};rooms+=(L.R||[]).length;walls+=(L.S||[]).length;openings+=(L.O||[]).length;for(const r of L.R||[])furniture+=(r.furniture||[]).length;}
 return {floors:floors.length,rooms,walls,openings,furniture};
}
function requestSummary(endpoint,body){
 body=body&&typeof body==='object'?body:{};const brief=body.brief&&typeof body.brief==='object'?body.brief:body;
 const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 const geometry=body.geometry||null,counts=geometryCounts(geometry),op=body.operation||{};
 const roomCounts={};for(const floor of geometry?.floors||[])for(const room of floor?.L?.R||[]){const kind=safeText(room.kind,40)||'unknown';roomCounts[kind]=(roomCounts[kind]||0)+1;}
 const ids=[op.roomId,op.otherRoomId,op.wallId,op.openingId,op.itemId].filter(v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(v)).slice(0,12);
 return {footprint:{width:num(brief.W)??num(geometry?.floors?.[0]?.L?.W),depth:num(brief.D)??num(geometry?.floors?.[0]?.L?.D)},room_program:{bedrooms:num(brief.beds),bathrooms:num(brief.baths),storeys:num(brief.storeys)??(counts.floors||null),study:brief.study===true,custom_room_count:Array.isArray(brief.rooms)?brief.rooms.length:null},geometry_counts:counts,room_type_counts:roomCounts,edit_type:safeText(op.type,40),element_ids:ids,text_length:typeof body.text==='string'?body.text.length:null};
}
async function bodyHash(body){
 const bytes=new TextEncoder().encode(JSON.stringify(body??null));const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
export function beginRequestLog(req,res,{request_id,endpoint,mode}){
 const started=Date.now(),summary=requestSummary(endpoint,req.body),hash=bodyHash(req.body).catch(()=>null);let status=200,failureStack=null,failurePath=null,logged=false;
 const originalStatus=res.status?.bind(res),originalJson=res.json?.bind(res);
 if(originalStatus)res.status=(code)=>{status=code;originalStatus(code);return res;};
 if(originalJson)res.json=(payload)=>{
  if(!logged){logged=true;const duration_ms=Date.now()-started;Promise.resolve(hash).then(body_hash=>console.log(JSON.stringify({event:'studio_request',request_id,endpoint,mode:safeText(mode,40)||'n/a',status,duration_ms,request_summary:summary,body_hash,stack_trace:failureStack,failure_path:failurePath})));}
  return originalJson(payload);
 };
 return {fail(error,path=null){failureStack=safeStack(error);failurePath=safeText(path,60);},addSummary(extra){if(!extra||typeof extra!=='object')return;for(const [key,value] of Object.entries(extra)){if(key==='normalization_repairs'&&Array.isArray(value)){summary[key]=value.slice(0,100).map(r=>({field:safeText(r?.field,100),element_id:safeText(r?.element_id,80)}));}else if(key==='project_id')summary[key]=typeof value==='number'||(typeof value==='string'&&/^[0-9]{1,18}$/.test(value))?String(value):null;else if(key==='source_revision')summary[key]=typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;else summary[key]=value;}}};
}