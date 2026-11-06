import { identify, requireBuild } from '../../lib/access.js';
import { buildDraft, buildDraftFromGeometry, checkExport, InputError, combinedPlans } from '../../lib/engine.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
 res.setHeader?.('Cache-Control','no-store');
 try{
  if(!await guardStudioRequest(req,res,{route:'studio.export',limit:20,maxBytes:2097152}))return;
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(!requireBuild(await identify(req),res))return;
  const {brief,geometry,format,revision}=req.body||{};
  const draft=geometry?await buildDraftFromGeometry(geometry,brief):await buildDraft(brief),blocked=checkExport(draft,format,revision);
  if(blocked){const {status,...body}=blocked;return res.status(status).json(body);}
  return res.json({revision:draft.revision,format,
   content:format==='svg'?combinedPlans(draft):format==='model'?JSON.stringify({revision:draft.revision,geometry:draft.geometry,validation:draft.validation},null,2):JSON.stringify({brief:draft.brief,revision:draft.revision,...draft.validation},null,2)});
 }catch(error){
  if(error instanceof InputError)return res.status(error.status||400).json({error:'invalid_brief',fields:error.fields});
  return res.status(503).json({error:'export_unavailable'});
 }
}