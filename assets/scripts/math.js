/* =========================================================================
   math.js — Vec3, Mat4, utilities. Dependency-free, allocation-light.

   We use plain Float32Array for vec3/mat4 so they upload to WebGL directly.
   Functions follow the gl-matrix style: out is the destination, returned.
   ========================================================================= */

(function (root) {
  "use strict";

  /* ------------------ scalar utilities ------------------ */
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;
  const DEG = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t)  { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function fract(x) { return x - Math.floor(x); }
  function mix(a, b, t) { return a * (1 - t) + b * t; }

  /* ============================ Vec3 ============================ */
  const Vec3 = {
    create()      { return new Float32Array(3); },
    fromValues(x, y, z) { const v = new Float32Array(3); v[0]=x; v[1]=y; v[2]=z; return v; },
    set(out, x, y, z)   { out[0]=x; out[1]=y; out[2]=z; return out; },
    copy(out, a)        { out[0]=a[0]; out[1]=a[1]; out[2]=a[2]; return out; },
    add(out, a, b)      { out[0]=a[0]+b[0]; out[1]=a[1]+b[1]; out[2]=a[2]+b[2]; return out; },
    sub(out, a, b)      { out[0]=a[0]-b[0]; out[1]=a[1]-b[1]; out[2]=a[2]-b[2]; return out; },
    scale(out, a, s)    { out[0]=a[0]*s;    out[1]=a[1]*s;    out[2]=a[2]*s;    return out; },
    addScaled(out, a, b, s) {
      out[0]=a[0]+b[0]*s; out[1]=a[1]+b[1]*s; out[2]=a[2]+b[2]*s;
      return out;
    },
    dot(a, b)           { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; },
    cross(out, a, b) {
      const ax=a[0], ay=a[1], az=a[2];
      const bx=b[0], by=b[1], bz=b[2];
      out[0]=ay*bz-az*by; out[1]=az*bx-ax*bz; out[2]=ax*by-ay*bx;
      return out;
    },
    length(a)           { return Math.hypot(a[0], a[1], a[2]); },
    lengthSq(a)         { return a[0]*a[0]+a[1]*a[1]+a[2]*a[2]; },
    distance(a, b)      { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); },
    normalize(out, a) {
      const len = Math.hypot(a[0], a[1], a[2]) || 1;
      out[0]=a[0]/len; out[1]=a[1]/len; out[2]=a[2]/len;
      return out;
    },
    lerp(out, a, b, t) {
      out[0]=a[0]+(b[0]-a[0])*t; out[1]=a[1]+(b[1]-a[1])*t; out[2]=a[2]+(b[2]-a[2])*t;
      return out;
    },
    transformMat4(out, a, m) {
      const x=a[0], y=a[1], z=a[2];
      let w = m[3]*x + m[7]*y + m[11]*z + m[15];
      if (!w) w = 1;
      out[0] = (m[0]*x + m[4]*y + m[8]*z  + m[12]) / w;
      out[1] = (m[1]*x + m[5]*y + m[9]*z  + m[13]) / w;
      out[2] = (m[2]*x + m[6]*y + m[10]*z + m[14]) / w;
      return out;
    },
  };

  /* ============================ Mat4 ============================ */
  // Column-major. Indexing:
  //   0  4  8 12
  //   1  5  9 13
  //   2  6 10 14
  //   3  7 11 15
  const Mat4 = {
    create() {
      const m = new Float32Array(16);
      m[0]=1; m[5]=1; m[10]=1; m[15]=1;
      return m;
    },
    identity(out) {
      out.fill(0);
      out[0]=1; out[5]=1; out[10]=1; out[15]=1;
      return out;
    },
    copy(out, a) {
      for (let i = 0; i < 16; i++) out[i] = a[i];
      return out;
    },
    multiply(out, a, b) {
      const a00=a[0], a01=a[1], a02=a[2], a03=a[3];
      const a10=a[4], a11=a[5], a12=a[6], a13=a[7];
      const a20=a[8], a21=a[9], a22=a[10], a23=a[11];
      const a30=a[12], a31=a[13], a32=a[14], a33=a[15];

      let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0]  = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[1]  = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[2]  = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[3]  = b0*a03 + b1*a13 + b2*a23 + b3*a33;

      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      out[4]  = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[5]  = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[6]  = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[7]  = b0*a03 + b1*a13 + b2*a23 + b3*a33;

      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      out[8]  = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[9]  = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
      return out;
    },

    // Right-handed perspective. fovy in radians.
    perspective(out, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[11] = -1;
      if (far != null && far !== Infinity) {
        const nf = 1 / (near - far);
        out[10] = (far + near) * nf;
        out[14] = 2 * far * near * nf;
      } else {
        out[10] = -1;
        out[14] = -2 * near;
      }
      return out;
    },

    // Right-handed lookAt
    lookAt(out, eye, center, up) {
      const ex=eye[0], ey=eye[1], ez=eye[2];
      const ux=up[0], uy=up[1], uz=up[2];
      const cx=center[0], cy=center[1], cz=center[2];

      let zx = ex - cx, zy = ey - cy, zz = ez - cz;
      let len = 1 / Math.hypot(zx, zy, zz);
      zx *= len; zy *= len; zz *= len;

      let xx = uy * zz - uz * zy;
      let xy = uz * zx - ux * zz;
      let xz = ux * zy - uy * zx;
      len = Math.hypot(xx, xy, xz);
      if (!len) { xx = 0; xy = 0; xz = 0; }
      else { len = 1 / len; xx *= len; xy *= len; xz *= len; }

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
      out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
      out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
      out[12] = -(xx*ex + xy*ey + xz*ez);
      out[13] = -(yx*ex + yy*ey + yz*ez);
      out[14] = -(zx*ex + zy*ey + zz*ez);
      out[15] = 1;
      return out;
    },

    translate(out, a, x, y, z) {
      if (a !== out) Mat4.copy(out, a);
      out[12] = a[0]*x + a[4]*y + a[8]*z  + a[12];
      out[13] = a[1]*x + a[5]*y + a[9]*z  + a[13];
      out[14] = a[2]*x + a[6]*y + a[10]*z + a[14];
      out[15] = a[3]*x + a[7]*y + a[11]*z + a[15];
      return out;
    },

    scaleMat(out, a, sx, sy, sz) {
      out[0]=a[0]*sx;  out[1]=a[1]*sx;  out[2]=a[2]*sx;  out[3]=a[3]*sx;
      out[4]=a[4]*sy;  out[5]=a[5]*sy;  out[6]=a[6]*sy;  out[7]=a[7]*sy;
      out[8]=a[8]*sz;  out[9]=a[9]*sz;  out[10]=a[10]*sz;out[11]=a[11]*sz;
      out[12]=a[12];   out[13]=a[13];   out[14]=a[14];   out[15]=a[15];
      return out;
    },

    rotateY(out, a, rad) {
      const s = Math.sin(rad), c = Math.cos(rad);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      if (a !== out) Mat4.copy(out, a);
      out[0]  = a00*c - a20*s;
      out[1]  = a01*c - a21*s;
      out[2]  = a02*c - a22*s;
      out[3]  = a03*c - a23*s;
      out[8]  = a00*s + a20*c;
      out[9]  = a01*s + a21*c;
      out[10] = a02*s + a22*c;
      out[11] = a03*s + a23*c;
      return out;
    },

    invert(out, a) {
      const a00=a[0], a01=a[1], a02=a[2], a03=a[3];
      const a10=a[4], a11=a[5], a12=a[6], a13=a[7];
      const a20=a[8], a21=a[9], a22=a[10], a23=a[11];
      const a30=a[12], a31=a[13], a32=a[14], a33=a[15];
      const b00 = a00*a11 - a01*a10;
      const b01 = a00*a12 - a02*a10;
      const b02 = a00*a13 - a03*a10;
      const b03 = a01*a12 - a02*a11;
      const b04 = a01*a13 - a03*a11;
      const b05 = a02*a13 - a03*a12;
      const b06 = a20*a31 - a21*a30;
      const b07 = a20*a32 - a22*a30;
      const b08 = a20*a33 - a23*a30;
      const b09 = a21*a32 - a22*a31;
      const b10 = a21*a33 - a23*a31;
      const b11 = a22*a33 - a23*a32;
      let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
      if (!det) return null;
      det = 1 / det;
      out[0]  = ( a11*b11 - a12*b10 + a13*b09) * det;
      out[1]  = (-a01*b11 + a02*b10 - a03*b09) * det;
      out[2]  = ( a31*b05 - a32*b04 + a33*b03) * det;
      out[3]  = (-a21*b05 + a22*b04 - a23*b03) * det;
      out[4]  = (-a10*b11 + a12*b08 - a13*b07) * det;
      out[5]  = ( a00*b11 - a02*b08 + a03*b07) * det;
      out[6]  = (-a30*b05 + a32*b02 - a33*b01) * det;
      out[7]  = ( a20*b05 - a22*b02 + a23*b01) * det;
      out[8]  = ( a10*b10 - a11*b08 + a13*b06) * det;
      out[9]  = (-a00*b10 + a01*b08 - a03*b06) * det;
      out[10] = ( a30*b04 - a31*b02 + a33*b00) * det;
      out[11] = (-a20*b04 + a21*b02 - a23*b00) * det;
      out[12] = (-a10*b09 + a11*b07 - a12*b06) * det;
      out[13] = ( a00*b09 - a01*b07 + a02*b06) * det;
      out[14] = (-a30*b03 + a31*b01 - a32*b00) * det;
      out[15] = ( a20*b03 - a21*b01 + a22*b00) * det;
      return out;
    },
  };

  /* ============================ Frustum (for culling) ============================ */
  // Extract 6 frustum planes from a view-projection matrix.
  // Each plane: [a, b, c, d] for ax + by + cz + d = 0 (normalized).
  function extractFrustum(out, vp) {
    const m0=vp[0], m1=vp[1], m2=vp[2], m3=vp[3];
    const m4=vp[4], m5=vp[5], m6=vp[6], m7=vp[7];
    const m8=vp[8], m9=vp[9], m10=vp[10], m11=vp[11];
    const m12=vp[12], m13=vp[13], m14=vp[14], m15=vp[15];

    // 0: left, 1: right, 2: bottom, 3: top, 4: near, 5: far
    setPlane(out, 0,  m3+m0,  m7+m4,  m11+m8,  m15+m12);
    setPlane(out, 1,  m3-m0,  m7-m4,  m11-m8,  m15-m12);
    setPlane(out, 2,  m3+m1,  m7+m5,  m11+m9,  m15+m13);
    setPlane(out, 3,  m3-m1,  m7-m5,  m11-m9,  m15-m13);
    setPlane(out, 4,  m3+m2,  m7+m6,  m11+m10, m15+m14);
    setPlane(out, 5,  m3-m2,  m7-m6,  m11-m10, m15-m14);
    return out;
  }

  function setPlane(planes, i, a, b, c, d) {
    const len = Math.hypot(a, b, c) || 1;
    const idx = i * 4;
    planes[idx]   = a / len;
    planes[idx+1] = b / len;
    planes[idx+2] = c / len;
    planes[idx+3] = d / len;
  }

  // AABB: minX, minY, minZ, maxX, maxY, maxZ
  // Returns true if the AABB is at least partially inside the frustum.
  function aabbInFrustum(planes, minX, minY, minZ, maxX, maxY, maxZ) {
    for (let i = 0; i < 6; i++) {
      const idx = i * 4;
      const a = planes[idx], b = planes[idx+1], c = planes[idx+2], d = planes[idx+3];
      // Pick the AABB corner most aligned with the plane normal
      const px = a >= 0 ? maxX : minX;
      const py = b >= 0 ? maxY : minY;
      const pz = c >= 0 ? maxZ : minZ;
      if (a*px + b*py + c*pz + d < 0) return false;
    }
    return true;
  }

  // Sphere in frustum
  function sphereInFrustum(planes, cx, cy, cz, r) {
    for (let i = 0; i < 6; i++) {
      const idx = i * 4;
      if (planes[idx]*cx + planes[idx+1]*cy + planes[idx+2]*cz + planes[idx+3] < -r) return false;
    }
    return true;
  }

  /* ============================ Public API ============================ */
  root.M = {
    TAU, HALF_PI, DEG,
    clamp, lerp, smoothstep, fract, mix,
    Vec3, Mat4,
    extractFrustum, aabbInFrustum, sphereInFrustum,
  };
})(window);
