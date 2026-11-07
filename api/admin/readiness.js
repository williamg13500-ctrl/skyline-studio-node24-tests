import {admin,config,ai,api} from 'hatchable';
import {billingSettings} from '../../lib/billing.js';
export const access='admin';
export const methods=['GET','POST'];
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!await admin.check(req))return res.status(403).json({error:'admin_required'});
 try{
  if(req.method==='POST'&&req.body?.action==='test_ai'){
   const model=req.body.model||'gpt-mini';if(!['gpt-mini','haiku','gemini'].includes(model))return res.status(400).json({error:'invalid_model'});
   try{const result=await ai.generateText({model,prompt:'Reply with OK only.',maxTokens:8,purpose:'skyline-provider-setup-test'});return res.json({ok:result.text.trim()==='OK',message:'Provider responded. This confirms a connection, not architectural accuracy.'});}
   catch{return res.status(412).json({error:'ai_setup_required',message:'No working key for this provider. Connect it in Hatchable Setup, then test again.'});}
  }
  if(req.method==='POST'&&req.body?.action==='test_stripe'){
   const price=await config.get('stripe_price_id');if(!/^price_[A-Za-z0-9]+$/.test(price||''))return res.status(412).json({error:'price_required'});
   try{const r=await api.stripe.get('/v1/prices/'+price,{headers:{'Stripe-Version':'2025-03-31.basil'}});if(r.status!==200||!r.body?.recurring||!r.body.active)throw Error();return res.json({ok:true,testMode:r.body.livemode===false,currency:r.body.currency,unitAmount:r.body.unit_amount,interval:r.body.recurring.interval,message:'Recurring price verified. Checkout, webhook and cancellation must still be tested before live activation.'});}
   catch{return res.status(412).json({error:'stripe_setup_required',message:'Connect Stripe and a valid recurring price, then test again.'});}
  }
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const b=await billingSettings();return res.json({aiInterpretationEnabled:await config.get('ai_interpretation_enabled')===true,billingEnabled:b.enabled,policiesApproved:await config.get('policies_approved')===true,priceConfigured:Boolean(b.price),policyLinks:{terms:b.terms,privacy:b.privacy,refunds:b.refunds},renderEnabled:await config.get('render_enabled')===true,constructionExportAllowed:false,professionalReview:'No verified professional provider or construction document production is connected.'});
 }catch{return res.status(503).json({error:'readiness_unavailable'});}
}