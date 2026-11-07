(async()=>{
 const $=id=>document.getElementById(id),buttons=['test-ai','test-stripe'];
 buttons.forEach(id=>$(id).disabled=true);
 function ownerSignIn(url){
  const link=document.createElement('a');
  try{const target=new URL(url||'https://hatchable.com/console/login');if(target.protocol!=='https:'||target.hostname!=='hatchable.com')throw Error();link.href=target.href;}catch{link.href='https://hatchable.com/console/login';}
  link.className='button button-outline';link.textContent='Sign in as project owner';$('setup-state').append(document.createElement('br'),link);
 }
 async function request(options={}){
  const response=await fetch('/api/admin/readiness',{cache:'no-store',redirect:'manual',...options});
  if(response.type==='opaqueredirect')return {signIn:true};
  const data=await response.json().catch(()=>({}));
  if(response.status===401)return {signIn:true,loginUrl:data.login_url};
  if(response.status===403)throw Error('Only the project owner or an administrator can inspect or test these connections.');
  if(!response.ok)throw Error(data.message||data.error||'Configuration could not be checked. Please reload to retry.');
  return {data};
 }
 try{
  const result=await request();
  if(result.signIn){$('setup-state').textContent='Sign in with the Hatchable account that owns Skyline, then return to this setup page.';ownerSignIn(result.loginUrl);}
  else{$('setup-state').textContent='Configuration flags shown below. Provider tests and real workflow checks are separate.';$('readiness').textContent=JSON.stringify(result.data,null,2);buttons.forEach(id=>$(id).disabled=false);}
 }catch(e){$('setup-state').textContent=e.message;}
 for(const [id,action,target]of [['test-ai','test_ai','ai-result'],['test-stripe','test_stripe','stripe-result']])$(id).addEventListener('click',async()=>{
  $(id).disabled=true;$(target).textContent='Testing…';let signedOut=false;
  try{const result=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,model:$('model').value})});
   if(result.signIn){signedOut=true;$(target).textContent='Your owner session expired. Sign in again, then reload this page.';$('setup-state').textContent='Owner sign-in required.';ownerSignIn(result.loginUrl);buttons.forEach(button=>$(button).disabled=true);}
   else $(target).textContent=result.data.message||'Test complete.';
  }catch(e){$(target).textContent=e.message||'Connection test failed. Please retry.';}finally{if(!signedOut)$(id).disabled=false;}
 });
})();