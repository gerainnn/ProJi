/* =========================================================================
   terrain.js — Chunked terrain mesh generation & rendering.

   Each chunk is a square tile of CHUNK_SIZE × CHUNK_SIZE world units,
   tessellated into a (VERTS_PER_SIDE × VERTS_PER_SIDE) grid. Heightmaps
   are sampled from the WorldSampler, normals computed analytically, biome
   and slope packed per-vertex.

   ChunkManager keeps a ring of loaded chunks around the camera and
   streams generation in the background (requestIdleCallback or split frames).

   Public API on window.Terrain:
     ChunkManager(gl, sampler, programs) → manager
     manager.update(camX, camZ) — call each frame
     manager.render(viewProj, uniforms)
   ========================================================================= */

(function (root) {
  "use strict";

  const { Vec3, clamp, smoothstep } = root.M;
  const { hash2 } = root.N;

  /* ======================== CONFIG ======================== */
  const CHUNK_SIZE      = 64;      // world units per chunk edge
  const VERTS_PER_SIDE  = 65;      // vertices along each edge (64 quads)
  const VIEW_RADIUS     = 6;       // chunks visible in each direction (6→169 chunks)
  const GEN_PER_FRAME   = 6;       // max chunks to generate per frame (fast initial load)
  const STEP            = CHUNK_SIZE / (VERTS_PER_SIDE - 1); // ~1.0 unit

  /* ======================== CHUNK ======================== */

  function Chunk(cx, cz) {
    this.cx = cx;           // chunk coordinate (multiply by CHUNK_SIZE for world)
    this.cz = cz;
    this.key = cx + "," + cz;
    this.originX = cx * CHUNK_SIZE;
    this.originZ = cz * CHUNK_SIZE;
    this.ready = false;

    // GPU resources (filled after generate)
    this.vao = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.indexCount = 0;

    // Bounding box for frustum culling (world space)
    this.minY = 0;
    this.maxY = 0;

    // Vegetation data per chunk (arrays of instance data)
    this.trees = null;
  }

  /* ======================== MESH GEN ======================== */

  // Generates vertex data (positions, normals, biome, slope) and indices.
  // Returns { vertices: Float32Array, indices: Uint32Array, minY, maxY, trees }
  function generateChunkData(chunk, sampler) {
    const N = VERTS_PER_SIDE;
    const ox = chunk.originX;
    const oz = chunk.originZ;

    // Pre-sample heights for normal computation
    const heights = new Float32Array(N * N);
    const biomes  = new Float32Array(N * N);
    let minY = Infinity, maxY = -Infinity;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const wx = ox + i * STEP;
        const wz = oz + j * STEP;
        const s = sampler.sample(wx, wz);
        const idx = j * N + i;
        heights[idx] = s.height;
        biomes[idx] = s.biome;
        if (s.height < minY) minY = s.height;
        if (s.height > maxY) maxY = s.height;
      }
    }

    // Vertex data: 8 floats per vertex (pos.xyz, normal.xyz, biome, slope)
    const FLOATS_PER_VERT = 8;
    const vertices = new Float32Array(N * N * FLOATS_PER_VERT);

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const off = idx * FLOATS_PER_VERT;
        const h = heights[idx];

        // Position (local to chunk, origin added via uniform)
        vertices[off + 0] = i * STEP;
        vertices[off + 1] = h;
        vertices[off + 2] = j * STEP;

        // Normal via central differences
        const hL = i > 0     ? heights[j * N + (i - 1)] : h;
        const hR = i < N - 1 ? heights[j * N + (i + 1)] : h;
        const hD = j > 0     ? heights[(j - 1) * N + i] : h;
        const hU = j < N - 1 ? heights[(j + 1) * N + i] : h;

        // dx = 2 * STEP because we sample left/right (or 1 STEP at edges)
        const dxScale = (i > 0 && i < N - 1) ? 2 * STEP : STEP;
        const dzScale = (j > 0 && j < N - 1) ? 2 * STEP : STEP;

        let nx = (hL - hR) / dxScale;
        let nz = (hD - hU) / dzScale;
        let ny = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;

        vertices[off + 3] = nx;
        vertices[off + 4] = ny;
        vertices[off + 5] = nz;

        // Biome (float index)
        vertices[off + 6] = biomes[idx];

        // Slope (gradient magnitude, saturated to 0..1)
        const slope = Math.sqrt(
          ((hR - hL) / dxScale) * ((hR - hL) / dxScale) +
          ((hU - hD) / dzScale) * ((hU - hD) / dzScale)
        );
        vertices[off + 7] = clamp(slope / 2.0, 0, 1);
      }
    }

    // Indices: two triangles per quad. Use Uint32 for >65k verts.
    const quads = (N - 1) * (N - 1);
    const indices = new Uint32Array(quads * 6);
    let idx = 0;
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const tl = j * N + i;
        const tr = tl + 1;
        const bl = tl + N;
        const br = bl + 1;
        // Two triangles per quad
        indices[idx++] = tl; indices[idx++] = bl; indices[idx++] = tr;
        indices[idx++] = tr; indices[idx++] = bl; indices[idx++] = br;
      }
    }

    // Vegetation placement — trees
    const trees = placeTreesInChunk(chunk, sampler, heights, biomes, N);

    return { vertices, indices, minY, maxY, trees };
  }

  /* ======================== TREE PLACEMENT ======================== */

  // Scatter trees across the chunk. Density depends on biome.
  // Returns array of { x, y, z, scale, rotation, biome }
  function placeTreesInChunk(chunk, sampler, heights, biomes, N) {
    const trees = [];
    const ox = chunk.originX;
    const oz = chunk.originZ;
    const SEA = sampler.SEA_LEVEL;

    // Grid spacing for tree candidates: every ~4 units
    const spacing = 4;
    const cellsX = Math.floor(CHUNK_SIZE / spacing);
    const cellsZ = Math.floor(CHUNK_SIZE / spacing);

    for (let cj = 0; cj < cellsZ; cj++) {
      for (let ci = 0; ci < cellsX; ci++) {
        // Jitter within cell
        const jx = hash2(chunk.cx * 100 + ci, chunk.cz * 100 + cj, 1);
        const jz = hash2(chunk.cx * 100 + ci, chunk.cz * 100 + cj, 2);
        const localX = (ci + jx) * spacing;
        const localZ = (cj + jz) * spacing;

        // Sample height at this point (bilinear from heightmap grid)
        const gi = localX / STEP;
        const gj = localZ / STEP;
        const i0 = Math.min(N - 2, Math.max(0, Math.floor(gi)));
        const j0 = Math.min(N - 2, Math.max(0, Math.floor(gj)));
        const fi = gi - i0;
        const fj = gj - j0;
        const h00 = heights[j0 * N + i0];
        const h10 = heights[j0 * N + i0 + 1];
        const h01 = heights[(j0 + 1) * N + i0];
        const h11 = heights[(j0 + 1) * N + i0 + 1];
        const h = h00 * (1 - fi) * (1 - fj) + h10 * fi * (1 - fj) +
                  h01 * (1 - fi) * fj + h11 * fi * fj;

        // Skip underwater or too high
        if (h < SEA + 1.8 || h > 32) continue;

        // Biome check at this point
        const bi0 = Math.floor(biomes[j0 * N + i0] + 0.5);

        // Determine density based on biome
        let density = 0;
        const { BIOME } = root.W;
        if (bi0 === BIOME.FOREST)       density = 0.62;
        else if (bi0 === BIOME.PINE_FOREST) density = 0.55;
        else if (bi0 === BIOME.GRASSLAND)   density = 0.08;
        else if (bi0 === BIOME.SAVANNA)     density = 0.06;
        else if (bi0 === BIOME.SWAMP)       density = 0.25;
        else if (bi0 === BIOME.TUNDRA)      density = 0.02;
        else continue;

        // Roll dice
        const roll = hash2(chunk.cx * 1000 + ci, chunk.cz * 1000 + cj, 77);
        if (roll > density) continue;

        // Slope check — no trees on steep terrain
        const wx = ox + localX;
        const wz = oz + localZ;
        const slope = sampler.slope(wx, wz);
        if (slope > 0.8) continue;

        // Tree parameters
        const scale = 0.7 + hash2(ci, cj, 33) * 0.8;
        const rot = hash2(ci, cj, 44) * 6.2832;

        trees.push({
          x: wx, y: h, z: wz,
          scale, rot, biome: bi0
        });
      }
    }
    return trees;
  }

  /* ======================== ChunkManager ======================== */

  function ChunkManager(gl, sampler, terrainProgram) {
    const chunks = new Map();     // key → Chunk
    const pending = [];           // chunks waiting for mesh gen
    let lastCamCX = null;
    let lastCamCZ = null;

    // Shared index buffer (all chunks use same topology)
    const sharedIndices = generateSharedIndices();
    const indexBuffer = root.GL.createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, sharedIndices);
    const indexCount = sharedIndices.length;

    function generateSharedIndices() {
      const N = VERTS_PER_SIDE;
      const quads = (N - 1) * (N - 1);
      const indices = new Uint32Array(quads * 6);
      let idx = 0;
      for (let j = 0; j < N - 1; j++) {
        for (let i = 0; i < N - 1; i++) {
          const tl = j * N + i;
          const tr = tl + 1;
          const bl = tl + N;
          const br = bl + 1;
          indices[idx++] = tl; indices[idx++] = bl; indices[idx++] = tr;
          indices[idx++] = tr; indices[idx++] = bl; indices[idx++] = br;
        }
      }
      return indices;
    }

    function getOrCreate(cx, cz) {
      const key = cx + "," + cz;
      if (chunks.has(key)) return chunks.get(key);
      const c = new Chunk(cx, cz);
      chunks.set(key, c);
      pending.push(c);
      return c;
    }

    function uploadChunk(chunk, data) {
      const FLOATS_PER_VERT = 8;
      const STRIDE = FLOATS_PER_VERT * 4;

      const vb = root.GL.createBuffer(gl, gl.ARRAY_BUFFER, data.vertices);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);

      // location 0: position (3 floats)
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
      // location 1: normal (3 floats)
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 12);
      // location 2: biome (1 float)
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 24);
      // location 3: slope (1 float)
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 28);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindVertexArray(null);

      chunk.vao = vao;
      chunk.vertexBuffer = vb;
      chunk.indexCount = indexCount;
      chunk.minY = data.minY;
      chunk.maxY = data.maxY;
      chunk.trees = data.trees;
      chunk.ready = true;
    }

    function update(camX, camZ) {
      const camCX = Math.floor(camX / CHUNK_SIZE);
      const camCZ = Math.floor(camZ / CHUNK_SIZE);

      // Only recalculate ring if camera moved chunk
      if (camCX !== lastCamCX || camCZ !== lastCamCZ) {
        lastCamCX = camCX;
        lastCamCZ = camCZ;

        // Ensure all chunks in view radius exist
        for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
          for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
            getOrCreate(camCX + dx, camCZ + dz);
          }
        }

        // Remove far chunks
        const R2 = (VIEW_RADIUS + 2) * (VIEW_RADIUS + 2);
        for (const [key, c] of chunks) {
          const dcx = c.cx - camCX;
          const dcz = c.cz - camCZ;
          if (dcx * dcx + dcz * dcz > R2) {
            // Dispose GPU resources
            if (c.vao) gl.deleteVertexArray(c.vao);
            if (c.vertexBuffer) gl.deleteBuffer(c.vertexBuffer);
            chunks.delete(key);
          }
        }
      }

      // Generate pending chunks (always, regardless of camera movement)
      let generated = 0;
      const limit = pending.length > 50 ? GEN_PER_FRAME * 3 : GEN_PER_FRAME;
      while (pending.length > 0 && generated < limit) {
        const c = pending.shift();
        if (!chunks.has(c.key)) continue; // may have been deleted
        const data = generateChunkData(c, sampler);
        uploadChunk(c, data);
        generated++;
      }
    }

    // Returns array of Chunk objects that are ready and visible.
    function visibleChunks(frustumPlanes) {
      const result = [];
      for (const c of chunks.values()) {
        if (!c.ready) continue;
        // Frustum culling via AABB
        const minX = c.originX;
        const maxX = c.originX + CHUNK_SIZE;
        const minZ = c.originZ;
        const maxZ = c.originZ + CHUNK_SIZE;
        if (!root.M.aabbInFrustum(frustumPlanes,
          minX, c.minY - 2, minZ, maxX, c.maxY + 2, maxZ)) continue;
        result.push(c);
      }
      return result;
    }

    function render(gl, program, uniforms, viewProj, renderState) {
      const frustumPlanes = new Float32Array(24);
      root.M.extractFrustum(frustumPlanes, viewProj);
      const visible = visibleChunks(frustumPlanes);

      gl.useProgram(program);

      // Set uniforms that are constant for all chunks
      gl.uniformMatrix4fv(uniforms.uViewProj, false, viewProj);
      gl.uniform3fv(uniforms.uViewPos, renderState.viewPos);
      gl.uniform3fv(uniforms.uSunDir, renderState.sunDir);
      gl.uniform3fv(uniforms.uSunColor, renderState.sunColor);
      gl.uniform3fv(uniforms.uAmbient, renderState.ambient);
      gl.uniform3fv(uniforms.uSkyZenith, renderState.skyZenith);
      gl.uniform3fv(uniforms.uSkyHorizon, renderState.skyHorizon);
      gl.uniform1f(uniforms.uFogStart, renderState.fogStart);
      gl.uniform1f(uniforms.uFogEnd, renderState.fogEnd);
      gl.uniform1f(uniforms.uTime, renderState.time);

      // Biome color arrays
      gl.uniform3fv(uniforms["uBiomeLow[0]"], renderState.biomeLowFlat);
      gl.uniform3fv(uniforms["uBiomeHigh[0]"], renderState.biomeHighFlat);

      for (const c of visible) {
        gl.uniform3f(uniforms.uChunkOrigin, c.originX, 0, c.originZ);
        gl.bindVertexArray(c.vao);
        gl.drawElements(gl.TRIANGLES, c.indexCount, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);

      return visible; // caller needs visible list for tree rendering
    }

    // Expose for vegetation
    function getAllTrees(frustumPlanes) {
      const trees = [];
      for (const c of chunks.values()) {
        if (!c.ready || !c.trees) continue;
        const minX = c.originX;
        const maxX = c.originX + CHUNK_SIZE;
        const minZ = c.originZ;
        const maxZ = c.originZ + CHUNK_SIZE;
        if (!root.M.aabbInFrustum(frustumPlanes,
          minX, c.minY - 2, minZ, maxX, c.maxY + 40, maxZ)) continue;
        for (const t of c.trees) trees.push(t);
      }
      return trees;
    }

    // Progress for loading screen
    function loadProgress() {
      const needed = (VIEW_RADIUS * 2 + 1) * (VIEW_RADIUS * 2 + 1);
      let ready = 0;
      for (const c of chunks.values()) if (c.ready) ready++;
      return { ready, needed };
    }

    return { update, render, visibleChunks, getAllTrees, loadProgress, CHUNK_SIZE, VIEW_RADIUS };
  }

  root.Terrain = { ChunkManager, CHUNK_SIZE, VERTS_PER_SIDE };
})(window);
