(async()=>{
 const $=id=>document.getElementById(id);let enabled=false;
 const response=await fetch('/api/billing/session',{cache:'no-store'}).catch(()=>null);const data=response?await response.json().catch(()=>null):null;
 if(!data){$('status').textContent='Billing availability could not be checked. Please retry.';return;}
 enabled=data.enabled===true;$('status').textContent=enabled?'Billing is configured. Sign in with your Studio account before continuing.':'Online payments are not active. The owner must complete Stripe and policy setup.';
 for(const [name,key]of [['Terms','terms'],['Privacy','privacy'],['Cancellation and refunds','refunds']])if(data[key]?.startsWith('https://')){const a=document.createElement('a');a.href=data[key];a.textContent=name;a.style.marginRight='20px';$('policies').append(a);}
 $('portal').disabled=!enabled;$('accept').addEventListener('change',()=>$('checkout').disabled=!enabled||!$('accept').checked);
 for(const action of ['checkout','portal'])$(action).addEventListener('click',async()=>{const b=$(action);b.disabled=true;try{const r=await fetch('/api/billing/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,acceptedPolicies:$('accept').checked})});const d=await r.json();if(!r.ok)throw Error(d.message||d.error);location.assign(d.url);}catch(e){$('status').textContent=e.message;}finally{b.disabled=action==='checkout'?!enabled||!$('accept').checked:!enabled;}});
})();