/* =========================================================================
   sky.js — Procedural sky dome + sun disc rendering.

   Sky is drawn as a full-screen triangle (no geometry needed).
   Sun is drawn as a billboard quad using vertex ID tricks.

   Public API on window.Sky:
     SkyRenderer(gl) → renderer
     renderer.renderSky(gl, program, uniforms, invViewProj, renderState)
     renderer.renderSun(gl, program, uniforms, viewProj, renderState)
   ========================================================================= */

(function (root) {
  "use strict";

  function SkyRenderer(gl) {
    // Empty VAO — sky/sun shaders use gl_VertexID
    const emptyVAO = gl.createVertexArray();

    function renderSky(gl, program, uniforms, invViewProj, renderState) {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uInvViewProj, false, invViewProj);
      gl.uniform3fv(uniforms.uViewPos, renderState.viewPos);
      gl.uniform3fv(uniforms.uSunDir, renderState.sunDir);
      gl.uniform3fv(uniforms.uSunColor, renderState.sunColor);
      gl.uniform3fv(uniforms.uSkyZenith, renderState.skyZenith);
      gl.uniform3fv(uniforms.uSkyHorizon, renderState.skyHorizon);

      gl.depthFunc(gl.LEQUAL); // draw at far plane
      gl.bindVertexArray(emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.depthFunc(gl.LESS);
    }

    function renderSun(gl, program, uniforms, viewProj, renderState) {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProj, false, viewProj);
      gl.uniform3fv(uniforms.uViewPos, renderState.viewPos);
      gl.uniform3fv(uniforms.uSunDir, renderState.sunDir);
      gl.uniform3fv(uniforms.uSunColor, renderState.sunColor);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // additive
      gl.depthMask(false);

      gl.bindVertexArray(emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    return { renderSky, renderSun };
  }

  root.Sky = { SkyRenderer };
})(window);
