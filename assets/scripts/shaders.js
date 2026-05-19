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

    uniform vec3 uBiomeLow[12];
    uniform vec3 uBiomeHigh[12];

    out vec4 outColor;

    ${GLSL_NOISE}
    ${GLSL_ATMOS}

    // -------- Detail normal from noise (simulates bump mapping) --------
    vec3 detailNormal(vec3 N, vec2 worldXZ, float scale, float strength) {
      float e = 0.5;
      float h0 = snoise(worldXZ * scale);
      float hx = snoise((worldXZ + vec2(e, 0.0)) * scale);
      float hz = snoise((worldXZ + vec2(0.0, e)) * scale);
      vec3 tangentNorm = normalize(vec3((h0 - hx) * strength / e, 1.0, (h0 - hz) * strength / e));
      // Transform tangent-space perturbation into world space
      // Simplified: assume up-facing terrain, blend with actual normal
      return normalize(mix(N, tangentNorm, 0.45));
    }

    // -------- Triplanar blending weights --------
    vec3 triplanarWeights(vec3 N) {
      vec3 w = abs(N);
      w = pow(w, vec3(4.0)); // sharpness
      return w / (w.x + w.y + w.z);
    }

    // -------- Procedural rock detail (triplanar) --------
    float rockDetail(vec3 pos, vec3 N) {
      vec3 w = triplanarWeights(N);
      float dXY = fbm2(pos.xy * 0.8, 4);
      float dXZ = fbm2(pos.xz * 0.8, 4);
      float dYZ = fbm2(pos.yz * 0.8, 4);
      return dXY * w.z + dXZ * w.y + dYZ * w.x;
    }

    // -------- Grass blade pattern --------
    float grassPattern(vec2 p) {
      float n1 = snoise(p * 12.0);
      float n2 = snoise(p * 48.0) * 0.3;
      return clamp(n1 + n2, -1.0, 1.0) * 0.5 + 0.5;
    }

    // -------- Enhanced biome color with multi-layer detail --------
    vec3 biomeBaseColor(int b, float h, vec3 worldPos, vec3 N) {
      vec3 lo = uBiomeLow[b];
      vec3 hi = uBiomeHigh[b];
      float t = clamp((h + 4.0) / 40.0, 0.0, 1.0);

      // Multi-octave surface variation at different scales
      float n_large  = fbm2(worldPos.xz * 0.03, 3);   // large patches
      float n_mid    = fbm2(worldPos.xz * 0.12, 3);   // mid detail
      float n_fine   = snoise(worldPos.xz * 0.6);     // fine grain
      float n_micro  = snoise(worldPos.xz * 2.4) * 0.5 + 0.5; // micro

      // Compose variation
      t = clamp(t + (n_large - 0.5) * 0.15 + (n_mid - 0.5) * 0.08, 0.0, 1.0);
      vec3 c = mix(lo, hi, t);

      // Apply per-pixel color variation (mottling)
      c *= 0.82 + n_fine * 0.12 + n_micro * 0.08;

      // Grass/vegetation pattern for relevant biomes (3,4,7,11)
      if (b == 3 || b == 4 || b == 7 || b == 11) {
        float gp = grassPattern(worldPos.xz);
        c = mix(c, c * vec3(0.85, 1.05, 0.82), gp * 0.3);
      }

      // Desert sand ripple pattern
      if (b == 6) {
        float ripple = sin(worldPos.x * 0.4 + worldPos.z * 0.15 + n_mid * 6.0) * 0.5 + 0.5;
        c = mix(c, c * vec3(1.08, 1.02, 0.92), ripple * 0.2);
      }

      return c;
    }

    // -------- Rock color with striations --------
    vec3 rockColor(vec3 worldPos, vec3 N, float h) {
      float detail = rockDetail(worldPos, N);
      // Layer different rock tones
      vec3 c1 = vec3(0.28, 0.26, 0.24); // dark granite
      vec3 c2 = vec3(0.46, 0.42, 0.38); // mid sandstone
      vec3 c3 = vec3(0.56, 0.52, 0.46); // light limestone

      // Use layers based on height + noise
      float layer = fract(h * 0.06 + detail * 0.4);
      vec3 c = mix(c1, c2, smoothstep(0.0, 0.45, layer));
      c = mix(c, c3, smoothstep(0.55, 1.0, layer));

      // Moss on sheltered (north-facing, wet) rock
      float moss = smoothstep(0.6, 0.9, N.y) * smoothstep(0.4, 0.7, detail);
      c = mix(c, vec3(0.22, 0.32, 0.16), moss * 0.35);

      // Micro detail variation
      float micro = snoise(worldPos.xz * 3.6) * 0.5 + 0.5;
      c *= 0.88 + micro * 0.15;

      return c;
    }

    // -------- Ambient Occlusion approximation --------
    float approxAO(vec3 N, float slope) {
      // Concavity estimation: steeper slopes in valleys get darker
      float cavity = 1.0 - smoothstep(0.0, 0.6, slope) * 0.35;
      // Higher normal.y = more open sky = less occlusion
      float openSky = mix(0.65, 1.0, N.y * 0.5 + 0.5);
      return cavity * openSky;
    }

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uViewPos - vWorldPos);
      vec3 L = normalize(uSunDir);

      // Apply detail normal perturbation for surface richness
      vec3 detN = detailNormal(N, vWorldPos.xz, 0.3, 0.6);
      // Blend detail normal more on flat surfaces, less on cliffs
      vec3 shadingN = mix(N, detN, smoothstep(0.4, 0.8, N.y));

      // Biome base color
      int b = int(vBiome + 0.5);
      vec3 baseCol = biomeBaseColor(b, vWorldPos.y, vWorldPos, N);

      // Slope-based rock blending (use world normal for detection, detail for shading)
      float verticality = 1.0 - clamp(N.y, 0.0, 1.0);
      float rockFactor = smoothstep(0.35, 0.75, max(vSlope, verticality));
      vec3 rock = rockColor(vWorldPos, N, vWorldPos.y);
      baseCol = mix(baseCol, rock, rockFactor);

      // Snow accumulation (aspect + altitude + slope)
      float snowAlt = smoothstep(26.0, 36.0, vWorldPos.y);
      float snowSlope = smoothstep(0.50, 0.85, N.y);
      float snowNoise = fbm2(vWorldPos.xz * 0.08, 2);
      float snowFactor = snowAlt * snowSlope * smoothstep(0.3, 0.6, snowNoise);
      vec3 snow = vec3(0.94, 0.96, 0.99) * (0.9 + snoise(vWorldPos.xz * 1.8) * 0.1);
      baseCol = mix(baseCol, snow, snowFactor);

      // Beach sand (near sea level, low slope)
      float beachFactor = (1.0 - smoothstep(0.5, 2.5, vWorldPos.y)) *
                          smoothstep(-0.5, 0.5, vWorldPos.y) *
                          smoothstep(0.6, 0.9, N.y);
      vec3 sand = vec3(0.88, 0.80, 0.60) * (0.92 + snoise(vWorldPos.xz * 4.0) * 0.08);
      baseCol = mix(baseCol, sand, beachFactor * 0.7);

      // -------- Lighting --------
      // PBR-inspired: rougher surfaces → broader diffuse, less spec.
      float roughness = mix(0.85, 0.98, rockFactor); // rock is rougher

      // Diffuse: wrapped Lambert for softer shadows
      float NdL = dot(shadingN, L);
      float wrapDiffuse = max(NdL * 0.7 + 0.3, 0.0);
      float hardDiffuse = max(NdL, 0.0);
      float diffuse = mix(hardDiffuse, wrapDiffuse, 0.55);

      // Specular (Blinn-Phong with roughness-modulated power)
      vec3 H = normalize(L + V);
      float NdH = max(dot(shadingN, H), 0.0);
      float specPower = mix(60.0, 8.0, roughness);
      float spec = pow(NdH, specPower) * (1.0 - roughness) * 0.3;

      // Hemispheric ambient (sky above, ground below)
      float hemiBlend = shadingN.y * 0.5 + 0.5;
      vec3 skyAmb = uSkyZenith * 0.50;
      vec3 groundAmb = vec3(0.12, 0.10, 0.08);
      vec3 ambient = mix(groundAmb, skyAmb, hemiBlend);

      // Ambient occlusion
      float ao = approxAO(N, vSlope);

      // Sun shadow approximation (self-shadow for overhangs)
      float selfShadow = smoothstep(-0.1, 0.15, NdL);

      // Rim/subsurface scattering for backlit vegetation
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
      float backscatter = max(dot(-V, L), 0.0) * rim;
      vec3 rimLight = uSkyHorizon * rim * 0.12;
      vec3 subsurface = uSunColor * backscatter * 0.06 *
                        float(b == 3 || b == 4 || b == 5 || b == 7); // only vegetation biomes

      // Final lighting composition
      vec3 sunContrib = uSunColor * (diffuse * selfShadow + spec * selfShadow);
      vec3 color = baseCol * (sunContrib + ambient * ao) + rimLight + subsurface;

      // -------- Atmospheric fog --------
      float dist = length(uViewPos - vWorldPos);
      vec3 viewDir = normalize(vWorldPos - uViewPos);
      vec3 fogCol = skyColorFromDir(viewDir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);

      // Exponential-squared fog (more realistic than linear)
      float fogDensity = 0.0025;
      float fogAmount = 1.0 - exp(-pow(dist * fogDensity, 2.0));
      fogAmount = clamp(fogAmount, 0.0, 1.0);

      // Height-based fog (thicker in valleys)
      float heightFog = exp(-max(vWorldPos.y - 0.0, 0.0) * 0.04);
      fogAmount = max(fogAmount, heightFog * smoothstep(100.0, 400.0, dist) * 0.6);

      color = mix(color, fogCol, fogAmount);

      // -------- Tone mapping (ACES-ish filmic) --------
      color = color / (color + 0.4) * 1.2;

      // Slight contrast boost
      color = pow(color, vec3(0.97));

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

    // Multi-layered animated water normal for realistic ripples
    vec3 waterNormal(vec2 p, float t) {
      float e = 0.4;

      // Layer 1: large slow swells
      vec2 d1 = vec2(t * 0.12, t * 0.08);
      float h1_00 = fbm2((p) * 0.10 + d1, 3);
      float h1_x  = fbm2((p + vec2(e,0)) * 0.10 + d1, 3);
      float h1_z  = fbm2((p + vec2(0,e)) * 0.10 + d1, 3);

      // Layer 2: mid-frequency chop
      vec2 d2 = vec2(-t * 0.06, t * 0.10);
      float h2_00 = fbm2((p) * 0.35 + d2, 3);
      float h2_x  = fbm2((p + vec2(e,0)) * 0.35 + d2, 3);
      float h2_z  = fbm2((p + vec2(0,e)) * 0.35 + d2, 3);

      // Layer 3: fine ripples (high frequency, low amplitude)
      vec2 d3 = vec2(t * 0.22, -t * 0.15);
      float h3_00 = snoise(p * 1.2 + d3);
      float h3_x  = snoise((p + vec2(e,0)) * 1.2 + d3);
      float h3_z  = snoise((p + vec2(0,e)) * 1.2 + d3);

      // Combine with decreasing amplitudes
      float dx = (h1_00 - h1_x) * 1.2 + (h2_00 - h2_x) * 0.6 + (h3_00 - h3_x) * 0.15;
      float dz = (h1_00 - h1_z) * 1.2 + (h2_00 - h2_z) * 0.6 + (h3_00 - h3_z) * 0.15;

      return normalize(vec3(dx / e, 1.0, dz / e));
    }

    // Caustic pattern (underwater light refraction)
    float caustics(vec2 p, float t) {
      vec2 p1 = p * 0.4 + vec2(t * 0.03, t * 0.02);
      vec2 p2 = p * 0.6 + vec2(-t * 0.02, t * 0.035);
      float c1 = snoise(p1) * 0.5 + 0.5;
      float c2 = snoise(p2) * 0.5 + 0.5;
      // Voronoi-like pattern from crossing noise waves
      float c = pow(c1 * c2, 1.5);
      return c;
    }

    void main() {
      vec3 V = normalize(uViewPos - vWorldPos);
      vec3 L = normalize(uSunDir);
      vec3 N = waterNormal(vWorldPos.xz, uTime);

      // View-distance for LOD of normal detail
      float dist = length(uViewPos - vWorldPos);
      // Flatten normals at distance to avoid shimmer
      float normalFade = smoothstep(80.0, 300.0, dist);
      N = normalize(mix(N, vec3(0, 1, 0), normalFade));

      // Reflection direction
      vec3 R = reflect(-V, N);
      // Clamp reflection to above horizon
      R.y = max(R.y, 0.02);
      R = normalize(R);

      // Sample sky for reflection
      vec3 skyRefl = skyColorFromDir(R, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);

      // Fresnel (Schlick) — water F0 ≈ 0.02
      float F0 = 0.02;
      float cosTheta = max(dot(N, V), 0.0);
      float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

      // Deep and shallow water colors
      vec3 deepCol    = vec3(0.015, 0.08, 0.14);
      vec3 shallowCol = vec3(0.10, 0.28, 0.36);

      // Depth estimation via noise (fake — real depth would need terrain height lookup)
      float depthNoise = fbm2(vWorldPos.xz * 0.008, 3);
      float depth = smoothstep(0.3, 0.7, depthNoise);
      vec3 baseWater = mix(shallowCol, deepCol, depth);

      // Caustics on shallow areas (brighten the water base)
      float caust = caustics(vWorldPos.xz, uTime) * (1.0 - depth) * 0.3;
      baseWater += caust * uSunColor * max(L.y, 0.0);

      // Specular sun glint (two-lobe: sharp + broad)
      vec3 H = normalize(L + V);
      float NdH = max(dot(N, H), 0.0);
      float specSharp = pow(NdH, 256.0) * 2.0;
      float specBroad = pow(NdH, 24.0) * 0.4;
      vec3 sunGlint = uSunColor * (specSharp + specBroad) * max(L.y, 0.0);

      // Combine: base water + reflection by fresnel + sun glint
      vec3 color = mix(baseWater, skyRefl, fresnel * 0.88) + sunGlint;

      // Subsurface scattering (light penetrating water at glancing angles)
      float sss = pow(max(dot(-V, L), 0.0), 4.0) * (1.0 - fresnel) * 0.08;
      color += vec3(0.05, 0.15, 0.12) * sss * max(L.y, 0.0);

      // Foam at shallow areas and wave peaks
      float foamNoise = snoise(vWorldPos.xz * 0.6 + vec2(uTime * 0.08)) * 0.5 + 0.5;
      float foam = smoothstep(0.72, 0.9, foamNoise) * (1.0 - depth) * 0.3;
      color = mix(color, vec3(0.85, 0.90, 0.92), foam);

      // Atmospheric fog (exponential squared)
      vec3 viewDir = normalize(vWorldPos - uViewPos);
      vec3 fogCol = skyColorFromDir(viewDir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);
      float fogDensity = 0.0022;
      float fogAmount = 1.0 - exp(-pow(dist * fogDensity, 2.0));
      color = mix(color, fogCol, clamp(fogAmount, 0.0, 1.0));

      // Tone mapping
      color = color / (color + 0.4) * 1.2;

      // Water alpha: mostly opaque, slightly transparent at edges
      float alpha = mix(0.92, 1.0, fresnel);

      outColor = vec4(color, alpha);
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

    ${GLSL_NOISE}
    ${GLSL_ATMOS}

    // Procedural volumetric cloud layer
    float cloudDensity(vec2 p, float t) {
      // Two moving layers of different speeds
      vec2 wind1 = vec2(t * 0.008, t * 0.003);
      vec2 wind2 = vec2(-t * 0.004, t * 0.006);

      float n1 = fbm2(p * 0.0008 + wind1, 5);
      float n2 = fbm2(p * 0.003 + wind2, 3);

      // Coverage: how much of the sky is cloudy
      float coverage = 0.45;
      float density = smoothstep(coverage, coverage + 0.25, n1);
      // Detail erosion
      density *= smoothstep(0.2, 0.5, n2);
      return density;
    }

    // Cloud color with self-shadowing
    vec3 cloudColor(float density, vec3 dir, vec3 sunDir, vec3 sunCol) {
      // Brighter on sun-facing side
      float sunDot = max(dot(normalize(dir), normalize(sunDir)), 0.0);
      float scatter = pow(sunDot, 4.0) * 0.4;

      vec3 litCol = vec3(0.98, 0.96, 0.93); // bright tops
      vec3 shadowCol = vec3(0.42, 0.45, 0.52); // self-shadowed base

      // Thicker clouds are darker at base
      float shadow = 1.0 - density * 0.55;
      vec3 col = mix(shadowCol, litCol, shadow);
      col += sunCol * scatter * 0.3;
      return col;
    }

    void main() {
      // Reconstruct view direction from NDC
      vec4 farPt = uInvViewProj * vec4(vNDC, 1.0, 1.0);
      farPt.xyz /= farPt.w;
      vec3 dir = normalize(farPt.xyz - uViewPos);

      // Base atmospheric sky
      vec3 col = skyColorFromDir(dir, uSunDir, uSkyZenith, uSkyHorizon, uSunColor);

      // Rayleigh-like deep blue overhead enhancement
      float zenithFactor = pow(max(dir.y, 0.0), 1.5);
      col = mix(col, uSkyZenith * 0.9, zenithFactor * 0.3);

      // Mie-like sun glow (wider warm halo)
      float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
      float mie = pow(sunDot, 3.0) * 0.15 + pow(sunDot, 16.0) * 0.35 + pow(sunDot, 64.0) * 0.5;
      col += uSunColor * mie * smoothstep(-0.05, 0.1, dir.y) * 0.8;

      // Clouds — project onto a flat layer above viewer
      if (dir.y > 0.01) {
        float cloudHeight = 400.0; // world units above sea level
        float t = (cloudHeight - uViewPos.y) / dir.y;
        vec2 cloudPos = uViewPos.xz + dir.xz * t;

        float density = cloudDensity(cloudPos, uViewPos.x * 0.001 + 100.0);

        if (density > 0.0) {
          vec3 cCol = cloudColor(density, dir, uSunDir, uSunColor);
          // Fade clouds at horizon to blend with fog
          float horizonFade = smoothstep(0.01, 0.12, dir.y);
          float alpha = density * horizonFade * 0.92;
          col = mix(col, cCol, alpha);
        }
      }

      // Very subtle gradient banding fix (dithering-like noise)
      float dither = (snoise(vNDC * 400.0) * 0.5 + 0.5) / 255.0;
      col += dither;

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
