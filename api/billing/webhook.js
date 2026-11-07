import {api,config,webhooks,db} from 'hatchable';
import {subscriptionSnapshot} from '../../lib/billing.js';
import {guardBodySize} from '../../lib/request-limits.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
 if(!guardBodySize(req,res,2097152))return;
 try{
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  const secret=await config.get('STRIPE_WEBHOOK_SECRET');
  const parts=String(req.headers['stripe-signature']||'').split(',').map(p=>p.trim().split('=')),ts=parts.find(p=>p[0]==='t')?.[1],sigs=parts.filter(p=>p[0]==='v1').map(p=>p[1]);
  if(!secret||!req.rawBody||!ts||!sigs.length)return res.status(400).json({error:'invalid_signature'});
  let ok=false;for(const signature of sigs)if(await webhooks.verifyHmac({raw:ts+'.'+req.rawBody,signature,secret,timestamp:ts})){ok=true;break;}
  if(!ok)return res.status(400).json({error:'invalid_signature'});
  const e=req.body;
  if(!/^evt_/.test(e?.id||'')||!Number.isSafeInteger(e.created))return res.status(400).json({error:'invalid_event'});
  if(!['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(e.type))return res.json({received:true,ignored:true});
  if((await db.query('SELECT 1 FROM studio_billing_events WHERE event_id=$1',[e.id])).rows.length)return res.json({received:true,duplicate:true});
  const subId=e.type==='checkout.session.completed'?e.data?.object?.subscription:e.data?.object?.id;
  if(typeof subId!=='string'||!/^sub_[A-Za-z0-9]+$/.test(subId))return res.status(400).json({error:'invalid_subscription'});
  const r=await api.stripe.get('/v1/subscriptions/'+encodeURIComponent(subId),{headers:{'Stripe-Version':'2025-03-31.basil'}});
  if(r.status!==200)throw Error('Subscription refresh failed');
  let s;try{s=subscriptionSnapshot(r.body,await config.get('stripe_price_id'));}catch{return res.json({received:true,ignored:true});}
  const person=(await db.query('SELECT email FROM users WHERE id=$1',[s.userId])).rows[0];if(!person)return res.json({received:true,ignored:true});
  await db.query(`WITH accepted AS (
   INSERT INTO studio_billing_events(event_id,event_type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING event_id
  ), account AS (
   INSERT INTO studio_billing_accounts(user_id,customer_id,subscription_id,provider_status,event_created)
   SELECT $3,$4,$5,$6,$7 FROM accepted
   ON CONFLICT(user_id) DO UPDATE SET customer_id=EXCLUDED.customer_id,subscription_id=EXCLUDED.subscription_id,provider_status=EXCLUDED.provider_status,event_created=EXCLUDED.event_created,updated_at=NOW()
   WHERE studio_billing_accounts.event_created<=EXCLUDED.event_created RETURNING user_id
  ) INSERT INTO subscriptions(email,status,plan,period_end,source)
  SELECT $8,$9,'studio',$10::timestamptz,'stripe' FROM account
  ON CONFLICT(email) DO UPDATE SET status=EXCLUDED.status,period_end=EXCLUDED.period_end,plan=EXCLUDED.plan,source='stripe',updated_at=NOW()
  WHERE subscriptions.source='stripe' OR subscriptions.status<>'active'`,[e.id,e.type,s.userId,s.customer,s.id,s.status,e.created,String(person.email).trim().toLowerCase(),s.active?'active':'inactive',s.end]);
  return res.json({received:true});
 }catch{return res.status(503).json({error:'webhook_processing_unavailable'});}
}