/* INJ Node · Admin Insights access controller.
 * Credentials are verified by /api/inj-node-insights, never persisted locally. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),API='/api/inj-node-insights';
const gate=$('adminGate'),dashboard=$('adminDashboard'),form=$('adminLoginForm');
const user=$('adminUsername'),pass=$('adminPassword'),error=$('adminLoginError'),submit=$('adminLoginButton');
const status=$('adminConnectStatus');
function textError(message){error.textContent=message;error.hidden=!message;}
function displayDashboard(){
 gate.hidden=true;dashboard.hidden=false;pass.value='';
 document.dispatchEvent(new CustomEvent('inj-admin:ready'));
}
function displayLogin(message=''){
 dashboard.hidden=true;gate.hidden=false;
 pass.value='';textError(message);
}
async function getJson(action,opts){
 try{const r=await fetch(API+'?action='+action,{cache:'no-store',credentials:'same-origin',...opts});const data=await r.json().catch(()=>({}));
 return {ok:r.ok,status:r.status,data};}
 catch(_){return {ok:false,status:0,data:{error:'Connessione non disponibile'}};}
}
async function check(){
 const r=await getJson('status');
 if(!r.ok){displayLogin('Il servizio Admin non è ancora disponibile su INJ Node.');return;}
 if(!r.data.configured){
  submit.disabled=true;
  displayLogin('Accesso Admin da configurare nel progetto Vercel di INJ Node: INJ_ADMIN_USERNAME e INJ_ADMIN_PASSWORD, poi Redeploy.');
  return;
 }
 submit.disabled=false;
 if(r.data.authenticated){displayDashboard();status.textContent=r.data.dataConnected?'LIVE DATA / SYNC':'SORGENTE DATI DA COLLEGARE';}
 else displayLogin();
}
form.addEventListener('submit',async e=>{
 e.preventDefault();textError('');submit.disabled=true;submit.textContent='VERIFICA IN CORSO…';
 const r=await getJson('login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({username:user.value,password:pass.value})});
 submit.disabled=false;submit.textContent='ACCEDI ALLE STATISTICHE';
 if(!r.ok){textError(r.data.error||'Accesso non riuscito');pass.value='';return;}
 user.value='';displayDashboard();
 status.textContent='VERIFICA DATI…';
});
$('adminLogout').addEventListener('click',async()=>{
 await getJson('logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 displayLogin();status.textContent='ACCESSO RISERVATO';
});
document.addEventListener('inj-admin:expired',()=>displayLogin('Sessione scaduta. Effettua nuovamente l’accesso.'));
$('adminGoHome').addEventListener('click',e=>{
 if(window.parent!==window){e.preventDefault();parent.postMessage({type:'injnode:section:home'},location.origin);}
});
check();
})();