/* =========================================================================
   gl.js — WebGL2 helpers. Compiles programs, uploads buffers, manages state.
   No magic, just thin wrappers to keep the call sites readable.

   Public API on window.GL:
     init(canvas) → { gl, ext }
     compileProgram(gl, vsSrc, fsSrc, label?) → program
     getUniforms(gl, program, names) → {name: location}
     createBuffer(gl, target, data, usage?) → WebGLBuffer
     createVAO(gl, attribs, indexBuffer?) → vao
     resize(gl, canvas, dpr) → boolean (changed?)
   ========================================================================= */

(function (root) {
  "use strict";

  function init(canvas) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      depth: true,
      stencil: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      alert("WebGL 2 не поддерживается. Используй современный браузер.");
      throw new Error("WebGL2 unavailable");
    }
    // Float texture support detection (used optionally)
    const ext = {
      colorBufferFloat: gl.getExtension("EXT_color_buffer_float"),
      textureFloatLinear: gl.getExtension("OES_texture_float_linear"),
      anisotropic: gl.getExtension("EXT_texture_filter_anisotropic"),
    };
    return { gl, ext };
  }

  function compileShader(gl, type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      console.error("Shader compile error", label || "", info, "\nSource:\n" + numberLines(src));
      gl.deleteShader(sh);
      throw new Error("Shader compile failed: " + (label || "") + "\n" + info);
    }
    return sh;
  }

  function compileProgram(gl, vsSrc, fsSrc, label) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, (label || "?") + " vs");
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, (label || "?") + " fs");
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      console.error("Program link error", label || "", info);
      gl.deleteProgram(prog);
      throw new Error("Program link failed: " + (label || "") + "\n" + info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  function numberLines(src) {
    return src.split("\n").map((l, i) => String(i + 1).padStart(3) + " | " + l).join("\n");
  }

  function getUniforms(gl, program, names) {
    const out = {};
    for (const n of names) out[n] = gl.getUniformLocation(program, n);
    return out;
  }

  function createBuffer(gl, target, data, usage) {
    const buf = gl.createBuffer();
    gl.bindBuffer(target, buf);
    gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return buf;
  }

  // attribs: [{ buffer, location, size, type, normalized?, stride?, offset?, divisor? }]
  function createVAO(gl, attribs, indexBuffer) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const a of attribs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer);
      gl.enableVertexAttribArray(a.location);
      if (a.intAttrib) {
        gl.vertexAttribIPointer(a.location, a.size, a.type || gl.INT,
          a.stride || 0, a.offset || 0);
      } else {
        gl.vertexAttribPointer(a.location, a.size, a.type || gl.FLOAT,
          !!a.normalized, a.stride || 0, a.offset || 0);
      }
      if (a.divisor != null) gl.vertexAttribDivisor(a.location, a.divisor);
    }
    if (indexBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bindVertexArray(null);
    return vao;
  }

  function resize(gl, canvas, dpr) {
    dpr = dpr || Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth  * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    let changed = false;
    if (canvas.width !== w)  { canvas.width  = w; changed = true; }
    if (canvas.height !== h) { canvas.height = h; changed = true; }
    if (changed) gl.viewport(0, 0, w, h);
    return changed;
  }

  root.GL = {
    init, compileProgram, compileShader, getUniforms,
    createBuffer, createVAO, resize,
  };
})(window);
