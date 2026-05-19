/* ==========================================================================
   Орбита — orbita.js
   A procedural pocket cosmos: deterministic generation, real sphere
   rendering with lighting, orbital motion, lore, and a fully self-
   contained UI. No frameworks, no libraries.

   Sections:
     §1  Constants & helpers (RNG, noise, color, math)
     §2  Vocabulary (names, epithets, lore templates)
     §3  System generation (sun + planets + comets)
     §4  Surface & texture baking
     §5  Sphere renderer (per-pixel, with lighting & limb darkening)
     §6  Starfield & sun rendering
     §7  Main animation loop
     §8  Interaction (hover, click, keyboard)
     §9  HUD & panel updates
     §10 Boot
   ========================================================================== */

(function () {
  "use strict";

  /* ============================================================
     §1  Constants & helpers
     ============================================================ */

  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Seeded PRNG — deterministic per system
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

  // Value noise factory — creates a noise function with its own permutation table
  function makeNoise(rng) {
    const SIZE = 256;
    const perm = new Uint8Array(SIZE * 2);
    const arr = new Uint8Array(SIZE);
    for (let i = 0; i < SIZE; i++) arr[i] = i;
    for (let i = SIZE - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    for (let i = 0; i < SIZE * 2; i++) perm[i] = arr[i % SIZE];

    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;

    return function noise2(x, y) {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = perm[perm[xi] + yi];
      const ab = perm[perm[xi] + yi + 1];
      const ba = perm[perm[xi + 1] + yi];
      const bb = perm[perm[xi + 1] + yi + 1];
      return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v) / 255;
    };
  }

  // Multi-octave fractal noise
  function fbm(noise, x, y, octaves, persistence) {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * freq, y * freq) * amp;
      max += amp;
      amp *= persistence;
      freq *= 2;
    }
    return total / max;
  }

  // Math
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Color
  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function rgbCss(rgb, a) {
    return a == null
      ? `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`
      : `rgba(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0},${a})`;
  }

  function lerpRgb(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  // Sample a multi-stop palette given t in [0..1]
  function paletteAt(stops, t) {
    if (t <= 0) return stops[0].slice();
    if (t >= 1) return stops[stops.length - 1].slice();
    const x = t * (stops.length - 1);
    const i = Math.floor(x);
    return lerpRgb(stops[i], stops[i + 1], x - i);
  }

  // HSL → RGB (for procedural palette generation)
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1)      { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else             { r = c; b = x; }
    const m = l - c / 2;
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  /* ============================================================
     §2  Vocabulary
     ============================================================ */

  const NAME_PRE = [
    "Ан","Ил","Ор","Ве","Ус","Ка","Те","Си","Ма","Эр","Ал","Ни","По","Ри","Та",
    "Юр","Ке","Лу","Со","На","Хи","Ти","Ди","Эн","Ис","Ор","Ме","Ла","Эл"
  ];
  const NAME_MID = [
    "ра","ли","се","ме","то","ри","ва","ку","де","ло","си","на","пе","мо","тья",
    "ле","фо","ни","ха","со","эл","ан","ро","ми","ту","ке"
  ];
  const NAME_SUF = [
    "ос","ия","ас","уна","эн","ил","ея","от","ан","ум","ар","ис","эль","он","ур",
    "ес","ой","им","эа","ара","ея","ея","ес"
  ];
  const ROMAN = ["Прим", "Секунд", "II", "III", "IV", "V", "VI", "VII", "IX", "XII"];

  function makeName(rng) {
    let n = NAME_PRE[Math.floor(rng() * NAME_PRE.length)];
    if (rng() < 0.7) n += NAME_MID[Math.floor(rng() * NAME_MID.length)];
    n += NAME_SUF[Math.floor(rng() * NAME_SUF.length)];
    if (rng() < 0.28) n += " " + ROMAN[Math.floor(rng() * ROMAN.length)];
    return n;
  }

  function makeStarName(rng) {
    let n = NAME_PRE[Math.floor(rng() * NAME_PRE.length)];
    n += NAME_MID[Math.floor(rng() * NAME_MID.length)];
    n += NAME_SUF[Math.floor(rng() * NAME_SUF.length)];
    return n;
  }

  // Epithets — short poetic phrases
  const EPITHETS = {
    gas:        ["шепчущий гигант", "царство ветров", "дом вечной бури", "колыбель молний", "кольцо без короны"],
    ringed:     ["венценосный", "обладатель пыльного гало", "дитя разбитой луны", "хранитель пыли"],
    terrestrial:["сад медленных вод", "дом возможной жизни", "мир под двумя солнцами памяти", "колыбель", "влажная сфера"],
    ocean:      ["мир, где небо упало в воду", "глубина без дна", "синий свет", "тёплое одиночество"],
    ice:        ["снящий подо льдом", "белая немота", "хрустальная архива", "забытый брат"],
    molten:     ["младенец из расплава", "негасимый", "красный пульс", "первичный огонь"],
    desert:     ["рыжий континент", "сухой колокол", "память дождя", "ветреный череп"],
    barren:     ["голый камень", "тихая поверхность", "пыльное лицо", "пустой щит"]
  };

  // Lore templates per kind
  const LORE = {
    gas: [
      "{name} — газовый гигант, чьи бури живут дольше династий. В нижних слоях давление превращает водород в металл; там не светает никогда.",
      "Атмосфера {name} разделена на тринадцать вертикальных течений. У каждого свой голос — и каждый из них шепчет на одном языке, известном только ему.",
      "Под слоем рыжих облаков {name} скрывает океан жидкого аммиака. Раз в орбиту он закипает; считается, что именно так звезда дышит.",
      "Кольца {name} ещё не сложились — это пыль, которая ждёт, когда у неё появится центр тяжести.",
      "Молнии {name} видны с соседней планеты. На местном языке это слово означает «передача мысли»."
    ],
    ringed: [
      "Кольца {name} — кладбище луны, разбитой о собственную планету. Расстояние между обломками настолько велико, что их можно пересечь, не заметив.",
      "{name} носит свои кольца как воротник: их форма меняется от сезона к сезону, и ни одна модель не предсказала следующее.",
      "Старейшие из колец {name} тоньше ладони. Если бы кто-то ехал по ним, под ним был бы только сам факт расстояния."
    ],
    terrestrial: [
      "{name} — мир, где океаны едва успевают остыть после кипения. Жизнь здесь начинается каждые сто тысяч лет заново и каждый раз по-новому.",
      "Континенты {name} плывут так быстро, что карты переписываются раз в столетие. Историки не доверяют картам — только фотографиям.",
      "Поверхность {name} разделена на узкие климатические пояса. Между ними — стены ветра, через которые птицы не возвращаются.",
      "На {name} один материк помнит дождь, второй — нет. Они никогда не разговаривают.",
      "Год {name} короче её суток. Местные растения цветут не по сезону, а по углу света."
    ],
    ocean: [
      "{name} — мир, у которого нет суши. На месте, где она должна была быть, плавает большая водяная складка.",
      "Под поверхностью {name} есть слой, в котором свет поворачивает обратно. Там живут существа, которых ещё никто не видел и никогда не увидит.",
      "Океан {name} тёплый сверху и холодный снизу. Температура на глубине трёх километров — точно такая же, как у тишины."
    ],
    ice: [
      "{name} спит подо льдом. Ниже, в океане без света, плавают тёплые течения и тишина.",
      "Поверхность {name} разрезана трещинами шириной в город. По этим трещинам можно идти годами — и не дойти ни до одной из них.",
      "{name} — мир, на котором замёрзло само время. Часы здесь идут, но никто не помнит зачем."
    ],
    molten: [
      "{name} ещё не остыла после рождения. Камни здесь текут, как ленивая ртуть, и разговаривают между собой через тепло.",
      "На {name} нет горизонта — только дрожание раскалённого воздуха.",
      "Поверхность {name} обновляется каждые семьсот лет. Археология здесь — самая короткая из наук."
    ],
    desert: [
      "Один океан {name} высох миллион лет назад. Второй — пятьсот тысяч. Сейчас здесь живёт только ветер, и он один помнит оба.",
      "{name} — мир красного песка и белых ночей. Дюны движутся медленнее, чем стрелки часов, но быстрее, чем эпохи.",
      "На {name} никогда не идёт дождь. Раз в семь лет с неба падает один камень. Местные считают это посланием."
    ],
    barren: [
      "{name} — голая порода, помнящая столкновение, после которого больше ничего не было.",
      "Поверхность {name} испещрена кратерами разной свежести. Самый старый из них старше системы — и этого никто не может объяснить.",
      "{name} вращается медленно. Один её день длится дольше человеческой жизни."
    ]
  };

  const ATMOS = {
    gas:         ["H₂ · He · следы CH₄", "плотная, бурная", "бесконечная, без поверхности", "слоистая, многотечная"],
    ringed:      ["H₂ · He · NH₃", "плотная, медленная", "слоистая"],
    terrestrial: ["N₂ · O₂ · следы H₂O", "пригодная для дыхания", "разрежённая, прохладная", "плотная, влажная", "тонкая, сухая"],
    ocean:       ["N₂ · H₂O", "плотный пар", "тяжёлая, влажная"],
    ice:         ["разрежённая, CO₂", "почти отсутствует", "тонкая, метановая"],
    molten:      ["плотные сернистые пары", "удушающая, раскалённая", "ядовитая"],
    desert:      ["разрежённая, CO₂", "сухая, пыльная", "тонкая, статичная"],
    barren:      ["—", "следы инертных газов", "вакуум"]
  };

  const POPULATIONS = [
    { v: "—",                   w: 8 },
    { v: "следы древних форм",  w: 2 },
    { v: "колония — 4 200",     w: 1 },
    { v: "колония — 18 600",    w: 1 },
    { v: "руины",               w: 2 },
    { v: "цивилизация — 1.2 млрд", w: 1 },
    { v: "цивилизация — 8.4 млрд", w: 0.5 },
    { v: "одинокая станция",    w: 1 },
    { v: "автоматический архив", w: 0.6 }
  ];

  function pickWeighted(rng, items) {
    const total = items.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of items) { r -= x.w; if (r <= 0) return x.v; }
    return items[items.length - 1].v;
  }

  /* ============================================================
     §3  System generation
     ============================================================ */

  // Planet kind weights (per slot)
  const KIND_WEIGHTS = [
    { k: "molten",      w: 1   },
    { k: "barren",      w: 1.4 },
    { k: "terrestrial", w: 1.6 },
    { k: "ocean",       w: 0.8 },
    { k: "desert",      w: 1.2 },
    { k: "gas",         w: 1.5 },
    { k: "ringed",      w: 0.9 },
    { k: "ice",         w: 1.3 }
  ];

  function pickKind(rng) {
    const total = KIND_WEIGHTS.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of KIND_WEIGHTS) { r -= x.w; if (r <= 0) return x.k; }
    return "barren";
  }

  // Per-kind palette generators (returns array of [r,g,b] stops)
  function makePalette(kind, rng) {
    const j = (a, b) => a + rng() * (b - a);
    switch (kind) {
      case "gas": {
        const baseHue = pickOne(rng, [28, 35, 200, 220, 280, 320]);
        return [
          hsl(baseHue + j(-10,10), j(0.35,0.55), j(0.15,0.22)),
          hsl(baseHue + j(-5,15),  j(0.40,0.60), j(0.32,0.45)),
          hsl(baseHue + j(-15,15), j(0.30,0.45), j(0.55,0.70)),
          hsl(baseHue + j(-10,10), j(0.35,0.55), j(0.40,0.55))
        ];
      }
      case "ringed":
        return [
          hsl(j(30,55),  0.30, 0.20),
          hsl(j(35,60),  0.45, 0.45),
          hsl(j(40,65),  0.55, 0.65),
          hsl(j(30,55),  0.40, 0.50)
        ];
      case "terrestrial":
        return [
          hsl(j(200,230), 0.55, 0.18),  // deep ocean
          hsl(j(195,225), 0.45, 0.32),  // shallow
          hsl(j(80,140),  0.40, 0.30),  // land
          hsl(j(70,130),  0.30, 0.50),  // highland
          hsl(j(40,55),   0.20, 0.65)   // peak / sand
        ];
      case "ocean":
        return [
          hsl(j(210,240), 0.65, 0.10),
          hsl(j(200,225), 0.55, 0.25),
          hsl(j(190,215), 0.45, 0.45),
          hsl(j(190,210), 0.35, 0.60)
        ];
      case "ice":
        return [
          hsl(j(190,220), 0.30, 0.30),
          hsl(j(195,220), 0.20, 0.65),
          hsl(j(200,225), 0.10, 0.85),
          hsl(j(200,225), 0.05, 0.95)
        ];
      case "molten":
        return [
          [10, 6, 6],
          hsl(j(0,15),   0.85, 0.18),
          hsl(j(10,30),  0.95, 0.45),
          hsl(j(30,55),  1.00, 0.65),
          [255, 240, 200]
        ];
      case "desert":
        return [
          hsl(j(15,30),  0.50, 0.20),
          hsl(j(20,40),  0.55, 0.40),
          hsl(j(30,50),  0.50, 0.55),
          hsl(j(35,55),  0.30, 0.75)
        ];
      case "barren":
      default:
        return [
          hsl(j(20,40),  0.10, 0.18),
          hsl(j(20,45),  0.08, 0.32),
          hsl(j(15,40),  0.06, 0.50),
          hsl(j(20,40),  0.04, 0.65)
        ];
    }
  }

  function pickOne(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  function generateSystem(seed) {
    const rng = mulberry32(seed);
    const noise = makeNoise(rng);

    // Star
    const starHue   = 30 + rng() * 30; // gold to warm
    const starRgb   = hsl(starHue, 0.7, 0.7);
    const starSize  = 26 + rng() * 18;

    const sun = {
      seed,
      name: makeStarName(rng).toUpperCase(),
      designation: "K-" + (1000 + Math.floor(rng() * 8999)),
      hue: starHue,
      rgb: starRgb,
      size: starSize
    };

    // Planets — 6..9
    const count = 6 + Math.floor(rng() * 4);
    const planets = [];
    let r = 110 + rng() * 30;

    for (let i = 0; i < count; i++) {
      const kind = pickKind(rng);
      const sizeRange = (
        kind === "gas" || kind === "ringed" ? [22, 42]
        : kind === "molten" ? [10, 16]
        : kind === "ocean"  ? [16, 24]
        : [12, 22]
      );
      const radius = sizeRange[0] + rng() * (sizeRange[1] - sizeRange[0]);

      // Orbit semi-major axis
      const orbitR = r;
      r += radius * 1.8 + 60 + rng() * 70;

      const eccentricity = rng() * 0.12;
      // Period scales with a^1.5 (Kepler), with arbitrary base
      const period = Math.pow(orbitR / 110, 1.5) * 6;
      const phase = rng() * TAU;

      const palette = makePalette(kind, rng);

      const planet = {
        idx: i + 1,
        seed: (seed * 9301 + i * 49297) >>> 0,
        kind,
        name: makeName(rng),
        epithet: pickOne(rng, EPITHETS[kind] || EPITHETS.barren),
        radius,
        orbitR,
        eccentricity,
        period,            // in-world years for one orbit
        phase,
        tilt: (rng() - 0.5) * 0.5,
        spinRate: 0.05 + rng() * 0.18,
        spinSign: rng() < 0.85 ? 1 : -1,
        palette,
        kindLabel: KIND_LABELS[kind] || kind,
        // Ring system?
        ring: kind === "ringed" || (kind === "gas" && rng() < 0.18),
        // Moons count
        moons: pickMoonCount(rng, kind),
        // Surface field — baked once
        field: null,
        // Render canvas — reused each frame
        renderCanvas: null,
        // Lore
        lore: null,
        // Stats (filled below)
        stats: {}
      };

      // Lore + stats
      const loreT = pickOne(rng, LORE[kind] || LORE.barren);
      planet.lore = loreT.replace(/\{name\}/g, planet.name);
      planet.stats = {
        orbit:       (orbitR / 110).toFixed(2) + " а.е.",
        year:        period.toFixed(1) + " лет",
        radius:      Math.round(radius * 280) + " км",
        gravity:     (0.2 + rng() * 2.5).toFixed(2) + " g",
        atmosphere:  pickOne(rng, ATMOS[kind] || ATMOS.barren),
        temperature: tempFor(kind, rng),
        moons:       planet.moons === 0 ? "—" : String(planet.moons),
        population:  pickWeighted(rng, POPULATIONS)
      };

      // Bake surface field
      bakeField(planet, noise);

      planets.push(planet);
    }

    return { seed, sun, planets, rng, noise };
  }

  const KIND_LABELS = {
    gas: "газовый гигант",
    ringed: "окольцованный",
    terrestrial: "землеподобный",
    ocean: "океанический",
    ice: "ледяной",
    molten: "расплавленный",
    desert: "пустынный",
    barren: "каменистый"
  };

  function pickMoonCount(rng, kind) {
    if (kind === "gas" || kind === "ringed") return 2 + Math.floor(rng() * 14);
    if (kind === "ice") return Math.floor(rng() * 4);
    if (kind === "terrestrial") return Math.floor(rng() * 3);
    if (kind === "molten") return 0;
    return Math.floor(rng() * 2);
  }

  function tempFor(kind, rng) {
    let t;
    switch (kind) {
      case "molten":      t = 800 + Math.floor(rng() * 800);  break;
      case "gas":         t = -180 + Math.floor(rng() * 90); break;
      case "ringed":      t = -150 + Math.floor(rng() * 80); break;
      case "ice":         t = -200 + Math.floor(rng() * 60); break;
      case "ocean":       t = 4 + Math.floor(rng() * 22);     break;
      case "terrestrial": t = -20 + Math.floor(rng() * 60);   break;
      case "desert":      t = -40 + Math.floor(rng() * 100);  break;
      default:            t = -100 + Math.floor(rng() * 200);
    }
    const sign = t >= 0 ? "+" : "";
    const desc =
      t > 500   ? "расплав" :
      t > 100   ? "горячий" :
      t > 30    ? "тёплый" :
      t > 0     ? "умеренный" :
      t > -50   ? "холодный" :
      t > -150  ? "ледяной" :
                  "глубокий лёд";
    return `${sign}${t} °C · ${desc}`;
  }

  /* ============================================================
     §4  Surface & texture baking
     ============================================================ */

  // Each planet gets a procedural surface field — a 2D array sampled later
  // by the sphere renderer. The field returns an RGB color for any (u, v) ∈ [0,1].
  function bakeField(planet, noise) {
    const FW = 256, FH = 128;
    const data = new Uint8ClampedArray(FW * FH * 3);
    const pal = planet.palette;
    const seed = planet.seed;

    // Per-planet noise offsets so each looks unique
    const ox = (seed % 1000) * 0.13;
    const oy = ((seed >>> 10) % 1000) * 0.07;

    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const u = x / FW;
        const v = y / FH;
        let r, g, b;

        switch (planet.kind) {
          case "gas":
          case "ringed": {
            // Strong horizontal banding + subtle longitudinal swirl
            const band = fbm(noise, ox, v * 8 + oy, 4, 0.55);
            const swirl = fbm(noise, u * 4 + ox, v * 6 + oy, 3, 0.5) * 0.15;
            const t = clamp(band + swirl, 0, 1);
            const c = paletteAt(pal, t);
            r = c[0]; g = c[1]; b = c[2];
            // Subtle storm spots
            const spot = fbm(noise, u * 12 + ox + 50, v * 12 + oy, 2, 0.5);
            if (spot > 0.78) {
              const s = (spot - 0.78) / 0.22;
              const accent = pal[pal.length - 1];
              r = lerp(r, accent[0], s * 0.5);
              g = lerp(g, accent[1], s * 0.5);
              b = lerp(b, accent[2], s * 0.5);
            }
            break;
          }
          case "terrestrial": {
            // 2D noise → continents
            const elevation = fbm(noise, u * 4 + ox, v * 4 + oy, 5, 0.55);
            const moisture  = fbm(noise, u * 3 + ox + 40, v * 3 + oy + 30, 3, 0.5);
            let c;
            if (elevation < 0.48) {
              // ocean — depth maps to palette[0..1]
              const t = smoothstep(0.30, 0.48, elevation);
              c = lerpRgb(pal[0], pal[1], t);
            } else if (elevation < 0.55) {
              // coastline / shallow
              const t = smoothstep(0.48, 0.55, elevation);
              c = lerpRgb(pal[1], pal[2], t);
            } else {
              // land — modulated by moisture
              const t = smoothstep(0.55, 0.85, elevation);
              const dry = lerpRgb(pal[2], pal[4] || pal[3], t);
              const wet = lerpRgb(pal[2], pal[3], t);
              c = lerpRgb(dry, wet, moisture);
            }
            r = c[0]; g = c[1]; b = c[2];
            // Polar caps
            const polar = Math.abs(v - 0.5) * 2; // 0..1
            if (polar > 0.78) {
              const s = (polar - 0.78) / 0.22;
              r = lerp(r, 240, s * 0.7);
              g = lerp(g, 248, s * 0.7);
              b = lerp(b, 252, s * 0.7);
            }
            break;
          }
          case "ocean": {
            const swell = fbm(noise, u * 6 + ox, v * 5 + oy, 4, 0.55);
            const eddy  = fbm(noise, u * 16 + ox, v * 16 + oy, 2, 0.5);
            const t = clamp(swell * 0.85 + eddy * 0.15, 0, 1);
            const c = paletteAt(pal, t);
            r = c[0]; g = c[1]; b = c[2];
            break;
          }
          case "ice": {
            const base = fbm(noise, u * 3 + ox, v * 3 + oy, 4, 0.5);
            const cracks = fbm(noise, u * 30 + ox, v * 30 + oy, 1, 0.5);
            const t = clamp(base + (cracks > 0.62 ? -0.35 : 0), 0, 1);
            const c = paletteAt(pal, t);
            r = c[0]; g = c[1]; b = c[2];
            // Hairline cracks darker
            const crack2 = fbm(noise, u * 80 + ox, v * 80 + oy, 1, 0.5);
            if (crack2 > 0.7) {
              r *= 0.55; g *= 0.6; b *= 0.7;
            }
            break;
          }
          case "molten": {
            const cells = fbm(noise, u * 5 + ox, v * 5 + oy, 4, 0.6);
            const flow  = fbm(noise, u * 15 + ox, v * 15 + oy, 2, 0.5);
            // dark cracks reveal hotter palette stops
            const t = cells > 0.6 ? clamp((cells - 0.6) / 0.4 + flow * 0.2, 0, 1) : 0;
            const c = paletteAt(pal, t);
            r = c[0]; g = c[1]; b = c[2];
            break;
          }
          case "desert": {
            const dunes = fbm(noise, u * 2 + ox, v * 14 + oy, 4, 0.55);
            const ridges = fbm(noise, u * 8 + ox, v * 8 + oy, 2, 0.5) * 0.2;
            const t = clamp(dunes + ridges, 0, 1);
            const c = paletteAt(pal, t);
            r = c[0]; g = c[1]; b = c[2];
            // Cracked basins (dark)
            const basin = fbm(noise, u * 6 + ox + 100, v * 6 + oy + 100, 2, 0.5);
            if (basin > 0.72) {
              const s = (basin - 0.72) / 0.28;
              r = lerp(r, pal[0][0] * 0.7, s);
              g = lerp(g, pal[0][1] * 0.7, s);
              b = lerp(b, pal[0][2] * 0.7, s);
            }
            break;
          }
          case "barren":
          default: {
            const rock = fbm(noise, u * 4 + ox, v * 4 + oy, 5, 0.55);
            const craters = fbm(noise, u * 18 + ox, v * 18 + oy, 1, 0.5);
            let t = clamp(rock, 0, 1);
            const c = paletteAt(pal, t);
            r = c[0]; g = c[1]; b = c[2];
            // Craters
            if (craters > 0.66) {
              const s = (craters - 0.66) / 0.34;
              r *= 1 - s * 0.4;
              g *= 1 - s * 0.4;
              b *= 1 - s * 0.4;
            }
            break;
          }
        }

        const i = (y * FW + x) * 3;
        data[i]     = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }

    planet.field = { data, w: FW, h: FH };
  }

  /* ============================================================
     §5  Sphere renderer
     ============================================================ */

  // Render planet to its own offscreen canvas at the given displayed radius,
  // with sphere mapping, real lighting (sun direction), and limb darkening.
  function renderPlanet(planet, displayR, lightAngle) {
    const D = Math.ceil(displayR * 2 + 4);
    if (!planet.renderCanvas || planet.renderCanvas.width !== D) {
      planet.renderCanvas = document.createElement("canvas");
      planet.renderCanvas.width = D;
      planet.renderCanvas.height = D;
    }
    const c = planet.renderCanvas;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(D, D);
    const px = img.data;

    const cx = D / 2, cy = D / 2;
    const R = displayR;
    const rotOffset = planet._rotPhase || 0;

    const f = planet.field;
    const fw = f.w, fh = f.h, fd = f.data;

    // Light direction in screen-space (sun is at canvas center;
    // for this planet we know its offset from sun via lightAngle param).
    // lightAngle = direction FROM planet TO sun.
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);

    // Tilt — simple latitude shift
    const tilt = planet.tilt || 0;
    const ct = Math.cos(tilt), st = Math.sin(tilt);

    for (let py = 0; py < D; py++) {
      for (let pxi = 0; pxi < D; pxi++) {
        const dx = (pxi - cx) / R;
        const dy = (py - cy) / R;
        const d2 = dx * dx + dy * dy;
        const idx = (py * D + pxi) * 4;

        if (d2 > 1) {
          px[idx + 3] = 0;
          continue;
        }

        const dz = Math.sqrt(1 - d2);

        // Apply tilt to the normal (rotate around X axis: y' = y*ct - z*st, z' = y*st + z*ct)
        const ny = dy * ct - dz * st;
        const nz = dy * st + dz * ct;
        const nx = dx;

        // Map to (u, v) on texture — equirectangular projection
        let u = Math.atan2(nx, nz) / TAU + 0.5 + rotOffset;
        u = u - Math.floor(u);
        const v = ny * 0.5 + 0.5;

        const tx = Math.min(fw - 1, Math.max(0, Math.floor(u * fw)));
        const ty = Math.min(fh - 1, Math.max(0, Math.floor(v * fh)));
        const ti = (ty * fw + tx) * 3;
        let r = fd[ti];
        let g = fd[ti + 1];
        let b = fd[ti + 2];

        // Lighting (Lambertian-ish with ambient)
        // Light direction in screen coords (3D vector pointing from planet to sun)
        // We approximate with z component slightly toward viewer for fullness.
        const ldot = Math.max(0, dx * lx + dy * ly + dz * 0.25);
        // Soft terminator
        const lit = 0.10 + 0.90 * ldot;

        // Limb darkening — slight extra dim at edges
        const limb = 0.55 + 0.45 * dz;

        // Atmospheric rim glow on the day side — boost blue/cyan near the limb
        let rim = 0;
        if (planet.kind === "terrestrial" || planet.kind === "ocean" || planet.kind === "ice") {
          rim = Math.pow(1 - dz, 3) * ldot * 1.2;
        }

        const m = lit * limb;
        let or = r * m;
        let og = g * m;
        let ob = b * m;

        if (rim > 0) {
          or = lerp(or, 200, rim);
          og = lerp(og, 220, rim);
          ob = lerp(ob, 255, rim);
        }

        // Molten worlds glow on the dark side (own-light)
        if (planet.kind === "molten" && ldot < 0.3) {
          const glow = (0.3 - ldot) * 1.5;
          or += 80 * glow;
          og += 30 * glow;
          ob += 10 * glow;
        }

        px[idx]     = Math.min(255, or);
        px[idx + 1] = Math.min(255, og);
        px[idx + 2] = Math.min(255, ob);
        px[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Rings — draw as ellipse arcs (back half + front half) around planet.
  // We compute and cache ring colors per planet.
  function getRingColors(planet) {
    if (planet.ringColors) return planet.ringColors;
    const rng = mulberry32(planet.seed ^ 0x9e3779b9);
    const stops = [];
    const bandCount = 8 + Math.floor(rng() * 14);
    for (let i = 0; i < bandCount; i++) {
      const pos = rng();
      const alpha = 0.15 + rng() * 0.55;
      const c = planet.palette[Math.floor(rng() * planet.palette.length)];
      stops.push({ pos, alpha, c });
    }
    stops.sort((a, b) => a.pos - b.pos);
    planet.ringColors = stops;
    return stops;
  }

  function drawRingsBack(ctx, planet, x, y, displayR) {
    drawRingsHalf(ctx, planet, x, y, displayR, true);
  }
  function drawRingsFront(ctx, planet, x, y, displayR) {
    drawRingsHalf(ctx, planet, x, y, displayR, false);
  }

  // Rings drawn directly as screen-space ellipses (no scale transform — keeps
  // erasure and stroke widths consistent). Back half = upper, front half = lower.
  function drawRingsHalf(ctx, planet, x, y, displayR, isBack) {
    const tilt = 0.32;
    const innerR = displayR * 1.4;
    const outerR = displayR * 2.25;
    const stops = getRingColors(planet);

    ctx.save();

    // Clip to upper / lower half-plane through planet center
    ctx.beginPath();
    if (isBack) {
      ctx.rect(x - outerR - 6, y - outerR * tilt - 6, (outerR + 6) * 2, outerR * tilt + 6);
    } else {
      ctx.rect(x - outerR - 6, y, (outerR + 6) * 2, outerR * tilt + 6);
    }
    ctx.clip();

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const r = lerp(innerR, outerR, s.pos);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * tilt, 0, 0, TAU);
      // Deterministic line width (no flicker)
      ctx.lineWidth = 0.9 + ((i * 7) % 5) * 0.35;
      ctx.strokeStyle = rgbCss(s.c, s.alpha);
      ctx.stroke();
    }

    // On the front half, erase the part overlapping the planet body
    if (!isBack) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, displayR * 0.97, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  /* ============================================================
     §6  Starfield & sun
     ============================================================ */

  function makeStarfield(W, H, seed) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const rng = mulberry32(seed);

    // Far stars — many, small
    const count = Math.floor(W * H * 0.0009);
    for (let i = 0; i < count; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const size = rng() < 0.93 ? 0.6 + rng() * 0.7 : 1.2 + rng() * 1.3;
      const a = 0.25 + rng() * 0.65;
      const hue = pickOne(rng, [200, 210, 220, 40, 30, 0]);
      ctx.fillStyle = rgbCss(hsl(hue, 0.15, 0.92), a);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    }

    // A few bright stars with cross flare
    const bright = 12;
    for (let i = 0; i < bright; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const a = 0.55 + rng() * 0.4;
      ctx.fillStyle = rgbCss([255, 250, 240], a);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, TAU);
      ctx.fill();
      // Flare
      ctx.strokeStyle = rgbCss([255, 250, 240], a * 0.4);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
      ctx.stroke();
    }

    // Soft nebulae
    const nebulae = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < nebulae; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const r = 180 + rng() * 320;
      const hue = pickOne(rng, [220, 260, 300, 320, 200]);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rgbCss(hsl(hue, 0.6, 0.5), 0.10));
      grad.addColorStop(0.4, rgbCss(hsl(hue, 0.5, 0.4), 0.04));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    return c;
  }

  function drawSun(ctx, sun, cx, cy, t) {
    const breathe = 1 + Math.sin(t * 0.7) * 0.02;
    const R = sun.size * breathe;
    const rgb = sun.rgb;

    // Outer corona — wide soft halo
    let g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 8);
    g.addColorStop(0,    rgbCss(rgb, 0.32));
    g.addColorStop(0.25, rgbCss(rgb, 0.10));
    g.addColorStop(0.6,  rgbCss(rgb, 0.025));
    g.addColorStop(1,    "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - R * 8, cy - R * 8, R * 16, R * 16);

    // Mid corona
    g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 3);
    g.addColorStop(0,   rgbCss(rgb, 0.6));
    g.addColorStop(0.4, rgbCss(rgb, 0.18));
    g.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);

    // Star body — bright center fading to colored edge
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0,    "rgb(255,255,250)");
    g.addColorStop(0.3,  "rgb(255,245,220)");
    g.addColorStop(0.75, rgbCss(rgb));
    g.addColorStop(1,    rgbCss([rgb[0] * 0.7, rgb[1] * 0.6, rgb[2] * 0.5]));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
  }

  /* ============================================================
     §7  Main animation loop
     ============================================================ */

  const canvas = document.querySelector("[data-cosmos]");
  const ctx = canvas.getContext("2d");

  let viewW = 0, viewH = 0, dpr = 1;
  let centerX = 0, centerY = 0;
  let starfield = null;
  let system = null;
  let elapsedYears = 0;          // in-world years
  let speed = 1;                  // multiplier
  let lastFrameMs = 0;
  let mouseX = -9999, mouseY = -9999;
  let hoverPlanet = null;
  let selectedPlanet = null;
  let panelOpen = false;
  let floater = null;
  let frame = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = Math.floor(window.innerWidth);
    viewH = Math.floor(window.innerHeight);
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = viewW / 2;
    centerY = viewH / 2;
    starfield = makeStarfield(viewW, viewH, system ? system.seed : 1);
  }

  function planetPosition(planet, t) {
    // t is in-world years (cumulative)
    const angle = planet.phase + (t / planet.period) * TAU;
    const a = planet.orbitR;
    const e = planet.eccentricity;
    // Simple ellipse with focus at sun (good enough visually)
    const x = a * (Math.cos(angle) - e);
    const y = a * Math.sin(angle) * Math.sqrt(1 - e * e);
    return { x: centerX + x, y: centerY + y, angle };
  }

  function step(now) {
    requestAnimationFrame(step);
    if (!system) return;

    const dt = lastFrameMs ? Math.min(0.05, (now - lastFrameMs) / 1000) : 0;
    lastFrameMs = now;
    if (speed > 0) elapsedYears += dt * speed * 0.1;
    frame++;

    render();

    // Update HUD stardate
    const sd = elapsedYears.toFixed(1).padStart(6, "0");
    stardateEl.textContent = "Y" + sd;
  }

  function render() {
    ctx.clearRect(0, 0, viewW, viewH);

    // Backdrop starfield (cached)
    if (starfield) ctx.drawImage(starfield, 0, 0);

    // Update each planet's screen position & rotation phase
    for (const p of system.planets) {
      const pos = planetPosition(p, elapsedYears);
      p._x = pos.x;
      p._y = pos.y;
      p._angle = pos.angle;
      // spin offset (texture pan)
      p._rotPhase = ((elapsedYears * p.spinRate * 24 * p.spinSign) % 1 + 1) % 1;
    }

    // Draw orbits — faintly, but highlight selected
    for (const p of system.planets) {
      const isSelected = (p === hoverPlanet) || (p === selectedPlanet);
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, p.orbitR, p.orbitR * Math.sqrt(1 - p.eccentricity * p.eccentricity), 0, 0, TAU);
      ctx.lineWidth = isSelected ? 1.0 : 0.6;
      ctx.strokeStyle = isSelected
        ? "rgba(138, 155, 255, 0.55)"
        : "rgba(138, 155, 255, 0.10)";
      ctx.stroke();
    }

    // Sun
    drawSun(ctx, system.sun, centerX, centerY, elapsedYears);

    // Sort planets by depth: those behind sun (y < center) drawn first? Actually they're all
    // in same plane visually — instead, sort by y so closer-bottom ones overlap. Optional polish.
    const ordered = system.planets.slice().sort((a, b) => a._y - b._y);

    // Planets
    for (const p of ordered) {
      // Compute light direction (from planet toward sun)
      const lightAngle = Math.atan2(centerY - p._y, centerX - p._x);

      // Rings (back half)
      if (p.ring) drawRingsBack(ctx, p, p._x, p._y, p.radius);

      // Planet body
      const c = renderPlanet(p, p.radius, lightAngle);
      ctx.drawImage(c, p._x - c.width / 2, p._y - c.height / 2);

      // Rings (front half)
      if (p.ring) drawRingsFront(ctx, p, p._x, p._y, p.radius);

      // Subtle outer atmospheric glow for habitable-feeling worlds
      if (p.kind === "terrestrial" || p.kind === "ocean") {
        const grad = ctx.createRadialGradient(p._x, p._y, p.radius * 0.95, p._x, p._y, p.radius * 1.5);
        grad.addColorStop(0, "rgba(150, 180, 255, 0.18)");
        grad.addColorStop(1, "rgba(150, 180, 255, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p._x, p._y, p.radius * 1.5, 0, TAU);
        ctx.fill();
      }

      // Hover / selection ring
      if (p === hoverPlanet || p === selectedPlanet) {
        const r = p.radius + 12 + Math.sin(frame * 0.06) * 2;
        ctx.beginPath();
        ctx.arc(p._x, p._y, r, 0, TAU);
        ctx.strokeStyle = "rgba(138, 155, 255, 0.7)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tick marks
        ctx.save();
        ctx.translate(p._x, p._y);
        ctx.strokeStyle = "rgba(138, 155, 255, 0.7)";
        for (let i = 0; i < 4; i++) {
          ctx.rotate(TAU / 4);
          ctx.beginPath();
          ctx.moveTo(r - 3, 0);
          ctx.lineTo(r + 3, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Floating label for hover
    if (hoverPlanet && floater) {
      floater.style.left = hoverPlanet._x + "px";
      floater.style.top = hoverPlanet._y - hoverPlanet.radius + "px";
      floater.classList.add("is-visible");
      floaterName.textContent = hoverPlanet.name;
      floaterKind.textContent = hoverPlanet.kindLabel;
    } else if (floater) {
      floater.classList.remove("is-visible");
    }
  }

  /* ============================================================
     §8  Interaction
     ============================================================ */

  function findHover(mx, my) {
    if (!system) return null;
    let best = null;
    let bestD = Infinity;
    for (const p of system.planets) {
      const dx = mx - p._x;
      const dy = my - p._y;
      const d2 = dx * dx + dy * dy;
      const r2 = (p.radius + 6) * (p.radius + 6);
      if (d2 < r2 && d2 < bestD) {
        best = p;
        bestD = d2;
      }
    }
    return best;
  }

  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    hoverPlanet = findHover(mouseX, mouseY);
    canvas.classList.toggle("is-hovering", !!hoverPlanet);
  });

  canvas.addEventListener("pointerleave", () => {
    mouseX = mouseY = -9999;
    hoverPlanet = null;
    canvas.classList.remove("is-hovering");
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p = findHover(mx, my);
    if (p) {
      selectedPlanet = p;
      openPanel(p);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
      reseed();
    } else if (e.key === "Escape") {
      closePanel();
    } else if (e.key === " ") {
      // Space → pause toggle
      e.preventDefault();
      if (speed === 0) {
        setSpeed(prevSpeed || 1);
      } else {
        prevSpeed = speed;
        setSpeed(0);
      }
    }
  });

  /* ============================================================
     §9  HUD & panel
     ============================================================ */

  const stardateEl = document.querySelector("[data-stardate]");
  const seedEl = document.querySelector("[data-seed]");
  const reseedBtn = document.querySelector("[data-reseed]");
  const speedBtns = document.querySelectorAll("[data-speed]");
  const panel = document.querySelector("[data-panel]");
  const panelClose = document.querySelector("[data-panel-close]");
  const panelCanvas = document.querySelector("[data-panel-canvas]");
  const panelCtx = panelCanvas.getContext("2d");

  let prevSpeed = 1;

  function setSpeed(v) {
    speed = v;
    speedBtns.forEach((b) => {
      b.classList.toggle("is-active", parseInt(b.dataset.speed, 10) === v);
    });
  }

  speedBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const v = parseInt(b.dataset.speed, 10);
      if (v !== 0) prevSpeed = v;
      setSpeed(v);
    });
  });

  reseedBtn.addEventListener("click", () => reseed());
  panelClose.addEventListener("click", closePanel);

  function openPanel(planet) {
    panelOpen = true;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");

    document.querySelector("[data-panel-index]").textContent =
      "ОБЪЕКТ " + String(planet.idx).padStart(2, "0");
    document.querySelector("[data-panel-kind]").textContent = planet.kindLabel;
    document.querySelector("[data-panel-name]").textContent = planet.name;
    document.querySelector("[data-panel-epithet]").textContent = "— " + planet.epithet;

    document.querySelector('[data-stat="orbit"]').textContent = planet.stats.orbit;
    document.querySelector('[data-stat="year"]').textContent = planet.stats.year;
    document.querySelector('[data-stat="radius"]').textContent = planet.stats.radius;
    document.querySelector('[data-stat="gravity"]').textContent = planet.stats.gravity;
    document.querySelector('[data-stat="atmosphere"]').textContent = planet.stats.atmosphere;
    document.querySelector('[data-stat="temperature"]').textContent = planet.stats.temperature;
    document.querySelector('[data-stat="moons"]').textContent = planet.stats.moons;
    document.querySelector('[data-stat="population"]').textContent = planet.stats.population;

    document.querySelector("[data-panel-lore]").textContent = planet.lore;

    document.querySelector("[data-panel-coords]").textContent =
      `система ${system.sun.designation} · сектор ${(planet.seed % 9999).toString().padStart(4, "0")}`;

    // Render hi-res planet portrait at 200px (independent from main animation)
    drawPanelPortrait(planet);
  }

  function closePanel() {
    panelOpen = false;
    selectedPlanet = null;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }

  function drawPanelPortrait(planet) {
    const D = panelCanvas.width;
    const portraitR = D / 2 - 22;
    // Use a separate render canvas so we don't disturb live animation
    const tempPlanet = {
      seed: planet.seed,
      kind: planet.kind,
      palette: planet.palette,
      field: planet.field,
      tilt: planet.tilt,
      _rotPhase: planet._rotPhase || 0,
      renderCanvas: null
    };
    const body = renderPlanet(tempPlanet, portraitR, -PI / 4);

    panelCtx.clearRect(0, 0, D, D);

    // Background glow
    const glow = panelCtx.createRadialGradient(D / 2, D / 2, portraitR * 0.6, D / 2, D / 2, D / 1.7);
    glow.addColorStop(0, "rgba(138, 155, 255, 0.22)");
    glow.addColorStop(1, "rgba(138, 155, 255, 0)");
    panelCtx.fillStyle = glow;
    panelCtx.fillRect(0, 0, D, D);

    if (planet.ring) drawRingsBack(panelCtx, planet, D / 2, D / 2, portraitR);
    panelCtx.drawImage(body, (D - body.width) / 2, (D - body.height) / 2);
    if (planet.ring) drawRingsFront(panelCtx, planet, D / 2, D / 2, portraitR);
  }

  /* ============================================================
     §10  Boot & re-seed
     ============================================================ */

  function reseed(seedOverride) {
    const newSeed = seedOverride != null
      ? seedOverride >>> 0
      : (Math.floor(Math.random() * 0xffffffff)) >>> 0;

    // Curtain flash
    curtain.classList.remove("is-gone");
    curtain.classList.remove("is-fading");
    void curtain.offsetWidth; // reflow
    setTimeout(() => {
      system = generateSystem(newSeed);
      seedEl.textContent = "0x" + newSeed.toString(16).toUpperCase().padStart(8, "0");
      starfield = makeStarfield(viewW, viewH, newSeed);
      elapsedYears = 0;
      closePanel();
      curtain.classList.add("is-fading");
      setTimeout(() => curtain.classList.add("is-gone"), 500);
      // restart animations on curtain lines
      const lines = curtain.querySelectorAll(".curtain__line");
      lines.forEach((l, i) => {
        l.style.animation = "none";
        void l.offsetWidth;
        l.style.animation = "";
      });
    }, 600);
  }

  // Build floater HTML overlay
  floater = document.createElement("div");
  floater.className = "floater";
  floater.innerHTML = `<span class="floater__name"></span><span class="floater__line"></span>`;
  document.body.appendChild(floater);
  const floaterName = floater.querySelector(".floater__name");
  const floaterKind = floater.querySelector(".floater__line");

  // Curtain element ref
  const curtain = document.querySelector("[data-curtain]");

  // Initial system
  const initialSeed = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
  system = generateSystem(initialSeed);
  seedEl.textContent = "0x" + initialSeed.toString(16).toUpperCase().padStart(8, "0");
  resize();

  // Fade curtain
  setTimeout(() => {
    curtain.classList.add("is-fading");
    setTimeout(() => curtain.classList.add("is-gone"), 700);
  }, 1400);

  window.addEventListener("resize", () => {
    clearTimeout(window._orbResize);
    window._orbResize = setTimeout(() => {
      resize();
    }, 100);
  });

  requestAnimationFrame(step);
})();
