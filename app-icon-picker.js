/* INJ Node · App Icon Picker v16.07.03
   Preview + saved choice + unique Safari Add to Home Screen install links.
   Installed iOS Home Screen icons cannot be replaced programmatically. */
(()=>{
'use strict';
const root=document.documentElement;
const host=document.getElementById('appIconControl');
if(!host)return;
const variants={
 minimal:{title:'Minimal',png180:'inj-node-minimal-180-v16.06.29.png',png192:'inj-node-minimal-192-v16.06.29.png',svg:'inj-node-minimal-v16.06.29.svg'},
 classic:{title:'Classic JN',png180:'inj-node-180-v16.06.28.png',png192:'inj-node-192-v16.06.28.png',svg:'inj-node-icon-v16.06.28.svg'},
 aurora:{title:'Aurora',png180:'inj-node-aurora-180-v16.07.03.png',png192:'inj-node-aurora-192-v16.07.03.png'},
 pulse:{title:'Pulse',png180:'inj-node-pulse-180-v16.07.03.png',png192:'inj-node-pulse-192-v16.07.03.png'}
};
const KEY='inj_node_app_icon_v1',item=id=>document.getElementById(id);
const read=()=>{try{return localStorage.getItem(KEY)}catch(_){return null}};
const save=id=>{try{localStorage.setItem(KEY,id)}catch(_){}};
let selected=Object.hasOwn(variants,read())?read():'minimal';
const lang=()=>root.lang==='en'?'en':'it';
function text(id,value){const el=item(id);if(el&&el.textContent!==value)el.textContent=value}
function apply(){
 const data=variants[selected],english=lang()==='en';
 for(const button of host.querySelectorAll('[data-app-icon]')){
  button.setAttribute('aria-pressed',String(button.dataset.appIcon===selected));
 }
 const preview=item('appIconCurrentPreview');
 if(preview)preview.src='./icons/'+data.png180;
 text('appIconTitle',english?'App icon':'Icona app');
 text('appIconSubtitle',data.title+' · '+(english?'choose style':'scegli stile'));
 text('appIconNote',english?
  'iPhone cannot change an existing Home Screen app icon automatically. Open the dedicated page in Safari and add INJ Node to your Home Screen again. Back up locally stored wallets and settings before replacing an installation.':
  'Su iPhone l’icona già installata non cambia automaticamente. Apri la pagina dedicata in Safari e aggiungi di nuovo INJ Node alla Home. Salva prima i wallet e le impostazioni memorizzati solo nel dispositivo.');
 text('appIconInstallText',english?'Open selected icon installation page':'Apri pagina per installare l’icona');
 const link=item('appIconInstallLink');
 if(link)link.href='./install-icon-'+selected+'.html';
 host.querySelector('#appIconChoices')?.setAttribute('aria-label',english?'App icon styles':'Stili icona app');
 // Update metadata of the open Safari page. A static per-icon install page
 // exists because iOS may snapshot apple-touch-icon before runtime updates.
 const apple=document.querySelector('link[rel="apple-touch-icon"]');
 if(apple)apple.href='./icons/'+data.png180;
 const favicon=document.querySelector('link[rel="icon"][type="image/png"]');
 if(favicon)favicon.href='./icons/'+data.png192;
 const svg=document.querySelector('link[rel="icon"][type="image/svg+xml"]');
 if(svg){
  if(data.svg){svg.href='./icons/'+data.svg;svg.disabled=false;svg.type='image/svg+xml'}
  else {svg.remove();}
 }
}
for(const button of host.querySelectorAll('[data-app-icon]')){
 button.addEventListener('click',()=>{
  const value=button.dataset.appIcon;
  if(!Object.hasOwn(variants,value))return;
  selected=value;save(value);apply();
 });
}
const watch=new MutationObserver(changes=>{
 if(changes.some(x=>x.attributeName==='lang'))apply();
});
watch.observe(root,{attributes:true,attributeFilter:['lang']});
window.addEventListener('storage',event=>{
 if(event.key===KEY && Object.hasOwn(variants,event.newValue)){
  selected=event.newValue;apply();
 }
});
apply();
})();
