/* =========================================================================
   noise.js — Seeded simplex/value noise + fBM + ridged + biome map.

   This module is the heart of world generation. All terrain and vegetation
   placement comes from layered noise queries here.

   Public API on window.N:
     - mulberry32(seed) → rng()
     - SimplexNoise(seed) → { noise2(x,y), noise3(x,y,z) }
     - fbm(noise, x, y, octaves, persistence, lacunarity)
     - ridgedFbm(...)
     - hash2(x, y, salt)        – fast deterministic 2D hash → [0,1)
   ========================================================================= */

(function (root) {
  "use strict";

  /* =====================================================
     Mulberry32 — fast deterministic PRNG.
     ===================================================== */
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* =====================================================
     2D integer hash for instancing decisions.
     ===================================================== */
  function hash2(x, y, salt) {
    salt = salt | 0;
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + salt * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) / 4294967296);
  }

  /* =====================================================
     2D Simplex Noise (Gustavson-style, ported & seeded).
     Returns values in approx [-1, 1].
     ===================================================== */
  function SimplexNoise(seed) {
    const rng = mulberry32(seed >>> 0);

    // 8-direction gradients for 2D
    const grad2 = new Float32Array([
       1, 1,   -1, 1,    1,-1,   -1,-1,
       1, 0,   -1, 0,    0, 1,    0,-1,
    ]);

    // Permutation table 0..255, shuffled
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512);
    const permMod8 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      permMod8[i] = perm[i] & 7;
    }

    // Skew/unskew constants for 2D simplex
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

    function noise2(xin, yin) {
      // Skew the input space
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const X0 = i - t;
      const Y0 = j - t;
      const x0 = xin - X0;
      const y0 = yin - Y0;

      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; }
      else         { i1 = 0; j1 = 1; }

      const x1 = x0 - i1 + G2;
      const y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2;
      const y2 = y0 - 1 + 2 * G2;

      const ii = i & 255;
      const jj = j & 255;
      const gi0 = permMod8[ii + perm[jj]];
      const gi1 = permMod8[ii + i1 + perm[jj + j1]];
      const gi2 = permMod8[ii + 1 + perm[jj + 1]];

      let n0 = 0, n1 = 0, n2 = 0;

      let t0 = 0.5 - x0*x0 - y0*y0;
      if (t0 >= 0) {
        t0 *= t0;
        n0 = t0 * t0 * (grad2[gi0*2]*x0 + grad2[gi0*2+1]*y0);
      }
      let t1 = 0.5 - x1*x1 - y1*y1;
      if (t1 >= 0) {
        t1 *= t1;
        n1 = t1 * t1 * (grad2[gi1*2]*x1 + grad2[gi1*2+1]*y1);
      }
      let t2 = 0.5 - x2*x2 - y2*y2;
      if (t2 >= 0) {
        t2 *= t2;
        n2 = t2 * t2 * (grad2[gi2*2]*x2 + grad2[gi2*2+1]*y2);
      }

      // Scale output to roughly [-1, 1]
      return 70 * (n0 + n1 + n2);
    }

    return { noise2 };
  }

  /* =====================================================
     fBM — fractal Brownian motion (sum of octaves).
     Returns ~[0..1] for `noise` returning ~[-1..1].
     ===================================================== */
  function fbm(noise, x, y, octaves, persistence, lacunarity) {
    persistence = persistence || 0.5;
    lacunarity = lacunarity || 2.0;
    let total = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * freq, y * freq) * amp;
      max += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return total / max * 0.5 + 0.5;
  }

  /* =====================================================
     Ridged multifractal — gives mountain ridges.
     ===================================================== */
  function ridgedFbm(noise, x, y, octaves, persistence, lacunarity) {
    persistence = persistence || 0.5;
    lacunarity = lacunarity || 2.0;
    let total = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      let v = 1 - Math.abs(noise(x * freq, y * freq));
      v *= v;
      total += v * amp;
      max += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return total / max;
  }

  /* =====================================================
     Public
     ===================================================== */
  root.N = { mulberry32, hash2, SimplexNoise, fbm, ridgedFbm };
})(window);
