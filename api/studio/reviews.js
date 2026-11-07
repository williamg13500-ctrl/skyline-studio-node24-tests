import {db} from 'hatchable';
import {identify,requireBuild} from '../../lib/access.js';
import {ownerKey,projectId} from '../../lib/projects.js';
import {ownedRevision} from '../../lib/workflows.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.reviews',limit:10,maxBytes:16384}))return;
  const user=await identify(req);if(!requireBuild(user,res))return;const owner=await ownerKey(req,user);
  if(req.method==='GET'){
   const id=projectId(req.query?.projectId);if(!id)return res.status(400).json({error:'invalid_project'});
   const reviews=(await db.query('SELECT id,revision,jurisdiction,notes,status,created_at FROM studio_review_requests WHERE owner_key=$1 AND project_id=$2 ORDER BY id DESC LIMIT 25',[owner,id])).rows;
   return res.json({reviews,constructionExportAllowed:false});
  }
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const b=req.body||{},project=await ownedRevision(owner,b);if(!project)return res.status(409).json({error:'stale_or_unavailable_project',message:'Save this revision before requesting review.'});
  if(typeof b.jurisdiction!=='string'||b.jurisdiction.trim().length<3||b.jurisdiction.length>200||typeof b.notes!=='string'||b.notes.length>2000)return res.status(400).json({error:'review_details_required',message:'Enter the jurisdiction (3–200 characters) and review notes (up to 2,000 characters).'});
  const row=(await db.query(`INSERT INTO studio_review_requests(project_id,owner_key,revision,jurisdiction,notes) VALUES ($1,$2,$3,$4,$5) RETURNING id,status`,[project.id,owner,b.revision,b.jurisdiction.trim(),b.notes.trim()])).rows[0];
  return res.status(201).json({review:row,constructionExportAllowed:false,message:'Recorded only. No professional was contacted or assigned; no approval granted.'});
 }catch{return res.status(503).json({error:'review_service_unavailable'});}
}