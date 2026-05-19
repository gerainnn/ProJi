/* =========================================================
   Hero canvas — flow field of thin warm strokes
   Implements a self-contained value-noise based vector field.
   Performance: capped particle count, devicePixelRatio-aware,
   pauses when off-screen or tab hidden.
   ========================================================= */

(function () {
  "use strict";

  const canvas = document.querySelector("[data-canvas]");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Value noise (lightweight Perlin-ish) ---------- */
  // Simple 2D value noise using a hashed lattice. Smoother than random,
  // cheaper than Perlin gradients, sufficient for flow fields.
  const PERM_SIZE = 256;
  const perm = new Uint8Array(PERM_SIZE * 2);
  (function seed() {
    const arr = new Array(PERM_SIZE);
    for (let i = 0; i < PERM_SIZE; i++) arr[i] = i;
    // Fisher-Yates with deterministic seed
    let s = 1337;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s & 0xffff) / 0xffff;
    };
    for (let i = PERM_SIZE - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    for (let i = 0; i < PERM_SIZE * 2; i++) perm[i] = arr[i % PERM_SIZE];
  })();

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  function valueNoise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = lerp(aa, ba, u) / 255;
    const x2 = lerp(ab, bb, u) / 255;
    return lerp(x1, x2, v); // 0..1
  }

  /* ---------- Particles ---------- */

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    particles: [],
    running: false,
    rafId: 0,
    t: 0,
    visible: true,
  };

  const CONFIG = {
    densityFactor: 0.00009, // particles per pixel area
    minParticles: 60,
    maxParticles: 220,
    speed: 0.42,
    fieldScale: 0.0014,
    fieldEvolve: 0.00018,
    lineWidth: 0.55,
    fadeAlpha: 0.045, // trail fade per frame
    color: "230, 165, 100",
    altColor: "200, 180, 230",
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, Math.floor(rect.width));
    state.height = Math.max(1, Math.floor(rect.height));
    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    seedParticles();
    // Paint base background once
    ctx.clearRect(0, 0, state.width, state.height);
  }

  function seedParticles() {
    const count = Math.max(
      CONFIG.minParticles,
      Math.min(
        CONFIG.maxParticles,
        Math.floor(state.width * state.height * CONFIG.densityFactor)
      )
    );
    state.particles = new Array(count).fill(0).map(() => spawn());
  }

  function spawn(initial) {
    return {
      x: Math.random() * state.width,
      y: Math.random() * state.height,
      px: 0,
      py: 0,
      life: 0,
      maxLife: 180 + Math.random() * 320,
      hueShift: Math.random(),
      speed: 0.6 + Math.random() * 0.8,
    };
  }

  function step() {
    state.rafId = requestAnimationFrame(step);
    if (!state.visible) return;
    if (reduceMotion) return drawStatic();

    state.t += 1;

    // Trail fade — uses a near-transparent rect to gradually erase
    ctx.fillStyle = "rgba(12, 10, 13, " + CONFIG.fadeAlpha + ")";
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.lineWidth = CONFIG.lineWidth;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "lighter";

    const tEvolve = state.t * CONFIG.fieldEvolve;

    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      p.life++;

      // Sample flow field
      const n = valueNoise(
        p.x * CONFIG.fieldScale + tEvolve,
        p.y * CONFIG.fieldScale + tEvolve
      );
      const angle = n * Math.PI * 4; // 0..4π → directional variety
      const vx = Math.cos(angle) * CONFIG.speed * p.speed;
      const vy = Math.sin(angle) * CONFIG.speed * p.speed;

      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;

      // Color blend along the field
      const baseAlpha =
        Math.min(p.life / 30, 1) *
        (1 - p.life / p.maxLife) *
        0.55;

      // Mix accent and a cooler whisper
      const useAlt = p.hueShift > 0.78;
      const color = useAlt ? CONFIG.altColor : CONFIG.color;

      ctx.strokeStyle = "rgba(" + color + "," + baseAlpha.toFixed(3) + ")";

      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // Respawn out-of-bounds or aged particles
      if (
        p.life > p.maxLife ||
        p.x < -20 ||
        p.x > state.width + 20 ||
        p.y < -20 ||
        p.y > state.height + 20
      ) {
        Object.assign(p, spawn());
        p.life = 0;
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- Static fallback (reduced motion) ---------- */

  function drawStatic() {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    ctx.clearRect(0, 0, state.width, state.height);

    // Draw a still snapshot of the field as quiet dotted strokes
    ctx.lineWidth = 0.6;
    ctx.lineCap = "round";
    const n = 1400;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * state.width;
      const y = Math.random() * state.height;
      const v = valueNoise(x * CONFIG.fieldScale, y * CONFIG.fieldScale);
      const angle = v * Math.PI * 4;
      const len = 6 + v * 12;
      const a = 0.06 + v * 0.06;
      ctx.strokeStyle = "rgba(230, 165, 100," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  }

  /* ---------- Lifecycle ---------- */

  function start() {
    if (state.running) return;
    state.running = true;
    if (reduceMotion) {
      drawStatic();
    } else {
      cancelAnimationFrame(state.rafId);
      state.rafId = requestAnimationFrame(step);
    }
  }

  function stop() {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  /* ---------- Observers ---------- */

  // Pause when out of viewport
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          state.visible = entry.isIntersecting;
        });
      },
      { threshold: 0.05 }
    );
    io.observe(canvas);
  }

  // Pause when tab hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  // Resize observer with debounce
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
    }, 80);
  }
  window.addEventListener("resize", onResize, { passive: true });

  // Boot
  resize();
  start();
})();
