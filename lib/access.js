import { db, admin, auth, config } from 'hatchable';
export async function identify(req) {
 if(await admin.check(req))return {role:'admin'};
 // req.user is supplied by Hatchable middleware, never read from request body.
 const user=req.user || await auth.getUser(req);
 if(!user)return {role:'anon'};
 const email=String(user.email||'').trim().toLowerCase();
 const result=await db.query("SELECT 1 FROM subscriptions WHERE email = $1 AND status = 'active' AND (period_end IS NULL OR period_end > NOW())",[email]);
 const preview=!result.rows.length && await config.get('studio_access_mode')==='preview';
 return {role:result.rows.length?'subscriber':preview?'preview':'user',email,id:user.id};
}
export function requireBuild(user,res){
 if(user.role==='anon'){res.status(401).json({error:'sign_in_required'});return false;}
 if(user.role==='user'){res.status(402).json({error:'subscription_required'});return false;}
 return true;
}