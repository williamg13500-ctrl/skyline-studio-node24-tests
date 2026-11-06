import {db,config,storage} from 'hatchable';
import {identify,requireBuild} from '../../lib/access.js';
import {ownerKey,projectId} from '../../lib/projects.js';
import {ownedRevision} from '../../lib/workflows.js';
import {buildDraft} from '../../lib/engine.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.renders',limit:10,maxBytes:16384}))return;
  const user=await identify(req);if(!requireBuild(user,res))return;const owner=await ownerKey(req,user);
  if(req.method==='GET'){
   const id=projectId(req.query?.projectId);if(!id)return res.status(400).json({error:'invalid_project'});
   const renders=(await db.query(`SELECT id,revision,status,storage_key,error,created_at FROM studio_render_jobs WHERE owner_key=$1 AND project_id=$2 ORDER BY id DESC LIMIT 25`,[owner,id])).rows;
   for(const r of renders){if(r.storage_key)r.url=await storage.url(r.storage_key,{ttl:300});delete r.storage_key;}
   return res.json({renders});
  }
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(await config.get('render_enabled')!==true)return res.status(412).json({error:'render_setup_required',message:'Rendered video is not connected. The owner must deploy the Blender worker, set its secret and enable rendering. The browser orbit video is available now.'});
  const p=await ownedRevision(owner,req.body||{});if(!p)return res.status(409).json({error:'stale_or_unavailable_project'});
  const d=await buildDraft(p.brief);if(d.revision!==p.revision)return res.status(409).json({error:'engine_revision_changed',message:'Regenerate and save with the current engine.'});
  if(d.validation.criticalCount)return res.status(422).json({error:'critical_validation_failure'});
  const count=(await db.query("SELECT count(*)::int AS n FROM studio_render_jobs WHERE owner_key=$1 AND created_at>NOW()-INTERVAL '1 day'",[owner])).rows[0].n;
  if(count>=5)return res.status(429).json({error:'daily_render_limit',message:'Up to five rendered revisions per account per day.'});
  const row=(await db.query(`INSERT INTO studio_render_jobs(project_id,owner_key,revision,brief) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT(owner_key,project_id,revision) DO UPDATE SET status=CASE WHEN studio_render_jobs.status='failed' THEN 'queued' ELSE studio_render_jobs.status END,error=NULL,updated_at=NOW() RETURNING id,status`,[p.id,owner,p.revision,JSON.stringify(p.brief)])).rows[0];
  return res.status(202).json({render:row});
 }catch{return res.status(503).json({error:'render_service_unavailable'});}
}