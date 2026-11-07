import {db} from 'hatchable';
import {identify,requireBuild} from '../../lib/access.js';
import {ownerKey,projectId} from '../../lib/projects.js';
import {analyzeSiteContext,SiteInputError} from '../../lib/site-intelligence.js';
import {requestId,sendUnexpectedFailure} from '../../lib/http-errors.js';
import {beginRequestLog} from '../../lib/request-logging.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='user';
export const methods=['GET','POST'];
export default async function(req,res){
 const rid=requestId();res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',rid);
 const log=beginRequestLog(req,res,{request_id:rid,endpoint:'/api/studio/site-projects',mode:req.method==='GET'?'site-history':'site-save'});
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.site-projects',limit:40,maxBytes:131072}))return;
  const platformUser=req.user,user=await identify(req);if(!platformUser||!requireBuild(user,res))return;
  const owner=await ownerKey(req,user);
  if(req.method==='GET'){
   if(req.query?.id!==undefined){
    const id=String(req.query.id);
    if(!/^[1-9][0-9]{0,17}$/.test(id))return res.status(400).json({error:'invalid_site_id'});
    const found=await db.query('SELECT id,name,project_id,latest_version,created_at,updated_at FROM studio_site_contexts WHERE id=$1 AND owner_key=$2',[id,owner]);
    if(!found.rows.length)return res.status(404).json({error:'site_context_not_found'});
    const history=await db.query('SELECT version,created_at FROM studio_site_revisions WHERE site_context_id=$1 ORDER BY version DESC LIMIT 50',[id]);
    const latest=await db.query('SELECT site_context,analysis,version,created_at FROM studio_site_revisions WHERE site_context_id=$1 ORDER BY version DESC LIMIT 1',[id]);
    return res.json({siteContext:found.rows[0],latestRevision:latest.rows[0]||null,history:history.rows});
   }
   const list=await db.query('SELECT id,name,project_id,latest_version,created_at,updated_at FROM studio_site_contexts WHERE owner_key=$1 ORDER BY updated_at DESC LIMIT 50',[owner]);
   return res.json({siteContexts:list.rows});
  }
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const body=req.body||{},name=typeof body.name==='string'?body.name.trim().slice(0,120):'Untitled site';
  if(!name)return res.status(400).json({error:'invalid_site_name'});
  const analyzed=analyzeSiteContext(body.siteContext||{}),site=analyzed.site;
  let linkedProject=null;
  if(body.projectId!==undefined&&body.projectId!==null){
   linkedProject=projectId(body.projectId);if(!linkedProject)return res.status(400).json({error:'invalid_project_id'});
   const owned=await db.query('SELECT id FROM studio_projects WHERE id=$1 AND owner_key=$2',[linkedProject,owner]);
   if(!owned.rows.length)return res.status(404).json({error:'project_not_found'});
  }
  if(body.id===undefined||body.id===null){
   const saved=await db.query(`WITH created AS (
    INSERT INTO studio_site_contexts(owner_key,project_id,name,latest_version)
    VALUES($1,$2,$3,1) RETURNING id,name,project_id,latest_version,created_at,updated_at
   ), revision AS (
    INSERT INTO studio_site_revisions(site_context_id,version,site_context,analysis)
    SELECT id,1,$4::jsonb,$5::jsonb FROM created RETURNING id
   ) SELECT created.* FROM created JOIN revision ON TRUE`,[owner,linkedProject,name,JSON.stringify(site),JSON.stringify(analyzed)]);
   log.addSummary({site_context_id:saved.rows[0]?.id,version:1,decision:analyzed.decision,findings:analyzed.findings.length});
   return res.status(201).json({siteContext:saved.rows[0],analysis:analyzed});
  }
  const id=String(body.id),expected=Number(body.expectedVersion);
  if(!/^[1-9][0-9]{0,17}$/.test(id)||!Number.isSafeInteger(expected)||expected<1)return res.status(400).json({error:'invalid_site_revision'});
  const saved=await db.query(`WITH changed AS (
   UPDATE studio_site_contexts SET project_id=CASE WHEN $1::boolean THEN $2::bigint ELSE project_id END,name=$3,latest_version=latest_version+1,updated_at=NOW()
   WHERE id=$4 AND owner_key=$5 AND latest_version=$6 RETURNING id,name,project_id,latest_version,created_at,updated_at
  ), revision AS (
   INSERT INTO studio_site_revisions(site_context_id,version,site_context,analysis)
   SELECT id,latest_version,$7::jsonb,$8::jsonb FROM changed RETURNING id
  ) SELECT changed.* FROM changed JOIN revision ON TRUE`,[body.projectId!==undefined,linkedProject,name,id,owner,expected,JSON.stringify(site),JSON.stringify(analyzed)]);
  if(!saved.rows.length)return res.status(409).json({error:'site_revision_conflict',message:'This site context changed or is unavailable. Reload it before saving.'});
  log.addSummary({site_context_id:id,version:saved.rows[0].latest_version,decision:analyzed.decision,findings:analyzed.findings.length});
  return res.json({siteContext:saved.rows[0],analysis:analyzed});
 }catch(error){
  log.fail(error);
  if(error instanceof SiteInputError)return res.status(400).json({error_code:'invalid_site_context',message:error.message,field:error.field,request_id:rid});
  return sendUnexpectedFailure(res,error,rid,'studio_site_projects_failure');
 }
}