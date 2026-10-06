INJ NODE v16.00 — MERGE OFFICIAL + NEW FEATURES

BASE:
- INJ VERSIONE UFFICIALE usata come base.
- Core ufficiale preservato: app.js, ricerca wallet, connessioni LCD/mercato, Live Charts, Order Book, Command Centre, viewport e service worker.

INTEGRATED:
- Live Rewards standalone per i 5 wallet Treasury.
- Dashboard Reward Runway con 6 indicatori.
- INJ Treasury aggiornato con le novità della build INJNODE.
- Launcher Live Rewards nella Home.
- Firma INJ NODE · by IB.
- Manifest PWA.

INTENTIONALLY NOT IMPORTED:
- Le modifiche invasive al core app.js/market sync/reconnect della build INJNODE.
- Il service worker aggressivo della build INJNODE.

Questo merge è stato progettato per mantenere la stabilità della versione ufficiale e aggiungere le novità senza sostituire il motore funzionante.

PATCH v16.00.1:
- Dashboard Reward: 5 decimali (0.00000 INJ).
- Treasury Composition: tutte le percentuali a 2 decimali (0,00%).
- Live Rewards runway: animazione pallini allineata al Dashboard.


v16.00.12 — MOBILE SHARP + REALTIME CONTINUITY
- iOS/mobile Home header: removed the persistent transformed compositor layer from the normal Home view to keep title/account rail sharp.
- Main app: single-authority Binance socket, stale-feed watchdog, fast reconnect, immediate online/focus/pageshow reconciliation.
- Active wallet refresh ~5–6s; multi-wallet summaries ~10–20s depending priority; freshness paint 1s.
- Live Rewards: verified reward polling 2s + guarded market socket.
- INJ Treasury: reward chain polling 1.5s, full wallet reconciliation 5s, APR cached separately, guarded market socket.
- Command Center: wallet core refresh 6s with validator/APR caching + market watchdog.
- Live Charts / Order Book: stale OPEN socket recovery + immediate resume on online/focus/pageshow.
- Service-worker/cache version bumped to v16.00.12.

v16.00.12 — TREASURY 100% ALLOCATION + DYNAMIC DONUT
- Percentuali Staking / Disponibile / Reward calcolate dallo stesso snapshot live e riconciliate al centesimo: con Treasury > 0 la somma visualizzata e sempre 100,00%.
- L'arrotondamento residuo viene assorbito dalla quota dominante, evitando di gonfiare artificialmente quote microscopiche.
- Grafico a torta normalizzato esclusivamente sui valori reali Staking + Disponibile + Reward; ogni variazione ridisegna le ampiezze delle sezioni.
- Transizione geometrica live del donut (420 ms) per rendere visibile il riequilibrio senza scatti; percentuali e tooltip restano sincronizzati ai dati correnti.
- Cache/versione aggiornata a v16.00.12.


v16.00.14 — FLUID LIVE DIGITS
- Home, Dashboard, Live View, Pulse View e Performance Timeline: odometro per-cifra coalescente, senza restart/jitter sui feed rapidi.
- INJ Treasury: riattivato lo scorrimento verticale con larghezza tabulare fissa; cifre modificate verdi/rosse in base alla direzione.
- Live Charts, Order Book e Command Center: metriche live principali con lo stesso comportamento.
- Live Rewards escluso intenzionalmente: mantiene il comportamento numerico precedente.
- Cache/service worker aggiornati a v16.00.14.
