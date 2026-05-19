/* =========================================================================
   shaders.js — All GLSL ES 3.00 shaders.

   Programs:
     1. TERRAIN (vertex + fragment): biome coloring, slope rock, sun lighting,
        atmospheric fog, surface micro-detail.
     2. WATER (vertex + fragment): rippled normal map, fresnel reflectance,
        depth-based tint, foam at shoreline.
     3. SKY (vertex + fragment): screen-aligned, atmospheric gradient, sun.
     4. TREE (vertex + fragment): instanced trees with wind sway and shading.
     5. SUN (vertex + fragment): bright disc + halo (drawn after sky).

   We use the same lighting approach across opaque shaders for consistency.

   Conventions:
     - Y is up.
     - Sea level at Y = 0.
     - World units ~ meters.
   ========================================================================= */

(function (root) {
  "use strict";

  /* =====================================================================
     COMMON GLSL — pasted into each fragment as needed.
     ===================================================================== */

  // Basic 2D simplex noise + fbm in GLSL for surface detail.
  // Source: classic IQ-style simplex 2D, adapted.
  const GLSL_NOISE = /* glsl */`
    // -------- Simplex noise 2D ----------------
    vec2 mod289_2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x)  { return mod289_3(((x * 34.0) + 1.0) * x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(
        0.211324865405187,
        0.366025403784439,
        -0.577350269189626,
        0.024390243902439
      );
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289_2(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                              + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m * m; m = m * m;
      vec3 x  = 2.0 * fract(p * C.www) - 1.0;
      vec3 h  = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float fbm2(vec2 p, int octaves) {
      float total = 0.0, amp = 1.0, freq = 1.0, maxA = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        total += snoise(p * freq) * amp;
        maxA  += amp;
        amp   *= 0.5;
        freq  *= 2.0;
      }
      return total / maxA * 0.5 + 0.5;
    }
  `;

  // Common atmospheric helpers — fog, sky color.
  const GLSL_ATMOS = /* glsl */`
    // Sky color from view direction. Mostly used as fog target.
    vec3 skyColorFromDir(vec3 dir, vec3 sunDir, vec3 dayZenith, vec3 dayHorizon, vec3 sunCol) {
      float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
      // Smoother gradient in upper half
      float t = pow(h, 0.55);
      vec3 base = mix(dayHorizon, dayZenith, t);
      // Sun aura — wide warm tint near sun
      float sunDot = max(dot(normalize(dir), normalize(sunDir)), 0.0);
      float halo = pow(sunDot, 4.0) * 0.18 + pow(sunDot, 32.0) * 0.6;
      base += sunCol * halo * smoothstep(-0.05, 0.2, dir.y);
      return base;
    }

    // Standard distance fog with exponential squared falloff.
    float fogFactor(float dist, float fogStart, float fogEnd) {
      float t = clamp((dist - fogStart) / max(fogEnd - fogStart, 1.0), 0.0, 1.0);
      return t;
    }
  `;

  /* =====================================================================
     TERRAIN
     ===================================================================== */

  const TERRAIN_VS = /* glsl */`#version 300 es
    precision highp float;

    layout (location = 0) in vec3 aPos;
    layout (location = 1) in vec3 aNormal;
    layout (location = 2) in float aBiome;
    layout (location = 3) in float aSlope;

    uniform mat4 uViewProj;
    uniform vec3 uChunkOrigin;

    out vec3 vWorldPos;
    out vec3 vNormal;
    out float vBiome;
    out float vSlope;

    void main() {
      vec3 world = aPos + uChunkOrigin;
      vWorldPos = world;
      vNormal = aNormal;
      vBiome = aBiome;
      vSlope = aSlope;
      gl_Position = uViewProj * vec4(world, 1.0);
    }
  `;

  const TERRAIN_FS = /* glsl */`#version 300 es
    precision highp float;

    in vec3 vWorldPos;
    in vec3 vNormal;
    in float vBiome;
    in float vSlope;

    uniform vec3 uViewPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbient;
    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;
    uniform float uFogStart;
    uniform float uFogEnd;
    uniform float uTime;

    // 12 biomes × 2 colors (low + high), passed flat as arrays of vec3
    uniform vec3 uBiomeLow[12];
    uniform vec3 uBiomeHigh[12];

    out vec4 outColor;

    ${GLSL_NOISE}
    ${GLSL_ATMOS}

    // Biome color mix: sample low/high by elevation, plus surface noise variation.
    vec3 biomeBaseColor(int b, float h, vec2 worldXZ) {
      vec3 lo = uBiomeLow[b];
      vec3 hi = uBiomeHigh[b];
      // Height ramp per biome: 0..1 between -4 and 36
      float t = clamp((h + 4.0) / 40.0, 0.0, 1.0);
      // Surface variation (fine grain) — adds organic mottling.
      float n1 = fbm2(worldXZ * 0.18, 3);
      float n2 = snoise(worldXZ * 0.7) * 0.5 + 0.5;
      // Bias mix slightly with noise so colors aren't uniform.
      t = clamp(t + (n1 - 0.5) * 0.18, 0.0, 1.0);
      vec3 c = mix(lo, hi, t);
      // Slight tonal variation so we don't see uniform fields.
      c *= 0.88 + n2 * 0.18;
      return c;
    }

    // Pick rock color for steep slopes
    vec3 rockColor(vec2 worldXZ, float h) {
      float n = fbm2(worldXZ * 0.25, 3);
      vec3 c1 = vec3(0.32, 0.30, 0.28);
      vec3 c2 = vec3(0.50, 0.46, 0.42);
      vec3 c = mix(c1, c2, n);
      // Slight darkening at low altitudes for damp rock
      c *= mix(0.85, 1.0, smoothstep(0.0, 12.0, h));
      return c;
    }

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uViewPos - vWorldPos);

      // Biome base color
      int b = int(vBiome + 0.5);
      vec3 baseCol = biomeBaseColor(b, vWorldPos.y, vWorldPos.xz);

      // If slope is steep, override toward rock (independent of biome).
      // vSlope is roughly 0..1 (saturated chunk-side gradient magnitude).
      // Use vertical normal as well — straight cliffs always rocky.
      float verticality = 1.0 - clamp(N.y, 0.0, 1.0);
      float rockFactor = smoothstep(0.40, 0.85, max(vSlope, verticality));
      vec3 rock = rockColor(vWorldPos.xz, vWorldPos.y);
      baseCol = mix(baseCol, rock, rockFactor);

      // Snow accumulation on tops (high altitude, low slope)
      float snowFactor = smoothstep(28.0, 38.0, vWorldPos.y) *
                         smoothstep(0.55, 0.85, N.y);
      vec3 snow = vec3(0.95, 0.96, 0.99);
      baseCol = mix(baseCol, snow, snowFactor);

      // Sand at very low altitude, regardless of biome (beach blending)
      float beachFactor = smoothstep(0.4, 1.4, vWorldPos.y) *
                          (1.0 - smoothstep(1.4, 2.4, vWorldPos.y));
      // ^ this peaks between 1.4 and triggers the blend zone. Keep it subtle.
      // (Actual beach biome handles most of this — this is a soft blend over.)
      // We'll skip this if-block for simplicity since BIOME.BEACH covers it.

      // Lighting: directional sun + sky ambient
      float NdL = max(dot(N, normalize(uSunDir)), 0.0);
      float wrap = max(dot(N, normalize(uSunDir)) * 0.5 + 0.5, 0.0);
      vec3 sunLight = uSunColor * (NdL * 0.85 + wrap * 0.15);

      // Sky ambient via hemispherical: more from above, less from below
      vec3 ambient = mix(uSkyHorizon * 0.45, uSkyZenith * 0.55, N.y * 0.5 + 0.5) * 0.55;

      // Subtle Rim/atmospheric scattering on edges (forward-facing slopes pick up sky)
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 rimLight = uSkyHorizon * rim * 0.18;

      vec3 color = baseCol * (sunLight + ambient) + rimLight;

      // Fog
      float dist = length(uViewPos - vWorldPos);
      vec3 viewDir = normalize(vWorldPos - uViewPos);
      vec3 fogCol = skyColorFromDir(viewDir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);
      float f = fogFactor(dist, uFogStart, uFogEnd);
      color = mix(color, fogCol, f);

      // Gamma-ish tone — output in linear-ish space; light pop.
      color = pow(color, vec3(0.95));

      outColor = vec4(color, 1.0);
    }
  `;

  /* =====================================================================
     WATER
     ===================================================================== */

  const WATER_VS = /* glsl */`#version 300 es
    precision highp float;

    layout (location = 0) in vec2 aPos;

    uniform mat4 uViewProj;
    uniform vec3 uViewPos;
    uniform float uSize;     // half-size of plane
    uniform float uSeaLevel;

    out vec3 vWorldPos;

    void main() {
      // Big quad centered around viewer (XZ plane at sea level)
      vec3 world = vec3(uViewPos.x + aPos.x * uSize, uSeaLevel, uViewPos.z + aPos.y * uSize);
      vWorldPos = world;
      gl_Position = uViewProj * vec4(world, 1.0);
    }
  `;

  const WATER_FS = /* glsl */`#version 300 es
    precision highp float;

    in vec3 vWorldPos;

    uniform vec3 uViewPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;
    uniform float uTime;
    uniform float uFogStart;
    uniform float uFogEnd;

    out vec4 outColor;

    ${GLSL_NOISE}
    ${GLSL_ATMOS}

    // Procedural normal from animated noise — two scrolling layers
    vec3 waterNormal(vec2 p, float t) {
      float e = 0.6;
      vec2 dx1 = vec2(t * 0.18, t * 0.10);
      vec2 dx2 = vec2(-t * 0.07, t * 0.13);

      // Layer 1
      float h00 = fbm2((p     ) * 0.18 + dx1, 3);
      float hx0 = fbm2((p + vec2(e,0)) * 0.18 + dx1, 3);
      float hz0 = fbm2((p + vec2(0,e)) * 0.18 + dx1, 3);
      vec3 n1 = normalize(vec3((h00 - hx0) / e, 1.0, (h00 - hz0) / e));

      // Layer 2
      float h01 = fbm2((p     ) * 0.55 + dx2, 2);
      float hx1 = fbm2((p + vec2(e,0)) * 0.55 + dx2, 2);
      float hz1 = fbm2((p + vec2(0,e)) * 0.55 + dx2, 2);
      vec3 n2 = normalize(vec3((h01 - hx1) / e, 1.0, (h01 - hz1) / e));

      return normalize(n1 * 0.65 + n2 * 0.35 + vec3(0, 1, 0) * 0.2);
    }

    void main() {
      vec3 V = normalize(uViewPos - vWorldPos);
      vec3 N = waterNormal(vWorldPos.xz, uTime);

      // Reflection direction
      vec3 R = reflect(-V, N);

      // Sample sky for reflection
      vec3 skyRefl = skyColorFromDir(R, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);

      // Fresnel — Schlick approximation
      float F0 = 0.02;
      float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);

      // Base water color depends on viewing angle (deep blue at angle, lighter near)
      vec3 deepCol    = vec3(0.04, 0.16, 0.22);
      vec3 shallowCol = vec3(0.18, 0.42, 0.50);

      // Use a subtle horizontal noise to give "shallow patches" suggestion.
      float n = fbm2(vWorldPos.xz * 0.012, 3);
      vec3 baseWater = mix(deepCol, shallowCol, smoothstep(0.4, 0.7, n));

      // Specular sun glint
      vec3 H = normalize(normalize(uSunDir) + V);
      float spec = pow(max(dot(N, H), 0.0), 80.0);
      vec3 sunGlint = uSunColor * spec * 1.4;

      // Combine: base water, plus reflection by fresnel, plus glint.
      vec3 color = mix(baseWater, skyRefl, fresnel * 0.85) + sunGlint;

      // Subsurface tint that lifts the deeps slightly
      color += vec3(0.0, 0.02, 0.04) * (1.0 - fresnel) * 0.6;

      // Fog
      float dist = length(uViewPos - vWorldPos);
      vec3 viewDir = normalize(vWorldPos - uViewPos);
      vec3 fogCol = skyColorFromDir(viewDir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);
      float f = fogFactor(dist, uFogStart, uFogEnd);
      color = mix(color, fogCol, f);

      outColor = vec4(color, 1.0);
    }
  `;

  /* =====================================================================
     SKY (full-screen)
     ===================================================================== */

  const SKY_VS = /* glsl */`#version 300 es
    precision highp float;
    // We render a single triangle that covers the screen.
    // Provide attribute-less rendering by indexing gl_VertexID.
    out vec2 vNDC;
    void main() {
      // Generate a fullscreen triangle at z = 1 (far plane in NDC)
      vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0,
                    (gl_VertexID == 2) ? 3.0 : -1.0);
      vNDC = p;
      gl_Position = vec4(p, 1.0, 1.0);
    }
  `;

  const SKY_FS = /* glsl */`#version 300 es
    precision highp float;

    in vec2 vNDC;
    out vec4 outColor;

    uniform mat4 uInvViewProj;
    uniform vec3 uViewPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;

    ${GLSL_ATMOS}

    void main() {
      // Reconstruct view direction from NDC
      vec4 farPt = uInvViewProj * vec4(vNDC, 1.0, 1.0);
      farPt.xyz /= farPt.w;
      vec3 dir = normalize(farPt.xyz - uViewPos);

      vec3 col = skyColorFromDir(dir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);

      // Subtle vertical banding (atmospheric perspective)
      // Stars at high altitude — only when sun is below
      // (Skip stars for daytime build; could add for night.)

      outColor = vec4(col, 1.0);
    }
  `;

  /* =====================================================================
     TREE (instanced)
     ===================================================================== */

  const TREE_VS = /* glsl */`#version 300 es
    precision highp float;

    // Per-vertex
    layout (location = 0) in vec3 aPos;
    layout (location = 1) in vec3 aNormal;
    layout (location = 2) in float aFoliage; // 0 = trunk, 1 = foliage

    // Per-instance
    layout (location = 3) in vec3 iOffset;   // world translation
    layout (location = 4) in vec3 iScale;    // (xy = trunk-radius scale, y = height scale)
    layout (location = 5) in float iRot;     // y-rotation
    layout (location = 6) in vec3 iTrunk;    // trunk color
    layout (location = 7) in vec3 iLeaf;     // leaf color

    uniform mat4 uViewProj;
    uniform float uTime;

    out vec3 vWorldPos;
    out vec3 vNormal;
    out vec3 vColor;

    mat3 rotY(float a) {
      float c = cos(a), s = sin(a);
      return mat3(
        c, 0.0, -s,
        0.0, 1.0, 0.0,
        s, 0.0, c
      );
    }

    void main() {
      mat3 R = rotY(iRot);
      // Scale: trunk uses x; foliage scales with y
      vec3 scaled = aPos * iScale;
      vec3 rotated = R * scaled;

      // Wind sway — only on foliage. Two sine waves in different directions.
      float windPhase = uTime * 1.5 + iOffset.x * 0.1 + iOffset.z * 0.07;
      vec3 sway = vec3(sin(windPhase) * 0.05, 0.0, cos(windPhase * 0.8) * 0.04) *
                  aFoliage * (rotated.y / max(iScale.y, 0.01));

      vec3 world = iOffset + rotated + sway;
      vec3 worldNormal = R * aNormal;

      vWorldPos = world;
      vNormal = worldNormal;
      vColor = mix(iTrunk, iLeaf, aFoliage);

      gl_Position = uViewProj * vec4(world, 1.0);
    }
  `;

  const TREE_FS = /* glsl */`#version 300 es
    precision highp float;

    in vec3 vWorldPos;
    in vec3 vNormal;
    in vec3 vColor;

    uniform vec3 uViewPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;
    uniform float uFogStart;
    uniform float uFogEnd;

    out vec4 outColor;

    ${GLSL_NOISE}
    ${GLSL_ATMOS}

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uViewPos - vWorldPos);

      // Tonal variation per-tree based on world position (cheap)
      float n = snoise(vWorldPos.xz * 0.7) * 0.5 + 0.5;
      vec3 col = vColor * (0.86 + n * 0.18);

      // Lighting
      float NdL = max(dot(N, normalize(uSunDir)), 0.0);
      float wrap = max(dot(N, normalize(uSunDir)) * 0.5 + 0.5, 0.0);
      vec3 sun = uSunColor * (NdL * 0.85 + wrap * 0.15);
      vec3 ambient = mix(uSkyHorizon * 0.45, uSkyZenith * 0.55, N.y * 0.5 + 0.5) * 0.55;

      vec3 color = col * (sun + ambient);

      // Fog
      float dist = length(uViewPos - vWorldPos);
      vec3 viewDir = normalize(vWorldPos - uViewPos);
      vec3 fogCol = skyColorFromDir(viewDir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);
      float f = fogFactor(dist, uFogStart, uFogEnd);
      color = mix(color, fogCol, f);

      outColor = vec4(color, 1.0);
    }
  `;

  /* =====================================================================
     SUN DISC (small bright billboard at sun direction, very far)
     ===================================================================== */

  const SUN_VS = /* glsl */`#version 300 es
    precision highp float;
    out vec2 vUV;
    uniform mat4 uViewProj;
    uniform vec3 uViewPos;
    uniform vec3 uSunDir;

    void main() {
      // Build a quad at distance 950 from viewer, perpendicular to view
      vec3 sunCenter = uViewPos + normalize(uSunDir) * 950.0;
      // Build basis perpendicular to sun direction
      vec3 sd = normalize(uSunDir);
      vec3 up = abs(sd.y) > 0.95 ? vec3(0,0,1) : vec3(0,1,0);
      vec3 right = normalize(cross(sd, up));
      vec3 actualUp = normalize(cross(right, sd));

      // Quad corners
      vec2 corner;
      if (gl_VertexID == 0)      corner = vec2(-1.0, -1.0);
      else if (gl_VertexID == 1) corner = vec2( 1.0, -1.0);
      else if (gl_VertexID == 2) corner = vec2(-1.0,  1.0);
      else if (gl_VertexID == 3) corner = vec2( 1.0,  1.0);
      else if (gl_VertexID == 4) corner = vec2(-1.0,  1.0);
      else                       corner = vec2( 1.0, -1.0);

      float SIZE = 70.0;
      vec3 worldPos = sunCenter + right * corner.x * SIZE + actualUp * corner.y * SIZE;
      vUV = corner;
      gl_Position = uViewProj * vec4(worldPos, 1.0);
    }
  `;

  const SUN_FS = /* glsl */`#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 outColor;
    uniform vec3 uSunColor;

    void main() {
      float r = length(vUV);
      // Inner disc + halo
      float disc = smoothstep(1.0, 0.78, r);
      float halo = smoothstep(1.0, 0.0, r) * 0.18;
      vec3 col = uSunColor * (disc * 1.4 + halo);
      float a = max(disc, halo);
      if (a < 0.01) discard;
      outColor = vec4(col, a);
    }
  `;

  /* =====================================================================
     Public
     ===================================================================== */

  root.SHADERS = {
    TERRAIN_VS, TERRAIN_FS,
    WATER_VS,   WATER_FS,
    SKY_VS,     SKY_FS,
    TREE_VS,    TREE_FS,
    SUN_VS,     SUN_FS,
  };
})(window);
