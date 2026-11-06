import { identify, requireBuild } from '../../lib/access.js';
import { config } from 'hatchable';
import { buildDraft, InputError } from '../../lib/engine.js';
import { requestId, sendInputFailure, sendUnexpectedFailure } from '../../lib/http-errors.js';
import { beginRequestLog } from '../../lib/request-logging.js';
import { guardStudioRequest } from '../../lib/request-limits.js';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 const rid=requestId();res.setHeader?.('Cache-Control','no-store');res.setHeader?.('X-Request-Id',rid);const requestLog=beginRequestLog(req,res,{request_id:rid,endpoint:'/api/studio/generate',mode:'generate'});
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.generate',limit:10,maxBytes:65536}))return;
  const user=await identify(req);
  if(req.method==='GET')return res.json({role:user.role,email:user.email||null,aiInterpretationEnabled:await config.get('ai_interpretation_enabled')===true});
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(!requireBuild(user,res))return;
  const draft=await buildDraft(req.body);
  const floors=draft.geometry.floors||[],roomCounts={};let rooms=0,walls=0,openings=0,furniture=0;
  for(const floor of floors){const L=floor.L||{};rooms+=(L.R||[]).length;walls+=(L.S||[]).length;openings+=(L.O||[]).length;for(const room of L.R||[]){roomCounts[room.kind]=(roomCounts[room.kind]||0)+1;furniture+=(room.furniture||[]).length;}}
  requestLog.addSummary({geometry_counts:{floors:floors.length,rooms,walls,openings,furniture},room_type_counts:roomCounts});
  return res.json({role:user.role,...draft});
 }catch(error){
  requestLog.fail(error);
  if(error instanceof InputError)return sendInputFailure(res,error,rid,error.status===422?'geometry_rejected':'invalid_brief');
  return sendUnexpectedFailure(res,error,rid,'studio_generate_failure');
 }
}