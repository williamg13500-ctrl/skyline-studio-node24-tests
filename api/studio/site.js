import {identify,requireBuild} from '../../lib/access.js';
import {analyzeSiteContext,SiteInputError} from '../../lib/site-intelligence.js';
import {requestId,sendUnexpectedFailure} from '../../lib/http-errors.js';
import {beginRequestLog} from '../../lib/request-logging.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='user';
export const methods=['POST'];
export default async function(req,res){
 const rid=requestId();res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',rid);
 const log=beginRequestLog(req,res,{request_id:rid,endpoint:'/api/studio/site',mode:'site-analysis'});
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.site',limit:30,maxBytes:131072}))return;
  const platformUser=req.user;const user=await identify(req);if(!platformUser||!requireBuild(user,res))return;
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const result=analyzeSiteContext(req.body?.siteContext||{});
  log.addSummary({boundary_present:Boolean(result.site.boundary),boundary_area_m2:result.summary.boundaryAreaM2,findings:result.findings.length,decision:result.decision});
  return res.json(result);
 }catch(error){
  log.fail(error);
  if(error instanceof SiteInputError)return res.status(400).json({error_code:'invalid_site_context',message:error.message,field:error.field,request_id:rid});
  return sendUnexpectedFailure(res,error,rid,'studio_site_analysis_failure');
 }
}