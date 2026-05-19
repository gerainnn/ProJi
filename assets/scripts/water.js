/* =========================================================================
   water.js — Infinite water plane rendering.

   A single large quad that follows the camera (XZ), positioned at sea level.
   The fragment shader does all the heavy lifting (procedural normals, fresnel,
   reflections approximated via sky sampling, specular sun glints).

   Public API on window.Water:
     WaterRenderer(gl, program) → renderer
     renderer.render(gl, program, uniforms, viewProj, renderState)
   ========================================================================= */

(function (root) {
  "use strict";

  function WaterRenderer(gl) {
    // Simple fullscreen quad in XZ. Covers [-1..1] to be scaled by uSize uniform.
    const verts = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1, -1,
       1,  1,
      -1,  1,
    ]);

    const buffer = root.GL.createBuffer(gl, gl.ARRAY_BUFFER, verts);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    function render(gl, program, uniforms, viewProj, renderState) {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProj, false, viewProj);
      gl.uniform3fv(uniforms.uViewPos, renderState.viewPos);
      gl.uniform3fv(uniforms.uSunDir, renderState.sunDir);
      gl.uniform3fv(uniforms.uSunColor, renderState.sunColor);
      gl.uniform3fv(uniforms.uSkyZenith, renderState.skyZenith);
      gl.uniform3fv(uniforms.uSkyHorizon, renderState.skyHorizon);
      gl.uniform1f(uniforms.uTime, renderState.time);
      gl.uniform1f(uniforms.uFogStart, renderState.fogStart);
      gl.uniform1f(uniforms.uFogEnd, renderState.fogEnd);
      gl.uniform1f(uniforms.uSeaLevel, renderState.seaLevel);
      gl.uniform1f(uniforms.uSize, renderState.fogEnd * 1.2); // extend past fog

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    return { render };
  }

  root.Water = { WaterRenderer };
})(window);
