/* INJ Node · three-font selector. No effects on data, layouts or navigation. */
(function(){
 'use strict';
 var STORE='inj_node_font_v1';
 var root=document.documentElement;
 var FONTS=[
  {id:'noto-light',name:'Noto Sans Mono Light',stack:'"Noto Sans Mono","SFMono-Regular",Menlo,Consolas,monospace',weight:'300',captionIt:'Minimal · leggero',captionEn:'Minimal · light'},
  {id:'pt-mono',name:'PT Mono Regular',stack:'"PT Mono","SFMono-Regular",Menlo,Consolas,monospace',weight:'400',captionIt:'Terminal · equilibrato',captionEn:'Terminal · balanced'},
  {id:'inter-semibold',name:'Inter SemiBold',stack:'"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',weight:'600',captionIt:'Moderno · più deciso',captionEn:'Modern · bolder'}
 ];
 var byId=Object.fromEntries(FONTS.map(function(f){return [f.id,f]}));
 var ACTIVE='noto-light';
 function selected(){
  try{
   var id=localStorage.getItem(STORE);
   return byId[id] ? id : 'noto-light';
  }catch(_){return 'noto-light'}
 }
 function english(){
  try{return localStorage.getItem('inj_node_language_v1')==='en'||root.lang==='en'}
  catch(_){return root.lang==='en'}
 }
 function updateUi(){
  var holder=document.getElementById('injFontSelector');
  if(!holder)return;
  var en=english(), font=byId[ACTIVE];
  var title=holder.querySelector('.menu-font-title');
  var current=holder.querySelector('.menu-font-current');
  var note=holder.querySelector('.menu-font-note');
  if(title)title.textContent='Font';
  if(current)current.textContent=(en?'Current: ':'Attuale: ')+font.name;
  if(note)note.textContent=en ?
   'Three typefaces for all INJ Node pages. Selection is saved on this device.' :
   'Tre stili per tutte le sezioni di INJ Node. La scelta viene salvata sul dispositivo.';
  holder.setAttribute('aria-label',en?'Interface font':'Carattere interfaccia');
  holder.querySelectorAll('[data-inj-font-choice]').forEach(function(button){
   var id=button.getAttribute('data-inj-font-choice');
   button.setAttribute('aria-pressed',id===ACTIVE?'true':'false');
   button.setAttribute('aria-label',(en?'Use ':'Usa ')+byId[id].name);
   var desc=button.querySelector('.menu-font-description');
   if(desc)desc.textContent=en?byId[id].captionEn:byId[id].captionIt;
  });
  var pref=document.getElementById('menuPreferencesAccordion');
  if(pref){
   var sub=pref.querySelector('.menu-compact-subtitle');
   if(sub)sub.textContent=en?'Theme · Font · Language · App icon':'Tema · Font · Lingua · Icona app';
  }
 }
 function apply(id,save){
  if(!byId[id])id='noto-light';
  ACTIVE=id;
  root.setAttribute('data-inj-font',id);
  if(save){try{localStorage.setItem(STORE,id)}catch(_){}}
  updateUi();
  try{window.dispatchEvent(new CustomEvent('injnode:fontchange',{detail:{font:id}}))}catch(_){}
  /* Charts listening to resize can repaint SVG/canvas labels in the selected face. */
  if(save){try{window.dispatchEvent(new Event('resize'))}catch(_){}}
 }
 /* Executed synchronously in head, before the body is painted. */
 apply(selected(),false);
 function setup(){
  var target=document.getElementById('themeControl');
  if(!target||document.getElementById('injFontSelector'))return;
  var holder=document.createElement('details');
  holder.className='menu-font-control';holder.id='injFontSelector';
  holder.innerHTML=
   '<summary class="menu-action menu-setting menu-font-trigger">'+
    '<span aria-hidden="true" class="menu-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 7V5h16v2M12 5v14M8 19h8M7 14l5-9 5 9"/></svg></span>'+
    '<span class="menu-action-copy"><strong class="menu-font-title">Font</strong><small class="menu-font-current">Attuale: Noto Sans Mono Light</small></span>'+
    '<svg aria-hidden="true" class="menu-font-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>'+
   '</summary>'+
   '<div class="menu-font-options" id="injFontOptions" role="group" aria-label="Font"></div>'+
   '<p class="menu-font-note"></p>';
  var opts=holder.querySelector('.menu-font-options');
  FONTS.forEach(function(f){
   var item=document.createElement('button');item.type='button';item.className='menu-font-option';
   item.setAttribute('data-inj-font-choice',f.id);item.setAttribute('aria-pressed','false');
   var nam=document.createElement('span');nam.className='menu-font-name';
   var title=document.createElement('span');title.textContent=f.name;
   var check=document.createElement('span');check.className='menu-font-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
   nam.append(title,check);
   var sample=document.createElement('span');sample.className='menu-font-sample';sample.textContent='INJ  1,248.60';
   var description=document.createElement('small');description.className='menu-font-description';
   title.style.setProperty('font-family',f.stack,'important');
   sample.style.setProperty('font-family',f.stack,'important');
   title.style.setProperty('font-weight',f.weight,'important');
   sample.style.setProperty('font-weight',f.weight,'important');
   item.append(nam,sample,description);
   item.addEventListener('click',function(){apply(f.id,true)});
   opts.appendChild(item);
  });
  target.insertAdjacentElement('afterend',holder);
  updateUi();
  window.addEventListener('injnode:languagechange',updateUi);
  window.addEventListener('storage',function(e){
   if(e.key===STORE)apply(selected(),false);
   if(e.key==='inj_node_language_v1')updateUi();
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(setup,0)});
 else setTimeout(setup,0);
 /* Settings are on Home; other sections still follow the same stored choice. */
 window.addEventListener('storage',function(e){if(e.key===STORE)apply(selected(),false)});
})();
