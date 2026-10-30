/* INJ Node · 5 selectable typefaces including the original fallback stack. */
(function(){
'use strict';
const STORE='inj_node_font_v1',root=document.documentElement;
const fonts=[
 {id:'original',name:'INJ Original',font:'"Supply Mono","PP Supply Mono","INJ IBM Plex Mono","IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace',subtitleIt:'Tipografia storica di INJ Node',subtitleEn:'Original INJ Node typography',weight:400},
 {id:'inter-light',name:'Inter Light · Classico',font:'"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',subtitleIt:'Il carattere utilizzato prima del cambio',subtitleEn:'Typeface used before the font change',weight:300},
 {id:'geist',name:'Geist',font:'"INJ Geist","Geist",-apple-system,BlinkMacSystemFont,sans-serif',subtitleIt:'Minimal premium',subtitleEn:'Minimal premium',weight:400},
 {id:'space',name:'Space Grotesk',font:'"INJ Space Grotesk","Space Grotesk",-apple-system,BlinkMacSystemFont,sans-serif',subtitleIt:'Tech luxury',subtitleEn:'Tech luxury',weight:500},
 {id:'plex',name:'IBM Plex Mono',font:'"INJ IBM Plex Mono","IBM Plex Mono",ui-monospace,monospace',subtitleIt:'Terminale finanziario',subtitleEn:'Financial terminal',weight:400},
 {id:'oxanium',name:'Oxanium',font:'"INJ Oxanium","Oxanium",sans-serif',subtitleIt:'Future terminal',subtitleEn:'Future terminal',weight:500}
];
const byId=Object.fromEntries(fonts.map(f=>[f.id,f]));
let active='space';
function current(){try{const id=localStorage.getItem(STORE);return id==='inter'?'inter-light':(byId[id]?id:'space')}catch(_){return 'space'}}
function english(){try{return localStorage.getItem('inj_node_language_v1')==='en'||root.lang==='en'}catch(_){return root.lang==='en'}}
function change(id,save){
 active=byId[id]?id:'space';
 root.setAttribute('data-inj-font',active);
 if(save){try{localStorage.setItem(STORE,active)}catch(_){}}
 refresh();
 try{window.dispatchEvent(new CustomEvent('injnode:fontchange',{detail:{font:active}}))}catch(_){}
 if(save && window.requestAnimationFrame)requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
function refresh(){
 const holder=document.getElementById('injFontSelector');if(!holder)return;
 const en=english(),caption=holder.querySelector('.menu-font-current');
 if(caption)caption.textContent=(en?'Selected: ':'Selezionato: ')+byId[active].name;
 const note=holder.querySelector('.menu-font-note');
 if(note)note.textContent=en?
  'Six ready-to-use choices, including Inter Light and INJ Original (Supply Mono if installed, otherwise IBM Plex Mono). Changes apply across the app and are saved on this device.':
  'Sei scelte disponibili, incluso Inter Light e INJ Original (Supply Mono se installato, altrimenti IBM Plex Mono). La scelta vale in tutta l’app e viene salvata sul dispositivo.';
 holder.setAttribute('aria-label',en?'Interface font':'Font interfaccia');
 holder.querySelectorAll('[data-inj-font-choice]').forEach(button=>{
  const f=byId[button.getAttribute('data-inj-font-choice')];
  const pressed=f.id===active;
  button.setAttribute('aria-pressed',pressed?'true':'false');
  button.setAttribute('aria-label',(en?'Use ':'Usa ')+f.name);
  const description=button.querySelector('.menu-font-description');
  if(description)description.textContent=en?f.subtitleEn:f.subtitleIt;
 });
 const pref=document.getElementById('menuPreferencesAccordion');
 if(pref){
  const sub=pref.querySelector('.menu-compact-subtitle');
  if(sub)sub.textContent=en?'Theme · Font · Language · App icon':'Tema · Font · Lingua · Icona app';
 }
}
function setup(){
 const target=document.getElementById('themeControl');
 if(!target || document.getElementById('injFontSelector'))return;
 const holder=document.createElement('details');holder.className='menu-font-control';holder.id='injFontSelector';
 holder.innerHTML=
  '<summary class="menu-action menu-setting menu-font-trigger">'+
   '<span class="menu-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 7V5h16v2M12 5v14M8 19h8M7 14l5-9 5 9"/></svg></span>'+
   '<span class="menu-action-copy"><strong class="menu-font-title">Font</strong><small class="menu-font-current">Space Grotesk</small></span>'+
   '<svg class="menu-font-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>'+
  '</summary><div class="menu-font-options" role="group" aria-label="Font"></div><p class="menu-font-note"></p>';
 const options=holder.querySelector('.menu-font-options');
 fonts.forEach(f=>{
  const button=document.createElement('button');button.type='button';button.className='menu-font-option';
  button.setAttribute('data-inj-font-choice',f.id);
  const top=document.createElement('span');top.className='menu-font-name';
  const label=document.createElement('span');label.textContent=f.name;
  const check=document.createElement('span');check.className='menu-font-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
  top.append(label,check);
  const sample=document.createElement('span');sample.className='menu-font-sample';sample.textContent='INJ  1,248.60';
  const subtitle=document.createElement('small');subtitle.className='menu-font-description';
  label.style.setProperty('font-family',f.font,'important');label.style.setProperty('font-weight',String(f.weight),'important');
  sample.style.setProperty('font-family',f.font,'important');sample.style.setProperty('font-weight',String(f.weight),'important');
  button.append(top,sample,subtitle);
  button.addEventListener('click',()=>change(f.id,true));
  options.appendChild(button);
 });
 target.insertAdjacentElement('afterend',holder);
 refresh();
 window.addEventListener('injnode:languagechange',refresh);
}
change(current(),false); // Runs inside <head> on every INJ Node page.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(setup,0));
else setTimeout(setup,0);
window.addEventListener('storage',event=>{
 if(event.key===STORE)change(current(),false);
 if(event.key==='inj_node_language_v1')refresh();
});
if(document.fonts&&document.fonts.ready){
 document.fonts.ready.then(()=>{try{window.dispatchEvent(new Event('resize'))}catch(_){}}).catch(()=>{});
}
})();