import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { Gfx3Mesh } from '@lib/gfx3_mesh/gfx3_mesh';
import { createBoxMesh } from './GameUtils';
import { UT } from '@lib/core/utils';
import { BulletManager } from './Bullets';
import { Quaternion } from '@lib/core/quaternion';

class ExplosionParticle {
    position: vec3;
    velocity: vec3;
    life: number = 800 + Math.random() * 500;
    maxLife: number;
    rotationFactor: vec3;
    active: boolean = true;
    size: number;
    
    constructor(pos: vec3) {
        this.position = [...pos] as vec3;
        this.velocity = [
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80 + 30, // biased upwards
            (Math.random() - 0.5) * 80
        ];
        this.maxLife = this.life;
        this.rotationFactor = [
            Math.random() * 5,
            Math.random() * 5,
            Math.random() * 5
        ];
        this.size = 0.5 + Math.random() * 1.5;
    }

    update(ts: number) {
        this.life -= ts;
        if (this.life <= 0) this.active = false;
        
        const dt = ts / 1000;
        this.position[0] += this.velocity[0] * dt;
        this.position[1] += this.velocity[1] * dt;
        this.position[2] += this.velocity[2] * dt;
        
        this.velocity[1] -= 90 * dt; // gravity
    }
}

export class Enemy {
    position: vec3;
    active: boolean = true;
    velocity: number = 60; 
    
    yaw: number = 0;
    pitch: number = 0;
    roll: number = 0;

    health: number = 100;

    state: 'orbit' | 'attack' = 'orbit';
    attackTimer: number;
    fireTimer: number = 0;
    
    orbitAngle: number;
    orbitRadius: number;
    orbitHeight: number;
    orbitSpeed: number;

    manager: EnemyManager;

    constructor(pos: vec3, manager: EnemyManager) {
        this.position = [...pos] as vec3;
        this.manager = manager;
        
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitRadius = 150 + Math.random() * 100;
        this.orbitHeight = (Math.random() - 0.5) * 80 + 30;
        this.orbitSpeed = 0.2 + Math.random() * 0.3;
        
        this.attackTimer = 4000 + Math.random() * 6000;
        this.velocity = 45; // Start slow
    }

    update(ts: number, playerPos: vec3) {
        if (!this.active) return;
        
        let targetPos: vec3;
        
        if (this.state === 'orbit') {
            this.attackTimer -= ts;
            if (this.attackTimer <= 0) {
                this.state = 'attack';
                this.velocity = 60; // Attack speed is moderately faster but slower than player 
            }
            
            this.orbitAngle += this.orbitSpeed * (ts / 1000);
            targetPos = [
                playerPos[0] + Math.cos(this.orbitAngle) * this.orbitRadius,
                playerPos[1] + this.orbitHeight,
                playerPos[2] + Math.sin(this.orbitAngle) * this.orbitRadius
            ];
        } else {
            // attack
            // aim a bit ahead of player or directly at player
            targetPos = [playerPos[0], playerPos[1], playerPos[2]];
            
            const distToPlayer = UT.VEC3_DISTANCE(this.position, playerPos);
            if (distToPlayer < 100) { // close enough, break off
                this.state = 'orbit';
                this.attackTimer = 5000 + Math.random() * 5000;
                this.velocity = 45;
                
                // Recalculate orbit to be where we currently are so it doesn't jerk strongly
                this.orbitRadius = 150 + Math.random() * 100;
            }
            
            this.fireTimer -= ts;
            if (this.fireTimer <= 0 && distToPlayer < 300 && this.state === 'attack') {
                this.fireTimer = 400 + Math.random() * 400; // slower fire rate
                
                const forward = [
                    Math.sin(this.yaw) * Math.cos(this.pitch),
                    -Math.sin(this.pitch),
                    Math.cos(this.yaw) * Math.cos(this.pitch)
                ];
                
                // Fire bullet!
                const quat = Quaternion.createFromEuler(this.yaw, this.pitch, this.roll, 'YXZ');
                this.manager.enemyBullets.fire(this.position, forward as vec3, quat);
            }
        }
        
        // Steering
        const dir = UT.VEC3_SUBSTRACT(targetPos, this.position);
        const dist = UT.VEC3_LENGTH(dir);
        
        if (dist > 5) {
            const targetYaw = Math.atan2(dir[0], dir[2]);
            const targetPitch = Math.asin(Math.max(-1, Math.min(1, -dir[1] / dist)));
            
            let yawDiff = targetYaw - this.yaw;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            
            // Smoother and faster turning to chase
            const turnSpeed = this.state === 'attack' ? 3.5 : 1.5;
            this.yaw += yawDiff * turnSpeed * (ts / 1000);
            
            let pitchDiff = targetPitch - this.pitch;
            this.pitch += pitchDiff * turnSpeed * (ts / 1000);
            
            // Bank into turns
            let targetRoll = -yawDiff * 2.0;
            this.roll = UT.LERP(this.roll, targetRoll, 4.0 * (ts / 1000));
        }

        // Move forward
        const forward = [
            Math.sin(this.yaw) * Math.cos(this.pitch),
            -Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ];
        
        const speed = this.velocity * (ts / 1000);
        this.position[0] += forward[0] * speed;
        this.position[1] += forward[1] * speed;
        this.position[2] += forward[2] * speed;
        
        // Hard deck
        if (this.position[1] < 5.0) {
            this.position[1] = 5.0;
            this.pitch = Math.max(this.pitch, 0); // stop pointing down
        }

        // Despawn if too far
        const distToPlayerForDespawn = UT.VEC3_DISTANCE(this.position, playerPos);
        if (distToPlayerForDespawn > 900) {
            this.active = false;
        }
    }

    takeDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
            // spawn explosion
            for (let i = 0; i < 15; i++) {
                this.manager.explosions.push(new ExplosionParticle(this.position));
            }
        }
    }

    draw() {
        if (!this.active) return;
        const mat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(mat, UT.MAT4_TRANSLATE(this.position[0], this.position[1], this.position[2]), mat);
        
        UT.MAT4_MULTIPLY(mat, UT.MAT4_ROTATE_Y(this.yaw), mat);
        UT.MAT4_MULTIPLY(mat, UT.MAT4_ROTATE_X(this.pitch), mat);
        UT.MAT4_MULTIPLY(mat, UT.MAT4_ROTATE_Z(this.roll), mat);
        
        // Body
        gfx3MeshRenderer.drawMesh(this.manager.bodyMesh, mat);
        
        // Wing
        const wingMat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(wingMat, mat, wingMat);
        UT.MAT4_MULTIPLY(wingMat, UT.MAT4_TRANSLATE(0, 0, -0.2), wingMat);
        gfx3MeshRenderer.drawMesh(this.manager.wingMesh, wingMat);
        
        // Cockpit
        const cockMat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(cockMat, mat, cockMat);
        UT.MAT4_MULTIPLY(cockMat, UT.MAT4_TRANSLATE(0, 0.4, 0.5), cockMat);
        gfx3MeshRenderer.drawMesh(this.manager.cockpitMesh, cockMat);
        
        // Engine Left
        const elMat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(elMat, mat, elMat);
        UT.MAT4_MULTIPLY(elMat, UT.MAT4_TRANSLATE(-0.6, 0.1, -1.2), elMat);
        gfx3MeshRenderer.drawMesh(this.manager.engineMesh, elMat);
        
        // Engine Right
        const erMat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(erMat, mat, erMat);
        UT.MAT4_MULTIPLY(erMat, UT.MAT4_TRANSLATE(0.6, 0.1, -1.2), erMat);
        gfx3MeshRenderer.drawMesh(this.manager.engineMesh, erMat);
        
        // V-Tail Left
        const tLMat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(tLMat, mat, tLMat);
        UT.MAT4_MULTIPLY(tLMat, UT.MAT4_TRANSLATE(-0.5, 0.5, -1.2), tLMat);
        UT.MAT4_MULTIPLY(tLMat, UT.MAT4_ROTATE_Z(-0.3), tLMat);
        gfx3MeshRenderer.drawMesh(this.manager.tailMesh, tLMat);
        
        // V-Tail Right
        const tRMat = UT.MAT4_IDENTITY();
        UT.MAT4_MULTIPLY(tRMat, mat, tRMat);
        UT.MAT4_MULTIPLY(tRMat, UT.MAT4_TRANSLATE(0.5, 0.5, -1.2), tRMat);
        UT.MAT4_MULTIPLY(tRMat, UT.MAT4_ROTATE_Z(0.3), tRMat);
        gfx3MeshRenderer.drawMesh(this.manager.tailMesh, tRMat);
    }
}

export class EnemyManager {
    enemies: Enemy[] = [];
    enemyBullets: BulletManager;
    explosions: ExplosionParticle[] = [];
    score: number = 0;
    
    // Meshes
    bodyMesh: Gfx3Mesh;
    wingMesh: Gfx3Mesh;
    cockpitMesh: Gfx3Mesh;
    engineMesh: Gfx3Mesh;
    tailMesh: Gfx3Mesh;
    explosionMesh: Gfx3Mesh;
    
    constructor() {
        this.enemyBullets = new BulletManager([1.0, 0.2, 0.1]); // Red bullets
        
        // Stealth/Sci-fi dark fighter colors
        const bodyColor = [0.15, 0.15, 0.15];
        const darkMetal = [0.1, 0.1, 0.1];
        const glassColor = [1.0, 0.0, 0.0]; // evil red eye
        const engineGlow = [1.0, 0.3, 0.0];
        
        this.bodyMesh = createBoxMesh(1.2, 0.8, 3.0, bodyColor);
        // swept forward wing
        this.wingMesh = createBoxMesh(6.0, 0.1, 1.2, darkMetal);
        this.cockpitMesh = createBoxMesh(0.5, 0.3, 0.8, glassColor);
        this.engineMesh = createBoxMesh(0.4, 0.4, 1.0, engineGlow);
        this.tailMesh = createBoxMesh(0.1, 1.0, 0.8, darkMetal);
        
        // simple red/orange mesh for explosion parts
        this.explosionMesh = createBoxMesh(1.0, 1.0, 1.0, [1.0, 0.4, 0.0]);
    }

    spawn(pos: vec3) {
        this.enemies.push(new Enemy(pos, this));
    }

    update(ts: number, playerPos: vec3, playerRot: Quaternion, playerBullets: BulletManager) {
        this.enemyBullets.update(ts);
        
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].update(ts);
            if (!this.explosions[i].active) {
                this.explosions.splice(i, 1);
            }
        }
        
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(ts, playerPos);
            
            // Check collision with player bullets
            for (const b of playerBullets.bullets) {
                if (!b.active) continue;
                const dist = UT.VEC3_DISTANCE(e.position, b.position);
                if (dist < 15.0) { // More generous hit radius
                    b.active = false;
                    e.takeDamage(25);
                    if (!e.active) {
                        this.score += 100;
                    }
                    break;
                }
            }
            
            if (!e.active) {
                this.enemies.splice(i, 1);
            }
        }

        // Keep 5 enemies active total
        if (this.enemies.length < 5) {
            // Spawn in front of the player
            // playerRot -> forward vector
            const forward = playerRot.rotateVector([0, 0, -1]);
            const right = playerRot.rotateVector([1, 0, 0]);
            
            const spawnBaseDist = 400 + Math.random() * 200;
            const lateralOffset = (Math.random() - 0.5) * 300;
            const verticalOffset = (Math.random() - 0.5) * 200 + 50;
            
            const sx = playerPos[0] + forward[0] * spawnBaseDist + right[0] * lateralOffset;
            const sy = Math.max(80, playerPos[1] + forward[1] * spawnBaseDist + verticalOffset);
            const sz = playerPos[2] + forward[2] * spawnBaseDist + right[2] * lateralOffset;
            
            const e = new Enemy([sx, sy, sz], this);
            
            // point them towards player to start
            const dir = UT.VEC3_SUBSTRACT(playerPos, [sx, sy, sz]);
            e.yaw = Math.atan2(dir[0], dir[2]);
            this.enemies.push(e);
        }
    }

    draw() {
        for (const e of this.enemies) {
            e.draw();
        }
        for (const p of this.explosions) {
            const mat = UT.MAT4_IDENTITY();
            const scale = (p.life / p.maxLife) * p.size;
            UT.MAT4_MULTIPLY(mat, UT.MAT4_TRANSLATE(p.position[0], p.position[1], p.position[2]), mat);
            UT.MAT4_MULTIPLY(mat, UT.MAT4_ROTATE_Y(p.life * p.rotationFactor[0] * 0.01), mat);
            UT.MAT4_MULTIPLY(mat, UT.MAT4_ROTATE_X(p.life * p.rotationFactor[1] * 0.01), mat);
            UT.MAT4_MULTIPLY(mat, UT.MAT4_SCALE(scale, scale, scale), mat);
            gfx3MeshRenderer.drawMesh(this.explosionMesh, mat);
        }
        this.enemyBullets.draw();
    }
}
