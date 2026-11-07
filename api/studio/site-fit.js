import {identify,requireBuild} from '../../lib/access.js';
import {buildDraft,buildDraftFromGeometry,InputError} from '../../lib/engine.js';
import {assessSiteFit} from '../../lib/site-fit.js';
import {SiteInputError} from '../../lib/site-intelligence.js';
import {requestId,sendInputFailure,sendUnexpectedFailure} from '../../lib/http-errors.js';
import {beginRequestLog} from '../../lib/request-logging.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='user';
export const methods=['POST'];
export default async function(req,res){
 const rid=requestId();res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',rid);
 const log=beginRequestLog(req,res,{request_id:rid,endpoint:'/api/studio/site-fit',mode:'preliminary-site-fit'});
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.site-fit',limit:20,maxBytes:196608}))return;
  const platformUser=req.user,user=await identify(req);if(!platformUser||!requireBuild(user,res))return;
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const body=req.body||{};
  if(!body.brief||typeof body.brief!=='object'||typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision))
   return res.status(400).json({error:'invalid_site_fit_request',message:'Provide the current generated brief, its 64-character geometry revision and a site context.'});
  const draft=body.geometry!==undefined ? await buildDraftFromGeometry(body.geometry,body.brief) : await buildDraft(body.brief);
  if(draft.revision!==body.expectedRevision)return res.status(409).json({error:'stale_geometry_revision',message:'The building brief or generated geometry has changed. Generate and review the current concept before running site fit.'});
  if(!body.siteContext||typeof body.siteContext!=='object'||Array.isArray(body.siteContext)||!body.siteContext.boundary)return res.status(422).json({status:'blocked',decision:'boundary_required',geometry:{revision:draft.revision},candidates:[],findings:[{code:'SITE_BOUNDARY_MISSING',severity:'blocking',message:'Draw or load a parcel boundary before assessing a building footprint.'}],disclaimer:'No footprint placement was tested because a parcel boundary is missing.'});
  const result=assessSiteFit(body.siteContext,draft.geometry);
  if(result.geometry)result.geometry.revision=draft.revision;else result.geometry={revision:draft.revision};
  log.addSummary({geometry_revision:draft.revision,site_fit_status:result.status,decision:result.decision,candidate_count:result.candidates.length,placements_examined:result.search?.placementsExamined||0});
  return res.json(result);
 }catch(error){
  log.fail(error);
  if(error instanceof SiteInputError)return res.status(400).json({error_code:'invalid_site_context',message:error.message,field:error.field,request_id:rid});
  if(error instanceof InputError)return sendInputFailure(res,error,rid,error.status===422?'geometry_rejected':'invalid_brief');
  return sendUnexpectedFailure(res,error,rid,'studio_site_fit_failure');
 }
}