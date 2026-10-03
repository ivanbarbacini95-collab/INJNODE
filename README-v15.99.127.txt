INJ Node v15.99.127 — LCD + Mercato Live connectivity fix

- Official Injective LCD is now tried first, with sentry/1RPC fallbacks.
- Binance market transports use documented market-stream endpoints with endpoint rotation.
- REST market fallback expanded and continuously reseeded after stale sockets.
- Live Reward now rotates market sockets instead of depending on Binance :9443.
- Existing UI, wallet isolation, rewards and Treasury logic are unchanged.

Verified against current Injective/Binance endpoint documentation on 2026-10-03.
