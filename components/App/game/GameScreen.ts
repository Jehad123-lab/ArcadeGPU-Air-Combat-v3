/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { em } from '@lib/engine/engine_manager';
import { screenManager } from '@lib/screen/screen_manager';
import { Screen } from '@lib/screen/screen';
import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { gfx3PostRenderer, PostParam } from '@lib/gfx3_post/gfx3_post_renderer';
import { gfx3JoltManager } from '@lib/gfx3_jolt/gfx3_jolt_manager';
import { Gfx3Camera } from '@lib/gfx3_camera/gfx3_camera';
import { Quaternion } from '@lib/core/quaternion';
import { UT } from '@lib/core/utils';
import { eventManager } from '@lib/core/event_manager';
import { inputManager } from '@lib/input/input_manager';
import { Plane } from './Plane';
import { Environment } from './Environment';
import { BulletManager } from './Bullets';
import { EnemyManager } from './Enemies';

export class GameScreen extends Screen {
  camera: Gfx3Camera;
  plane: Plane;
  level: Environment;
  bulletManager: BulletManager;
  enemyManager: EnemyManager;
  fireCooldown: number = 0;
  moveDir = { x: 0, y: 0 };
  
  cameraLookTarget: vec3 = [0, 0, 0];
  cameraRollLerp: number = 0.5;
  isReady: boolean = false;
  
  frameMouseX: number = 0;
  frameMouseY: number = 0;
  
  virtualMouseX: number = 0;
  virtualMouseY: number = 0;

  nextWingLeft: boolean = true;
  
  constructor() {
    super();
    this.camera = new Gfx3Camera(0);
    this.plane = new Plane();
    this.level = new Environment();
    this.bulletManager = new BulletManager([0.1, 0.8, 1.0]); // Glowing cyan player lasers
    this.enemyManager = new EnemyManager();
  }

  async onEnter() {
    gfx3PostRenderer.setParam(PostParam.PIXELATION_ENABLED, 0.0);
    
    // Load Models
    await Promise.all([
      this.plane.load()
    ]);
    
    // Desktop Controls
    inputManager.registerAction('keyboard', 'KeyW', 'THR_UP');
    inputManager.registerAction('keyboard', 'KeyS', 'THR_DOWN');
    inputManager.registerAction('keyboard', 'KeyA', 'ROLL_LEFT');
    inputManager.registerAction('keyboard', 'KeyD', 'ROLL_RIGHT');
    inputManager.registerAction('keyboard', 'KeyQ', 'YAW_LEFT');
    inputManager.registerAction('keyboard', 'KeyE', 'YAW_RIGHT');
    inputManager.registerAction('keyboard', 'ArrowUp', 'PITCH_DOWN'); 
    inputManager.registerAction('keyboard', 'ArrowDown', 'PITCH_UP');
    inputManager.registerAction('keyboard', 'ArrowLeft', 'YAW_LEFT');
    inputManager.registerAction('keyboard', 'ArrowRight', 'YAW_RIGHT');
    inputManager.registerAction('keyboard', 'ShiftLeft', 'SPECIAL_MOVE');
    inputManager.registerAction('keyboard', 'ShiftRight', 'SPECIAL_MOVE');
    inputManager.registerAction('keyboard', 'Space', 'FIRE');

    inputManager.setPointerLockEnabled(true);
    eventManager.subscribe(inputManager, 'E_MOUSE_MOVE', this, this.handleMouseMove);

    this.camera.setPosition(0, 10, -10);
    this.camera.lookAt(0, 0, 0);
    this.camera.getView().setBgColor(0.53, 0.81, 0.92, 1.0); // Sky blue
    
    const planePos = this.plane.getPosition();
    this.cameraLookTarget = [planePos[0], planePos[1] + 1.5, planePos[2]];
    this.isReady = true;

    // Spawn initial enemies
    this.enemyManager.spawn([0, 50, -300]);
    this.enemyManager.spawn([100, 40, -250]);
  }

  handleMouseMove = (data: any) => {
    // Accumulate mouse movement
    if (inputManager.isPointerLockCaptured()) {
        this.frameMouseX += data.movementX;
        this.frameMouseY += data.movementY;
    }
  };

  update(ts: number) {
    inputManager.update(ts);
    gfx3JoltManager.update(ts);

    let rollInput = 0;
    let pitchInput = 0;
    let yawInput = 0;
    let throttleInput = 0;
    let specialMove = false;
    let fireInput = false;
    
    if (inputManager.isActiveAction('ROLL_LEFT')) rollInput += 1;
    if (inputManager.isActiveAction('ROLL_RIGHT')) rollInput -= 1;
    if (inputManager.isActiveAction('PITCH_DOWN')) pitchInput -= 1;
    if (inputManager.isActiveAction('PITCH_UP')) pitchInput += 1;
    if (inputManager.isActiveAction('YAW_LEFT')) yawInput += 1;
    if (inputManager.isActiveAction('YAW_RIGHT')) yawInput -= 1;
    if (inputManager.isActiveAction('THR_UP')) throttleInput += 1;
    if (inputManager.isActiveAction('THR_DOWN')) throttleInput -= 1;
    if (inputManager.isActiveAction('SPECIAL_MOVE')) specialMove = true;
    if (inputManager.isActiveAction('FIRE') || inputManager.isMouseDown()) fireInput = true;
    
    // Also use mouse for pitch/yaw if pointer is locked
    if (inputManager.isPointerLockCaptured()) {
        
        if (Math.abs(this.frameMouseX) > 0 || Math.abs(this.frameMouseY) > 0) {
            this.virtualMouseX += this.frameMouseX * 0.005;
            this.virtualMouseY += this.frameMouseY * 0.005;
        } else {
            const mouseSmooth = Math.exp(-4.0 * (ts / 1000));
            this.virtualMouseX *= mouseSmooth;
            this.virtualMouseY *= mouseSmooth;
        }
        
        this.virtualMouseX = Math.max(-1, Math.min(1, this.virtualMouseX));
        this.virtualMouseY = Math.max(-1, Math.min(1, this.virtualMouseY));
        
        yawInput -= this.virtualMouseX * 0.3; 
        rollInput -= this.virtualMouseX * 1.0; 
        pitchInput -= this.virtualMouseY * 1.0; // Inverted for regular FPS-style up/down
        
        yawInput = Math.max(-1, Math.min(1, yawInput));
        rollInput = Math.max(-1, Math.min(1, rollInput));
        pitchInput = Math.max(-1, Math.min(1, pitchInput));
    }
    this.frameMouseX = 0;
    this.frameMouseY = 0;

    this.level.update(ts);
    this.plane.update(ts, rollInput, pitchInput, yawInput, throttleInput, specialMove);

    if (this.fireCooldown > 0) {
        this.fireCooldown -= ts;
    }
    if (fireInput && this.fireCooldown <= 0 && !this.plane.isLanded) {
        this.fireCooldown = 60.0; // Faster machine-gun style firing
        
        // Shoot from under wings
        const planePos = this.plane.getPosition();
        const planeRot = this.plane.rotation;
        const forward = planeRot.rotateVector([0, 0, -1]);
        const right = planeRot.rotateVector([1, 0, 0]);
        const down = planeRot.rotateVector([0, -1, 0]);
        
        // Convergence point 200 units ahead
        const targetPoint = [
            planePos[0] + forward[0] * 200,
            planePos[1] + forward[1] * 200,
            planePos[2] + forward[2] * 200
        ] as vec3;
        
        if (this.nextWingLeft) {
            // Left wing gun
            const leftWingGun = [
                planePos[0] - right[0] * 3.0 + down[0] * 0.5,
                planePos[1] - right[1] * 3.0 + down[1] * 0.5,
                planePos[2] - right[2] * 3.0 + down[2] * 0.5,
            ] as vec3;
            // Direction from gun to target
            const aimDir = UT.VEC3_SUBSTRACT(targetPoint, leftWingGun);
            this.bulletManager.fire(leftWingGun, UT.VEC3_NORMALIZE(aimDir), planeRot);
        } else {
            // Right wing gun
            const rightWingGun = [
                planePos[0] + right[0] * 3.0 + down[0] * 0.5,
                planePos[1] + right[1] * 3.0 + down[1] * 0.5,
                planePos[2] + right[2] * 3.0 + down[2] * 0.5,
            ] as vec3;
            const aimDir = UT.VEC3_SUBSTRACT(targetPoint, rightWingGun);
            this.bulletManager.fire(rightWingGun, UT.VEC3_NORMALIZE(aimDir), planeRot);
        }
        
        this.nextWingLeft = !this.nextWingLeft;
    }
    
    this.bulletManager.update(ts);
    this.enemyManager.update(ts, this.plane.getPosition(), this.plane.rotation, this.bulletManager);

    // Player damage logic (only visual for now, as requested)
    for (const b of this.enemyManager.enemyBullets.bullets) {
        if (!b.active) continue;
        const dist = UT.VEC3_DISTANCE(this.plane.getPosition(), b.position);
        if (dist < 8.0) { // Hit radius for player
            b.active = false;
            this.plane.health = Math.max(0, this.plane.health - 5);
        }
    }

    // Camera follow the plane smoothly
    const followPos = this.plane.getPosition();
    const planeRot = this.plane.rotation;
    
    const forwardVec = planeRot.rotateVector([0, 0, -1]);
    const planeUp = planeRot.rotateVector([0, 1, 0]);
    
    // Cinematic pull-back effect during barrel roll
    const rollT = this.plane.isBarrelRolling ? this.plane.barrelRollProgress : 0;
    const rollBlend = Math.sin(rollT * Math.PI); // Smooth bell curve 0 -> 1 -> 0
    
    // Dynamic camera back offset based on velocity
    const speedFactor = Math.max(0, (this.plane.velocity - 50) / 100.0);
    let zOffset = 18 + speedFactor * 8.0 + rollBlend * 12.0; 
    let yOffset = 4 + speedFactor * 2.0;

    // Smoothly blend out camera roll during barrel roll so the universe doesn't spin wildly
    const targetCameraRoll = 0.5 * (1.0 - rollBlend * 0.9); // goes from 0.5 to 0.05
    this.cameraRollLerp = UT.LERP(this.cameraRollLerp, targetCameraRoll, 1.0 - Math.exp(-8.0 * (ts / 1000)));
    
    // Static Up vector, but we blend it with planeUp so camera can pass zenith in loops 
    // At high pitch (pointing up/down), we must lean more on planeUp to avoid gimbal lock!
    const pitchAbs = Math.abs(forwardVec[1]);
    // As pitch approaches 1 (zenith), we fully use planeUp
    const zenithBlend = Math.pow(pitchAbs, 4.0); // 0 at level, ~1 at vertical
    const effectiveRollLerp = Math.max(this.cameraRollLerp, zenithBlend);
    
    const staticUp: vec3 = [0, 1, 0];
    const cameraUp = UT.VEC3_NORMALIZE(UT.VEC3_LERP(staticUp, planeUp, effectiveRollLerp));
    
    // Now construct offset using forwardVec and our safe cameraUp
    const rightVec = UT.VEC3_NORMALIZE(UT.VEC3_CROSS(forwardVec, cameraUp)); // careful if parallel, but zenithBlend prevents it
    // Actual orthogonal up
    const orthoUp = UT.VEC3_NORMALIZE(UT.VEC3_CROSS(rightVec, forwardVec));
    
    const camOffset = [
        -forwardVec[0] * zOffset + orthoUp[0] * yOffset,
        -forwardVec[1] * zOffset + orthoUp[1] * yOffset,
        -forwardVec[2] * zOffset + orthoUp[2] * yOffset
    ] as vec3;
    
    if (!followPos || isNaN(followPos[0]) || isNaN(followPos[1]) || isNaN(followPos[2])) {
        return;
    }

    const camTarget = [
        followPos[0] + camOffset[0],
        followPos[1] + camOffset[1],
        followPos[2] + camOffset[2]
    ] as vec3;
    
    const camPos = this.camera.getPosition();
    
    // Smoothly loosen the camera follow rate during barrel roll to let plane drift in frame
    let posStrength = 15.0 * (1.0 - rollBlend * 0.75); // goes from 15 -> 3.75
    let targetStrength = 20.0 * (1.0 - rollBlend * 0.7); // goes from 20 -> 6.0

    let posLerpRate = 1.0 - Math.exp(-posStrength * (ts / 1000));
    let targetLerpRate = 1.0 - Math.exp(-targetStrength * (ts / 1000));

    const lerpedPos = UT.VEC3_LERP(camPos, camTarget, posLerpRate);
    const desiredLookTarget = [
        followPos[0] - forwardVec[0] * 5.0, // Look slightly ahead of the plane, not just at it
        followPos[1] - forwardVec[1] * 5.0 + 2.0, 
        followPos[2] - forwardVec[2] * 5.0
    ] as vec3;
    
    this.cameraLookTarget = UT.VEC3_LERP(this.cameraLookTarget, desiredLookTarget, targetLerpRate);
    
    if (!isNaN(lerpedPos[0]) && !isNaN(lerpedPos[1]) && !isNaN(lerpedPos[2])) {
        // Camera shake at high speeds
        let shakeX = 0, shakeY = 0, shakeZ = 0;
        if (speedFactor > 0.5) {
            const shakeMag = (speedFactor - 0.5) * 0.8; // Reduced shake magnitude
            shakeX = (Math.random() - 0.5) * shakeMag;
            shakeY = (Math.random() - 0.5) * shakeMag;
            shakeZ = (Math.random() - 0.5) * shakeMag;
        }
        
        this.camera.setPosition(lerpedPos[0] + shakeX, lerpedPos[1] + shakeY, lerpedPos[2] + shakeZ);
        this.camera.lookAt(this.cameraLookTarget[0] + shakeX * 0.2, this.cameraLookTarget[1] + shakeY * 0.2, this.cameraLookTarget[2] + shakeZ * 0.2, cameraUp);
    }
    
    // Expand FOV with speed for dramatic effect
    // Fovy is in radians... default is Math.PI/3 (60 degrees)
    const baseFov = Math.PI / 3;
    const maxFov = Math.PI / 2; // 90 degrees
    const targetFov = baseFov + speedFactor * (maxFov - baseFov);
    const currentFov = this.camera.getPerspectiveFovy() || baseFov;
    this.camera.setPerspectiveFovy(UT.LERP(currentFov, targetFov, 2.0 * (ts/1000)));
  }

  draw() {
    gfx3Manager.beginDrawing();
    gfx3MeshRenderer.drawDirLight([0.3, -1.0, 0.4], [1.0, 0.95, 0.9], [1.0, 1.0, 1.0], 1.5);
    gfx3MeshRenderer.setAmbientColor([0.5, 0.55, 0.65]); // Brighter ambient

    const camPos = this.camera.getPosition();
    
    // Slight fog effect by simulating fog with post process or clear color? 
    // ArcadeGPU might not have fog, but we have a sky blue bg.

    this.level.draw(camPos);
    this.plane.draw();
    
    this.bulletManager.draw();
    this.enemyManager.draw();
    
    gfx3Manager.endDrawing();
  }

  render(ts: number) {
    if (!this.isReady) return;
    
    gfx3Manager.beginRender();
    
    gfx3Manager.setDestinationTexture(gfx3PostRenderer.getSourceTexture());
    gfx3Manager.beginPassRender(0);
    gfx3MeshRenderer.render(ts);
    gfx3Manager.endPassRender();
    
    gfx3Manager.setDestinationTexture(null);
    gfx3PostRenderer.render(ts, gfx3Manager.getCurrentRenderingTexture());
    
    gfx3Manager.endRender();
  }
}
