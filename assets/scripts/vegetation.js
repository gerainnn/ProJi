/* =========================================================================
   vegetation.js — Instanced tree rendering.

   Trees are simple geometric shapes (cone trunk + sphere/cone foliage)
   rendered via hardware instancing. Instance data (position, scale,
   rotation, colors) is rebuilt each frame from visible chunks' tree lists.

   Tree geometry is intentionally low-poly (aesthetic choice — not a
   limitation). Each tree is 12–24 triangles.

   Public API on window.Vegetation:
     TreeRenderer(gl) → renderer
     renderer.render(gl, program, uniforms, viewProj, renderState, trees[])
   ========================================================================= */

(function (root) {
  "use strict";

  const { BIOME } = root.W;

  /* ======================== TREE GEOMETRY ======================== */
  // Trunk: hexagonal prism. Foliage: cone (pine) or hemisphere (deciduous).
  // Both stored in same VBO with a "foliage" attribute (0 or 1).

  function buildTreeMesh() {
    const positions = [];
    const normals = [];
    const foliageFlags = [];

    // ---- Trunk (hexagonal prism, radius 0.08, height 0..0.35) ----
    const segs = 6;
    const trunkR = 0.08;
    const trunkH = 0.35;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const nx = (c0 + c1) / 2, nz = (s0 + s1) / 2;
      const nl = Math.hypot(nx, nz) || 1;

      // Two triangles per face
      positions.push(
        c0 * trunkR, 0, s0 * trunkR,
        c1 * trunkR, 0, s1 * trunkR,
        c0 * trunkR, trunkH, s0 * trunkR,
        c1 * trunkR, 0, s1 * trunkR,
        c1 * trunkR, trunkH, s1 * trunkR,
        c0 * trunkR, trunkH, s0 * trunkR
      );
      for (let j = 0; j < 6; j++) {
        normals.push(nx / nl, 0, nz / nl);
        foliageFlags.push(0);
      }
    }

    // ---- Foliage: cone (8 segments, radius 0.3, from 0.25 to 1.0) ----
    const fSegs = 8;
    const fR = 0.3;
    const fBase = 0.25;
    const fTip = 1.0;
    for (let i = 0; i < fSegs; i++) {
      const a0 = (i / fSegs) * Math.PI * 2;
      const a1 = ((i + 1) / fSegs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      // Side face triangle (tip + two base corners)
      positions.push(
        0, fTip, 0,
        c0 * fR, fBase, s0 * fR,
        c1 * fR, fBase, s1 * fR
      );
      // Normal: average of face normal
      const ex1x = c0 * fR, ex1y = fBase - fTip, ex1z = s0 * fR;
      const ex2x = c1 * fR, ex2y = fBase - fTip, ex2z = s1 * fR;
      const fnx = ex1y * ex2z - ex1z * ex2y;
      const fny = ex1z * ex2x - ex1x * ex2z;
      const fnz = ex1x * ex2y - ex1y * ex2x;
      const fnl = Math.hypot(fnx, fny, fnz) || 1;
      for (let j = 0; j < 3; j++) {
        normals.push(fnx / fnl, fny / fnl, fnz / fnl);
        foliageFlags.push(1);
      }

      // Bottom cap triangle
      positions.push(
        0, fBase, 0,
        c1 * fR, fBase, s1 * fR,
        c0 * fR, fBase, s0 * fR
      );
      for (let j = 0; j < 3; j++) {
        normals.push(0, -1, 0);
        foliageFlags.push(1);
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      foliageFlags: new Float32Array(foliageFlags),
      vertexCount: positions.length / 3,
    };
  }

  /* ======================== COLORS PER BIOME ======================== */
  const TRUNK_COLORS = {
    [BIOME.FOREST]:      [0.35, 0.22, 0.12],
    [BIOME.PINE_FOREST]: [0.30, 0.18, 0.10],
    [BIOME.GRASSLAND]:   [0.38, 0.26, 0.14],
    [BIOME.SAVANNA]:     [0.42, 0.30, 0.16],
    [BIOME.SWAMP]:       [0.28, 0.22, 0.14],
    [BIOME.TUNDRA]:      [0.30, 0.25, 0.18],
  };
  const LEAF_COLORS = {
    [BIOME.FOREST]:      [0.28, 0.48, 0.22],
    [BIOME.PINE_FOREST]: [0.18, 0.36, 0.20],
    [BIOME.GRASSLAND]:   [0.36, 0.55, 0.28],
    [BIOME.SAVANNA]:     [0.50, 0.52, 0.25],
    [BIOME.SWAMP]:       [0.22, 0.38, 0.18],
    [BIOME.TUNDRA]:      [0.32, 0.42, 0.28],
  };

  /* ======================== RENDERER ======================== */

  const MAX_TREES = 8000;  // max rendered per frame

  function TreeRenderer(gl) {
    const mesh = buildTreeMesh();

    // Static geometry buffers
    const posBuf = root.GL.createBuffer(gl, gl.ARRAY_BUFFER, mesh.positions);
    const normBuf = root.GL.createBuffer(gl, gl.ARRAY_BUFFER, mesh.normals);
    const folBuf = root.GL.createBuffer(gl, gl.ARRAY_BUFFER, mesh.foliageFlags);

    // Instance buffers (dynamic, updated each frame)
    // Per instance: offset(3) + scale(3) + rot(1) + trunkColor(3) + leafColor(3) = 13 floats
    const INST_FLOATS = 13;
    const instData = new Float32Array(MAX_TREES * INST_FLOATS);
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);

    // VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Per-vertex attribs
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, folBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    // Per-instance attribs (all from instBuf)
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    const STRIDE = INST_FLOATS * 4;
    // location 3: iOffset (vec3)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(3, 1);
    // location 4: iScale (vec3)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, STRIDE, 12);
    gl.vertexAttribDivisor(4, 1);
    // location 5: iRot (float)
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, STRIDE, 24);
    gl.vertexAttribDivisor(5, 1);
    // location 6: iTrunk (vec3)
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 3, gl.FLOAT, false, STRIDE, 28);
    gl.vertexAttribDivisor(6, 1);
    // location 7: iLeaf (vec3)
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 3, gl.FLOAT, false, STRIDE, 40);
    gl.vertexAttribDivisor(7, 1);

    gl.bindVertexArray(null);

    function render(gl, program, uniforms, viewProj, renderState, trees) {
      if (!trees || trees.length === 0) return;

      const count = Math.min(trees.length, MAX_TREES);

      // Fill instance buffer
      for (let i = 0; i < count; i++) {
        const t = trees[i];
        const off = i * INST_FLOATS;
        instData[off + 0] = t.x;
        instData[off + 1] = t.y;
        instData[off + 2] = t.z;
        // Scale: x = trunk width, y = height, z = trunk width
        const s = t.scale;
        instData[off + 3] = s;
        instData[off + 4] = s * (3.0 + (t.biome === BIOME.PINE_FOREST ? 1.5 : 0));
        instData[off + 5] = s;
        instData[off + 6] = t.rot;
        // Colors
        const tc = TRUNK_COLORS[t.biome] || [0.35, 0.22, 0.12];
        const lc = LEAF_COLORS[t.biome]  || [0.30, 0.50, 0.22];
        instData[off + 7] = tc[0]; instData[off + 8] = tc[1]; instData[off + 9] = tc[2];
        instData[off + 10] = lc[0]; instData[off + 11] = lc[1]; instData[off + 12] = lc[2];
      }

      // Upload
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData.subarray(0, count * INST_FLOATS));

      // Draw
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProj, false, viewProj);
      gl.uniform3fv(uniforms.uViewPos, renderState.viewPos);
      gl.uniform3fv(uniforms.uSunDir, renderState.sunDir);
      gl.uniform3fv(uniforms.uSunColor, renderState.sunColor);
      gl.uniform3fv(uniforms.uSkyZenith, renderState.skyZenith);
      gl.uniform3fv(uniforms.uSkyHorizon, renderState.skyHorizon);
      gl.uniform1f(uniforms.uFogStart, renderState.fogStart);
      gl.uniform1f(uniforms.uFogEnd, renderState.fogEnd);
      gl.uniform1f(uniforms.uTime, renderState.time);

      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertexCount, count);
      gl.bindVertexArray(null);
    }

    return { render };
  }

  root.Vegetation = { TreeRenderer };
})(window);
