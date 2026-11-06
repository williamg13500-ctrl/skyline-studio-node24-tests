import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','POST'];
export default async function(req,res){
 res.setHeader?.('Cache-Control','no-store');
 try{
  if(req.method==='GET'){
   const result=await db.query('SELECT email, status, period_end, source, updated_at FROM subscriptions ORDER BY updated_at DESC LIMIT 200');
   return res.json({subscriptions:result.rows});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  const body=req.body||{},email=String(body.email||'').trim().toLowerCase(),action=body.action;
  if(!/^[^@\s]{1,64}@[^@\s]{1,255}$/.test(email)||email.length>320)return res.status(400).json({error:'Enter a valid email.'});
  if(action!=='grant'&&action!=='revoke')return res.status(400).json({error:'Invalid action.'});
  const days=Number(body.days);
  if(action==='grant'&&(body.days===null||String(body.days).trim()===''||!Number.isInteger(days)||days<0||days>3650))return res.status(400).json({error:'Access length must be a whole number from 0 to 3650 days.'});
  const end=action==='grant'&&days?new Date(Date.now()+days*864e5).toISOString():null,status=action==='grant'?'active':'inactive';
  await db.query("INSERT INTO subscriptions (email, status, period_end, source, updated_at) VALUES ($1, $2, $3, 'manual', NOW()) ON CONFLICT (email) DO UPDATE SET status = $2, period_end = $3, source = 'manual', updated_at = NOW()",[email,status,end]);
  return res.json({ok:true,email,status,period_end:end});
 }catch{return res.status(503).json({error:'Subscriber access could not be updated or loaded. Please retry.'});}
}