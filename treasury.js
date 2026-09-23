'use strict';

const INJ_DECIMALS = 1e18;
const OFFICIAL_APR_ENDPOINT = 'https://api.ui.injective.network/api/v1/cache/stats/apr';
const LCD_ENDPOINTS = [
  'https://sentry.lcd.injective.network:443',
  'https://lcd.injective.network',
  'https://1rpc.io/inj-lcd'
];
const TREASURY_ADDRESSES = Object.freeze([
  'inj1cqvjau8tl4ge874crfaj6gkw55pnn6n2vmwdhv',
  'inj1ewp22h79mx9ln494nnx08laan4u2x7xyf37ceu',
  'inj19ue2rs8a8vr5q7fc7a52ee9kx8axt46wndhzv9',
  'inj1tgy6auqyps9uql9xpmnkwfd7gsf3hrkdx9cv3q',
  'inj1x2pste4f04pltkmaw6wzqflrgpgsu9x6gn3l9m'
]);
const HISTORY_KEY = 'inj_node_treasury_growth_v1';
const SNAPSHOT_KEY = 'inj_node_treasury_snapshot_v1';
const WORTH_HISTORY_KEY = 'inj_node_treasury_worth_growth_v1';
const HISTORY_COMPACT_VERSION = 2;
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const state = {
  data: null,
  price: 0,
  open24: 0,
  change24: 0,
  eurRate: 0.86,
  currency: 'USD',
  loading: false,
  updatedAt: 0,
  samples: [],
  plot: null,
  inspectIndex: -1,
  worthSamples: [],
  worthPlot: null,
  worthInspectIndex: -1,
  worthRange: 'd1',
  firstPaint: true,
  socket: null,
  reconnectTimer: 0
};

const $ = (id) => document.getElementById(id);
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const fromWei = (value) => number(value) / INJ_DECIMALS;
const rate = (value) => {
  const parsed = number(value);
  return parsed > 1 ? parsed / INJ_DECIMALS : parsed;
};
const aprPercent = (value) => {
  const parsed = number(value);
  if (!(parsed > 0)) return 0;
  return parsed <= 1 ? parsed * 100 : parsed;
};

function currencyValue(value) {
  return state.currency === 'EUR' ? number(value) * state.eurRate : number(value);
}
function money(value, digits = 2) {
  return new Intl.NumberFormat(state.currency === 'EUR' ? 'it-IT' : 'en-US', {
    style: 'currency', currency: state.currency,
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(currencyValue(value));
}
function signedMoney(value, digits = 2) {
  const numeric = number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric === 0) return money(0, digits);
  return `${numeric > 0 ? '+' : '−'}${money(Math.abs(numeric), digits)}`;
}
function treasuryInj(value, digits = 4) {
  return `${number(value).toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} INJ`;
}

function numberRollGroups(text) {
  const value = String(text ?? '');
  const groups = [];
  const regex = /\d[\d.,]*/g;
  let match;
  while ((match = regex.exec(value))) groups.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  return groups;
}
function appendRollingDigit(parent, oldDigit, newDigit, direction) {
  if (oldDigit === newDigit) {
    const stable = document.createElement('span');
    stable.className = 'number-roll-static-digit';
    stable.textContent = newDigit;
    parent.append(stable);
    return;
  }
  const slot = document.createElement('span');
  slot.className = `number-roll-digit number-roll-${direction}`;
  slot.setAttribute('aria-hidden', 'true');
  const oldLayer = document.createElement('span');
  oldLayer.className = 'number-roll-digit-layer number-roll-old';
  oldLayer.textContent = oldDigit || '\u00a0';
  const newLayer = document.createElement('span');
  newLayer.className = 'number-roll-digit-layer number-roll-new';
  newLayer.textContent = newDigit;
  slot.append(oldLayer, newLayer);
  parent.append(slot);
}
function appendRollingGroup(parent, oldGroup, newGroup, direction) {
  const oldDigits = Array.from(String(oldGroup || '')).filter((char) => /\d/.test(char));
  const chars = Array.from(String(newGroup || ''));
  const count = chars.reduce((sum, char) => sum + (/\d/.test(char) ? 1 : 0), 0);
  const offset = oldDigits.length - count;
  let index = 0;
  for (const char of chars) {
    if (!/\d/.test(char)) { parent.append(document.createTextNode(char)); continue; }
    const oldIndex = index + offset;
    appendRollingDigit(parent, oldIndex >= 0 && oldIndex < oldDigits.length ? oldDigits[oldIndex] : '', char, direction);
    index += 1;
  }
}
function appendStableGroup(parent, group) {
  for (const char of Array.from(String(group || ''))) {
    if (/\d/.test(char)) {
      const digit = document.createElement('span');
      digit.className = 'number-roll-static-digit';
      digit.textContent = char;
      parent.append(digit);
    } else parent.append(document.createTextNode(char));
  }
}
function renderStableNumberText(element, text) {
  const value = String(text ?? '');
  const groups = numberRollGroups(value);
  if (!groups.length) { element.textContent = value; return; }
  const shell = document.createElement('span');
  shell.className = 'number-roll-text';
  shell.setAttribute('aria-label', value);
  let cursor = 0;
  for (const group of groups) {
    if (group.start > cursor) shell.append(document.createTextNode(value.slice(cursor, group.start)));
    appendStableGroup(shell, group.text);
    cursor = group.end;
  }
  if (cursor < value.length) shell.append(document.createTextNode(value.slice(cursor)));
  element.replaceChildren(shell);
}
function animateNumber(element, previousText, nextText, previous, next) {
  element.classList.add('number-roll-host');
  const visibleChange = previousText !== undefined && previousText !== nextText;
  const numericChange = Number.isFinite(previous) && Number.isFinite(next) && Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);
  if (!visibleChange || !numericChange || state.firstPaint || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    renderStableNumberText(element, nextText);
    return;
  }
  const direction = next > previous ? 'up' : 'down';
  const shell = document.createElement('span');
  shell.className = 'number-roll-text';
  shell.setAttribute('aria-label', nextText);
  const oldGroups = numberRollGroups(previousText);
  const newGroups = numberRollGroups(nextText);
  let cursor = 0;
  newGroups.forEach((group, index) => {
    if (group.start > cursor) shell.append(document.createTextNode(nextText.slice(cursor, group.start)));
    appendRollingGroup(shell, oldGroups[index]?.text || '', group.text, direction);
    cursor = group.end;
  });
  if (cursor < nextText.length) shell.append(document.createTextNode(nextText.slice(cursor)));
  element.replaceChildren(shell);
  clearTimeout(element._rollTimer);
  element._rollTimer = setTimeout(() => renderStableNumberText(element, nextText), 500);
}
function setLiveValue(id, text, numericValue, roll = true) {
  const element = $(id);
  if (!element) return;
  const nextText = String(text);
  const next = Number(numericValue);
  const previousText = element.dataset.renderedText;
  const previous = element.dataset.numericValue === undefined ? NaN : Number(element.dataset.numericValue);
  const changed = previousText !== undefined && previousText !== nextText && Number.isFinite(previous) && Number.isFinite(next) && Math.abs(next - previous) > Math.max(1e-12, Math.abs(previous) * 1e-10);
  if (roll) animateNumber(element, previousText, nextText, previous, next);
  else element.textContent = nextText;
  if (changed && !state.firstPaint) {
    element.classList.remove('value-change-up','value-change-down');
    void element.offsetWidth;
    element.classList.add(next > previous ? 'value-change-up' : 'value-change-down');
  }
  element.dataset.renderedText = nextText;
  if (Number.isFinite(next)) element.dataset.numericValue = String(next); else delete element.dataset.numericValue;
}

function milestone(total) {
  const value = Math.max(0, number(total));
  const targets = [1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,25000,50000,100000,250000,500000,1000000];
  const next = targets.find((target) => target > value) || Math.ceil(value / 1000000 + 1) * 1000000;
  const previous = [...targets].reverse().find((target) => target <= value) || 0;
  const span = Math.max(1, next - previous);
  return { next, progress: Math.max(0,Math.min(100,((value - previous) / span) * 100)), remaining: Math.max(0,next - value) };
}

function hydrateSnapshot() {
  try {
    const cached = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    if (cached && number(cached.total) > 0) { state.data = cached; state.updatedAt = number(cached.updatedAt); }
  } catch (_) {}
}
function persistSnapshot(data) { try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data)); } catch (_) {} }
function normalizeTimeline(rows) {
  const cleaned = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ t:number(row?.t), value:number(row?.value) }))
    .filter((row) => row.t > 0 && row.value > 0)
    .sort((a,b) => a.t - b.t);
  const deduped = [];
  for (const row of cleaned) {
    const last = deduped.at(-1);
    if (last && Math.abs(last.t - row.t) < 1000) last.value = row.value;
    else deduped.push(row);
  }
  return deduped;
}
function historyBucketSize(age) {
  if (age <= DAY) return MINUTE;          // ultime 24h: 1 punto/minuto
  if (age <= 7 * DAY) return 10 * MINUTE; // 1–7 giorni: 1 punto/10 min
  if (age <= 30 * DAY) return 30 * MINUTE;// 7–30 giorni: 1 punto/30 min
  if (age <= 180 * DAY) return 3 * HOUR;  // 1–6 mesi: 1 punto/3h
  if (age <= 365 * DAY) return 12 * HOUR; // 6–12 mesi: 1 punto/12h
  return DAY;                              // oltre 1 anno: 1 punto/giorno
}
function compactTimeline(rows, now = Date.now()) {
  const samples = normalizeTimeline(rows);
  if (samples.length <= 2) return samples;
  const first = samples[0];
  const last = samples.at(-1);
  const buckets = new Map();
  for (let index = 1; index < samples.length - 1; index += 1) {
    const row = samples[index];
    const step = historyBucketSize(Math.max(0, now - row.t));
    const bucket = `${step}:${Math.floor(row.t / step)}`;
    // Keep the latest real reading in each historical bucket. Nothing is
    // synthesized and the time coverage always remains from the first sample.
    buckets.set(bucket, row);
  }
  const compacted = [first, ...buckets.values(), last].sort((a,b) => a.t - b.t);
  return normalizeTimeline(compacted);
}
function saveTimeline(key, samples, assign) {
  const compacted = compactTimeline(samples);
  assign(compacted);
  try {
    localStorage.setItem(key, JSON.stringify(compacted));
  } catch (_) {
    // Very old installations can eventually approach the browser quota.
    // Fall back to a coarser archive without ever dropping the first reading.
    const first = compacted[0], last = compacted.at(-1);
    const archived = first && last ? [first] : [];
    const buckets = new Map();
    for (let index = 1; index < compacted.length - 1; index += 1) {
      const row = compacted[index];
      const step = Math.max(historyBucketSize(Math.max(0, Date.now() - row.t)), 6 * HOUR);
      buckets.set(`${step}:${Math.floor(row.t / step)}`, row);
    }
    archived.push(...buckets.values());
    if (last && (!archived.length || archived.at(-1).t !== last.t)) archived.push(last);
    archived.sort((a,b) => a.t - b.t);
    assign(archived);
    try { localStorage.setItem(key, JSON.stringify(archived)); } catch (_) {}
  }
}
function hydrateHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    state.samples = compactTimeline(rows);
    persistHistory();
  } catch (_) { state.samples = []; }
}
function persistHistory() {
  saveTimeline(HISTORY_KEY, state.samples, (rows) => { state.samples = rows; });
}
function recordHistory(total, at = Date.now()) {
  const value = number(total);
  if (!(value > 0)) return;
  const last = state.samples.at(-1);
  if (!last) { state.samples.push({t:at,value}); persistHistory(); return; }
  const gap = Math.max(0, at - number(last.t));
  if (gap < 1000) last.value = value;
  else if (gap >= 15000 || Math.abs(number(last.value) - value) > 1e-10) state.samples.push({t:at,value});
  persistHistory();
}
function hydrateWorthHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(WORTH_HISTORY_KEY) || '[]');
    state.worthSamples = compactTimeline(rows);
    persistWorthHistory();
  } catch (_) { state.worthSamples = []; }
}
function persistWorthHistory() {
  saveTimeline(WORTH_HISTORY_KEY, state.worthSamples, (rows) => { state.worthSamples = rows; });
}
function recordWorthHistory(total, price, at = Date.now(), force = false) {
  const worthUSD = number(total) * number(price);
  if (!(worthUSD > 0)) return;
  const last = state.worthSamples.at(-1);
  if (!last) { state.worthSamples.push({t:at,value:worthUSD}); persistWorthHistory(); return; }
  const gap = Math.max(0, at - number(last.t));
  if (force || gap >= 15000) {
    if (gap < 1000) last.value = worthUSD;
    else state.worthSamples.push({t:at,value:worthUSD});
    persistWorthHistory();
  }
}
function recordCurrentWorth(force = false) {
  const total = number(state.data?.total);
  if (total > 0 && state.price > 0) recordWorthHistory(total,state.price,Date.now(),force);
}

function historyLabel(timestamp) {
  const d = new Date(number(timestamp));
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
}
function historyFullLabel(timestamp) {
  return new Date(number(timestamp)).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function signedInj(value,digits=4){
  const numeric=number(value);
  const sign=numeric>0?'+':numeric<0?'−':'';
  return `${sign}${Math.abs(numeric).toLocaleString('it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits})} INJ`;
}
function signedPct(value,digits=2){
  const numeric=number(value);
  return `${numeric>0?'+':''}${numeric.toFixed(digits)}%`;
}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function updateGrowthChartMetrics(sample=null){
  const rows=state.samples.filter((row)=>number(row.t)>0&&number(row.value)>0);
  const liveTotal=number(state.data?.total)||number(rows.at(-1)?.value);
  if(!rows.length && !(liveTotal>0))return;
  const first=number(rows[0]?.value)||liveTotal;
  const current=sample?number(sample.value):liveTotal;
  const delta=current-first;
  const pct=first>0?(delta/first)*100:0;
  const ath=Math.max(current,...rows.map((row)=>number(row.value)));
  setText('treasuryGrowthLabel',sample?'LETTURA':'TOTALE ATTUALE');
  setText('treasuryGrowthCurrent',treasuryInj(current,2));
  setText('treasuryGrowthSideLabel',sample?historyLabel(sample.t):'DAL PRIMO DATO');
  setText('treasuryGrowthChange',signedInj(delta,2));
  setText('treasuryGrowthChangePct',signedPct(pct,2));
  setText('treasuryGrowthAth',`ATH ${treasuryInj(ath,2)}`);
  setText('treasuryGrowthPoints',`${rows.length.toLocaleString('it-IT')} LETTURE`);
}
const WORTH_RANGES = Object.freeze({ d1: DAY, w1: 7 * DAY, m1: 30 * DAY, all: Infinity });
function allWorthRows(){
  const rows=state.worthSamples.filter((row)=>number(row.t)>0&&number(row.value)>0).map((row)=>({...row,value:number(row.value)}));
  const liveWorth=number(state.data?.total)*number(state.price);
  if(liveWorth>0){
    const last=rows.at(-1);
    if(!last||Math.abs(last.value-liveWorth)>Math.max(.000001,Math.abs(liveWorth)*1e-9))rows.push({t:Date.now(),value:liveWorth});
  }
  return rows;
}
function currentWorthRows(){
  const rows=allWorthRows();
  if(!rows.length||state.worthRange==='all')return rows;
  const windowMs=WORTH_RANGES[state.worthRange]||DAY;
  const end=number(rows.at(-1).t)||Date.now();
  const cutoff=end-windowMs;
  const filtered=rows.filter((row)=>number(row.t)>=cutoff);
  return filtered.length>=2?filtered:rows.slice(-Math.min(2,rows.length));
}
function syncWorthRangeControls(){
  const rows=allWorthRows();
  const span=rows.length>1?Math.max(0,number(rows.at(-1).t)-number(rows[0].t)):0;
  document.querySelectorAll('[data-worth-range]').forEach((button)=>{
    const key=button.dataset.worthRange;
    const required=key==='w1'?7*DAY:key==='m1'?30*DAY:0;
    const disabled=required>0&&span<required;
    button.disabled=disabled;
    if(disabled&&state.worthRange===key)state.worthRange='d1';
    const active=key===state.worthRange;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
    if(key==='w1'&&disabled)button.title='Disponibile dopo 7 giorni di storico';
    else if(key==='m1'&&disabled)button.title='Disponibile dopo 30 giorni di storico';
    else button.removeAttribute('title');
  });
}
function setWorthRange(range){
  if(!WORTH_RANGES[range])return;
  const button=document.querySelector(`[data-worth-range="${range}"]`);
  if(button?.disabled)return;
  state.worthRange=range;
  hideWorthInspector();
  syncWorthRangeControls();
  render();
}
function bindWorthRangeControls(){
  document.querySelectorAll('[data-worth-range]').forEach((button)=>button.addEventListener('click',()=>setWorthRange(button.dataset.worthRange)));
  syncWorthRangeControls();
}
function updateWorthChartMetrics(sample=null){
  const rows=currentWorthRows();
  if(!rows.length)return;
  const first=number(rows[0].value),current=sample?number(sample.value):number(rows.at(-1).value);
  const delta=current-first,pct=first>0?(delta/first)*100:0;
  const min=Math.min(...rows.map((row)=>number(row.value))),max=Math.max(...rows.map((row)=>number(row.value)));
  setText('treasuryWorthLabel',sample?'LETTURA':'VALORE ATTUALE');
  setText('treasuryNetWorthCurrent',money(current,2));
  const rangeLabel=state.worthRange==='d1'?'24H':state.worthRange==='w1'?'1 SETTIMANA':state.worthRange==='m1'?'1 MESE':'TOTALE';
  setText('treasuryWorthSideLabel',sample?historyLabel(sample.t):rangeLabel);
  setText('treasuryWorthChangeAbs',signedMoney(delta,2));
  setText('treasuryWorthChangePct',signedPct(pct,2));
  setText('treasuryWorthMin',`MIN ${money(min,2)}`);
  setText('treasuryWorthMax',`MAX ${money(max,2)}`);
}


function downsampleExtrema(samples,maxPoints=140) {
  if (samples.length <= maxPoints) return samples.map((row)=>({...row}));
  const first=samples[0],last=samples.at(-1),interior=samples.slice(1,-1);
  const bucketCount=Math.max(1,Math.floor((maxPoints-2)/2));
  const out=[first];
  for(let b=0;b<bucketCount;b+=1){
    const start=Math.floor((b*interior.length)/bucketCount);
    const end=Math.floor(((b+1)*interior.length)/bucketCount);
    const bucket=interior.slice(start,Math.max(start+1,end));
    if(!bucket.length)continue;
    let lo=bucket[0],hi=bucket[0];
    for(const row of bucket){
      if(number(row.value)<number(lo.value))lo=row;
      if(number(row.value)>number(hi.value))hi=row;
    }
    if(lo===hi)out.push(lo);
    else if(number(lo.t)<number(hi.t))out.push(lo,hi);
    else out.push(hi,lo);
  }
  out.push(last);
  return out.sort((a,b)=>number(a.t)-number(b.t));
}

// Visual-only adaptive scale: keeps large spikes visible without crushing the
// smaller movements into a flat line. Tooltips always show the real value.
function adaptiveVisualPositions(values,minRelativeCore=.0005) {
  const clean=values.map(number).filter(Number.isFinite);
  if(!clean.length)return [];
  const sorted=[...clean].sort((a,b)=>a-b);
  const q=(ratio)=>{
    const pos=(sorted.length-1)*ratio,lo=Math.floor(pos),hi=Math.ceil(pos);
    if(lo===hi)return sorted[lo];
    const mix=pos-lo;
    return sorted[lo]*(1-mix)+sorted[hi]*mix;
  };
  const center=q(.5);
  const core=Math.max((q(.85)-q(.15))/2,Math.abs(center)*minRelativeCore,1e-8);
  const transformed=clean.map((value)=>Math.asinh((value-center)/core));
  let min=Math.min(...transformed),max=Math.max(...transformed);
  let span=Math.max(1e-8,max-min);
  const pad=span*.09;
  min-=pad; max+=pad; span=max-min;
  return transformed.map((value)=>Math.max(0,Math.min(1,(value-min)/span)));
}


function placeTreasuryLiveDot(id, point, width=320, height=96) {
  const dot=$(id);
  if(!dot)return;
  if(!point){dot.hidden=true;return;}
  dot.style.left=`${Math.max(0,Math.min(100,(number(point.x)/width)*100))}%`;
  dot.style.top=`${Math.max(0,Math.min(100,(number(point.y)/height)*100))}%`;
  dot.hidden=false;
}
function renderSparkline() {
  const svg = $('treasurySparkline');
  if (!svg) return;
  const rawSamples = state.samples.filter((row) => number(row.t) > 0 && number(row.value) > 0);
  if (rawSamples.length < 2) {
    state.plot = null;
    svg.innerHTML = '<path class="treasury-growth-line" d="M0 76 L320 76" opacity=".18"></path>';
    placeTreasuryLiveDot('treasuryGrowthLiveDot',null);
    $('treasuryHistoryStart').textContent = rawSamples.length ? historyLabel(rawSamples[0].t) : 'Prima lettura';
    $('treasuryHistoryEnd').textContent = 'Ora';
    hideSparkInspector();
    return;
  }
  const samples = downsampleExtrema(rawSamples, window.innerWidth <= 760 ? 96 : 156);
  const times = samples.map((row) => number(row.t));
  const values = samples.map((row) => number(row.value));
  const visual = adaptiveVisualPositions(values,.00008);
  const minT = Math.min(...times), maxT = Math.max(...times), timeSpan = Math.max(1,maxT-minT);
  const plotted = samples.map((row,index) => ({
    t:number(row.t),
    value:number(row.value),
    x:((number(row.t)-minT)/timeSpan)*320,
    y:79-(visual[index] ?? .5)*61
  }));
  const d = plotted.map((row,index) => `${index?'L':'M'}${row.x.toFixed(2)} ${row.y.toFixed(2)}`).join(' ');
  const first = plotted[0], last = plotted.at(-1);
  const area = `${d} L${last.x.toFixed(2)} 92 L${first.x.toFixed(2)} 92 Z`;
  svg.innerHTML = `<path class="treasury-growth-area" d="${area}"></path><path class="treasury-growth-line" d="${d}"></path>`;
  placeTreasuryLiveDot('treasuryGrowthLiveDot',last);
  state.plot = {width:320,height:96,samples:plotted};
  $('treasuryHistoryStart').textContent = historyLabel(rawSamples[0].t);
  $('treasuryHistoryEnd').textContent = historyLabel(rawSamples.at(-1).t);
  if (state.inspectIndex >= 0) showSparkSample(Math.min(state.inspectIndex,plotted.length-1));
}

function hideSparkInspector() {
  $('treasurySparkStage')?.classList.remove('inspecting','dragging');
  if ($('treasurySparkCursor')) $('treasurySparkCursor').hidden = true;
  if ($('treasurySparkTooltip')) $('treasurySparkTooltip').hidden = true;
  state.inspectIndex = -1;
  updateGrowthChartMetrics();
}
function showSparkSample(index) {
  const plot = state.plot, stage = $('treasurySparkStage'), cursor = $('treasurySparkCursor'), tooltip = $('treasurySparkTooltip');
  if (!plot?.samples?.length || !stage || !cursor || !tooltip) return;
  const safe = Math.max(0,Math.min(plot.samples.length-1,index));
  const sample = plot.samples[safe];
  const leftPct = (sample.x / plot.width) * 100;
  const topPct = (sample.y / plot.height) * 100;
  cursor.style.left = `${leftPct}%`;
  cursor.querySelector('i').style.top = `${topPct}%`;
  cursor.hidden = false;
  tooltip.style.left = `${leftPct}%`;
  tooltip.style.top = `${topPct}%`;
  tooltip.classList.toggle('flip', leftPct > 72);
  tooltip.classList.toggle('below', topPct < 24);
  tooltip.querySelector('strong').textContent = treasuryInj(sample.value,4);
  tooltip.querySelector('small').textContent = historyFullLabel(sample.t);
  tooltip.hidden = false;
  stage.classList.add('inspecting');
  state.inspectIndex = safe;
  updateGrowthChartMetrics(sample);
}
function inspectSparkAt(event) {
  const stage = $('treasurySparkStage'), plot = state.plot;
  if (!stage || !plot?.samples?.length) return;
  const rect = stage.getBoundingClientRect();
  const x = Math.max(0,Math.min(rect.width,event.clientX-rect.left));
  const targetX = rect.width ? (x/rect.width)*plot.width : 0;
  let best=0,dist=Infinity;
  plot.samples.forEach((sample,index)=>{const d=Math.abs(sample.x-targetX);if(d<dist){dist=d;best=index;}});
  showSparkSample(best);
}
function bindSparkInteraction() {
  const stage = $('treasurySparkStage');
  if (!stage) return;
  const touch = {id:null,x:0,y:0,horizontal:false};
  const inside = (event) => { const r=stage.getBoundingClientRect(); return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom; };
  const release = (id) => { try{if(stage.hasPointerCapture?.(id))stage.releasePointerCapture(id);}catch(_){} };
  stage.addEventListener('pointerdown',(event)=>{
    if(event.pointerType==='mouse'){inspectSparkAt(event);return;}
    touch.id=event.pointerId;touch.x=event.clientX;touch.y=event.clientY;touch.horizontal=false;inspectSparkAt(event);
  },{passive:true});
  stage.addEventListener('pointermove',(event)=>{
    if(event.pointerType==='mouse'){if(!inside(event)){hideSparkInspector();return;}inspectSparkAt(event);return;}
    if(event.pointerId!==touch.id)return;
    if(!inside(event)){release(event.pointerId);stage.classList.remove('dragging');touch.id=null;touch.horizontal=false;hideSparkInspector();return;}
    const dx=event.clientX-touch.x,dy=event.clientY-touch.y,ax=Math.abs(dx),ay=Math.abs(dy);
    if(!touch.horizontal){
      if(Math.max(ax,ay)<4){inspectSparkAt(event);return;}
      if(ay>ax*1.35){hideSparkInspector();touch.id=null;return;}
      if(ax<4||ax<ay*.72)return;
      touch.horizontal=true;stage.classList.add('dragging');try{stage.setPointerCapture(event.pointerId)}catch(_){}
    }
    if(event.cancelable)event.preventDefault();inspectSparkAt(event);
  },{passive:false});
  stage.addEventListener('pointerup',(event)=>{release(event.pointerId);stage.classList.remove('dragging');touch.id=null;touch.horizontal=false;hideSparkInspector();});
  stage.addEventListener('pointercancel',(event)=>{release(event.pointerId);stage.classList.remove('dragging');touch.id=null;touch.horizontal=false;hideSparkInspector();});
  stage.addEventListener('pointerleave',()=>hideSparkInspector());
  document.addEventListener('pointerdown',(event)=>{if(stage.classList.contains('inspecting')&&!stage.contains(event.target))hideSparkInspector();},true);
  stage.addEventListener('keydown',(event)=>{const samples=state.plot?.samples||[];if(!samples.length||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')return hideSparkInspector();let i=state.inspectIndex;if(event.key==='Home')i=0;else if(event.key==='End')i=samples.length-1;else if(event.key==='ArrowLeft')i=i<0?samples.length-1:i-1;else i=i<0?0:i+1;showSparkSample(i);});
}
function readableWorthSamples(samples, maxPoints = 96) {
  if (samples.length <= maxPoints) return samples.map((row) => ({...row}));
  const out = [samples[0]];
  const interior = samples.length - 2;
  const slots = Math.max(1,maxPoints - 2);
  for (let slot = 0; slot < slots; slot += 1) {
    const start = 1 + Math.floor((slot * interior) / slots);
    const end = 1 + Math.floor(((slot + 1) * interior) / slots);
    const bucket = samples.slice(start,Math.max(start + 1,end));
    if (!bucket.length) continue;
    // A representative point per horizontal bucket keeps the chart readable
    // without inventing extra historical values.
    const mid = bucket[Math.floor(bucket.length / 2)];
    out.push(mid);
  }
  out.push(samples.at(-1));
  return out;
}
function smoothWorthValues(samples) {
  if (samples.length < 4) return samples.map((row) => number(row.value));
  return samples.map((row,index) => {
    if (index === 0 || index === samples.length - 1) return number(row.value);
    const a = number(samples[index - 1].value);
    const b = number(row.value);
    const c = number(samples[index + 1].value);
    return (a + (b * 2) + c) / 4;
  });
}
function worthCurvePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    path += ` Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points.at(-1);
  path += ` T${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
}
function renderWorthSparkline() {
  const svg = $('treasuryWorthSparkline');
  if (!svg) return;
  let rawSamples = currentWorthRows();
  syncWorthRangeControls();
  if (rawSamples.length < 2) {
    state.worthPlot = null;
    svg.innerHTML = '<path class="treasury-worth-line" d="M0 76 L320 76" opacity=".18"></path>';
    placeTreasuryLiveDot('treasuryWorthLiveDot',null);
    $('treasuryWorthHistoryStart').textContent = rawSamples.length ? historyLabel(rawSamples[0].t) : 'Prima lettura';
    $('treasuryWorthHistoryEnd').textContent = 'Ora';
    hideWorthInspector();
    return;
  }

  // Preserve real extrema, then smooth only the drawn curve. No work is done
  // while the finger moves, so inspection stays immediate even as history grows.
  const reduced = downsampleExtrema(rawSamples, window.innerWidth <= 760 ? 90 : 138);
  const samples = readableWorthSamples(reduced, window.innerWidth <= 760 ? 90 : 138);
  const displayValues = smoothWorthValues(samples);
  const visual = adaptiveVisualPositions(displayValues,.0022);
  const times = samples.map((row) => number(row.t));
  const minT = Math.min(...times), maxT = Math.max(...times), timeSpan = Math.max(1,maxT-minT);
  const plotted = samples.map((row,index) => ({
    t:number(row.t),
    value:number(row.value),
    displayValue:displayValues[index],
    x:((number(row.t)-minT)/timeSpan)*320,
    y:79-(visual[index] ?? .5)*61
  }));
  const d = worthCurvePath(plotted);
  const first = plotted[0], last = plotted.at(-1);
  const area = `${d} L${last.x.toFixed(2)} 92 L${first.x.toFixed(2)} 92 Z`;
  svg.innerHTML = `<path class="treasury-worth-area" d="${area}"></path><path class="treasury-worth-line" d="${d}"></path>`;
  placeTreasuryLiveDot('treasuryWorthLiveDot',last);
  state.worthPlot = {width:320,height:96,samples:plotted};
  $('treasuryWorthHistoryStart').textContent = historyLabel(rawSamples[0].t);
  $('treasuryWorthHistoryEnd').textContent = historyLabel(rawSamples.at(-1).t);
  if (state.worthInspectIndex >= 0) showWorthSample(Math.min(state.worthInspectIndex,plotted.length-1));
}

function hideWorthInspector() {
  $('treasuryWorthStage')?.classList.remove('inspecting','dragging');
  if ($('treasuryWorthCursor')) $('treasuryWorthCursor').hidden = true;
  if ($('treasuryWorthTooltip')) $('treasuryWorthTooltip').hidden = true;
  state.worthInspectIndex = -1;
  updateWorthChartMetrics();
}
function showWorthSample(index) {
  const plot = state.worthPlot, stage = $('treasuryWorthStage'), cursor = $('treasuryWorthCursor'), tooltip = $('treasuryWorthTooltip');
  if (!plot?.samples?.length || !stage || !cursor || !tooltip) return;
  const safe = Math.max(0,Math.min(plot.samples.length-1,index));
  const sample = plot.samples[safe];
  const leftPct = (sample.x / plot.width) * 100;
  const topPct = (sample.y / plot.height) * 100;
  cursor.style.left = `${leftPct}%`;
  cursor.querySelector('i').style.top = `${topPct}%`;
  cursor.hidden = false;
  tooltip.style.left = `${leftPct}%`;
  tooltip.style.top = `${topPct}%`;
  tooltip.classList.toggle('flip', leftPct > 72);
  tooltip.classList.toggle('below', topPct < 24);
  tooltip.querySelector('strong').textContent = money(sample.value,2);
  tooltip.querySelector('small').textContent = historyFullLabel(sample.t);
  tooltip.hidden = false;
  stage.classList.add('inspecting');
  state.worthInspectIndex = safe;
  updateWorthChartMetrics(sample);
}
function inspectWorthAt(event) {
  const stage = $('treasuryWorthStage'), plot = state.worthPlot;
  if (!stage || !plot?.samples?.length) return;
  const rect = stage.getBoundingClientRect();
  const x = Math.max(0,Math.min(rect.width,event.clientX-rect.left));
  const targetX = rect.width ? (x/rect.width)*plot.width : 0;
  let best=0,dist=Infinity;
  plot.samples.forEach((sample,index)=>{const d=Math.abs(sample.x-targetX);if(d<dist){dist=d;best=index;}});
  showWorthSample(best);
}
function bindWorthInteraction() {
  const stage = $('treasuryWorthStage');
  if (!stage) return;
  const touch = {id:null,x:0,y:0,horizontal:false};
  const inside = (event) => { const r=stage.getBoundingClientRect(); return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom; };
  const release = (id) => { try{if(stage.hasPointerCapture?.(id))stage.releasePointerCapture(id);}catch(_){} };
  stage.addEventListener('pointerdown',(event)=>{
    if(event.pointerType==='mouse'){inspectWorthAt(event);return;}
    touch.id=event.pointerId;touch.x=event.clientX;touch.y=event.clientY;touch.horizontal=false;inspectWorthAt(event);
  },{passive:true});
  stage.addEventListener('pointermove',(event)=>{
    if(event.pointerType==='mouse'){if(!inside(event)){hideWorthInspector();return;}inspectWorthAt(event);return;}
    if(event.pointerId!==touch.id)return;
    if(!inside(event)){release(event.pointerId);stage.classList.remove('dragging');touch.id=null;touch.horizontal=false;hideWorthInspector();return;}
    const dx=event.clientX-touch.x,dy=event.clientY-touch.y,ax=Math.abs(dx),ay=Math.abs(dy);
    if(!touch.horizontal){
      if(Math.max(ax,ay)<4){inspectWorthAt(event);return;}
      if(ay>ax*1.35){hideWorthInspector();touch.id=null;return;}
      if(ax<4||ax<ay*.72)return;
      touch.horizontal=true;stage.classList.add('dragging');try{stage.setPointerCapture(event.pointerId)}catch(_){}
    }
    if(event.cancelable)event.preventDefault();inspectWorthAt(event);
  },{passive:false});
  stage.addEventListener('pointerup',(event)=>{release(event.pointerId);stage.classList.remove('dragging');touch.id=null;touch.horizontal=false;hideWorthInspector();});
  stage.addEventListener('pointercancel',(event)=>{release(event.pointerId);stage.classList.remove('dragging');touch.id=null;touch.horizontal=false;hideWorthInspector();});
  stage.addEventListener('pointerleave',()=>hideWorthInspector());
  document.addEventListener('pointerdown',(event)=>{if(stage.classList.contains('inspecting')&&!stage.contains(event.target))hideWorthInspector();},true);
  stage.addEventListener('keydown',(event)=>{const samples=state.worthPlot?.samples||[];if(!samples.length||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')return hideWorthInspector();let i=state.worthInspectIndex;if(event.key==='Home')i=0;else if(event.key==='End')i=samples.length-1;else if(event.key==='ArrowLeft')i=i<0?samples.length-1:i-1;else i=i<0?0:i+1;showWorthSample(i);});
}
function render() {
  const data = state.data;
  setLiveValue('treasuryHeaderPrice', state.price > 0 ? money(state.price,state.price<10?4:3) : '—', state.price || NaN, true);
  if (!data) { renderSparkline(); renderWorthSparkline(); return; }
  const total=number(data.total),available=number(data.available),staked=number(data.staked),rewards=number(data.rewards),apr=number(data.apr),worth=total*state.price,totalSafe=Math.max(total,.00000001);
  const stakedPct=Math.max(0,Math.min(100,staked/totalSafe*100)),availablePct=Math.max(0,Math.min(100,available/totalSafe*100)),rewardsPct=Math.max(0,Math.min(100,rewards/totalSafe*100));
  const daily=staked>0&&apr>0?staked*(apr/100)/365:0;
  const rv={hour:daily/24,day:daily,month:daily*30.4375,year:daily*365};
  const m=milestone(total);
  const fixed=Math.max(0,total).toFixed(2),[wholeRaw,decimals='00']=fixed.split('.');
  setLiveValue('treasuryTotalMajor',Number(wholeRaw).toLocaleString('en-US'),total,true);
  setLiveValue('treasuryTotalDecimals',`.${decimals}`,total,true);
  setLiveValue('treasuryTotalWorth',state.price>0?money(worth,2):'Prezzo in sincronizzazione',state.price>0?worth:NaN,true);
  setLiveValue('treasuryNetWorthCurrent',state.price>0?money(worth,2):'—',state.price>0?worth:NaN,true);
  const pnl24 = state.price>0 && state.open24>0 ? total * (state.price-state.open24) : NaN;
  const pnl24Pct = state.price>0 && state.open24>0 ? ((state.price/state.open24)-1)*100 : NaN;
  const pnl24Card = $('treasuryPnl24');
  if (pnl24Card) {
    pnl24Card.classList.remove('positive','negative','neutral');
    pnl24Card.classList.add(Number.isFinite(pnl24) ? (pnl24>0?'positive':pnl24<0?'negative':'neutral') : 'neutral');
  }
  setLiveValue('treasuryPnl24Value',Number.isFinite(pnl24)?signedMoney(pnl24,2):'—',pnl24,true);
  setLiveValue('treasuryPnl24Pct',Number.isFinite(pnl24Pct)?`${pnl24Pct>0?'+':''}${pnl24Pct.toFixed(2)}%`:'—',pnl24Pct,true);
  setLiveValue('treasuryRewards',treasuryInj(rewards,4),rewards,true);setLiveValue('treasuryRewardsWorth',state.price>0?money(rewards*state.price,2):'—',state.price>0?rewards*state.price:NaN,true);
  setLiveValue('treasuryAvailable',treasuryInj(available,4),available,true);setLiveValue('treasuryAvailableWorth',state.price>0?money(available*state.price,2):'—',state.price>0?available*state.price:NaN,true);
  setLiveValue('treasuryStaked',treasuryInj(staked,4),staked,true);setLiveValue('treasuryStakedWorth',state.price>0?money(staked*state.price,2):'—',state.price>0?staked*state.price:NaN,true);
  setLiveValue('treasuryStakeRatio',`${stakedPct.toFixed(1)}%`,stakedPct,true);setLiveValue('treasuryStakedPct',`${stakedPct.toFixed(1)}%`,stakedPct,true);setLiveValue('treasuryAvailablePct',`${availablePct.toFixed(1)}%`,availablePct,true);setLiveValue('treasuryRewardsPct',`${rewardsPct.toFixed(2)}%`,rewardsPct,true);
  $('treasuryStakedBar').style.width=`${stakedPct}%`;$('treasuryAvailableBar').style.width=`${availablePct}%`;$('treasuryRewardsBar').style.width=`${Math.max(rewardsPct,rewards>0?.35:0)}%`;
  setLiveValue('treasuryApr',apr>0?`APR RETE ${apr.toFixed(3)}%`:'APR —',apr||NaN,true);
  setLiveValue('treasuryRewardHour',treasuryInj(rv.hour,5),rv.hour,true);setLiveValue('treasuryRewardDay',treasuryInj(rv.day,4),rv.day,true);setLiveValue('treasuryRewardMonth',treasuryInj(rv.month,3),rv.month,true);setLiveValue('treasuryRewardYear',treasuryInj(rv.year,2),rv.year,true);
  setLiveValue('treasuryRewardHourWorth',state.price>0?money(rv.hour*state.price,2):'—',state.price>0?rv.hour*state.price:NaN,true);setLiveValue('treasuryRewardDayWorth',state.price>0?money(rv.day*state.price,2):'—',state.price>0?rv.day*state.price:NaN,true);setLiveValue('treasuryRewardMonthWorth',state.price>0?money(rv.month*state.price,2):'—',state.price>0?rv.month*state.price:NaN,true);setLiveValue('treasuryRewardYearWorth',state.price>0?money(rv.year*state.price,2):'—',state.price>0?rv.year*state.price:NaN,true);
  setLiveValue('treasuryMilestoneTitle',`${m.next.toLocaleString('it-IT')} INJ`,m.next,true);setLiveValue('treasuryMilestonePct',`${m.progress.toFixed(1)}%`,m.progress,true);$('treasuryMilestoneBar').style.width=`${m.progress}%`;setLiveValue('treasuryMilestoneCurrent',`${total.toLocaleString('it-IT',{maximumFractionDigits:2})} INJ`,total,true);setLiveValue('treasuryMilestoneRemaining',`${m.remaining.toLocaleString('it-IT',{maximumFractionDigits:2})} INJ mancanti`,m.remaining,true);
  $('treasuryWalletCount').textContent=data.walletCount>0?(number(data.liveWallets)<number(data.walletCount)?`${data.liveWallets}/${data.walletCount} wallet live`:`${data.walletCount} wallet`):'—';
  $('treasuryUpdated').textContent=data.updatedAt?`Updated ${new Date(data.updatedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Sync';
  const base=state.samples.length?number(state.samples[0].value):total,delta=total-base;setLiveValue('treasurySessionDelta',`${delta>=0?'+':''}${delta.toLocaleString('it-IT',{minimumFractionDigits:4,maximumFractionDigits:4})} INJ`,delta,true);
  const worthRangeRows=currentWorthRows();
  const worthBase=worthRangeRows.length?number(worthRangeRows[0].value):worth;
  const worthCurrent=worthRangeRows.length?number(worthRangeRows.at(-1).value):worth;
  const worthDelta=state.price>0?worthCurrent-worthBase:0,worthPct=worthBase>0?(worthDelta/worthBase)*100:0;
  setLiveValue('treasuryWorthDelta',state.price>0?`${worthPct>=0?'+':''}${worthPct.toFixed(2)}%`:'—',worthPct,true);
  updateGrowthChartMetrics();
  syncWorthRangeControls();
  updateWorthChartMetrics();
  renderSparkline();
  renderWorthSparkline();
  requestAnimationFrame(()=>{state.firstPaint=false;});
}

async function fetchJson(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeout);
  try { const response=await fetch(url,{cache:'no-store',signal:controller.signal}); if(!response.ok)throw new Error(`HTTP ${response.status}`); return await response.json(); }
  finally { clearTimeout(timer); }
}
async function lcd(path) {
  let lastError;
  for (const base of LCD_ENDPOINTS) { try { return await fetchJson(base+path); } catch(error){ lastError=error; } }
  throw lastError || new Error('Rete Injective non disponibile');
}
function findInj(coins=[]) { const coin=coins.find((item)=>item?.denom==='inj'); return coin?fromWei(coin.amount):0; }
function delegationTotal(data) { return (data?.delegation_responses||[]).reduce((sum,row)=>sum+fromWei(row?.balance?.amount),0); }
function rewardTotal(data) { return (data?.total||[]).filter((coin)=>coin?.denom==='inj').reduce((sum,coin)=>sum+fromWei(coin.amount),0); }
async function loadWallet(address) {
  const [bank,delegations,rewards]=await Promise.all([lcd(`/cosmos/bank/v1beta1/balances/${address}`),lcd(`/cosmos/staking/v1beta1/delegations/${address}`),lcd(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`)]);
  const available=findInj(bank?.balances||[]),staked=delegationTotal(delegations),reward=rewardTotal(rewards);
  return {available,staked,rewards:reward,total:available+staked+reward};
}
async function loadRows() {
  const rows=[];let cursor=0;
  const worker=async()=>{while(cursor<TREASURY_ADDRESSES.length){const address=TREASURY_ADDRESSES[cursor++];try{rows.push(await loadWallet(address));}catch(_){}}};
  await Promise.all([worker(),worker()]);
  return rows;
}
async function loadApr() {
  const cached=number(state.data?.apr);
  try {
    const [official,annual,pool,distribution]=await Promise.all([
      fetchJson(OFFICIAL_APR_ENDPOINT,7000).catch(()=>null),
      lcd('/cosmos/mint/v1beta1/annual_provisions').catch(()=>null),
      lcd('/cosmos/staking/v1beta1/pool').catch(()=>null),
      lcd('/cosmos/distribution/v1beta1/params').catch(()=>null)
    ]);
    const officialApr=aprPercent(official?.apr);
    const annualProvisions=number(annual?.annual_provisions),bondedTokens=number(pool?.pool?.bonded_tokens),communityTax=rate(distribution?.params?.community_tax);
    const fallback=bondedTokens>0?(annualProvisions/bondedTokens)*100*Math.max(0,1-communityTax):0;
    return officialApr||fallback||cached;
  } catch (_) { return cached; }
}
async function loadTreasury(force=false) {
  if(state.loading)return;
  if(!force&&state.updatedAt&&Date.now()-state.updatedAt<15000)return;
  state.loading=true;
  const badge=$('treasuryLiveBadge');badge.classList.add('sync');badge.classList.remove('error');
  try {
    const [rows,apr]=await Promise.all([loadRows(),loadApr()]);
    if(!rows.length)throw new Error('Rete Injective non disponibile');
    const totals=rows.reduce((acc,row)=>({available:acc.available+number(row.available),staked:acc.staked+number(row.staked),rewards:acc.rewards+number(row.rewards),total:acc.total+number(row.total)}),{available:0,staked:0,rewards:0,total:0});
    const data={ok:true,...totals,apr:number(apr),walletCount:TREASURY_ADDRESSES.length,liveWallets:rows.length,updatedAt:Date.now()};
    state.data=data;state.updatedAt=data.updatedAt;persistSnapshot(data);recordHistory(data.total,data.updatedAt);recordCurrentWorth(true);badge.classList.remove('sync','error');
  } catch(error) {
    badge.classList.remove('sync');badge.classList.add('error');$('treasuryUpdated').textContent='Rete Injective temporaneamente non disponibile';
  } finally { state.loading=false;render(); }
}
async function loadEurRate() {
  try {
    const cached=number(localStorage.getItem('inj_monitor_eur_rate'));if(cached>0)state.eurRate=cached;
    const data=await fetchJson('https://api.frankfurter.app/latest?from=USD&to=EUR',6000);const next=number(data?.rates?.EUR);if(next>0){state.eurRate=next;localStorage.setItem('inj_monitor_eur_rate',String(next));render();}
  } catch(_) {}
}
async function loadPrice() {
  try {
    const ticker=await fetchJson('https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT',6000);
    const price=number(ticker?.lastPrice),open24=number(ticker?.openPrice),change24=number(ticker?.priceChangePercent);
    if(price>0){state.price=price;if(open24>0)state.open24=open24;state.change24=change24;recordCurrentWorth(false);render();}
  } catch(_) {
    try {
      const data=await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=injective-protocol&vs_currencies=usd&include_24hr_change=true',6000);
      const price=number(data?.['injective-protocol']?.usd),change24=number(data?.['injective-protocol']?.usd_24h_change);
      if(price>0){
        state.price=price;state.change24=change24;
        if(Number.isFinite(change24)&&change24>-99.999)state.open24=price/(1+(change24/100));
        recordCurrentWorth(false);render();
      }
    } catch(_){}
  }
}
function connectPriceSocket() {
  clearTimeout(state.reconnectTimer);
  try { state.socket?.close(); } catch(_) {}
  try {
    const socket=new WebSocket('wss://stream.binance.com:9443/ws/injusdt@ticker');state.socket=socket;
    socket.addEventListener('message',(event)=>{try{const tick=JSON.parse(event.data);const price=number(tick?.c),open24=number(tick?.o),change24=number(tick?.P);if(price>0){state.price=price;if(open24>0)state.open24=open24;state.change24=change24;recordCurrentWorth(false);render();}}catch(_){}});
    socket.addEventListener('close',()=>{if(!document.hidden)state.reconnectTimer=setTimeout(connectPriceSocket,4000);});
    socket.addEventListener('error',()=>{try{socket.close()}catch(_){}});
  } catch(_) { state.reconnectTimer=setTimeout(connectPriceSocket,5000); }
}


function bindTreasuryHomeReturn() {
  const close = $('treasuryClose');
  if (!close) return;
  close.addEventListener('click', (event) => {
    event.preventDefault();
    try { sessionStorage.setItem('inj_node_return_home', '1'); } catch (_) {}

    let canRestorePreviousHome = false;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      canRestorePreviousHome = Boolean(
        ref &&
        ref.origin === window.location.origin &&
        (ref.pathname.endsWith('/index.html') || ref.pathname.endsWith('/')) &&
        window.history.length > 1
      );
    } catch (_) {}

    // If Treasury was opened from Home, let the browser restore that exact page
    // (BFCache on iOS makes this effectively instant). If it cannot, index.html
    // consumes the one-shot flag and opens Home without replaying the boot splash.
    if (canRestorePreviousHome) window.history.back();
    else window.location.replace('./index.html');
  });
}

function boot() {
  try { state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD'; } catch(_) {}
  hydrateSnapshot();hydrateHistory();hydrateWorthHistory();bindTreasuryHomeReturn();bindSparkInteraction();bindWorthInteraction();bindWorthRangeControls();render();
  Promise.allSettled([loadPrice(),loadEurRate(),loadTreasury(true)]).finally(()=>{state.firstPaint=false;});
  connectPriceSocket();
  setInterval(()=>{if(!document.hidden)void loadTreasury(false);},15000);
  setInterval(()=>{if(!document.hidden&&(!state.socket||state.socket.readyState!==WebSocket.OPEN))void loadPrice();},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void loadPrice();void loadTreasury(true);connectPriceSocket();}});
  window.addEventListener('pageshow',()=>{try{state.currency=localStorage.getItem('inj_monitor_currency')==='EUR'?'EUR':'USD';}catch(_){};render();});
  window.addEventListener('beforeunload',()=>{try{state.socket?.close()}catch(_){};clearTimeout(state.reconnectTimer);});
}

document.addEventListener('DOMContentLoaded',boot,{once:true});
