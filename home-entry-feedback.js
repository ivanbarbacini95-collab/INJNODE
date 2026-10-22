/* INJ Node · Home launch micro-feedback v16.07.13.
 * Runs only on a genuine section-launch gesture, never on live data or timers.
 * iOS Safari has no navigator.vibrate; no unsafe switch/checkbox overlays. */
(()=>{
 'use strict';
 if(!document.getElementById('entryGate'))return;
 const SOUND_KEY='inj_node_feedback_sound_v1';
 const HAPTIC_KEY='inj_node_feedback_haptic_v1';
 const VOLUME_KEY='inj_node_feedback_volume_v1';
 const DEFAULT_VOLUME=40; // Standard: matches the original 0.018 peak gain.
 const volumeInput=()=>document.getElementById('menuFeedbackVolume');
 const volumeLabel=()=>document.getElementById('menuFeedbackVolumeValue');
 const volumeTitle=()=>document.getElementById('menuFeedbackVolumeTitle');
 const volumeHint=()=>document.getElementById('menuFeedbackVolumeHint');
 const volumeWrap=()=>document.getElementById('menuFeedbackVolumeControl');
 const volume=()=>{
  try {
   const raw=localStorage.getItem(VOLUME_KEY);
   return raw===null?DEFAULT_VOLUME:Math.max(0,Math.min(100,Math.round(Number(raw)||0)));
  }catch(_){return DEFAULT_VOLUME}
 };
 const writeVolume=value=>{try{localStorage.setItem(VOLUME_KEY,String(value))}catch(_){}};
 const volumeText=value=>value===DEFAULT_VOLUME?'Standard · '+value+'%':value+'%';
 const soundButton=()=>document.getElementById('menuFeedbackSoundButton');
 const hapticButton=()=>document.getElementById('menuFeedbackHapticButton');
 const read=(key)=>{try{return localStorage.getItem(key)!=='off'}catch(_){return true}};
 const write=(key,on)=>{try{localStorage.setItem(key,on?'on':'off')}catch(_){}};
 const english=()=>{try{return localStorage.getItem('inj_node_language_v1')==='en'}catch(_){return document.documentElement.lang==='en'}};
 const tr=(it,en)=>english()?en:it;
 const canVibrate=()=>typeof navigator.vibrate==='function';
 let last=0,audio=null;
 function update(){
  const snd=soundButton(),hap=hapticButton(),volumeControl=volumeInput(),volumeDisplay=volumeLabel();
  const level=volume();
  if(volumeControl){volumeControl.value=String(level);volumeControl.setAttribute('aria-valuetext',volumeText(level))}
  if(volumeDisplay)volumeDisplay.textContent=volumeText(level);
  if(volumeTitle())volumeTitle().textContent=tr('Volume apertura','Opening volume');
  if(volumeHint())volumeHint().textContent=tr('Rilascia per ascoltare un’anteprima','Release to hear a preview');
  if(volumeWrap()){
   volumeWrap().classList.toggle('is-muted',!read(SOUND_KEY));
   volumeWrap().style.setProperty('--volume-percent',level+'%');
  }
  if(volumeControl)volumeControl.disabled=!read(SOUND_KEY);
  if(volumeControl)volumeControl.setAttribute('aria-label',tr('Volume suono apertura','Opening sound volume'));
  if(snd){
   const on=read(SOUND_KEY);
   snd.setAttribute('aria-pressed',String(on));
   snd.setAttribute('aria-label',tr('Suono apertura sezioni: ','Section opening sound: ')+(on?tr('attivo','on'):tr('spento','off')));
   snd.querySelector('.menu-action-copy strong').textContent=tr('Suono apertura','Opening sound');
   snd.querySelector('.menu-action-copy small').textContent=tr('Tono breve quando apri una sezione','Soft tone when opening a section');
   snd.querySelector('.menu-action-value').textContent=on?tr('ON','ON'):tr('OFF','OFF');
  }
  if(hap){
   const on=read(HAPTIC_KEY),supported=canVibrate();
   hap.disabled=!supported;
   hap.setAttribute('aria-pressed',String(supported&&on));
   hap.setAttribute('aria-label',supported?
    tr('Vibrazione apertura sezioni: ','Section opening haptics: ')+(on?tr('attiva','on'):tr('spenta','off')):
    tr('Vibrazione non supportata da questo browser','Vibration unsupported by this browser'));
   hap.querySelector('.menu-action-copy strong').textContent=tr('Vibrazione breve','Short vibration');
   hap.querySelector('.menu-action-copy small').textContent=supported?
    tr('Piccolo impulso all’apertura','Small pulse on opening'):
    tr('Non disponibile su questo browser','Not available in this browser');
   hap.querySelector('.menu-action-value').textContent=supported?(on?'ON':'OFF'):tr('N/D','N/A');
  }
 }
 function playSound(){
  if(!read(SOUND_KEY)||volume()===0)return;
  try{
   const Ctx=window.AudioContext||window.webkitAudioContext;
   if(!Ctx)return;
   if(!audio||audio.state==='closed')audio=new Ctx({latencyHint:'interactive'});
   if(audio.state==='suspended')void audio.resume().catch(()=>{});
   const t=audio.currentTime;
   const oscillator=audio.createOscillator(),gain=audio.createGain();
   oscillator.type='sine';
   oscillator.frequency.setValueAtTime(690,t);
   oscillator.frequency.exponentialRampToValueAtTime(860,t+.072);
   gain.gain.setValueAtTime(.0001,t);
   // 40% == old standard volume; ceiling modest to protect device speakers.
   const peak=Math.max(.0001,Math.min(.045,.045*volume()/100));
   gain.gain.exponentialRampToValueAtTime(peak,t+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,t+.105);
   oscillator.connect(gain);gain.connect(audio.destination);
   oscillator.start(t);oscillator.stop(t+.11);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
  }catch(_){/* Audio policies can block sound; navigation must never fail. */}
 }
 function vibrate(){
  if(!read(HAPTIC_KEY)||!canVibrate())return;
  try{navigator.vibrate(14)}catch(_){/* optional enhancement */}
 }
 // Capture before the existing Home navigation handlers or iframe creation.
 // Preserve all clicks, default behavior, scroll, focus and accessibility.
 document.addEventListener('click',event=>{
  if(!event.isTrusted || event.defaultPrevented || event.button>0 ||
    event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const source=event.target;
  if(!(source instanceof Element))return;
  const section=source.closest('#entryGate .entry-actions .entry-action');
  if(!section||section.matches('[disabled],[aria-disabled="true"]'))return;
  const current=performance.now();
  if(current-last<190)return;
  last=current;
  vibrate();
  playSound();
 },true);
 soundButton()?.addEventListener('click',()=>{
  write(SOUND_KEY,!read(SOUND_KEY));update();
 });
 hapticButton()?.addEventListener('click',()=>{
  if(!canVibrate())return;
  write(HAPTIC_KEY,!read(HAPTIC_KEY));update();
 });
 volumeInput()?.addEventListener('input',event=>{
  const next=Math.max(0,Math.min(100,Math.round(Number(event.target.value)||0)));
  writeVolume(next);
  update();
 });
 volumeInput()?.addEventListener('change',()=>{playSound()});
 window.addEventListener('injnode:languagechange',update);
 window.addEventListener('storage',event=>{
  if([SOUND_KEY,HAPTIC_KEY,VOLUME_KEY,'inj_node_language_v1'].includes(event.key))update();
 });
 update();
})();
