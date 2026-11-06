(()=>{
 const $=id=>document.getElementById(id),A=window.hatchable?.auth;let step='email',hasPasskey=false;
 const raw=new URLSearchParams(location.search).get('next'),next=['/studio.html','/billing.html'].includes(raw)?raw:'/studio.html';
 const done=()=>location.replace(next),say=t=>$('login-message').textContent=t;
 const declined=()=>{try{return localStorage.getItem('skyline-passkey-declined')==='1';}catch{return false;}};
 const decline=()=>{try{localStorage.setItem('skyline-passkey-declined','1');}catch{}};
 function finish(){if(hasPasskey||declined()||!A.registerPasskey||!A.supportsPasskeys?.()){done();return;}step='passkey';$('login-form').hidden=true;$('passkey').hidden=false;$('title').textContent='You are signed in';say('');$('passkey-add').focus();}
 if(!A){say('Sign-in is unavailable. Please refresh.');$('submit').disabled=true;return;}
 A.getSession().then(s=>{if(s?.user)done();}).catch(()=>{});
 try{A.attachPasskeyAutofill?.($('email')).then(r=>{if(r?.user)done();}).catch(()=>{});}catch{}
 $('back').addEventListener('click',()=>{step='email';$('email-row').hidden=false;$('code-row').hidden=true;$('code').required=false;$('back').hidden=true;$('submit').textContent='Continue';say('');});
 $('login-form').addEventListener('submit',async e=>{e.preventDefault();$('submit').disabled=true;try{
  if(step==='email'){const result=await A.startLogin({email:$('email').value.trim()});hasPasskey=Boolean(result?.has_passkey);if(hasPasskey&&A.supportsPasskeys?.()){try{const d=await A.signInWithPasskey({email:$('email').value.trim()});if(d?.user){done();return;}}catch{}}
   step='code';$('email-row').hidden=true;$('code-row').hidden=false;$('code').required=true;$('back').hidden=false;$('submit').textContent='Sign in';say('Enter the code sent to your email.');$('code').focus();
  }else{const d=await A.verifyCode({email:$('email').value.trim(),code:$('code').value.trim()});if(d?.user)finish();else say('That code did not work. Try again.');}
 }catch(e){say(e.status===429?'Too many attempts. Wait before trying again.':'Sign-in failed. Check your email and code.');}finally{$('submit').disabled=false;}});
 $('passkey-add').addEventListener('click',async()=>{$('passkey-add').disabled=true;$('passkey-skip').disabled=true;try{const r=await A.registerPasskey();if(!r)decline();done();}catch{say('Could not save the passkey. You can continue without one.');$('passkey-add').disabled=false;$('passkey-skip').disabled=false;}});
 $('passkey-skip').addEventListener('click',()=>{decline();done();});
})();