/* INJ Node · Appearance font switcher.
   Only the selected face changes; no manipulation of trading values,
   DOM geometries or existing navigation/settings handlers. */
(function(){
 'use strict';
 var STORE='inj_node_font_v1', ACTIVE='inter', root=document.documentElement;
 var FONTS=[
  {id:'inter',name:'Inter Light',stack:'"Inter",Arial,sans-serif',url:''},
  {id:'bitcount',name:'Handjet · Double Round Bold',stack:'"INJ Handjet","Inter",sans-serif',url:''},
  {id:'roboto',name:'Roboto',stack:'"Roboto",Arial,sans-serif',url:'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400&display=swap'},
  {id:'dm-sans',name:'DM Sans',stack:'"DM Sans",Arial,sans-serif',url:'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap'},
  {id:'jakarta',name:'Plus Jakarta Sans',stack:'"Plus Jakarta Sans",Arial,sans-serif',url:'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400&display=swap'},
  {id:'neue-haas',name:'Neue Haas Grotesk',stack:'"Neue Haas Grotesk Text","Neue Haas Grotesk Display","Neue Haas Grotesk",Helvetica,Arial,sans-serif',url:''},
  {id:'helvetica',name:'Helvetica',stack:'Helvetica,"Helvetica Neue",Arial,sans-serif',url:''},
  {id:'plex-mono',name:'IBM Plex Mono',stack:'"IBM Plex Mono","SFMono-Regular",monospace',url:'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400&display=swap'}
 ];
 var byId=Object.fromEntries(FONTS.map(function(f){return [f.id,f]}));
 var loadedLinks=Object.create(null);
 function selected(){
  try{var id=localStorage.getItem(STORE);return byId[id]?id:'inter'}catch(_){return 'inter'}
 }
 function loadFace(id){
  var font=byId[id];if(!font||!font.url||loadedLinks[id])return;
  loadedLinks[id]=true;
  var l=document.createElement('link');l.rel='stylesheet';l.href=font.url;l.dataset.injFontAsset=id;
  document.head.appendChild(l);
 }
 function apply(id,save){
  if(!byId[id])id='inter';
  ACTIVE=id;
  if(id==='inter')root.removeAttribute('data-inj-font');
  else root.setAttribute('data-inj-font',id);
  loadFace(id);
  if(save){try{localStorage.setItem(STORE,id)}catch(_){}}
  updateUi();
  try{window.dispatchEvent(new CustomEvent('injnode:fontchange',{detail:{font:id}}))}catch(_){}
 }
 /* Run in <head> before the body is parsed, on every INJ Node page. */
 apply(selected(),false);
 function isEnglish(){
  try{return localStorage.getItem('inj_node_language_v1')==='en'||root.lang==='en'}catch(_){return root.lang==='en'}
 }
 function updateUi(){
  var holder=document.getElementById('injFontSelector');
  if(!holder)return;
  var en=isEnglish(), name=byId[ACTIVE].name;
  var caption=holder.querySelector('.menu-font-current');
  var title=holder.querySelector('.menu-font-title');
  var note=holder.querySelector('.menu-font-note');
  if(title)title.textContent='Font';
  if(caption)caption.textContent=(en?'Current: ':'Attuale: ')+name;
  if(note)note.textContent=en?
   'Applies to every section of this app on this device. Handjet Double Round Bold uses a thicker double-grid of round dots and slightly wider spacing on key figures; compact labels stay crisp. Neue Haas Grotesk requires a licensed font; otherwise Helvetica or Arial is used.':
   'La scelta vale in questa app su questo dispositivo. Handjet Double Round Bold ha punti circolari più marcati e cifre leggermente più distese; le etichette restano nitide. Neue Haas Grotesk richiede una licenza; altrimenti si usa Helvetica o Arial.';
  holder.setAttribute('aria-label',en?'Interface font':'Carattere interfaccia');
  var options=holder.querySelectorAll('[data-inj-font-choice]');
  options.forEach(function(button){
   var active=button.getAttribute('data-inj-font-choice')===ACTIVE;
   button.setAttribute('aria-pressed',active?'true':'false');
   button.setAttribute('aria-label',(en?'Use ':'Usa ')+byId[button.getAttribute('data-inj-font-choice')].name);
  });
  var pref=document.getElementById('menuPreferencesAccordion');
  if(pref){
   var sub=pref.querySelector('.menu-compact-subtitle');
   if(sub && !sub.dataset.injFontsCaptionWrapped){
    /* The menu-localization script may update this text afterward. */
    sub.dataset.injFontsCaptionWrapped='1';
   }
   if(sub)sub.textContent=en?'Theme · Font · Language · App icon':'Tema · Font · Lingua · Icona app';
  }
 }
 function loadPreviewFonts(){
  FONTS.forEach(function(font){loadFace(font.id)});
 }
 function setup(){
  var target=document.getElementById('themeControl');
  if(!target||document.getElementById('injFontSelector'))return;
  var holder=document.createElement('details');
  holder.className='menu-font-control';holder.id='injFontSelector';
  holder.innerHTML=
   '<summary class="menu-action menu-setting menu-font-trigger">'+
    '<span aria-hidden="true" class="menu-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 7V5h16v2M12 5v14M8 19h8M7 14l5-9 5 9"/></svg></span>'+
    '<span class="menu-action-copy"><strong class="menu-font-title">Font</strong><small class="menu-font-current">Attuale: Inter Light</small></span>'+
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
   /* Important inline faces overcome the pre-existing high-specificity Inter reset. */
   title.style.setProperty('font-family',f.stack,'important');
   sample.style.setProperty('font-family',f.stack,'important');
   sample.style.setProperty('font-weight',f.id==='bitcount'?'700':'400','important');
   if(f.id==='bitcount'){
    sample.style.setProperty('font-variation-settings','"ELGR" 2,"ELSH" 8,"wght" 700','important');
    title.style.setProperty('font-variation-settings','"ELGR" 2,"ELSH" 8,"wght" 700','important');
   }
   item.append(nam,sample);
   item.addEventListener('click',function(){apply(f.id,true)});
   opts.appendChild(item);
  });
  target.insertAdjacentElement('afterend',holder);
  holder.addEventListener('toggle',function(){if(holder.open)loadPreviewFonts()});
  updateUi();
  window.addEventListener('injnode:languagechange',updateUi);
  window.addEventListener('storage',function(e){
   if(!e.key||e.key==='inj_node_language_v1')updateUi();
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){
  /* Existing deferred settings scripts first move the native Theme item. */
  setTimeout(setup,0);
 });
 else setTimeout(setup,0);
 /* For other tabs/pages, apply font immediately without needing the picker. */
 window.addEventListener('storage',function(e){
  if(e.key===STORE)apply(selected(),false);
 });
})();
