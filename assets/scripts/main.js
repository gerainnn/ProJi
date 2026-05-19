/* =========================================================================
   main.js — Game loop, initialization, HUD updates.

   Boot sequence:
     1. Init WebGL2
     2. Compile all shader programs
     3. Create world sampler (seed)
     4. Create subsystems (terrain, water, sky, vegetation, player, map)
     5. Show start screen
     6. On "enter world" → pointer lock + game loop
   ========================================================================= */

(function () {
  "use strict";

  /* ======================== DOM REFS ======================== */
  const canvas      = document.querySelector("[data-canvas]");
  const curtainEl   = document.querySelector("[data-curtain]");
  const loadStepEl  = document.querySelector("[data-load-step]");
  const loadBarEl   = document.querySelector("[data-load-bar]");
  const startEl     = document.querySelector("[data-start]");
  const startBtnEl  = document.querySelector("[data-start-btn]");
  const hudEl       = document.querySelector("[data-hud]");
  const pauseEl     = document.querySelector("[data-pause]");
  const pauseBtn    = document.querySelector("[data-pause-resume]");

  const seedEl      = document.querySelector("[data-seed]");
  const biomeEl     = document.querySelector("[data-biome]");
  const coordsEl    = document.querySelector("[data-coords]");
  const clockEl     = document.querySelector("[data-clock]");
  const compassEl   = document.querySelector("[data-compass-strip]");

  const mapOverlay  = document.querySelector("[data-map]");
  const mapCanvas   = document.querySelector("[data-map-canvas]");
  const mapViewport = document.querySelector("[data-map-viewport]");
  const mapPlayer   = document.querySelector("[data-map-player]");
  const mapCrosshair= document.querySelector("[data-map-crosshair]");
  const mapClose    = document.querySelector("[data-map-close]");
  const mapZoomIn   = document.querySelector("[data-map-zoom-in]");
  const mapZoomOut  = document.querySelector("[data-map-zoom-out]");
  const mapZoomLabel= document.querySelector("[data-map-zoom]");
  const minimapCanvas = document.querySelector("[data-minimap]");

  /* ======================== INIT ======================== */
  const { gl, ext } = GL.init(canvas);
  GL.resize(gl, canvas);

  // Generate world seed (random)
  const SEED = (Math.random() * 0xFFFFFFFF) >>> 0;

  // Compile programs
  loadStepEl.textContent = "компиляция шейдеров";
  const terrainProg = GL.compileProgram(gl, SHADERS.TERRAIN_VS, SHADERS.TERRAIN_FS, "terrain");
  const waterProg   = GL.compileProgram(gl, SHADERS.WATER_VS,   SHADERS.WATER_FS,   "water");
  const skyProg     = GL.compileProgram(gl, SHADERS.SKY_VS,     SHADERS.SKY_FS,     "sky");
  const treeProg    = GL.compileProgram(gl, SHADERS.TREE_VS,    SHADERS.TREE_FS,    "tree");
  const sunProg     = GL.compileProgram(gl, SHADERS.SUN_VS,     SHADERS.SUN_FS,     "sun");

  // Get uniform locations
  const terrainU = GL.getUniforms(gl, terrainProg, [
    "uViewProj","uChunkOrigin","uViewPos","uSunDir","uSunColor","uAmbient",
    "uSkyZenith","uSkyHorizon","uFogStart","uFogEnd","uTime",
    "uBiomeLow[0]","uBiomeHigh[0]"
  ]);
  const waterU = GL.getUniforms(gl, waterProg, [
    "uViewProj","uViewPos","uSunDir","uSunColor","uSkyZenith","uSkyHorizon",
    "uTime","uFogStart","uFogEnd","uSeaLevel","uSize"
  ]);
  const skyU = GL.getUniforms(gl, skyProg, [
    "uInvViewProj","uViewPos","uSunDir","uSunColor","uSkyZenith","uSkyHorizon"
  ]);
  const treeU = GL.getUniforms(gl, treeProg, [
    "uViewProj","uViewPos","uSunDir","uSunColor","uSkyZenith","uSkyHorizon",
    "uFogStart","uFogEnd","uTime"
  ]);
  const sunU = GL.getUniforms(gl, sunProg, [
    "uViewProj","uViewPos","uSunDir","uSunColor"
  ]);

  /* ======================== WORLD ======================== */
  loadStepEl.textContent = "генерация шумовых полей";
  loadBarEl.style.width = "10%";

  const sampler = W.WorldSampler(SEED);
  seedEl.textContent = "0x" + SEED.toString(16).toUpperCase().padStart(8, "0");

  /* ======================== SUBSYSTEMS ======================== */
  loadStepEl.textContent = "подготовка рендеринга";
  loadBarEl.style.width = "20%";

  const chunkMgr   = Terrain.ChunkManager(gl, sampler, terrainProg);
  const waterRend  = Water.WaterRenderer(gl);
  const skyRend    = Sky.SkyRenderer(gl);
  const treeRend   = Vegetation.TreeRenderer(gl);
  const player     = Player.FPSController(canvas, sampler);
  const worldMap   = WorldMap.MapController(sampler, player, {
    minimap: minimapCanvas,
    mapCanvas, mapOverlay, mapViewport, mapPlayer, mapCrosshair,
    mapClose, zoomIn: mapZoomIn, zoomOut: mapZoomOut, zoomLabel: mapZoomLabel,
  });

  // Spawn player at origin, on terrain
  player.teleport(0, 0);

  /* ======================== BIOME FLAT ARRAYS ======================== */
  // Flatten biome color arrays for uniform upload (12 biomes × 3 floats)
  const biomeLowFlat  = new Float32Array(12 * 3);
  const biomeHighFlat = new Float32Array(12 * 3);
  for (let i = 0; i < 12; i++) {
    const lo = W.BIOME_COLORS_LOW[i] || [0.5, 0.5, 0.5];
    const hi = W.BIOME_COLORS_HIGH[i] || [0.6, 0.6, 0.6];
    biomeLowFlat[i * 3]     = lo[0]; biomeLowFlat[i * 3 + 1]  = lo[1]; biomeLowFlat[i * 3 + 2]  = lo[2];
    biomeHighFlat[i * 3]    = hi[0]; biomeHighFlat[i * 3 + 1] = hi[1]; biomeHighFlat[i * 3 + 2] = hi[2];
  }

  /* ======================== RENDER STATE ======================== */
  const renderState = {
    viewPos:    new Float32Array(3),
    sunDir:     new Float32Array([0.4, 0.7, 0.3]),
    sunColor:   new Float32Array([1.0, 0.95, 0.85]),
    ambient:    new Float32Array([0.15, 0.18, 0.25]),
    skyZenith:  new Float32Array([0.22, 0.38, 0.68]),
    skyHorizon: new Float32Array([0.60, 0.72, 0.85]),
    fogStart:   200,
    fogEnd:     480,
    seaLevel:   0,
    time:       0,
    biomeLowFlat,
    biomeHighFlat,
  };

  // Normalize sun direction
  const sl = Math.hypot(renderState.sunDir[0], renderState.sunDir[1], renderState.sunDir[2]);
  renderState.sunDir[0] /= sl; renderState.sunDir[1] /= sl; renderState.sunDir[2] /= sl;

  /* ======================== MATRICES ======================== */
  const projMat     = M.Mat4.create();
  const viewProjMat = M.Mat4.create();
  const invVPMat    = M.Mat4.create();
  const frustumPlanes = new Float32Array(24);

  const FOV = 75 * M.DEG;
  const NEAR = 0.3;
  const FAR = 1200;

  /* ======================== LOADING ======================== */

  let gameStarted = false;
  let loadingDone = false;

  // Pre-generate initial chunks before showing start screen
  function loadInitialChunks() {
    chunkMgr.update(player.position[0], player.position[2]);

    const p = chunkMgr.loadProgress();
    const pct = Math.min(p.ready / p.needed, 1);
    loadBarEl.style.width = (20 + pct * 75) + "%";
    loadStepEl.textContent = `чанки ${p.ready}/${p.needed}`;

    if (pct >= 1 && !loadingDone) {
      loadingDone = true;
      loadBarEl.style.width = "100%";
      loadStepEl.textContent = "готово";
      setTimeout(() => {
        curtainEl.classList.add("is-fading");
        setTimeout(() => {
          curtainEl.classList.add("is-gone");
          startEl.hidden = false;
        }, 700);
      }, 300);
      return;
    }

    if (!loadingDone) requestAnimationFrame(loadInitialChunks);
  }
  requestAnimationFrame(loadInitialChunks);

  /* ======================== START ======================== */
  startBtnEl.addEventListener("click", () => {
    startEl.hidden = true;
    hudEl.hidden = false;
    gameStarted = true;
    canvas.requestPointerLock();
    requestAnimationFrame(gameLoop);
  });

  /* ======================== PAUSE ======================== */
  document.addEventListener("pointerlockchange", () => {
    if (!gameStarted) return;
    if (!document.pointerLockElement) {
      // Lost pointer lock → show pause if game is running and map not open
      if (!worldMap.isOpen) pauseEl.hidden = false;
    } else {
      pauseEl.hidden = true;
    }
  });
  pauseBtn.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  /* ======================== MAP KEY ======================== */
  window.addEventListener("keydown", (e) => {
    if (!gameStarted) return;
    if (e.code === "KeyM") {
      if (worldMap.isOpen) {
        worldMap.closeMap();
        canvas.requestPointerLock();
      } else {
        document.exitPointerLock();
        worldMap.openMap();
      }
    }
    if (e.code === "Escape" && worldMap.isOpen) {
      worldMap.closeMap();
      canvas.requestPointerLock();
    }
  });

  /* ======================== GAME LOOP ======================== */
  let lastTime = 0;
  let minimapTimer = 0;
  let worldTime = 12; // hours (12 = noon)

  function gameLoop(now) {
    requestAnimationFrame(gameLoop);
    const dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;

    // World time (day cycle: 1 real minute = 1 in-game hour → full day in 24 min)
    worldTime += dt / 60; // 1 game-hour per real-minute
    if (worldTime >= 24) worldTime -= 24;

    // Update sun direction based on time of day
    const sunAngle = ((worldTime - 6) / 12) * Math.PI; // 6am = horizon, 12 = top, 18 = horizon
    renderState.sunDir[0] = Math.cos(sunAngle) * 0.5;
    renderState.sunDir[1] = Math.sin(sunAngle);
    renderState.sunDir[2] = 0.3;
    const sLen = Math.hypot(renderState.sunDir[0], renderState.sunDir[1], renderState.sunDir[2]);
    renderState.sunDir[0] /= sLen; renderState.sunDir[1] /= sLen; renderState.sunDir[2] /= sLen;

    // Sky color tint based on sun altitude
    const sunAlt = renderState.sunDir[1];
    const dayFactor = M.clamp(sunAlt * 2, 0, 1);
    renderState.skyZenith[0] = M.lerp(0.02, 0.22, dayFactor);
    renderState.skyZenith[1] = M.lerp(0.03, 0.38, dayFactor);
    renderState.skyZenith[2] = M.lerp(0.08, 0.68, dayFactor);
    renderState.skyHorizon[0] = M.lerp(0.08, 0.60, dayFactor);
    renderState.skyHorizon[1] = M.lerp(0.06, 0.72, dayFactor);
    renderState.skyHorizon[2] = M.lerp(0.12, 0.85, dayFactor);
    // Sun color warm at horizon
    const horizonWarm = 1 - M.clamp(sunAlt * 3, 0, 1);
    renderState.sunColor[0] = M.lerp(1.0, 1.0, horizonWarm);
    renderState.sunColor[1] = M.lerp(0.95, 0.6, horizonWarm);
    renderState.sunColor[2] = M.lerp(0.85, 0.3, horizonWarm);

    renderState.time += dt;

    // Player
    player.update(dt);
    renderState.viewPos[0] = player.position[0];
    renderState.viewPos[1] = player.position[1];
    renderState.viewPos[2] = player.position[2];

    // Chunk streaming
    chunkMgr.update(player.position[0], player.position[2]);

    // Resize if needed
    GL.resize(gl, canvas);

    // Projection
    const aspect = canvas.width / canvas.height;
    M.Mat4.perspective(projMat, FOV, aspect, NEAR, FAR);
    M.Mat4.multiply(viewProjMat, projMat, player.viewMatrix);
    M.Mat4.invert(invVPMat, viewProjMat);

    // Frustum for culling
    M.extractFrustum(frustumPlanes, viewProjMat);

    // ==== RENDER ====
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // 1. Sky (at far depth, no depth write)
    skyRend.renderSky(gl, skyProg, skyU, invVPMat, renderState);

    // 2. Sun disc
    if (renderState.sunDir[1] > -0.05) {
      skyRend.renderSun(gl, sunProg, sunU, viewProjMat, renderState);
    }

    // 3. Terrain
    const visibleChunks = chunkMgr.render(gl, terrainProg, terrainU, viewProjMat, renderState);

    // 4. Trees (instanced)
    const allTrees = chunkMgr.getAllTrees(frustumPlanes);
    treeRend.render(gl, treeProg, treeU, viewProjMat, renderState, allTrees);

    // 5. Water (after opaque, uses blending)
    gl.disable(gl.CULL_FACE);
    waterRend.render(gl, waterProg, waterU, viewProjMat, renderState);
    gl.enable(gl.CULL_FACE);

    // ==== HUD ====
    updateHUD(dt);
  }

  /* ======================== HUD ======================== */
  let hudFrame = 0;
  function updateHUD(dt) {
    hudFrame++;

    // Coords (every 6 frames)
    if (hudFrame % 6 === 0) {
      const p = player.position;
      coordsEl.textContent = `${p[0].toFixed(0)}, ${p[1].toFixed(1)}, ${p[2].toFixed(0)}`;
    }

    // Biome (every 30 frames)
    if (hudFrame % 30 === 0) {
      const b = sampler.biomeAt(player.position[0], player.position[2], player.position[1]);
      biomeEl.textContent = W.BIOME_NAMES[b] || "—";
    }

    // Clock
    if (hudFrame % 20 === 0) {
      const hours = Math.floor(worldTime);
      const mins = Math.floor((worldTime - hours) * 60);
      const period = (worldTime >= 6 && worldTime < 18) ? "день" : "ночь";
      clockEl.textContent = `${period} · ${String(hours).padStart(2,"0")}:${String(mins).padStart(2,"0")}`;
    }

    // Compass (smooth)
    if (compassEl) {
      const deg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360;
      compassEl.style.transform = `translateX(${-deg * 2 + 110}px)`;
    }

    // Minimap (every 60 frames = ~1 per second at 60fps)
    minimapTimer += dt;
    if (minimapTimer > 1.0) {
      minimapTimer = 0;
      worldMap.updateMinimap();
    }
  }

})();
