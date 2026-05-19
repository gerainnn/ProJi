/* =========================================================================
   player.js — First-person camera & physics.

   Features:
     - Mouse look (pointer lock)
     - WASD movement (relative to camera heading)
     - Sprint (Shift)
     - Jump (Space) with gravity
     - Fly mode (F key) — hover anywhere
     - Terrain collision: always snaps to terrain height + eye offset

   Public API on window.Player:
     FPSController(canvas, sampler) → controller
     controller.update(dt) — call per frame
     controller.position → Float32Array(3)
     controller.viewMatrix → Float32Array(16)
     controller.yaw / pitch
     controller.isFlying
   ========================================================================= */

(function (root) {
  "use strict";

  const { Vec3, Mat4, clamp, DEG, HALF_PI } = root.M;

  const EYE_HEIGHT    = 1.7;
  const WALK_SPEED    = 6.0;
  const RUN_SPEED     = 14.0;
  const FLY_SPEED     = 24.0;
  const JUMP_VELOCITY = 7.0;
  const GRAVITY       = 22.0;
  const MOUSE_SENS    = 0.0018;

  function FPSController(canvas, sampler) {
    const pos = Vec3.fromValues(0, 40, 0);
    let yaw = 0;    // radians (around Y)
    let pitch = 0;  // radians (around X, clamped)
    let velY = 0;
    let onGround = false;
    let isFlying = false;
    let locked = false;

    // Input state
    const keys = {};
    window.addEventListener("keydown", (e) => { keys[e.code] = true; });
    window.addEventListener("keyup",   (e) => { keys[e.code] = false; });

    // Pointer lock
    canvas.addEventListener("click", () => {
      if (!locked) canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      locked = (document.pointerLockElement === canvas);
      document.body.classList.toggle("is-cursor", !locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!locked) return;
      yaw   -= e.movementX * MOUSE_SENS;
      pitch -= e.movementY * MOUSE_SENS;
      pitch = clamp(pitch, -HALF_PI + 0.01, HALF_PI - 0.01);
    });

    // Toggle fly mode
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyF") isFlying = !isFlying;
    });

    const forward = Vec3.create();
    const right   = Vec3.create();
    const viewMat = Mat4.create();

    function update(dt) {
      // Forward/right in XZ plane based on yaw
      forward[0] = -Math.sin(yaw);
      forward[1] = 0;
      forward[2] = -Math.cos(yaw);
      right[0] = Math.cos(yaw);
      right[1] = 0;
      right[2] = -Math.sin(yaw);

      const speed = isFlying ? FLY_SPEED :
                    keys["ShiftLeft"] || keys["ShiftRight"] ? RUN_SPEED : WALK_SPEED;

      let moveX = 0, moveZ = 0, moveY = 0;
      if (keys["KeyW"] || keys["ArrowUp"])    { moveX += forward[0]; moveZ += forward[2]; }
      if (keys["KeyS"] || keys["ArrowDown"])  { moveX -= forward[0]; moveZ -= forward[2]; }
      if (keys["KeyA"] || keys["ArrowLeft"])  { moveX -= right[0];   moveZ -= right[2]; }
      if (keys["KeyD"] || keys["ArrowRight"]) { moveX += right[0];   moveZ += right[2]; }

      const len = Math.hypot(moveX, moveZ);
      if (len > 0.001) {
        moveX /= len; moveZ /= len;
      }

      pos[0] += moveX * speed * dt;
      pos[2] += moveZ * speed * dt;

      if (isFlying) {
        if (keys["Space"])    pos[1] += speed * dt;
        if (keys["KeyQ"] || keys["ControlLeft"]) pos[1] -= speed * dt;
      } else {
        // Gravity + jump
        const groundY = sampler.height(pos[0], pos[2]) + EYE_HEIGHT;
        if (keys["Space"] && onGround) {
          velY = JUMP_VELOCITY;
          onGround = false;
        }
        velY -= GRAVITY * dt;
        pos[1] += velY * dt;

        if (pos[1] <= groundY) {
          pos[1] = groundY;
          velY = 0;
          onGround = true;
        }
      }

      // Build view matrix
      const cx = pos[0] + Math.sin(-yaw) * Math.cos(pitch);
      const cy = pos[1] + Math.sin(pitch);
      const cz = pos[2] + Math.cos(-yaw) * Math.cos(pitch);
      Mat4.lookAt(viewMat, pos, Vec3.fromValues(cx, cy, cz), Vec3.fromValues(0, 1, 0));
    }

    // Teleport (for map)
    function teleport(x, z) {
      pos[0] = x;
      pos[2] = z;
      const h = sampler.height(x, z);
      pos[1] = h + EYE_HEIGHT + (isFlying ? 20 : 0);
      velY = 0;
      onGround = false;
    }

    return {
      update,
      teleport,
      get position() { return pos; },
      get viewMatrix() { return viewMat; },
      get yaw() { return yaw; },
      get pitch() { return pitch; },
      get isFlying() { return isFlying; },
      get isLocked() { return locked; },
    };
  }

  root.Player = { FPSController };
})(window);
