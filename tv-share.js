// External display helper. Screen mirroring is started from iOS Control Center.
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 function ready(){
  const dialog=$('tvShareDialog'),launch=$('tvShareMenuButton'),input=$('tvStandaloneLink'),feedback=$('tvShareFeedback');
  if(!dialog||!launch)return;
  const url=new URL('./tv-display.html',location.href).href;
  if(input)input.value=url;
  launch.addEventListener('click',()=>{if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');});
  $('tvShareClose')?.addEventListener('click',()=>dialog.close?.());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close?.();});
  $('tvCopyLink')?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(url);feedback.textContent='Link TV copiato';}
    catch(_){if(input){input.focus();input.select();}feedback.textContent='Seleziona il link e copialo';}
  });
  $('tvShareLink')?.addEventListener('click',async()=>{
    if(navigator.share)try{await navigator.share({title:'INJ Node · Schermo TV',url});}catch(_){}
    else try{await navigator.clipboard.writeText(url);feedback.textContent='Link copiato';}catch(_){feedback.textContent='Copia il link manualmente';}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();