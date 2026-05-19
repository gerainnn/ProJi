/* =========================================================================
   biomes.js — World sampling: height, biome, color.

   Two layers:
     1. WorldSampler: given (x, z) → { height, slope, biome, surfaceColor }
     2. Biome lookup tables and color mixing

   Heights are in world units. Sea level = 0.
   ========================================================================= */

(function (root) {
  "use strict";

  const { SimplexNoise, fbm, ridgedFbm } = root.N;
  const { clamp, smoothstep, mix } = root.M;

  /* ============================================================
     Biome enum
     ============================================================ */
  const BIOME = {
    OCEAN_DEEP:  0,
    OCEAN:       1,
    BEACH:       2,
    GRASSLAND:   3,
    FOREST:      4,
    PINE_FOREST: 5,
    DESERT:      6,
    SAVANNA:     7,
    TUNDRA:      8,
    SNOW:        9,
    MOUNTAIN:    10,
    SWAMP:       11,
  };

  const BIOME_NAMES = {
    [BIOME.OCEAN_DEEP]:  "глубокий океан",
    [BIOME.OCEAN]:       "океан",
    [BIOME.BEACH]:       "побережье",
    [BIOME.GRASSLAND]:   "луга",
    [BIOME.FOREST]:      "лиственный лес",
    [BIOME.PINE_FOREST]: "хвойный лес",
    [BIOME.DESERT]:      "пустыня",
    [BIOME.SAVANNA]:     "саванна",
    [BIOME.TUNDRA]:      "тундра",
    [BIOME.SNOW]:        "снежные пики",
    [BIOME.MOUNTAIN]:    "горы",
    [BIOME.SWAMP]:       "болото",
  };

  // Surface colors per biome (RGB 0..1, used in shaders too via uniform table).
  // Two colors per biome: low (deep / wet) and high (high ground / dry).
  const BIOME_COLORS_LOW = {
    [BIOME.OCEAN_DEEP]:  [0.05, 0.10, 0.18],
    [BIOME.OCEAN]:       [0.12, 0.22, 0.32],
    [BIOME.BEACH]:       [0.86, 0.78, 0.58],
    [BIOME.GRASSLAND]:   [0.39, 0.52, 0.30],
    [BIOME.FOREST]:      [0.22, 0.34, 0.18],
    [BIOME.PINE_FOREST]: [0.20, 0.30, 0.22],
    [BIOME.DESERT]:      [0.86, 0.72, 0.46],
    [BIOME.SAVANNA]:     [0.62, 0.58, 0.32],
    [BIOME.TUNDRA]:      [0.48, 0.50, 0.42],
    [BIOME.SNOW]:        [0.90, 0.93, 0.96],
    [BIOME.MOUNTAIN]:    [0.40, 0.38, 0.36],
    [BIOME.SWAMP]:       [0.28, 0.32, 0.20],
  };
  const BIOME_COLORS_HIGH = {
    [BIOME.OCEAN_DEEP]:  [0.10, 0.18, 0.28],
    [BIOME.OCEAN]:       [0.20, 0.34, 0.44],
    [BIOME.BEACH]:       [0.94, 0.88, 0.70],
    [BIOME.GRASSLAND]:   [0.55, 0.66, 0.38],
    [BIOME.FOREST]:      [0.34, 0.46, 0.24],
    [BIOME.PINE_FOREST]: [0.32, 0.42, 0.30],
    [BIOME.DESERT]:      [0.96, 0.82, 0.54],
    [BIOME.SAVANNA]:     [0.78, 0.72, 0.42],
    [BIOME.TUNDRA]:      [0.62, 0.62, 0.54],
    [BIOME.SNOW]:        [1.00, 1.00, 1.00],
    [BIOME.MOUNTAIN]:    [0.55, 0.52, 0.48],
    [BIOME.SWAMP]:       [0.40, 0.42, 0.28],
  };

  /* ============================================================
     WorldSampler — encapsulates noise generators for one seed.
     Cheap to construct, expensive to query lots of points
     (we cache height samples at chunk level).
     ============================================================ */
  function WorldSampler(seed) {
    seed = (seed >>> 0) || 1;

    // Distinct salts so each layer is independent
    const nContinent = SimplexNoise(seed ^ 0xA15F);
    const nMountain  = SimplexNoise(seed ^ 0xBC23);
    const nHill      = SimplexNoise(seed ^ 0xCE9D);
    const nDetail    = SimplexNoise(seed ^ 0xD721);
    const nTemp      = SimplexNoise(seed ^ 0xE0F5);
    const nMoist     = SimplexNoise(seed ^ 0xF312);
    const nForest    = SimplexNoise(seed ^ 0x1A4B);
    const nWarp      = SimplexNoise(seed ^ 0x2B5C);

    // Sea level (world Y where water sits). Land starts above this.
    const SEA_LEVEL = 0;

    /* ------------- Height ------------- */
    // Returns world Y coordinate (in units).
    function height(x, z) {
      // Domain warp — adds organic curves to the macro shapes.
      const wScale = 0.0015;
      const wAmp = 60.0;
      const wx = x + nWarp.noise2(x * wScale, z * wScale) * wAmp;
      const wz = z + nWarp.noise2(x * wScale + 100, z * wScale + 100) * wAmp;

      // Continental mask — 0..1, decides land vs sea presence.
      // Very low frequency so we get continents and oceans.
      const c = fbm((u, v) => nContinent.noise2(u, v), wx * 0.0009, wz * 0.0009, 4, 0.5, 2.0);
      // c ~ 0..1, sea center ~0.5
      const landMask = smoothstep(0.42, 0.58, c);

      // Ridged mountains (most prominent on land).
      const mountainRaw = ridgedFbm((u, v) => nMountain.noise2(u, v),
                                    x * 0.0030, z * 0.0030, 6, 0.55, 2.0);
      // Sharpen + bias toward higher elevation
      const mountain = Math.pow(mountainRaw, 1.6);

      // Hills (mid frequency).
      const hill = fbm((u, v) => nHill.noise2(u, v), x * 0.012, z * 0.012, 5, 0.5, 2.0);

      // Detail bumps.
      const detail = fbm((u, v) => nDetail.noise2(u, v), x * 0.06, z * 0.06, 3, 0.5, 2.0);

      // Compose:
      //   - On land: base elevation + mountains weighted by mountainMask
      //   - In ocean: negative depth based on landMask
      const baseLand   = landMask * 6.0;
      const mountainContribution = mountain * landMask * 80.0;
      const hillContribution     = (hill - 0.5) * landMask * 6.0;
      const detailContribution   = (detail - 0.5) * 1.6;
      const oceanDepth           = (1.0 - landMask) * -16.0;

      return SEA_LEVEL + baseLand + mountainContribution + hillContribution +
             detailContribution + oceanDepth;
    }

    /* ------------- Slope (numerical gradient) ------------- */
    function slope(x, z) {
      const e = 1.0;
      const h0 = height(x, z);
      const hx = height(x + e, z);
      const hz = height(x, z + e);
      const dx = hx - h0;
      const dz = hz - h0;
      return Math.sqrt(dx * dx + dz * dz);
    }

    /* ------------- Climate ------------- */
    function temperature(x, z, h) {
      // Latitude effect — slow gradient over Z; large period gives variety.
      const lat = nTemp.noise2(x * 0.00025, z * 0.00025);
      // Local noise variance
      const local = nTemp.noise2(x * 0.0035, z * 0.0035) * 0.3;
      // Altitude lapse — colder higher up.
      const altPenalty = Math.max(0, h - 4) * 0.018;
      // 0 = freezing, 1 = hot
      return clamp(lat * 0.5 + 0.55 + local - altPenalty, 0, 1);
    }

    function moisture(x, z) {
      const m = fbm((u, v) => nMoist.noise2(u, v), x * 0.0014, z * 0.0014, 4, 0.5, 2.0);
      return clamp(m, 0, 1);
    }

    /* ------------- Biome classification ------------- */
    function biomeAt(x, z, h) {
      if (h < SEA_LEVEL - 6)  return BIOME.OCEAN_DEEP;
      if (h < SEA_LEVEL - 0.4) return BIOME.OCEAN;
      if (h < SEA_LEVEL + 1.2) return BIOME.BEACH;

      const t = temperature(x, z, h);
      const m = moisture(x, z);

      // Mountains / snow at altitude (override climate).
      if (h > 36) return BIOME.SNOW;
      if (h > 22 && t < 0.4) return BIOME.SNOW;
      if (h > 18) return BIOME.MOUNTAIN;

      // Cold zones
      if (t < 0.22) return BIOME.TUNDRA;

      // Hot zones
      if (t > 0.78 && m < 0.32) return BIOME.DESERT;
      if (t > 0.62 && m < 0.42) return BIOME.SAVANNA;

      // Wet & low → swamp
      if (m > 0.78 && h < 4) return BIOME.SWAMP;

      // Forests by moisture/temperature
      if (m > 0.55) {
        return t < 0.45 ? BIOME.PINE_FOREST : BIOME.FOREST;
      }

      return BIOME.GRASSLAND;
    }

    /* ------------- All-in-one sample ------------- */
    function sample(x, z) {
      const h = height(x, z);
      const t = temperature(x, z, h);
      const m = moisture(x, z);
      const b = biomeAt(x, z, h);
      return { height: h, temp: t, moist: m, biome: b };
    }

    return {
      seed,
      SEA_LEVEL,
      height,
      slope,
      temperature,
      moisture,
      biomeAt,
      sample,
      // Expose noise for advanced users
      _noise: { nContinent, nMountain, nHill, nDetail, nTemp, nMoist, nForest, nWarp },
    };
  }

  /* ============================================================
     Mini-color helper for HUD/map: sample biome → CSS rgb()
     ============================================================ */
  function biomeCssColor(biome, height) {
    const low = BIOME_COLORS_LOW[biome] || [0.5, 0.5, 0.5];
    const high = BIOME_COLORS_HIGH[biome] || [0.6, 0.6, 0.6];
    // Use height to mix
    const t = clamp((height + 4) / 40, 0, 1);
    const r = mix(low[0], high[0], t) * 255;
    const g = mix(low[1], high[1], t) * 255;
    const b = mix(low[2], high[2], t) * 255;
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  /* ============================================================
     Public
     ============================================================ */
  root.W = {
    BIOME,
    BIOME_NAMES,
    BIOME_COLORS_LOW,
    BIOME_COLORS_HIGH,
    WorldSampler,
    biomeCssColor,
  };
})(window);
