import {db,config,webhooks,storage} from 'hatchable';
import {buildDraft} from '../../lib/engine.js';
import {guardBodySize} from '../../lib/request-limits.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!guardBodySize(req,res,25165824))return;
 try{
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const secret=await config.get('RENDER_WORKER_SECRET');
  const ts=String(req.headers['x-skyline-timestamp']||'');
  if(!secret||!req.rawBody||!await webhooks.verifyHmac({raw:ts+'.'+req.rawBody,signature:req.headers['x-skyline-signature']||'',secret,timestamp:ts}))return res.status(401).json({error:'invalid_worker_signature'});
  if(await config.get('render_enabled')!==true)return res.status(412).json({error:'render_disabled'});
  const b=req.body||{};
  if(b.action==='claim'){
   await db.query("UPDATE studio_render_jobs SET status='failed',error='Worker lease expired after three attempts.',updated_at=NOW() WHERE status='rendering' AND lease_until<NOW() AND attempts>=3");
   const token=crypto.randomUUID();
   const row=(await db.query(`WITH next AS (SELECT id FROM studio_render_jobs WHERE (status='queued' OR (status='rendering' AND lease_until<NOW())) AND attempts<3 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE studio_render_jobs SET status='rendering',lease_token=$1,lease_until=NOW()+INTERVAL '30 minutes',attempts=attempts+1,updated_at=NOW() WHERE id IN (SELECT id FROM next) RETURNING id,brief,revision`,[token])).rows[0];
   if(!row)return res.json({job:null});
   const d=await buildDraft(row.brief);
   if(d.revision!==row.revision||d.validation.criticalCount){await db.query("UPDATE studio_render_jobs SET status='failed',error='Saved geometry is stale or failed validation.' WHERE id=$1",[row.id]);return res.json({job:null});}
   return res.json({job:{id:row.id,token,revision:row.revision,model:d.model,brief:d.brief,width:1280,height:800,frames:192,fps:24,watermark:d.model.watermark}});
  }
  if(!['complete','fail','heartbeat'].includes(b.action)||!/^[1-9][0-9]*$/.test(String(b.id))||typeof b.token!=='string')return res.status(400).json({error:'invalid_job'});
  const job=(await db.query("SELECT id,revision FROM studio_render_jobs WHERE id=$1 AND lease_token=$2 AND status='rendering' AND lease_until>NOW()",[b.id,b.token])).rows[0];
  if(!job)return res.status(409).json({error:'expired_or_unavailable_lease'});
  if(b.action==='heartbeat'){await db.query("UPDATE studio_render_jobs SET lease_until=NOW()+INTERVAL '30 minutes' WHERE id=$1 AND lease_token=$2",[b.id,b.token]);return res.json({ok:true});}
  if(b.action==='fail'){await db.query("UPDATE studio_render_jobs SET status='failed',error=$3,updated_at=NOW() WHERE id=$1 AND lease_token=$2",[b.id,b.token,'The rendering worker could not complete this video.']);return res.json({ok:true});}
  if(b.revision!==job.revision||typeof b.video!=='string'||b.video.length>16000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.video))return res.status(400).json({error:'invalid_video'});
  const bytes=Uint8Array.from(atob(b.video),c=>c.charCodeAt(0));
  if(bytes.length<1000||String.fromCharCode(...bytes.slice(4,8))!=='ftyp')return res.status(400).json({error:'mp4_required'});
  const key='renders/'+job.id+'/'+job.revision+'.mp4';await storage.put(key,bytes,'video/mp4');
  await db.query("UPDATE studio_render_jobs SET status='complete',storage_key=$3,lease_token=NULL,updated_at=NOW() WHERE id=$1 AND lease_token=$2",[b.id,b.token,key]);return res.json({ok:true});
 }catch(error){return res.status(503).json({error:'worker_unavailable',message:'Check worker configuration and retry.'});}
}