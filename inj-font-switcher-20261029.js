/* INJ Node · Code / Fester / Mont / Zag, loaded from a user's private ZIP import. */
(function(){
'use strict';
const K='inj_node_font_v1',R='inj_node_uploaded_fonts_revision',DB='inj_node_uploaded_fonts',root=document.documentElement;
const groups=[
 {id:'code',name:'Code',family:'INJ Code',normal:300,bold:700,files:['code-light','code-bold'],detail:'Light / Bold'},
 {id:'fester',name:'Fester',family:'INJ Fester',normal:200,bold:200,files:['fester-light'],detail:'ExtraLight'},
 {id:'mont',name:'Mont',family:'INJ Mont',normal:300,bold:900,files:['mont-light','mont-heavy'],detail:'ExtraLight / Heavy · DEMO'},
 {id:'zag',name:'Zag',family:'INJ Zag',normal:400,bold:700,files:['zag-regular','zag-bold'],detail:'Regular / Bold'}
];
const variants=[
 ['code-light','codelightotf','INJ Code',300],['code-bold','codeboldotf','INJ Code',700],
 ['fester-light','festerextralightotf','INJ Fester',200],
 ['mont-light','montextralightdemootf','INJ Mont',300],['mont-heavy','montheavydemootf','INJ Mont',900],
 ['zag-regular','zagregularotf','INJ Zag',400],['zag-bold','zagboldotf','INJ Zag',700]
];
const byId=Object.fromEntries(groups.map(f=>[f.id,f])), byFile=Object.fromEntries(variants.map(v=>[v[1],v])), byVariant=Object.fromEntries(variants.map(v=>[v[0],v]));
const installed=new Set(),faces=new Map();let active='code',database,busy=false;
function en(){try{return localStorage.getItem('inj_node_language_v1')==='en'||root.lang==='en'}catch(_){return root.lang==='en'}}
function chosen(){try{const v=localStorage.getItem(K);return byId[v]?v:'code'}catch(_){return 'code'}}
function openDB(){
 if(!database)database=new Promise((res,rej)=>{
  if(!window.indexedDB)return rej(Error('IndexedDB unavailable'));
  const q=indexedDB.open(DB,1);
  q.onupgradeneeded=()=>q.result.createObjectStore('fonts');
  q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);
 });
 return database;
}
async function readFonts(){
 const db=await openDB();
 return new Promise((res,rej)=>{
  const q=db.transaction('fonts','readonly').objectStore('fonts').getAll();
  q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);
 });
}
async function persist(rows){
 const db=await openDB();
 return new Promise((res,rej)=>{
  const t=db.transaction('fonts','readwrite');
  rows.forEach(row=>t.objectStore('fonts').put(row,row.id));
  t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||Error('Storage error'));
 });
}
async function installFace(row){
 const v=byVariant[row.id];if(!v)return;
 if(faces.has(row.id))document.fonts.delete(faces.get(row.id));
 const face=new FontFace(v[2],row.buffer,{weight:String(v[3]),style:'normal',display:'swap'});
 await face.load();document.fonts.add(face);faces.set(row.id,face);
}
async function loadFonts(){
 const rows=await readFonts();installed.clear();
 rows.forEach(r=>{if(byVariant[r.id])installed.add(r.id)});
 await Promise.allSettled(rows.filter(r=>byVariant[r.id]&&!faces.has(r.id)).map(installFace));
 updateUI();
}
function apply(id,save){
 active=byId[id]?id:'code';root.setAttribute('data-inj-font',active);
 if(save)try{localStorage.setItem(K,active)}catch(_){}
 updateUI();
 try{window.dispatchEvent(new CustomEvent('injnode:fontchange',{detail:{font:active}}))}catch(_){}
 if(save)requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
function updateUI(){
 const h=document.getElementById('injFontSelector');if(!h)return;
 const english=en(),current=h.querySelector('.menu-font-current'),btn=h.querySelector('.menu-font-import-button'),note=h.querySelector('.menu-font-note');
 if(current)current.textContent=(english?'Selected: ':'Selezionato: ')+byId[active].name;
 if(btn){btn.textContent=english?'Import font ZIP / OTF':'Importa font ZIP / OTF';btn.disabled=busy}
 if(note)note.textContent=english?'Import the ZIP files once on each device. Your fonts stay in the browser, never on our servers. Missing symbols use a fallback.':'Importa gli ZIP una volta su ogni dispositivo. I file restano nel browser, mai sui nostri server. I simboli mancanti usano un font di riserva.';
 h.querySelectorAll('[data-inj-font-choice]').forEach(el=>{
  const f=byId[el.dataset.injFontChoice];const count=f.files.filter(x=>installed.has(x)).length;
  el.setAttribute('aria-pressed',String(f.id===active));
  const desc=el.querySelector('.menu-font-description');
  if(desc)desc.textContent=f.detail+' · '+(count===f.files.length?(english?'Installed':'Installato'):(english?'Import needed':'Da importare')+' '+count+'/'+f.files.length);
  const sample=el.querySelector('.menu-font-sample');
  if(sample){sample.style.setProperty('font-family','"'+f.family+'",system-ui,sans-serif','important');sample.style.setProperty('font-weight',String(f.normal),'important')}
 });
 const status=h.querySelector('.menu-font-import-status');
 if(status&&!status.dataset.message){
  const n=groups.filter(f=>f.files.every(x=>installed.has(x))).length;
  status.textContent=n+'/4 '+(english?'fonts ready on this device':'font disponibili su questo dispositivo');
 }
 const preferences=document.getElementById('menuPreferencesAccordion'),sub=preferences&&preferences.querySelector('.menu-compact-subtitle');
 if(sub)sub.textContent=english?'Theme · Font · Language · App icon':'Tema · Font · Lingua · Icona app';
}
function show(s){const t=document.querySelector('#injFontSelector .menu-font-import-status');if(t){t.dataset.message='1';t.textContent=s}}
function normalize(s){return s.split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9]/g,'')}
async function parseZip(file){
 const b=new Uint8Array(await file.arrayBuffer());if(b.length>12000000)throw Error('ZIP too large');
 const v=new DataView(b.buffer);let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-66000);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break}
 if(end<0)throw Error('Invalid ZIP');
 let p=v.getUint32(end+16,true);const count=v.getUint16(end+10,true),result=[];
 for(let i=0;i<count;i++){
  if(p+46>b.length||v.getUint32(p,true)!==0x02014b50)throw Error('Invalid ZIP directory');
  const method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),plain=v.getUint32(p+24,true);
  const nameLen=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
  const name=new TextDecoder().decode(b.subarray(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  const spec=byFile[normalize(name)];if(!spec)continue;
  if(compressed>3000000||plain>3000000||offset+30>b.length||v.getUint32(offset,true)!==0x04034b50)throw Error('Font ZIP entry invalid');
  const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
  if(start+compressed>b.length)throw Error('ZIP font data invalid');
  let buffer;
  if(method===0)buffer=b.slice(start,start+compressed).buffer;
  else if(method===8){
   const stream=new Blob([b.slice(start,start+compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   buffer=await new Response(stream).arrayBuffer();
  }else throw Error('Unsupported ZIP compression');
  if(buffer.byteLength!==plain)throw Error('Font data mismatch');
  result.push({id:spec[0],buffer});
 }
 return result;
}
async function importSelected(files){
 if(busy)return;busy=true;updateUI();const english=en();
 try{
  let rows=[];
  for(const file of files){
   if(/\.zip$/i.test(file.name))rows.push(...await parseZip(file));
   else {const s=byFile[normalize(file.name)];if(s)rows.push({id:s[0],buffer:await file.arrayBuffer()})}
  }
  if(!rows.length)throw Error(english?'No matching fonts found':'Nessun font riconosciuto');
  rows=Array.from(new Map(rows.map(r=>[r.id,r])).values());
  for(const r of rows){const s=byVariant[r.id];await new FontFace(s[2],r.buffer,{weight:String(s[3])}).load()}
  await persist(rows);
  for(const r of rows){installed.add(r.id);await installFace(r)}
  try{localStorage.setItem(R,String(Date.now()))}catch(_){}
  show((english?'Imported ':'Importati ')+rows.length+(english?' font files':' file font'));
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 }catch(e){console.warn('INJ fonts',e);show((english?'Import error: ':'Errore importazione: ')+(e.message||'unknown'))}
 finally{busy=false;updateUI()}
}
function setup(){
 const target=document.getElementById('themeControl');if(!target||document.getElementById('injFontSelector'))return;
 const h=document.createElement('details');h.className='menu-font-control';h.id='injFontSelector';
 h.innerHTML='<summary class="menu-action menu-setting menu-font-trigger"><span aria-hidden="true" class="menu-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7V5h16v2M12 5v14M8 19h8M7 14l5-9 5 9"/></svg></span><span class="menu-action-copy"><strong class="menu-font-title">Font</strong><small class="menu-font-current"></small></span><svg aria-hidden="true" class="menu-font-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg></summary><div class="menu-font-options" role="group" aria-label="Font"></div><div class="menu-font-import-area"><button class="menu-font-import-button" type="button">Importa font ZIP / OTF</button><input class="menu-font-import-input" type="file" accept=".zip,.otf,.ttf" multiple hidden><p class="menu-font-import-status" aria-live="polite"></p></div><p class="menu-font-note"></p>';
 const opts=h.querySelector('.menu-font-options');
 groups.forEach(f=>{
  const b=document.createElement('button');b.type='button';b.className='menu-font-option';b.dataset.injFontChoice=f.id;
  const name=document.createElement('span');name.className='menu-font-name';const label=document.createElement('span');label.textContent=f.name;
  const check=document.createElement('span');check.className='menu-font-check';check.textContent='✓';check.setAttribute('aria-hidden','true');name.append(label,check);
  const sample=document.createElement('span');sample.className='menu-font-sample';sample.textContent='INJ 1,248.60';
  const desc=document.createElement('small');desc.className='menu-font-description';b.append(name,sample,desc);b.addEventListener('click',()=>apply(f.id,true));opts.appendChild(b);
 });
 const input=h.querySelector('.menu-font-import-input');
 h.querySelector('.menu-font-import-button').addEventListener('click',()=>input.click());
 input.addEventListener('change',()=>{const a=Array.from(input.files||[]);input.value='';if(a.length)importSelected(a)});
 target.insertAdjacentElement('afterend',h);updateUI();
 window.addEventListener('injnode:languagechange',updateUI);
}
apply(chosen(),false);loadFonts().catch(e=>console.warn('No local fonts',e));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(setup,0));
else setTimeout(setup,0);
window.addEventListener('storage',e=>{
 if(e.key===K)apply(chosen(),false);
 if(e.key===R)loadFonts().catch(()=>{});
 if(e.key==='inj_node_language_v1')updateUI();
});
})();