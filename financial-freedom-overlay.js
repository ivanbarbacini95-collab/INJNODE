/* Financial Freedom overlay: retain Home, wallet selection and scroll position.
   Isolated same-origin child reads only INJ_FINANCIAL_FREEDOM_SOURCE. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 let previousFocus=null,open=false;
 const overlay=()=> $('injFreedomOverlay');
 const frame=()=> $('injFreedomFrame');
 function openView(){
  if(open)return;
  if(!overlay()||!frame())return;
  open=true;
  previousFocus=document.activeElement;
  window.INJ_HOME_SCROLL?.save?.();
  overlay().hidden=false;
  document.documentElement.classList.add('inj-freedom-open');
  document.body.classList.add('inj-freedom-open');
  if(!frame().getAttribute('src')){
   frame().src='./financial-freedom.html?v=20261028freedom2';
  } else {
   try{frame().contentWindow?.postMessage({type:'injnode:freedom-refresh'},location.origin)}catch(_){}
  }
 }
 function closeView(){
  if(!open)return;
  open=false;
  overlay().hidden=true;
  document.documentElement.classList.remove('inj-freedom-open');
  document.body.classList.remove('inj-freedom-open');
  previousFocus?.focus?.({preventScroll:true});
  previousFocus=null;
 }
 function setup(){
  const button=$('entryFreedomButton');
  if(!button||!overlay()||!frame())return;
  button.addEventListener('click',openView);
  window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.source!==frame().contentWindow)return;
   if(event.data?.type==='injnode:freedom-close')closeView();
  });
  document.addEventListener('keydown',event=>{
   if(open&&event.key==='Escape'){event.preventDefault();closeView()}
  });
  window.addEventListener('pageshow',()=>{if(open)closeView()});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
 else setup();
})();
