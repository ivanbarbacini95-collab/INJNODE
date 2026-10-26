/* INJ Node · Precision Iconography, v2026.10.26.
   Decorative vector artworks: no data requests, listeners on tiles, or layout changes.
   One coordinated miniature trading-instrument illustration per Home destination. */
(() => {
  'use strict';
  const artwork = {
    entryDashboardButton: `
      <g class="pi-panes">
        <rect class="pi-panel" x="15" y="19" width="28" height="15" rx="3"/>
        <rect class="pi-panel" x="47" y="19" width="27" height="15" rx="3"/>
        <rect class="pi-panel" x="78" y="19" width="27" height="31" rx="3"/>
        <rect class="pi-panel" x="15" y="38" width="59" height="12" rx="3"/>
      </g>
      <path class="pi-strong" d="M19 29h6l4-6 3 5h7M51 27l5-3 5 3 7-5M82 44h5l4-5 4 2 6-8"/>
      <path class="pi-detail" d="M19 43h26M19 46h18M51 43h18M51 46h11M82 25h18"/>
      <circle class="pi-led" cx="99" cy="26" r="2"/>
    `,
    entryLiveButton: `
      <rect class="pi-panel" x="13" y="19" width="94" height="31" rx="5"/>
      <path class="pi-detail" d="M19 27h82M19 43h82M28 22v25M63 22v25M91 22v25"/>
      <path class="pi-strong pi-trace" d="M17 36h18l7-9 7 17 7-23 9 15h10l5-6 7 6h15"/>
      <circle class="pi-led pi-heart" cx="85" cy="36" r="2.7"/>
      <path class="pi-hair" d="M21 54h24m-18 3h12M75 54h23"/>
    `,
    entryLiveChartsButton: `
      <path class="pi-hair" d="M13 51V17h94M13 40h94M13 29h94M39 17v34M67 17v34M91 17v34"/>
      <g class="pi-candles">
        <path class="pi-detail" d="M27 27v15M47 24v15M62 20v19M79 16v20M96 12v16"/>
        <rect class="pi-fill" x="24" y="32" width="6" height="8" rx="1"/>
        <rect class="pi-fill" x="44" y="27" width="6" height="7" rx="1"/>
        <rect class="pi-fill" x="59" y="25" width="6" height="9" rx="1"/>
        <rect class="pi-fill" x="76" y="21" width="6" height="10" rx="1"/>
        <rect class="pi-fill" x="93" y="14" width="6" height="9" rx="1"/>
      </g>
      <path class="pi-strong pi-trace" d="m20 44 14-4 15-12 12 3 20-11 19-8"/>
      <circle class="pi-led" cx="100" cy="12" r="2.5"/>
    `,
    entryOrderBookButton: `
      <rect class="pi-panel" x="12" y="17" width="96" height="36" rx="4"/>
      <path class="pi-hair" d="M60 20v29M17 36h86"/>
      <g class="pi-fill">
        <rect x="19" y="23" width="29" height="3" rx="1"/><rect x="29" y="29" width="19" height="3" rx="1"/>
        <rect x="19" y="40" width="24" height="3" rx="1"/><rect x="24" y="46" width="24" height="3" rx="1"/>
        <rect x="72" y="23" width="25" height="3" rx="1"/><rect x="72" y="29" width="17" height="3" rx="1"/>
        <rect x="72" y="40" width="31" height="3" rx="1"/><rect x="72" y="46" width="20" height="3" rx="1"/>
      </g>
      <path class="pi-strong" d="M54 32h12m-5-4 4 4-4 4"/>
      <circle class="pi-led" cx="60" cy="52" r="2"/>
    `,
    entryPerformanceButton: `
      <path class="pi-hair" d="M12 51H108M12 38h96M12 25h96"/>
      <path class="pi-detail" d="M24 24v26M43 16v32M62 25v29M81 12v31M99 17v26"/>
      <rect class="pi-fill" x="20" y="31" width="8" height="12" rx="1.5"/>
      <rect class="pi-fill" x="39" y="22" width="8" height="16" rx="1.5"/>
      <rect class="pi-fill" x="58" y="32" width="8" height="13" rx="1.5"/>
      <rect class="pi-fill" x="77" y="19" width="8" height="17" rx="1.5"/>
      <rect class="pi-fill" x="95" y="24" width="8" height="12" rx="1.5"/>
      <path class="pi-strong pi-trace" d="M18 27 40 20 61 30 80 16 102 19"/>
      <circle class="pi-led" cx="102" cy="19" r="2.4"/>
    `,
    entryConverterButton: `
      <circle class="pi-panel" cx="37" cy="34" r="17"/><circle class="pi-panel" cx="83" cy="34" r="17"/>
      <path class="pi-hair" d="M29 30h16M29 38h16M74 29h18M74 39h18"/>
      <path class="pi-strong" d="M31 34h12M81 23v22m-7-16h15m-15 10h15"/>
      <path class="pi-trace pi-detail" d="M46 17c11-6 26-5 37 2m-6-6 6 6-9 2M74 52c-12 6-27 5-37-2m6 6-6-6 9-2"/>
      <circle class="pi-led" cx="60" cy="34" r="2.2"/>
    `,
    entryCommandCenterButton: `
      <rect class="pi-panel" x="12" y="17" width="96" height="37" rx="5"/>
      <path class="pi-hair" d="M45 20v31M78 20v31M16 37h87"/>
      <path class="pi-strong pi-trace" d="M17 30h5l4-7 5 12 4-5h6"/>
      <path class="pi-detail" d="M18 45h22M18 48h14M83 24h18M83 29h14M83 43h16M83 48h12"/>
      <circle class="pi-detail" cx="61" cy="35" r="12"/>
      <path class="pi-strong" d="M54 39 61 26l7 13"/>
      <circle class="pi-led" cx="61" cy="35" r="2.2"/>
    `,
    entryMarketButton: `
      <path class="pi-hair" d="M14 52V18M14 52h93M14 40h92M14 28h92"/>
      <g class="pi-fill">
        <rect x="21" y="38" width="11" height="14" rx="1.5"/>
        <rect x="38" y="31" width="11" height="21" rx="1.5"/>
        <rect x="55" y="35" width="11" height="17" rx="1.5"/>
        <rect x="72" y="24" width="11" height="28" rx="1.5"/>
        <rect x="89" y="19" width="11" height="33" rx="1.5"/>
      </g>
      <path class="pi-strong pi-trace" d="m19 34 20-10 21 4 20-12 19-1"/>
      <path class="pi-strong" d="m92 11 7 4-6 6"/>
      <circle class="pi-led" cx="80" cy="16" r="2.3"/>
    `,
    entryLiveRewardsButton: `
      <path class="pi-hair" d="M13 51h94M23 51V34M47 51V25M73 51V33M97 51V19"/>
      <circle class="pi-panel" cx="23" cy="35" r="7"/>
      <circle class="pi-panel" cx="47" cy="27" r="8"/>
      <circle class="pi-panel" cx="73" cy="35" r="7"/>
      <circle class="pi-panel" cx="97" cy="20" r="9"/>
      <circle class="pi-led pi-heart" cx="23" cy="35" r="2.2"/>
      <circle class="pi-led" cx="47" cy="27" r="2.6"/>
      <circle class="pi-led pi-heart" cx="73" cy="35" r="2.2"/>
      <circle class="pi-led" cx="97" cy="20" r="3"/>
      <path class="pi-strong pi-trace" d="M16 44q10-8 19-2t19-11q11-15 21-4t23-17"/>
    `,
    entryComparisonButton: `
      <path class="pi-hair" d="M13 53h94M13 27h94"/>
      <rect class="pi-panel" x="20" y="27" width="31" height="26" rx="3.5"/>
      <rect class="pi-panel" x="70" y="17" width="31" height="36" rx="3.5"/>
      <path class="pi-strong" d="M35 48V32m-5 5 5-5 5 5M86 47V24m-5 5 5-5 5 5"/>
      <path class="pi-trace pi-detail" d="M50 33q10-10 20-10"/>
      <path class="pi-detail" d="M25 46h21M76 46h19M76 39h19"/>
      <circle class="pi-led" cx="60" cy="28" r="2.4"/>
    `,
    entryVisualizeWealthButton: `
      <path class="pi-panel" d="M28 21h64l12 15-44 20-44-20z"/>
      <path class="pi-strong" d="m28 21 11 15 21 20 21-20 11-15M16 36h88M39 36l11-15m31 15L70 21M39 36h42"/>
      <path class="pi-detail" d="M60 56V36M50 21l10 15 10-15"/>
      <path class="pi-strong pi-trace" d="M15 18v-9m-5 4h10M106 18v-9m-5 4h10"/>
      <circle class="pi-led pi-heart" cx="60" cy="36" r="2.6"/>
    `,
    entryRewardLadderButton: `
      <path class="pi-hair" d="M11 53h98"/>
      <g class="pi-fill">
        <path d="M18 42h17v11H18zM39 34h17v19H39zM60 25h17v28H60zM81 16h21v37H81z"/>
      </g>
      <path class="pi-detail" d="M22 47h9M43 39h9M64 31h9M85 22h13"/>
      <path class="pi-strong pi-trace" d="m18 48 19-7 20-4 21-14 19-8"/>
      <circle class="pi-led" cx="97" cy="15" r="3"/>
    `,
    entryInjcEtfButton: `
      <rect class="pi-panel" x="20" y="13" width="68" height="43" rx="6"/>
      <path class="pi-hair" d="M28 20h35M28 24h23M28 47h42M28 51h29"/>
      <text class="pi-type" x="28" y="38">ETF</text>
      <circle class="pi-panel" cx="89" cy="43" r="17"/>
      <circle class="pi-detail" cx="89" cy="43" r="12"/>
      <path class="pi-strong pi-trace" d="m81 46 6-7 5 4 6-9"/>
      <circle class="pi-led" cx="98" cy="34" r="2.4"/>
      <path class="pi-detail" d="M92 15h17M99 20h10"/>
    `,
    entryWorkspaceButton: `
      <rect class="pi-panel" x="13" y="16" width="41" height="18" rx="3.5"/>
      <rect class="pi-panel" x="13" y="39" width="41" height="14" rx="3.5"/>
      <rect class="pi-panel" x="59" y="16" width="47" height="37" rx="3.5"/>
      <path class="pi-detail" d="M20 22h27M20 26h18M20 44h26M20 48h15M66 23h32M66 47h32"/>
      <path class="pi-strong" d="M74 36h19M83.5 27v18"/>
      <circle class="pi-led" cx="102" cy="19" r="2.4"/>
    `,
    entryTreasuryButton: `
      <circle class="pi-panel" cx="60" cy="34" r="26"/>
      <circle class="pi-detail" cx="60" cy="34" r="19"/>
      <circle class="pi-strong" cx="60" cy="34" r="11"/>
      <path class="pi-hair" d="M60 3v12m0 38v12M29 34H15m76 0h14"/>
      <path class="pi-strong" d="m54 34 4 4 9-11"/>
      <circle class="pi-led" cx="60" cy="8" r="2"/>
      <circle class="pi-led" cx="86" cy="34" r="2"/>
      <path class="pi-detail" d="M20 16h15M85 52h15"/>
    `
  };
  const base = `
    <rect class="pi-back" x="4.5" y="5" width="111" height="58" rx="11"/>
    <path class="pi-edge" d="M16 6h19M85 6h19M5 18v15M115 36v14M17 62h21M85 62h19"/>
    <path class="pi-ticks" d="M10 12h9M10 15h5M100 57h10M105 54h5"/>
    <circle class="pi-beacon" cx="109" cy="12" r="1.45"/>
  `;
  function upgrade() {
    const home = document.querySelector('#entryGate .entry-actions.entry-flat-v44');
    if (!home) return;
    for (const [id, content] of Object.entries(artwork)) {
      const tile = document.getElementById(id);
      if (!tile || !home.contains(tile)) continue;
      let holder = tile.querySelector(':scope > .inj-tile-scene');
      if (!holder) {
        holder = document.createElement('span');
        holder.className = 'inj-tile-scene';
        tile.appendChild(holder);
      }
      if (holder.dataset.premiumArtwork === '1') continue;
      holder.setAttribute('aria-hidden', 'true');
      holder.classList.add('inj-precision-icon');
      // Only inert trusted constant SVG markup; never interpolates wallet or API data.
      holder.innerHTML = '<svg viewBox="0 0 120 68" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' + base + content + '</svg>';
      holder.dataset.premiumArtwork = '1';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', upgrade, {once:true});
  else upgrade();
})();
