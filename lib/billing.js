import {config} from 'hatchable';
export const ORIGIN='https://skyline-studio-build.hatchable.site';
export async function billingSettings(){
 const [enabled,approved,price,terms,privacy,refunds]=await Promise.all(['billing_enabled','policies_approved','stripe_price_id','terms_url','privacy_url','refunds_url'].map(k=>config.get(k)));
 return {enabled:enabled===true&&approved===true&&/^price_[A-Za-z0-9]+$/.test(price||'')&&[terms,privacy,refunds].every(v=>typeof v==='string'&&v.startsWith('https://')),price,terms,privacy,refunds};
}
export function subscriptionSnapshot(s,price){
 if(!s||!/^sub_/.test(s.id||'')||!/^cus_/.test(s.customer||'')||typeof s.metadata?.skyline_user_id!=='string')throw Error('Invalid subscription');
 const items=s.items?.data||[];const allowed=items.length===1&&items[0].price?.id===price;
 const end=items[0]?.current_period_end??s.current_period_end;
 const active=allowed&&s.status==='active'&&Number.isFinite(end)&&end*1000>Date.now();
 return {userId:s.metadata.skyline_user_id,customer:s.customer,id:s.id,status:s.status,active,end:Number.isFinite(end)?new Date(end*1000).toISOString():new Date(0).toISOString()};
}