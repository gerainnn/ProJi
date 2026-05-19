/* =========================================================================
   map.js — World map overlay + minimap rendering.

   The map draws a 2D canvas colored by biome, centered on player.
   Click to teleport. Minimap is a small circular crop.

   Public API on window.WorldMap:
     MapController(sampler, player, elements) → controller
     controller.updateMinimap()
     controller.openMap()
     controller.closeMap()
   ========================================================================= */

(function (root) {
  "use strict";

  const { clamp } = root.M;
  const { BIOME_COLORS_LOW, BIOME_COLORS_HIGH } = root.W;

  function MapController(sampler, player, els) {
    const minimapCanvas = els.minimap;
    const minimapCtx = minimapCanvas.getContext("2d");
    const mapCanvas = els.mapCanvas;
    const mapCtx = mapCanvas.getContext("2d");

    let mapZoom = 1;
    const MINIMAP_RANGE = 256; // world units radius shown in minimap
    const MAP_BASE_RANGE = 800;

    // Minimap update: sample biome colors around player in a circular mask
    function updateMinimap() {
      const W = minimapCanvas.width;
      const H = minimapCanvas.height;
      const img = minimapCtx.createImageData(W, H);
      const px = img.data;
      const cx = player.position[0];
      const cz = player.position[2];
      const range = MINIMAP_RANGE;

      for (let py = 0; py < H; py++) {
        for (let px2 = 0; px2 < W; px2++) {
          const dx = (px2 / W - 0.5) * 2;
          const dy = (py / H - 0.5) * 2;
          const r2 = dx * dx + dy * dy;
          const idx = (py * W + px2) * 4;

          if (r2 > 1) {
            px[idx] = 13; px[idx + 1] = 20; px[idx + 2] = 24; px[idx + 3] = 255;
            continue;
          }

          const wx = cx + dx * range;
          const wz = cz + dy * range;
          const s = sampler.sample(wx, wz);
          const col = biomeColor(s.biome, s.height);
          px[idx]     = col[0];
          px[idx + 1] = col[1];
          px[idx + 2] = col[2];
          px[idx + 3] = 255;
        }
      }
      minimapCtx.putImageData(img, 0, 0);
    }

    // Full map render
    function renderFullMap() {
      const W = mapCanvas.width = mapCanvas.clientWidth * (Math.min(devicePixelRatio, 2));
      const H = mapCanvas.height = mapCanvas.clientHeight * (Math.min(devicePixelRatio, 2));
      const img = mapCtx.createImageData(W, H);
      const px = img.data;
      const cx = player.position[0];
      const cz = player.position[2];
      const range = MAP_BASE_RANGE / mapZoom;
      const step = Math.max(1, Math.floor(2 / mapZoom));

      for (let py = 0; py < H; py += step) {
        for (let px2 = 0; px2 < W; px2 += step) {
          const dx = (px2 / W - 0.5) * 2;
          const dy = (py / H - 0.5) * 2;
          const wx = cx + dx * range;
          const wz = cz + dy * range;
          const s = sampler.sample(wx, wz);
          const col = biomeColor(s.biome, s.height);

          for (let sy = 0; sy < step && py + sy < H; sy++) {
            for (let sx = 0; sx < step && px2 + sx < W; sx++) {
              const idx = ((py + sy) * W + (px2 + sx)) * 4;
              px[idx]     = col[0];
              px[idx + 1] = col[1];
              px[idx + 2] = col[2];
              px[idx + 3] = 255;
            }
          }
        }
      }
      mapCtx.putImageData(img, 0, 0);

      // Player marker position
      const pmX = W / 2;
      const pmY = H / 2;
      els.mapPlayer.style.left = pmX / (Math.min(devicePixelRatio, 2)) + "px";
      els.mapPlayer.style.top  = pmY / (Math.min(devicePixelRatio, 2)) + "px";
    }

    // Click on map → teleport
    function onMapClick(e) {
      const rect = mapCanvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const range = MAP_BASE_RANGE / mapZoom;
      const wx = player.position[0] + (mx - 0.5) * 2 * range;
      const wz = player.position[2] + (my - 0.5) * 2 * range;
      player.teleport(wx, wz);
      closeMap();
    }

    function setZoom(z) {
      mapZoom = clamp(z, 0.25, 8);
      els.zoomLabel.textContent = mapZoom.toFixed(1) + "×";
      renderFullMap();
    }

    // Map show/hide
    let isOpen = false;
    function openMap() {
      if (isOpen) return;
      isOpen = true;
      els.mapOverlay.hidden = false;
      renderFullMap();
    }
    function closeMap() {
      isOpen = false;
      els.mapOverlay.hidden = true;
    }
    function toggleMap() { isOpen ? closeMap() : openMap(); }

    // Events
    els.mapCanvas.addEventListener("click", onMapClick);
    els.zoomIn.addEventListener("click", () => setZoom(mapZoom * 2));
    els.zoomOut.addEventListener("click", () => setZoom(mapZoom / 2));
    els.mapClose.addEventListener("click", closeMap);

    // Crosshair follow
    els.mapViewport.addEventListener("mousemove", (e) => {
      const rect = els.mapViewport.getBoundingClientRect();
      els.mapCrosshair.style.left = (e.clientX - rect.left) + "px";
      els.mapCrosshair.style.top  = (e.clientY - rect.top)  + "px";
    });

    return { updateMinimap, openMap, closeMap, toggleMap, get isOpen() { return isOpen; } };
  }

  function biomeColor(biome, height) {
    const low = BIOME_COLORS_LOW[biome] || [0.5, 0.5, 0.5];
    const high = BIOME_COLORS_HIGH[biome] || [0.6, 0.6, 0.6];
    const t = clamp((height + 4) / 40, 0, 1);
    return [
      Math.round((low[0] + (high[0] - low[0]) * t) * 255),
      Math.round((low[1] + (high[1] - low[1]) * t) * 255),
      Math.round((low[2] + (high[2] - low[2]) * t) * 255),
    ];
  }

  root.WorldMap = { MapController };
})(window);
