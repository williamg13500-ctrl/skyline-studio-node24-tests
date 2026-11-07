import {api,auth,db} from 'hatchable';
import {billingSettings,ORIGIN} from '../../lib/billing.js';
import {guardStudioRequest} from '../../lib/request-limits.js';
export const access='public';
export const methods=['GET','POST'];
const headers={'Stripe-Version':'2025-03-31.basil'};
export default async function(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!await guardStudioRequest(req,res,{route:'billing.session',limit:10,maxBytes:16384}))return;
  const setup=await billingSettings();
  if(req.method==='GET')return res.json({enabled:setup.enabled,terms:setup.terms,privacy:setup.privacy,refunds:setup.refunds});
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const user=req.user||await auth.getUser(req);if(!user?.id)return res.status(401).json({error:'sign_in_required',message:'Sign in with your Studio user account before managing billing.'});
  if(!setup.enabled)return res.status(412).json({error:'billing_setup_required',message:'Online billing is not active. Stripe, pricing and approved policies must be configured by the owner.'});
  const account=(await db.query('SELECT customer_id,subscription_id,provider_status FROM studio_billing_accounts WHERE user_id=$1',[user.id])).rows[0];
  if(req.body?.action==='portal'){
   if(!account)return res.status(404).json({error:'no_billing_account'});
   const r=await api.stripe.post('/v1/billing_portal/sessions',{headers,body:{customer:account.customer_id,return_url:ORIGIN+'/billing.html'}});
   if(r.status!==200||typeof r.body?.url!=='string'||!r.body.url.startsWith('https://billing.stripe.com/'))throw Error('Portal unavailable');
   return res.json({url:r.body.url});
  }
  if(req.body?.action!=='checkout'||req.body.acceptedPolicies!==true)return res.status(400).json({error:'accept_policies',message:'Read and accept the published policies before opening checkout.'});
  if(account&&['active','trialing','past_due','unpaid','incomplete','paused'].includes(account.provider_status))return res.status(409).json({error:'subscription_exists',message:'Manage your existing subscription in the billing portal.'});
  const r=await api.stripe.post('/v1/checkout/sessions',{headers:{...headers,'Idempotency-Key':'skyline-checkout-'+user.id+'-'+Math.floor(Date.now()/600000)},body:{mode:'subscription',client_reference_id:String(user.id),...(account?{customer:account.customer_id}:{customer_email:user.email}), 'line_items[0][price]':setup.price,'line_items[0][quantity]':1,'subscription_data[metadata][skyline_user_id]':String(user.id),'metadata[skyline_user_id]':String(user.id),'consent_collection[terms_of_service]':'required',success_url:ORIGIN+'/billing.html?checkout=returned',cancel_url:ORIGIN+'/billing.html?checkout=cancelled'}});
  if(r.status!==200||typeof r.body?.url!=='string'||!r.body.url.startsWith('https://checkout.stripe.com/'))throw Error('Checkout unavailable');
  return res.json({url:r.body.url,message:'Entitlement activates only after the verified provider webhook.'});
 }catch(error){return res.status(error.code==='SetupRequired'?412:503).json({error:'billing_unavailable',message:'Billing is not connected or the provider could not complete this request. No entitlement was changed.'});}
}