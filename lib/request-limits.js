import {db} from 'hatchable';

const WINDOW_SECONDS=60;
function clientIp(req){
 const h=req.headers||{};
 const direct=String(h['x-real-ip']||'').trim();if(direct)return direct.slice(0,80);
 const forwarded=String(h['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean);
 return (forwarded[forwarded.length-1]||'unknown').slice(0,80);
}
async function digest(value){
 const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
export function guardBodySize(req,res,maxBytes){
 let bodyBytes=0;try{bodyBytes=new TextEncoder().encode(JSON.stringify(req.body??null)).length;}catch{res.status(400).json({error_code:'invalid_request_body',message:'The request body could not be read.',suggestion:'Send valid JSON and retry.'});return false;}
 const declared=Number(req.headers?.['content-length']||0);
 if(bodyBytes>maxBytes||declared>maxBytes){res.status(413).json({error_code:'request_too_large',message:'This request exceeds the allowed size for this operation.',suggestion:'Reduce the request payload and retry.'});return false;}
 return true;
}
export async function guardStudioRequest(req,res,{route,limit=30,maxBytes=262144}={}){
 if(!guardBodySize(req,res,maxBytes))return false;
 const bucket=Math.floor(Date.now()/1000/WINDOW_SECONDS),key=await digest(clientIp(req)+'|'+route);
 const result=await db.query('INSERT INTO studio_request_limits(key_hash,route,window_bucket,request_count) VALUES($1,$2,$3,1) ON CONFLICT(key_hash,route,window_bucket) DO UPDATE SET request_count=studio_request_limits.request_count+1 RETURNING request_count',[key,route,bucket]);
 if(Number(result.rows[0]?.request_count||0)>limit){res.setHeader?.('Retry-After','60');return res.status(429).json({error_code:'rate_limited',message:'Too many requests in a short period.',suggestion:'Wait one minute and try again.'}),false;}
 if(bucket%10===0)await db.query('DELETE FROM studio_request_limits WHERE window_bucket < $1',[bucket-2]);
 return true;
}