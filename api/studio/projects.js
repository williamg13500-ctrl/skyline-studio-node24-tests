import {db} from 'hatchable';
import {identify,requireBuild} from '../../lib/access.js';
import {buildDraft,buildDraftFromGeometry,parseBrief,revisionFor,InputError} from '../../lib/engine.js';
import {ownerKey,projectId,saveProject} from '../../lib/projects.js';
import {applyGeometryEdit} from '../../lib/editor.js';
import {createUniversalBuildingModel,validateUniversalBuildingModel} from '../../lib/universal-building-model.js';
import {requestId,sendInputFailure,sendUnexpectedFailure} from '../../lib/http-errors.js';
import {beginRequestLog} from '../../lib/request-logging.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 const rid=requestId();res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',rid);const requestLog=beginRequestLog(req,res,{request_id:rid,endpoint:'/api/studio/projects',mode:req.body?.operation?.type||'project-access'});
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.projects',limit:60,maxBytes:2097152}))return;
  const user=await identify(req);if(!requireBuild(user,res))return;
  const owner=await ownerKey(req,user);
  if(req.method==='GET'){
   if(req.query?.id!==undefined){
    const id=projectId(req.query.id);if(!id)return res.status(400).json({error:'invalid_project_id'});
    const result=await db.query('SELECT id,name,brief,revision,version,created_at,updated_at FROM studio_projects WHERE id=$1 AND owner_key=$2',[id,owner]);
    if(!result.rows.length)return res.status(404).json({error:'project_not_found'});
    const project=result.rows[0],history=await db.query('SELECT version,revision,created_at FROM studio_revisions WHERE project_id=$1 ORDER BY version DESC LIMIT 50',[id]);
    if(req.query.version!==undefined){
     const version=Number(req.query.version);if(!Number.isSafeInteger(version)||version<1)return res.status(400).json({error:'invalid_revision'});
     const previous=await db.query('SELECT brief,geometry,revision,version,validation,created_at FROM studio_revisions WHERE project_id=$1 AND version=$2',[id,version]);
     if(!previous.rows.length)return res.status(404).json({error:'revision_not_found'});
     return res.json({project,selectedRevision:previous.rows[0],history:history.rows,reportMode:'historical_record_not_rerun'});
    }
    const latest=await db.query('SELECT brief,geometry,validation,revision,version,created_at FROM studio_revisions WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[id]);
    return res.json({project,selectedRevision:latest.rows[0]||null,history:history.rows});
   }
   const cursor=req.query?.before;
   if(cursor!==undefined&&!projectId(cursor))return res.status(400).json({error:'invalid_cursor'});
   const result=await db.query('SELECT id,name,revision,version,updated_at FROM studio_projects WHERE owner_key=$1 AND ($2::bigint IS NULL OR id < $2::bigint) ORDER BY id DESC LIMIT 31',[owner,cursor||null]);
   const more=result.rows.length>30,projects=result.rows.slice(0,30);
   return res.json({projects,nextCursor:more?String(projects[projects.length-1].id):null});
  }
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const body=req.body||{};
  if(body.operation?.type==='restore'){
   let geometry=body.geometry,brief=body.brief,storedRevision=null;
   if(body.projectId!==undefined&&body.version!==undefined){
    const id=projectId(body.projectId),version=Number(body.version);if(!id||!Number.isSafeInteger(version)||version<1)return res.status(400).json({error:'invalid_revision'});
    const stored=await db.query('SELECT r.brief,r.geometry,r.revision FROM studio_revisions r JOIN studio_projects p ON p.id=r.project_id WHERE p.id=$1 AND p.owner_key=$2 AND r.version=$3',[id,owner,version]);
    if(!stored.rows.length)return res.status(404).json({error:'revision_not_found'});
    geometry=stored.rows[0].geometry;brief=stored.rows[0].brief;storedRevision=stored.rows[0].revision;
   }
   if(geometry?.buildingModel?.schema==='skyline.universal-building'){
    const report=validateUniversalBuildingModel(geometry);
    if(report.status==='failed')return res.status(422).json({error:'universal_building_invalid',validation:report});
    const revision=await revisionFor(geometry);
    if((storedRevision&&storedRevision!==revision)||(body.projectId===undefined&&body.revision!==revision))return res.status(409).json({error:'stale_revision',message:'The saved universal building revision does not match its contents.'});
    requestLog.addSummary({project_id:body.projectId??null,geometry_counts:{floors:geometry.floors.length},universal_model_status:report.status});
    return res.json({brief,geometry,revision,validation:{...report,criticalCount:report.issues.filter(i=>i.severity==='critical').length,approval:'not_approved',constructionExportAllowed:false},plans:[],model:null,rows:[],reportMode:'universal_building_geometry_only',restoredFromRevision:storedRevision});
   }
   const restored=await buildDraftFromGeometry(geometry,brief);requestLog.addSummary({project_id:body.projectId??null,source_revision:body.revision??null,normalization_repair_count:restored.normalizationRepairs.length,normalization_repairs:restored.normalizationRepairs});
   if(body.projectId===undefined&&body.revision!==restored.revision)return res.status(409).json({error:'stale_revision',message:'The saved geometry revision does not match its contents.'});
   return res.json({...restored,restoredFromRevision:body.projectId===undefined?null:body.revision});
  }
  if(body.operation?.type==='universal-building-save'){
   const geometry=body.geometry,report=validateUniversalBuildingModel(geometry);
   if(report.status==='failed')return res.status(422).json({error:'universal_building_invalid',validation:report});
   if(!geometry?.buildingModel||!body.brief||typeof body.brief.name!=='string'||!body.brief.name.trim())return res.status(400).json({error:'universal_building_metadata_required'});
   const revision=await revisionFor(geometry);
   if(body.revision!==revision)return res.status(409).json({error:'stale_revision',message:'The universal building changed. Recalculate its revision before saving.'});
   const validation={...report,criticalCount:report.issues.filter(i=>i.severity==='critical').length,approval:'not_approved',constructionExportAllowed:false,engineVersion:'universal-building-v1'};
   const result=await saveProject(owner,body,{brief:body.brief,geometry,revision,validation}),{status,...payload}=result;
   requestLog.addSummary({project_id:body.id??null,geometry_counts:{floors:geometry.floors.length},universal_model_status:report.status});
   return res.status(status).json(payload);
  }
  if(body.operation){
   const base=body.geometry?await buildDraftFromGeometry(body.geometry,body.brief):await buildDraft(body.brief);requestLog.addSummary({project_id:body.projectId??null,source_revision:body.sourceRevision??body.baseRevision??null,normalization_repair_count:base.normalizationRepairs.length,normalization_repairs:base.normalizationRepairs});
   if(body.baseRevision!==base.revision)return res.status(409).json({error:'stale_revision',message:'The base drawing changed. Reload the latest revision before editing.'});
   const geometry=applyGeometryEdit(base.geometry,body.operation),edited=await buildDraftFromGeometry(geometry,base.brief);
   return res.json(edited);
  }
  let draft;
  if(body.geometry){const normalizedBrief=parseBrief(body.brief),candidate={...body.geometry,brief:normalizedBrief};if(body.revision!==await revisionFor(candidate))return res.status(409).json({error:'stale_revision',message:'The edited geometry revision does not match its contents.'});draft=await buildDraftFromGeometry(body.geometry,normalizedBrief);}
  else draft=await buildDraft(body.brief);
  requestLog.addSummary({project_id:body.projectId??body.id??null,source_revision:body.sourceRevision??body.revision??null,normalization_repair_count:draft.normalizationRepairs.length,normalization_repairs:draft.normalizationRepairs});
  if(body.revision!==draft.revision)return res.status(409).json({error:'stale_revision',message:'Generate and review the current brief before saving.'});
  const result=await saveProject(owner,body,draft),{status,...payload}=result;return res.status(status).json(payload);
 }catch(error){
  requestLog.fail(error);
  if(error instanceof InputError)return sendInputFailure(res,error,rid,error.status===422?'geometry_rejected':'invalid_brief');
  if(error.status===422)return sendInputFailure(res,error,rid,'geometry_edit_rejected');
  return sendUnexpectedFailure(res,error,rid,'studio_projects_failure');
 }
}
