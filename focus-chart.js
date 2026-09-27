/* INJ Node v15.99.119 — hypersensitive 1-hour Live View context chart. */
(() => {
  'use strict';

  const WINDOW_MS = 60 * 60_000;
  const EXTRA_HISTORY_MS = 3 * 60_000;
  const MAX_STORED_SAMPLES = 1200;
  const SMOOTH_TAU_MS = 34;

  let samples = [];
  let targetPrice = 0;
  let visualPrice = 0;
  let direction = 0;
  let loadedAt = 0;
  let loading = false;
  let frame = 0;
  let lastFrameAt = 0;

  const canvas = () => document.getElementById('focusChartCanvas');
  const visible = () => {
    const dialog = document.getElementById('focusDisplayDialog');
    return dialog && !dialog.hidden && !dialog.classList.contains('mode-parked') && !dialog.classList.contains('is-closing') && !document.hidden;
  };

  function trim(now) {
    samples = samples
      .filter((point) => point.t >= now - WINDOW_MS - EXTRA_HISTORY_MS && point.t <= now)
      .slice(-MAX_STORED_SAMPLES);
  }

  function breakoutDirection(price, now) {
    const prior = samples.filter((point) => point.t >= now - WINDOW_MS && point.p > 0);
    if (!prior.length) return direction;

    let high = -Infinity;
    let low = Infinity;
    for (const point of prior) {
      if (point.p > high) high = point.p;
      if (point.p < low) low = point.p;
    }

    const range = Math.max(0, high - low);
    const epsilon = Math.max(price * 0.0000015, range * 0.0012, 0.000001);

    // Trend colour is regime-based, not tick-based: once red, it only turns
    // green when live price breaks the previous 1h maximum. Vice versa for
    // a new minimum. This removes green/red flicker on micro ticks.
    if (price > high + epsilon) return 1;
    if (price < low - epsilon) return -1;

    if (!direction) {
      const first = prior[0]?.p || price;
      const delta = price - first;
      if (Math.abs(delta) > epsilon) return Math.sign(delta);
    }
    return direction;
  }

  function push(price, time) {
    price = Number(price);
    time = Number(time);
    if (!(price > 0) || !Number.isFinite(time)) return;

    const now = Date.now();
    const previousDirection = direction;
    const nextDirection = breakoutDirection(price, now);
    direction = nextDirection;
    if (previousDirection && nextDirection && previousDirection !== nextDirection) {
      window.dispatchEvent(new CustomEvent('inj-focus-breakout', { detail: { direction: nextDirection } }));
    }
    targetPrice = price;
    if (!(visualPrice > 0)) visualPrice = price;

    const point = { t: time, p: price, live: true };
    const last = samples.at(-1);
    if (last && time < last.t) return;

    // Keep incoming market updates fully responsive. Multiple updates inside
    // the same 250 ms bucket rewrite the live head instead of growing the path.
    if (last && last.live && Math.floor(last.t / 250) === Math.floor(time / 250)) {
      samples[samples.length - 1] = point;
    } else {
      samples.push(point);
    }

    trim(now);
    schedule();
  }

  function schedule() {
    if (visible() && !frame) frame = requestAnimationFrame(draw);
  }

  function downsample(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const result = [points[0]];
    const interior = points.length - 2;
    const step = interior / Math.max(1, maxPoints - 2);
    for (let cursor = 0; cursor < interior; cursor += step) {
      const index = Math.min(points.length - 2, 1 + Math.floor(cursor));
      if (result.at(-1) !== points[index]) result.push(points[index]);
    }
    result.push(points.at(-1));
    return result;
  }

  function smoothStroke(ctx, coords) {
    if (!coords.length) return;
    if (coords.length === 1) {
      ctx.moveTo(coords[0].x, coords[0].y);
      return;
    }

    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length - 1; i++) {
      const current = coords[i];
      const next = coords[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const last = coords.at(-1);
    ctx.lineTo(last.x, last.y);
  }

  function draw(timestamp = performance.now()) {
    frame = 0;
    if (!visible()) {
      lastFrameAt = 0;
      return;
    }

    const node = canvas();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w < 2 || h < 2) {
      frame = requestAnimationFrame(draw);
      return;
    }

    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelW = Math.round(w * ratio);
    const pixelH = Math.round(h * ratio);
    if (node.width !== pixelW || node.height !== pixelH) {
      node.width = pixelW;
      node.height = pixelH;
    }

    const ctx = node.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dt = lastFrameAt ? Math.max(8, Math.min(50, timestamp - lastFrameAt)) : 16;
    lastFrameAt = timestamp;

    if (targetPrice > 0) {
      if (!(visualPrice > 0)) visualPrice = targetPrice;
      const delta = targetPrice - visualPrice;
      const alpha = 1 - Math.exp(-dt / SMOOTH_TAU_MS);
      visualPrice += delta * alpha;
      if (Math.abs(targetPrice - visualPrice) <= Math.max(targetPrice * 0.00000004, 0.0000001)) {
        visualPrice = targetPrice;
      }
    }

    const now = Date.now();
    trim(now);
    let points = samples.filter((point) => point.t >= now - WINDOW_MS);

    const label = document.getElementById('focusChartLabel');
    const fresh = Boolean(points.length && now - points.at(-1).t < 20_000);
    const title = !points.length
      ? '1H · IN ATTESA'
      : !fresh
        ? '1H · ULTIMO DATO'
        : points[0].t > now - WINDOW_MS + 90_000
          ? '1H · STORICO PARZIALE'
          : '1H · LIVE';
    if (label && label.textContent !== title) label.textContent = title;
    if (!points.length) {
      frame = requestAnimationFrame(draw);
      return;
    }

    // The final point is synthetic only for rendering: it follows the latest
    // price every animation frame, giving the line a continuous, hypersensitive
    // head without inventing stored market history.
    if (visualPrice > 0 && fresh) {
      const head = { t: now, p: visualPrice, live: true, visual: true };
      if (points.at(-1)?.live) points = [...points.slice(0, -1), head];
      else points = [...points, head];
    }

    const maxPoints = Math.max(90, Math.min(300, Math.round(w * 0.55)));
    points = downsample(points, maxPoints);

    let low = Infinity;
    let high = -Infinity;
    for (const point of points) {
      if (point.p < low) low = point.p;
      if (point.p > high) high = point.p;
    }
    const span = Math.max(high - low, high * 0.00042, 0.00001);
    const middle = (high + low) / 2;
    low = middle - span * 0.66;
    high = middle + span * 0.66;

    const x = (point) => 14 + ((point.t - (now - WINDOW_MS)) / WINDOW_MS) * (w - 28);
    const y = (point) => h * 0.18 + (1 - (point.p - low) / Math.max(high - low, 1e-9)) * h * 0.64;

    const theme = getComputedStyle(document.documentElement);
    const color = theme.getPropertyValue(direction > 0 ? '--up' : direction < 0 ? '--down' : '--accent').trim() || '#55dcb2';

    const coords = [];
    let segment = [];
    const segments = [];
    let previous = null;
    for (const point of points) {
      if (previous && point.t - previous.t > 95_000 && segment.length) {
        segments.push(segment);
        segment = [];
      }
      segment.push({ x: x(point), y: y(point) });
      previous = point;
    }
    if (segment.length) segments.push(segment);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.55;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.27;
    for (const part of segments) {
      ctx.beginPath();
      smoothStroke(ctx, part);
      ctx.stroke();
      coords.push(...part);
    }

    const end = coords.at(-1);
    if (end) {
      const glow = ctx.createRadialGradient(end.x, end.y, 0, end.x, end.y, 16);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'transparent');
      ctx.globalAlpha = fresh ? 0.18 : 0.08;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = fresh ? 0.95 : 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Continuous RAF keeps both the live head and the time axis moving instead
    // of waiting for the next websocket packet and jumping in visible steps.
    frame = requestAnimationFrame(draw);
  }

  async function open() {
    schedule();
    if (loading || Date.now() - loadedAt < 60_000) return;
    loading = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch('https://api.binance.com/api/v3/klines?symbol=INJUSDT&interval=1m&limit=62', {
        signal: controller.signal,
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('history');
      const rows = await response.json();
      const now = Date.now();
      if (!Array.isArray(rows)) throw new Error('history');

      const history = rows
        .filter((row) => Number(row[4]) > 0 && Number(row[0]) <= now)
        .map((row) => ({ t: Math.min(Number(row[6]), now), p: Number(row[4]), live: false }))
        .filter((point) => Number.isFinite(point.t));

      const live = samples.filter((point) => point.live);
      samples = [
        ...history.filter((point) => !live.some((livePoint) => Math.abs(livePoint.t - point.t) < 1000)),
        ...live
      ].sort((a, b) => a.t - b.t);

      if (samples.length) {
        const latest = live.at(-1)?.p || samples.at(-1).p;
        targetPrice = targetPrice > 0 ? targetPrice : latest;
        visualPrice = visualPrice > 0 ? visualPrice : targetPrice;
        const first = samples.find((point) => point.t >= now - WINDOW_MS)?.p || samples[0].p;
        const epsilon = Math.max(latest * 0.0000015, 0.000001);
        if (!direction && Math.abs(latest - first) > epsilon) direction = Math.sign(latest - first);
      }

      trim(now);
      loadedAt = now;
      schedule();
    } catch (_) {
      schedule();
    } finally {
      clearTimeout(timer);
      loading = false;
    }
  }

  window.INJ_FOCUS_CHART = { push, open };
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (visible()) void open();
  });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
