/**
 * Core Game Engine for Ronin's Edge.
 * Manages fixed-timestep game loop, Three.js rendering, post-processing,
 * player physics & input, spring-arm camera, Sekiro-style combat & posture,
 * enemy AI state machines, General Kageyama boss encounter, and particle pooling.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { sound } from './audio';
import { textures } from './textures';
import { SamuraiRig, AnimState } from './characters';
import { WorldBuilder, GrapplePoint, Checkpoint } from './world';

// =====================================================
// 1. GAME CONFIGURATION & BALANCE TUNABLES
// =====================================================
export const CONFIG = {
  // Difficulty settings
  difficulty: 'normal' as 'easy' | 'normal' | 'hard',
  deflectWindow: {
    easy: 0.28,
    normal: 0.20,
    hard: 0.14,
  },
  spamPenaltyWindow: 0.08,
  spamPenaltyThreshold: 0.45,

  // Player movement
  moveSpeed: 5.2,
  sprintSpeed: 9.0,
  crouchSpeed: 2.2,
  grappleSpeed: 26.0,
  dodgeSpeed: 12.5,
  dodgeDuration: 0.28,
  dodgeCooldown: 0.5,
  invincibilityDuration: 0.28,
  jumpForce: 7.2,
  gravity: 21.0,

  // Player combat
  maxHealth: 100,
  maxPosture: 100,
  postureRecoveryRate: 12, // per second when idle
  postureGuardRecoveryBonus: 10,
  blockPostureDamage: 22,
  deflectPostureDamageToEnemy: 36,
  deflectPostureDamageToPlayer: 2,
  gourdHealPercent: 0.65,
  maxGourdCharges: 3,

  // Camera
  camDistance: 4.6,
  camHeight: 1.85,
  camShoulderOffset: 0.35,
  camFov: 65,
  mouseSensitivity: 0.0022,
  lockOnSmoothness: 8.0,

  // Hit-stop & juice
  hitStopDeflect: 0.065,
  hitStopHit: 0.045,
  screenShakeDeflect: 0.18,
  screenShakeHit: 0.12,
  screenShakeBossSlam: 0.35,
};

export type CombatStance = 'water' | 'flame' | 'thunder';

export interface HitOptions {
  damage?: number;
  posture?: number;
  isSpecial?: boolean;
  breaksBlock?: boolean;
  piercesGuard?: boolean;
}

export interface SlashWave {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  maxAge: number;
  initialScale: number;
  targetScale: number;
}

export interface ShockwaveFX {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  maxAge: number;
  targetScale: number;
}

export interface Fighter {
  id: string;
  name: string;
  type: 'player' | 'soldier' | 'boss' | 'dummy';
  rig: SamuraiRig;
  position: THREE.Vector3;
  rotationY: number;
  velocity: THREE.Vector3;
  health: number;
  maxHealth: number;
  posture: number;
  maxPosture: number;
  isStaggered: boolean;
  staggerTimer: number;
  isDead: boolean;
  isGuarding: boolean;
  isDeflecting: boolean;
  isDodging: boolean;
  dodgeTimer: number;
  dodgeCooldownTimer: number;
  invincibleTimer: number;
  hitFlashTimer?: number;
  isAttacking: boolean;
  attackComboStep: number;
  attackTimer: number;
  attackCooldown: number;
  perilousType: 'none' | 'thrust' | 'sweep';
  perilousTimer: number;
  perilousWarningShown: boolean;
  // AI fields
  aiState?: 'idle' | 'patrol' | 'suspicious' | 'alert' | 'combat' | 'staggered' | 'dead';
  patrolOrigin?: THREE.Vector3;
  patrolTarget?: THREE.Vector3;
  aiTimer?: number;
  suspicionLevel?: number; // 0 to 1
  bossPhase?: number; // 1, 2, or 3
  bossSegments?: number; // 3 segments
  lastGuardTime?: number;
}

export interface SparkParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export interface PetalParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  swingPhase: number;
}

export type GameState = 'menu' | 'playing' | 'paused' | 'death' | 'victory' | 'cutscene';

export class GameEngine {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;

  world: WorldBuilder;
  player!: Fighter;
  enemies: Fighter[] = [];
  trainingDummy!: Fighter;
  boss?: Fighter;

  // Combat Stance & Special Arts
  currentStance: CombatStance = 'water';
  specialArtCharge: number = 100; // 0 to 100
  slashWaves: SlashWave[] = [];
  shockwaves: ShockwaveFX[] = [];

  gameState: GameState = 'menu';
  resurrectionAvailable: boolean = true;
  gourdCharges: number = CONFIG.maxGourdCharges;
  isCrouching: boolean = false;
  isGrounded: boolean = true;
  verticalVelocity: number = 0;

  // Camera & Lock-on
  cameraYaw: number = 0;
  cameraPitch: number = 0.2;
  currentCamDist: number = CONFIG.camDistance;
  lockedTarget: Fighter | null = null;
  shakeIntensity: number = 0;
  hitStopTimer: number = 0;
  screenFlashAlpha: number = 0;

  // Grappling hook
  activeGrappleTarget: GrapplePoint | null = null;
  isGrappling: boolean = false;
  grappleProgress: number = 0;
  grappleStartPos: THREE.Vector3 = new THREE.Vector3();
  grappleLine!: THREE.Line;

  // Input states
  keys: { [key: string]: boolean } = {};
  isMouseDownLeft: boolean = false;
  isMouseDownRight: boolean = false;
  pointerLocked: boolean = false;
  lastGuardPressTime: number = -10;
  deflectSuccessWindow: number = 0;

  // Particle systems
  sparksPool: SparkParticle[] = [];
  sparksGeometry!: THREE.BufferGeometry;
  sparksPoints!: THREE.Points;
  petals: PetalParticle[] = [];
  petalsGeometry!: THREE.BufferGeometry;
  petalsPoints!: THREE.Points;

  // Callbacks for UI updates
  onHUDUpdate?: () => void;
  onStateChange?: (state: GameState) => void;
  onCinematicBanner?: (title: string, subtitle: string) => void;
  onStanceChange?: (stance: CombatStance) => void;
  onSpecialArtChange?: (charge: number) => void;

  private clock = new THREE.Clock();
  private fixedTimeStep = 1 / 60;
  private accumulator = 0;
  private animationFrameId: number = 0;
  private isDestroyed = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene setup
    this.scene = new THREE.Scene();

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camFov,
      container.clientWidth / container.clientHeight,
      0.1,
      350
    );

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Post-processing setup (Bloom & Color Grade)
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.65, // strength
      0.45, // radius
      0.82  // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // 5. World geometry
    this.world = new WorldBuilder(this.scene);
    this.world.buildAll();

    // 6. Setup actors, particles, grappling hook, inputs
    this.initCharacters();
    this.initParticles();
    this.initGrappleLine();
    this.initInputListeners();

    // 7. Start render loop
    this.startLoop();
  }

  private initCharacters() {
    // --- PLAYER ---
    const playerRig = new SamuraiRig('player');
    this.scene.add(playerRig.joints.root);
    this.player = {
      id: 'player',
      name: 'The Lone Wolf',
      type: 'player',
      rig: playerRig,
      position: new THREE.Vector3(0, 0, 18),
      rotationY: 0,
      velocity: new THREE.Vector3(),
      health: CONFIG.maxHealth,
      maxHealth: CONFIG.maxHealth,
      posture: 0,
      maxPosture: CONFIG.maxPosture,
      isStaggered: false,
      staggerTimer: 0,
      isDead: false,
      isGuarding: false,
      isDeflecting: false,
      isDodging: false,
      dodgeTimer: 0,
      dodgeCooldownTimer: 0,
      invincibleTimer: 0,
      isAttacking: false,
      attackComboStep: 0,
      attackTimer: 0,
      attackCooldown: 0,
      perilousType: 'none',
      perilousTimer: 0,
      perilousWarningShown: false,
    };
    this.player.rig.joints.root.position.copy(this.player.position);

    // --- TRAINING DUMMY IN DOJO ---
    const dummyRig = new SamuraiRig('dummy');
    dummyRig.joints.root.position.set(-16, 0, 14);
    this.scene.add(dummyRig.joints.root);
    this.trainingDummy = {
      id: 'training_dummy',
      name: 'Training Dummy',
      type: 'dummy',
      rig: dummyRig,
      position: new THREE.Vector3(-16, 0, 14),
      rotationY: 0,
      velocity: new THREE.Vector3(),
      health: 100,
      maxHealth: 100,
      posture: 0,
      maxPosture: 100,
      isStaggered: false,
      staggerTimer: 0,
      isDead: false,
      isGuarding: false,
      isDeflecting: false,
      isDodging: false,
      dodgeTimer: 0,
      dodgeCooldownTimer: 0,
      invincibleTimer: 0,
      isAttacking: false,
      attackComboStep: 0,
      attackTimer: 0,
      attackCooldown: 0,
      perilousType: 'none',
      perilousTimer: 0,
      perilousWarningShown: false,
      aiState: 'combat',
    };
    this.enemies.push(this.trainingDummy);

    // --- LEVEL 1 ASHIGARU SOLDIERS ---
    const soldierSpawns = [
      new THREE.Vector3(-8, 0, 2),
      new THREE.Vector3(8, 0, 4),
      new THREE.Vector3(-14, 0, -14),
      new THREE.Vector3(12, 0, -16),
      new THREE.Vector3(0, 0, -18),
    ];

    soldierSpawns.forEach((spawn, idx) => {
      const rig = new SamuraiRig('soldier');
      this.scene.add(rig.joints.root);
      const enemy: Fighter = {
        id: `soldier_${idx}`,
        name: `Ashigaru Spearman ${idx + 1}`,
        type: 'soldier',
        rig,
        position: spawn.clone(),
        rotationY: Math.PI + (idx % 2 === 0 ? 0.3 : -0.3),
        velocity: new THREE.Vector3(),
        health: 80,
        maxHealth: 80,
        posture: 0,
        maxPosture: 80,
        isStaggered: false,
        staggerTimer: 0,
        isDead: false,
        isGuarding: false,
        isDeflecting: false,
        isDodging: false,
        dodgeTimer: 0,
        dodgeCooldownTimer: 0,
        invincibleTimer: 0,
        isAttacking: false,
        attackComboStep: 0,
        attackTimer: 0,
        attackCooldown: 1.5 + Math.random() * 1.5,
        perilousType: 'none',
        perilousTimer: 0,
        perilousWarningShown: false,
        aiState: 'patrol',
        patrolOrigin: spawn.clone(),
        patrolTarget: spawn.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)),
        aiTimer: Math.random() * 3,
        suspicionLevel: 0,
      };
      rig.joints.root.position.copy(enemy.position);
      rig.joints.root.rotation.y = enemy.rotationY;
      this.enemies.push(enemy);
    });

    // --- LEVEL 2 BOSS: GENERAL KAGEYAMA ---
    const bossRig = new SamuraiRig('boss');
    this.scene.add(bossRig.joints.root);
    this.boss = {
      id: 'boss_kageyama',
      name: 'General Kageyama - The Iron Warlord',
      type: 'boss',
      rig: bossRig,
      position: new THREE.Vector3(0, 0.6, -42),
      rotationY: 0,
      velocity: new THREE.Vector3(),
      health: 220,
      maxHealth: 220,
      posture: 0,
      maxPosture: 160,
      isStaggered: false,
      staggerTimer: 0,
      isDead: false,
      isGuarding: false,
      isDeflecting: false,
      isDodging: false,
      dodgeTimer: 0,
      dodgeCooldownTimer: 0,
      invincibleTimer: 0,
      isAttacking: false,
      attackComboStep: 0,
      attackTimer: 0,
      attackCooldown: 2.0,
      perilousType: 'none',
      perilousTimer: 0,
      perilousWarningShown: false,
      aiState: 'idle',
      bossPhase: 1,
      bossSegments: 3,
      aiTimer: 0,
    };
    bossRig.joints.root.position.copy(this.boss.position);
    this.enemies.push(this.boss);
  }

  // =====================================================
  // 2. PARTICLE SYSTEMS (OBJECT POOLING)
  // =====================================================
  private initParticles() {
    // 1. Deflect spark pool
    const sparkCount = 120;
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkColors = new Float32Array(sparkCount * 3);
    const sparkSizes = new Float32Array(sparkCount);

    this.sparksGeometry = new THREE.BufferGeometry();
    this.sparksGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    this.sparksGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
    this.sparksGeometry.setAttribute('size', new THREE.BufferAttribute(sparkSizes, 1));

    const sparkTexture = textures.createSparkTexture();
    const sparkMat = new THREE.PointsMaterial({
      size: 0.65,
      map: sparkTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
    });

    this.sparksPoints = new THREE.Points(this.sparksGeometry, sparkMat);
    this.scene.add(this.sparksPoints);

    for (let i = 0; i < sparkCount; i++) {
      this.sparksPool.push({
        active: false,
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.4,
        size: 0.5,
        color: new THREE.Color(1, 0.8, 0.4),
      });
    }

    // 2. Ambient falling cherry blossom petals
    const petalCount = 180;
    const petalPositions = new Float32Array(petalCount * 3);
    this.petalsGeometry = new THREE.BufferGeometry();
    this.petalsGeometry.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));

    const petalTexture = textures.createPetalTexture();
    const petalMat = new THREE.PointsMaterial({
      size: 0.45,
      map: petalTexture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    this.petalsPoints = new THREE.Points(this.petalsGeometry, petalMat);
    this.scene.add(this.petalsPoints);

    for (let i = 0; i < petalCount; i++) {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 100,
        Math.random() * 22,
        (Math.random() - 0.5) * 100
      );
      this.petals.push({
        pos,
        vel: new THREE.Vector3(-0.6 - Math.random() * 0.8, -0.7 - Math.random() * 0.5, (Math.random() - 0.5) * 0.6),
        rot: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, 0),
        rotSpeed: new THREE.Vector3(Math.random() * 2, Math.random() * 2, 0),
        swingPhase: Math.random() * Math.PI * 2,
      });
    }

    // 3. 3D Crescent Slash Waves Pool
    const slashGeo = new THREE.PlaneGeometry(3.6, 3.6);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: textures.createSlashArcTexture('#70d6ff', '#ffffff'),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(slashGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.slashWaves.push({
        mesh,
        active: false,
        age: 0,
        maxAge: 0.18,
        initialScale: 0.8,
        targetScale: 2.2,
      });
    }

    // 4. Ground/Impact Shockwaves Pool
    const shockGeo = new THREE.RingGeometry(0.1, 2.6, 32);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: textures.createShockwaveRingTexture('#ffaa33'),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(shockGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({
        mesh,
        active: false,
        age: 0,
        maxAge: 0.28,
        targetScale: 3.2,
      });
    }
  }

  /**
   * Spawns an expanding 3D glowing crescent slash wave along the blade stroke plane.
   */
  spawnSlashWave(position: THREE.Vector3, rotation: THREE.Euler, stance: CombatStance, scaleMult: number = 1.0) {
    const sw = this.slashWaves.find(s => !s.active);
    if (!sw) return;

    sw.active = true;
    sw.age = 0;
    sw.initialScale = 0.8 * scaleMult;
    sw.targetScale = 2.4 * scaleMult;
    sw.mesh.position.copy(position);
    sw.mesh.rotation.copy(rotation);
    sw.mesh.scale.set(sw.initialScale, sw.initialScale, sw.initialScale);
    sw.mesh.visible = true;

    const mat = sw.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.95;

    // Set texture colors based on combat style
    if (stance === 'water') {
      mat.map = textures.createSlashArcTexture('#40d0ff', '#ffffff');
    } else if (stance === 'flame') {
      mat.map = textures.createSlashArcTexture('#ff5511', '#fff4a0');
    } else if (stance === 'thunder') {
      mat.map = textures.createSlashArcTexture('#ffd522', '#ffffff');
    }
    mat.needsUpdate = true;
  }

  /**
   * Spawns an expanding radial impact / ground shockwave ring.
   */
  spawnShockwave(position: THREE.Vector3, color: string = '#ffaa33', scaleMult: number = 1.0) {
    const sh = this.shockwaves.find(s => !s.active);
    if (!sh) return;

    sh.active = true;
    sh.age = 0;
    sh.targetScale = 3.2 * scaleMult;
    sh.mesh.position.copy(position);
    sh.mesh.scale.set(0.2, 0.2, 0.2);
    sh.mesh.visible = true;

    const mat = sh.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.85;
    mat.map = textures.createShockwaveRingTexture(color);
    mat.needsUpdate = true;
  }

  /**
   * Switches combat stance and updates blade trail & emissive colors.
   */
  switchStance(stance: CombatStance) {
    if (this.currentStance === stance) return;
    this.currentStance = stance;
    sound.playStanceSwitch();

    if (stance === 'water') {
      this.player.rig.setBladeStanceColor(0x40d0ff, 0x0044aa);
    } else if (stance === 'flame') {
      this.player.rig.setBladeStanceColor(0xff5511, 0xaa2200);
    } else if (stance === 'thunder') {
      this.player.rig.setBladeStanceColor(0xffea44, 0xaa8800);
    }

    if (this.onStanceChange) this.onStanceChange(stance);
    if (this.onHUDUpdate) this.onHUDUpdate();
  }

  cycleStance() {
    const stances: CombatStance[] = ['water', 'flame', 'thunder'];
    const nextIdx = (stances.indexOf(this.currentStance) + 1) % stances.length;
    this.switchStance(stances[nextIdx]);
  }

  /**
   * Triggers the special Combat Art based on the active stance.
   */
  triggerSpecialCombatArt() {
    if (this.specialArtCharge < 35 || this.player.isAttacking || this.player.isStaggered || this.player.isDodging) {
      return;
    }

    this.specialArtCharge = Math.max(0, this.specialArtCharge - 35);
    this.player.isAttacking = true;
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotationY);

    if (this.currentStance === 'water') {
      // Whirlwind Dance: 720 degree vortex hitting all around!
      this.player.rig.setAnimation('water_whirlwind', 0.65);
      sound.playWhirlwindSlash();
      this.spawnSlashWave(this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Euler(0, this.player.rotationY, 0), 'water', 2.2);

      // Area hit on all enemies within 4.5m
      setTimeout(() => {
        for (const enemy of this.enemies) {
          if (enemy.isDead) continue;
          if (this.player.position.distanceTo(enemy.position) < 4.5) {
            this.processAttackHit(this.player, enemy, { damage: 45, posture: 40, isSpecial: true });
          }
        }
      }, 180);
    } else if (this.currentStance === 'flame') {
      // Dragon Cleave / Flame Slam: Leaps and slams down with earth shockwave!
      this.player.rig.setAnimation('flame_slam', 0.75);
      this.player.position.addScaledVector(forward, 1.4);
      sound.playHeavyCleave();

      setTimeout(() => {
        const slamPos = this.player.position.clone().addScaledVector(forward, 1.2);
        this.spawnShockwave(slamPos, '#ff4400', 3.5);
        this.spawnDeflectSparks(slamPos.clone().add(new THREE.Vector3(0, 0.4, 0)), 45);
        this.shakeIntensity = CONFIG.screenShakeBossSlam;

        for (const enemy of this.enemies) {
          if (enemy.isDead) continue;
          if (slamPos.distanceTo(enemy.position) < 4.5) {
            this.processAttackHit(this.player, enemy, { damage: 65, posture: 60, isSpecial: true, breaksBlock: true });
          }
        }
      }, 300);
    } else if (this.currentStance === 'thunder') {
      // Shadowrush / Thunder Thrust: Supersonic dash through foes!
      this.player.rig.setAnimation('thunder_rush', 0.55);
      sound.playThunderThrust();
      this.spawnSlashWave(this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Euler(0, this.player.rotationY, 1.57), 'thunder', 2.0);

      // Dash forward 5.5m
      this.player.position.addScaledVector(forward, 5.5);
      this.spawnDeflectSparks(this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 35);
      this.shakeIntensity = 0.22;

      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        if (this.player.position.distanceTo(enemy.position) < 3.8) {
          this.processAttackHit(this.player, enemy, { damage: 55, posture: 45, isSpecial: true, piercesGuard: true });
        }
      }
    }

    if (this.onHUDUpdate) this.onHUDUpdate();
    if (this.onSpecialArtChange) this.onSpecialArtChange(this.specialArtCharge);
  }

  /**
   * Spawns a dramatic burst of deflect or slash sparks at contact point with directional bias.
   */
  spawnDeflectSparks(pos: THREE.Vector3, count: number = 32, dir?: THREE.Vector3) {
    let spawned = 0;
    const stance = this.currentStance;

    for (const p of this.sparksPool) {
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos);
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI;
        const speed = 5.0 + Math.random() * 9.5;

        if (dir) {
          // Directional spray along slice vector
          p.vel.copy(dir).multiplyScalar(speed * 0.85);
          p.vel.x += (Math.random() - 0.5) * 4.5;
          p.vel.y += (Math.random() - 0.2) * 4.0 + 1.8;
          p.vel.z += (Math.random() - 0.5) * 4.5;
        } else {
          p.vel.set(
            Math.cos(theta) * Math.cos(phi) * speed,
            Math.sin(phi) * speed + 2.5,
            Math.sin(theta) * Math.cos(phi) * speed
          );
        }

        p.life = 0;
        p.maxLife = 0.28 + Math.random() * 0.22;
        p.size = 0.7 + Math.random() * 0.5;

        // Dynamic sparks color palette
        if (stance === 'water') {
          p.color.setRGB(0.4 + Math.random() * 0.4, 0.8 + Math.random() * 0.2, 1.0);
        } else if (stance === 'flame') {
          p.color.setRGB(1.0, 0.35 + Math.random() * 0.4, 0.1);
        } else {
          p.color.setRGB(1.0, 0.9 + Math.random() * 0.1, 0.3 + Math.random() * 0.4);
        }

        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  private updateParticles(dt: number) {
    // 1. Sparks
    const sparkPosAttr = this.sparksGeometry.attributes.position as THREE.BufferAttribute;
    const sparkColAttr = this.sparksGeometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.sparksPool.length; i++) {
      const p = this.sparksPool[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          p.pos.set(0, -100, 0);
        } else {
          p.vel.y -= 15.0 * dt; // gravity
          p.pos.addScaledVector(p.vel, dt);
        }
      }
      sparkPosAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      sparkColAttr.setXYZ(i, p.color.r, p.color.g, p.color.b);
    }
    sparkPosAttr.needsUpdate = true;
    sparkColAttr.needsUpdate = true;

    // 2. Sakura petals
    const petalPosAttr = this.petalsGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.swingPhase += dt * 3.0;
      p.pos.x += (p.vel.x + Math.sin(p.swingPhase) * 0.8) * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += (p.vel.z + Math.cos(p.swingPhase) * 0.8) * dt;

      // Wrap around bounds
      if (p.pos.y < 0) {
        p.pos.y = 22 + Math.random() * 4;
        p.pos.x = (Math.random() - 0.5) * 90;
        p.pos.z = (Math.random() - 0.5) * 90;
      }
      petalPosAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    }
    petalPosAttr.needsUpdate = true;

    // 3. 3D Crescent Slash Waves
    for (const sw of this.slashWaves) {
      if (sw.active) {
        sw.age += dt;
        const progress = sw.age / sw.maxAge;
        if (progress >= 1.0) {
          sw.active = false;
          sw.mesh.visible = false;
        } else {
          const s = THREE.MathUtils.lerp(sw.initialScale, sw.targetScale, Math.sqrt(progress));
          sw.mesh.scale.set(s, s, s);
          const mat = sw.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = (1 - progress) * 0.95;
        }
      }
    }

    // 4. Ground & Hit Shockwaves
    for (const sh of this.shockwaves) {
      if (sh.active) {
        sh.age += dt;
        const progress = sh.age / sh.maxAge;
        if (progress >= 1.0) {
          sh.active = false;
          sh.mesh.visible = false;
        } else {
          const s = THREE.MathUtils.lerp(0.2, sh.targetScale, Math.sqrt(progress));
          sh.mesh.scale.set(s, s, s);
          const mat = sh.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = (1 - progress) * 0.85;
        }
      }
    }
  }

  // =====================================================
  // 3. GRAPPLING HOOK
  // =====================================================
  private initGrappleLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x58f0d8,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
    });
    this.grappleLine = new THREE.Line(geo, mat);
    this.grappleLine.visible = false;
    this.scene.add(this.grappleLine);
  }

  private triggerGrapple() {
    if (this.isGrappling || !this.activeGrappleTarget) return;

    sound.playGrapple();
    this.isGrappling = true;
    this.grappleProgress = 0;
    this.grappleStartPos.copy(this.player.position);
    this.player.rig.setAnimation('jump', 0.8);
    this.grappleLine.visible = true;
  }

  private updateGrapple(dt: number) {
    if (!this.isGrappling || !this.activeGrappleTarget) return;

    const targetPos = this.activeGrappleTarget.position;
    const dist = this.grappleStartPos.distanceTo(targetPos);
    const speed = CONFIG.grappleSpeed;

    this.grappleProgress += (speed * dt) / Math.max(1, dist);

    // Update grapple rope line
    const handWorld = new THREE.Vector3();
    this.player.rig.joints.rightHand.getWorldPosition(handWorld);
    const geo = this.grappleLine.geometry;
    const positions = new Float32Array([
      handWorld.x, handWorld.y, handWorld.z,
      targetPos.x, targetPos.y, targetPos.z,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.attributes.position.needsUpdate = true;

    if (this.grappleProgress >= 1.0) {
      // Arrived at anchor point
      this.player.position.copy(targetPos).add(new THREE.Vector3(0, 0.4, 0));
      this.isGrappling = false;
      this.grappleLine.visible = false;
      this.player.rig.setAnimation('idle', 0.2);
    } else {
      // Bezier / Lerp flight curve
      const t = this.grappleProgress;
      this.player.position.lerpVectors(this.grappleStartPos, targetPos, t);
      this.player.position.y += Math.sin(t * Math.PI) * 2.0; // slight arc
    }
  }

  // =====================================================
  // 4. INPUT & EVENT LISTENERS
  // =====================================================
  private initInputListeners() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;

      // Stance Switching: 1 for Water, 2 for Flame, 3 for Thunder, Tab to cycle
      if (e.code === 'Digit1') {
        this.switchStance('water');
      }
      if (e.code === 'Digit2') {
        this.switchStance('flame');
      }
      if (e.code === 'Digit3') {
        this.switchStance('thunder');
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        this.cycleStance();
      }

      // Special Combat Art: Key R
      if (e.code === 'KeyR') {
        this.triggerSpecialCombatArt();
      }

      if (e.code === 'KeyQ') {
        this.toggleLockOn();
      }
      if (e.code === 'Space') {
        this.triggerDodge();
      }
      if (e.code === 'KeyC') {
        this.isCrouching = !this.isCrouching;
      }
      if (e.code === 'KeyE') {
        this.triggerGrapple();
      }
      if (e.code === 'KeyF') {
        this.handleInteractOrFinisher();
      }
      if (e.code === 'KeyH') {
        this.drinkHealingGourd();
      }
      if (e.code === 'Escape') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    this.container.addEventListener('mousedown', e => {
      sound.init(); // Initialize audio context on first click
      if (this.gameState !== 'playing') return;

      if (e.button === 0) {
        // Left click: Attack
        this.isMouseDownLeft = true;
        this.triggerPlayerAttack();
      } else if (e.button === 2) {
        // Right click: Guard / Deflect
        this.isMouseDownRight = true;
        this.handleGuardPress();
      } else if (e.button === 1) {
        // Middle click: Lock-on
        this.toggleLockOn();
      }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 0) {
        this.isMouseDownLeft = false;
      } else if (e.button === 2) {
        this.isMouseDownRight = false;
        this.player.isGuarding = false;
        this.player.rig.isGuarding = false;
      }
    });

    this.container.addEventListener('contextmenu', e => e.preventDefault());

    // Pointer lock for immersive camera control
    this.container.addEventListener('click', () => {
      if (this.gameState === 'playing' && !this.pointerLocked) {
        this.container.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.container;
    });

    window.addEventListener('mousemove', e => {
      if (!this.pointerLocked) return;

      if (!this.lockedTarget) {
        this.cameraYaw -= e.movementX * CONFIG.mouseSensitivity;
        this.cameraPitch = Math.max(-0.4, Math.min(1.1, this.cameraPitch + e.movementY * CONFIG.mouseSensitivity));
      } else {
        // Cycle lock-on targets if quick flick mouse
        if (Math.abs(e.movementX) > 28) {
          this.cycleLockOn(e.movementX > 0 ? 1 : -1);
        }
      }
    });

    window.addEventListener('resize', () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  // =====================================================
  // 5. COMBAT MECHANICS: DEFLECT, GUARD, COMBO, POSTURE
  // =====================================================
  private handleGuardPress() {
    const now = performance.now() / 1000;
    const timeSinceLastGuard = now - this.lastGuardPressTime;

    // Check guard spam penalty
    let currentWindow = CONFIG.deflectWindow[CONFIG.difficulty];
    if (timeSinceLastGuard < CONFIG.spamPenaltyThreshold) {
      currentWindow = CONFIG.spamPenaltyWindow; // spamming guard shrinks window drastically!
    }

    this.lastGuardPressTime = now;
    this.deflectSuccessWindow = now + currentWindow;

    this.player.isGuarding = true;
    this.player.rig.isGuarding = true;
    this.player.rig.setAnimation('guard', 0.2);
  }

  private triggerPlayerAttack() {
    if (this.player.isAttacking || this.player.isStaggered || this.player.isDodging || this.isGrappling) {
      return;
    }

    this.player.isAttacking = true;
    this.player.attackComboStep = (this.player.attackComboStep % 3) + 1;
    const step = this.player.attackComboStep;
    const stance = this.currentStance;

    let animName: AnimState = 'attack1';
    let duration = 0.38;
    let pushDist = 0.45;

    if (stance === 'water') {
      animName = step === 1 ? 'water_slash1' : step === 2 ? 'water_slash2' : 'water_whirlwind';
      duration = step === 3 ? 0.46 : 0.34;
      pushDist = step === 3 ? 0.65 : 0.42;
      sound.playSlash(step, 'water');
    } else if (stance === 'flame') {
      animName = step === 1 ? 'flame_slash1' : step === 2 ? 'flame_uppercut' : 'ichimonji';
      duration = step === 3 ? 0.62 : 0.42;
      pushDist = step === 3 ? 0.8 : 0.5;
      if (step === 3) {
        sound.playHeavyCleave();
        // Ichimonji posture cleansing
        this.player.posture = Math.max(0, this.player.posture - 22);
      } else {
        sound.playSlash(step, 'flame');
      }
    } else if (stance === 'thunder') {
      animName = step === 1 ? 'thunder_iaijutsu' : step === 2 ? 'thunder_thrust' : 'thunder_rush';
      duration = step === 1 ? 0.3 : step === 2 ? 0.34 : 0.42;
      pushDist = step === 2 ? 0.85 : 0.48;
      if (step === 2) {
        sound.playThunderThrust();
      } else {
        sound.playSlash(step, 'thunder');
      }
    }

    this.player.rig.setAnimation(animName, duration);

    // Dynamic forward momentum
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotationY);
    this.player.position.addScaledVector(forward, pushDist);

    // Spawn 3D glowing crescent slash wave!
    const slashPos = this.player.position.clone().add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(forward, 0.85);
    const slashRot = new THREE.Euler(
      step === 2 ? 0.45 : step === 3 ? -0.25 : 0.1,
      this.player.rotationY + (step === 2 ? -0.3 : 0.25),
      step === 1 ? -0.2 : step === 2 ? 0.75 : 0
    );
    this.spawnSlashWave(slashPos, slashRot, stance, step === 3 ? 1.45 : 1.15);
  }

  private triggerDodge() {
    const now = performance.now() / 1000;
    if (this.player.dodgeCooldownTimer > 0 || this.player.isStaggered || this.isGrappling) {
      return;
    }

    this.player.isDodging = true;
    this.player.dodgeTimer = CONFIG.dodgeDuration;
    this.player.dodgeCooldownTimer = CONFIG.dodgeCooldown;
    this.player.invincibleTimer = CONFIG.invincibilityDuration;

    sound.playDodge();
    this.player.rig.setAnimation('dodge', CONFIG.dodgeDuration);

    // Move in input direction
    const moveDir = this.getPlayerInputDirection();
    if (moveDir.lengthSq() > 0.01) {
      this.player.velocity.copy(moveDir.multiplyScalar(CONFIG.dodgeSpeed));
    } else {
      // Backwards hop if no direction key pressed
      const back = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotationY);
      this.player.velocity.copy(back.multiplyScalar(CONFIG.dodgeSpeed * 0.8));
    }
  }

  private drinkHealingGourd() {
    if (this.gourdCharges <= 0 || this.player.isAttacking || this.player.isDodging || this.player.isStaggered) {
      return;
    }

    this.gourdCharges--;
    sound.playHeal();
    this.player.rig.setAnimation('drink', 1.0);

    const healAmount = this.player.maxHealth * CONFIG.gourdHealPercent;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + healAmount);
    this.player.posture = Math.max(0, this.player.posture - 30);

    if (this.onHUDUpdate) this.onHUDUpdate();
  }

  /**
   * Evaluates weapon contact with opponent.
   * Handles Deflect timing, normal Block, and clean Hits with high-impact VFX.
   */
  processAttackHit(attacker: Fighter, defender: Fighter, options?: HitOptions) {
    if (defender.isDead || defender.invincibleTimer > 0) return;

    const hitPoint = defender.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const now = performance.now() / 1000;
    const hitDir = defender.position.clone().sub(attacker.position).normalize();

    // Check if defender is deflecting
    const isDeflect = defender.isGuarding && now <= this.deflectSuccessWindow;

    if (isDeflect) {
      // ==========================================
      // PERFECT DEFLECT: Sparks, Clang, Posture Break!
      // ==========================================
      sound.playDeflect();
      this.spawnDeflectSparks(hitPoint, 45);
      this.spawnShockwave(hitPoint.clone().setY(0.05), '#ffe066', 1.8);
      this.hitStopTimer = CONFIG.hitStopDeflect;
      this.shakeIntensity = CONFIG.screenShakeDeflect;
      this.screenFlashAlpha = 0.45;

      defender.rig.setAnimation('deflect', 0.25);

      // Posture damage math: attacker takes heavy posture damage
      attacker.posture += CONFIG.deflectPostureDamageToEnemy;
      defender.posture = Math.min(defender.maxPosture, defender.posture + CONFIG.deflectPostureDamageToPlayer);

      if (defender.type === 'player') {
        this.specialArtCharge = Math.min(100, this.specialArtCharge + 25);
        if (this.onSpecialArtChange) this.onSpecialArtChange(this.specialArtCharge);
      }

      // Pushback on both fighters
      attacker.position.addScaledVector(hitDir, -0.45);
      defender.position.addScaledVector(hitDir, 0.25);

      if (attacker.posture >= attacker.maxPosture) {
        this.triggerPostureBreak(attacker);
      }
    } else if (defender.isGuarding && !options?.breaksBlock && !options?.piercesGuard && attacker.perilousType !== 'sweep') {
      // ==========================================
      // REGULAR BLOCK: Dull thud, posture damage
      // ==========================================
      sound.playBlock();
      this.spawnDeflectSparks(hitPoint, 16, hitDir);
      this.shakeIntensity = 0.1;

      const postureCost = options?.posture || CONFIG.blockPostureDamage;
      defender.posture += postureCost;
      // Slight chip damage on normal block
      const chip = options?.damage ? Math.round(options.damage * 0.12) : 5;
      defender.health -= chip;

      defender.position.addScaledVector(hitDir, 0.2);

      if (defender.posture >= defender.maxPosture) {
        this.triggerPostureBreak(defender);
      }
    } else {
      // ==========================================
      // CLEAN HIT: Flesh slice, directional sparks, shockwave, hit-stop
      // ==========================================
      sound.playHit();

      // Dynamic directional sparks along the cut
      this.spawnDeflectSparks(hitPoint, 38, hitDir);

      // Ground shockwave ripple
      const stance = this.currentStance;
      const shockwaveColor = stance === 'flame' ? '#ff4400' : stance === 'thunder' ? '#ffd833' : '#33ccff';
      this.spawnShockwave(hitPoint.clone().setY(0.05), shockwaveColor, options?.isSpecial ? 2.5 : 1.8);

      // Hit-flash material effect on defender
      defender.hitFlashTimer = 0.12;

      // Knockback impulse
      const knockback = options?.breaksBlock ? 0.8 : options?.isSpecial ? 0.7 : 0.42;
      defender.position.addScaledVector(hitDir, knockback);

      let damage = 24;
      let postureDmg = 20;
      let hitStop = CONFIG.hitStopHit;
      let shake = CONFIG.screenShakeHit;

      if (options?.damage) {
        damage = options.damage;
        postureDmg = options.posture || 30;
        hitStop = 0.08;
        shake = 0.25;
      } else if (attacker.type === 'player') {
        if (stance === 'water') {
          damage = 22 + attacker.attackComboStep * 5;
          postureDmg = 18 + attacker.attackComboStep * 6;
          hitStop = 0.04;
          shake = 0.12;
        } else if (stance === 'flame') {
          damage = 32 + attacker.attackComboStep * 9;
          postureDmg = 28 + attacker.attackComboStep * 11;
          hitStop = attacker.attackComboStep === 3 ? 0.1 : 0.07;
          shake = attacker.attackComboStep === 3 ? 0.32 : 0.22;
        } else if (stance === 'thunder') {
          damage = 28 + attacker.attackComboStep * 7;
          postureDmg = 24 + attacker.attackComboStep * 8;
          hitStop = 0.05;
          shake = 0.18;
        }

        // Charge special art on hits
        this.specialArtCharge = Math.min(100, this.specialArtCharge + 15);
        if (this.onSpecialArtChange) this.onSpecialArtChange(this.specialArtCharge);
      } else {
        if (attacker.perilousType === 'thrust') {
          damage = 45;
          postureDmg = 35;
        } else if (attacker.perilousType === 'sweep') {
          damage = 40;
          postureDmg = 30;
        }
      }

      this.hitStopTimer = hitStop;
      this.shakeIntensity = shake;

      defender.health -= damage;
      defender.posture += postureDmg;
      defender.rig.setAnimation('hit', 0.28);

      if (defender.posture >= defender.maxPosture) {
        this.triggerPostureBreak(defender);
      } else if (defender.health <= 0) {
        this.handleFighterDeath(defender);
      }
    }

    if (this.onHUDUpdate) this.onHUDUpdate();
  }

  private triggerPostureBreak(target: Fighter) {
    target.isStaggered = true;
    target.staggerTimer = target.type === 'boss' ? 4.5 : 3.5;
    target.rig.setAnimation('stagger', target.staggerTimer);
    sound.playPostureBreak();
  }

  /**
   * Cinematic Deathblow / Finisher execution.
   */
  private handleInteractOrFinisher() {
    // 1. Check if near checkpoint shrine
    for (const cp of this.world.checkpoints) {
      if (this.player.position.distanceTo(cp.position) < 3.0) {
        this.restAtCheckpoint();
        return;
      }
    }

    // 2. Check for staggered enemy in finisher range
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const dist = this.player.position.distanceTo(enemy.position);

      if (dist < 3.2 && enemy.isStaggered) {
        this.executeFinisher(enemy, 'finisher');
        return;
      }

      // 3. Check for stealth assassination from behind unaware enemy
      if (dist < 2.4 && this.isCrouching && (enemy.aiState === 'idle' || enemy.aiState === 'patrol')) {
        const toPlayer = this.player.position.clone().sub(enemy.position).normalize();
        const enemyForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.rotationY);
        // If player is behind enemy (dot < -0.3)
        if (enemyForward.dot(toPlayer) < -0.3) {
          this.executeFinisher(enemy, 'stealth');
          return;
        }
      }
    }
  }

  private executeFinisher(victim: Fighter, style: 'finisher' | 'stealth') {
    sound.playDeathblow();
    this.hitStopTimer = 0.22; // Cinematic slow motion
    this.screenFlashAlpha = 0.55;

    // Face each other
    const dir = victim.position.clone().sub(this.player.position).normalize();
    this.player.rotationY = Math.atan2(dir.x, dir.z);
    victim.rotationY = Math.atan2(-dir.x, -dir.z);

    this.player.rig.setAnimation('finisher_attacker', 1.2);
    victim.rig.setAnimation('finisher_victim', 1.2);

    // Particle blood-free spark spray
    const chestPos = victim.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    this.spawnDeflectSparks(chestPos, 45);

    if (victim.type === 'boss') {
      victim.bossSegments = (victim.bossSegments || 3) - 1;
      victim.posture = 0;
      victim.isStaggered = false;

      if (victim.bossSegments <= 0) {
        this.handleFighterDeath(victim);
      } else {
        // Transition Boss Phase
        victim.bossPhase = 4 - victim.bossSegments;
        victim.health = victim.maxHealth;
        this.shakeIntensity = CONFIG.screenShakeBossSlam;

        if (victim.bossPhase === 3 && victim.rig.joints.auraMesh) {
          const mat = victim.rig.joints.auraMesh.material;
          if (!Array.isArray(mat)) mat.opacity = 0.7; // Dark fiery aura
        }

        if (this.onCinematicBanner) {
          this.onCinematicBanner(
            victim.bossPhase === 2 ? 'PHASE II: UNLEASHED RAGE' : 'PHASE III: ASURA MANIFEST',
            'Beware the perilous strikes'
          );
        }
      }
    } else {
      victim.health = 0;
      this.handleFighterDeath(victim);
    }

    if (this.onHUDUpdate) this.onHUDUpdate();
  }

  private handleFighterDeath(target: Fighter) {
    target.isDead = true;
    target.rig.setAnimation('death', 2.0);

    if (target.type === 'player') {
      if (this.resurrectionAvailable) {
        // Prompt Resurrection
        this.setGameState('death');
      } else {
        this.setGameState('death');
      }
    } else if (target.type === 'boss') {
      setTimeout(() => {
        this.setGameState('victory');
      }, 1800);
    }
  }

  /**
   * Kaisei / Rise resurrection with 50% health.
   */
  resurrectPlayer() {
    if (!this.resurrectionAvailable) return;
    this.resurrectionAvailable = false;
    this.player.health = this.player.maxHealth * 0.5;
    this.player.posture = 0;
    this.player.isDead = false;
    this.player.isStaggered = false;
    this.player.rig.setAnimation('idle', 0.5);

    sound.playHeal();
    this.spawnDeflectSparks(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 50);
    this.setGameState('playing');
  }

  /**
   * Rest at checkpoint stone shrine: refills gourd, health, resets posture.
   */
  restAtCheckpoint() {
    this.player.health = this.player.maxHealth;
    this.player.posture = 0;
    this.gourdCharges = CONFIG.maxGourdCharges;
    this.resurrectionAvailable = true;

    sound.playHeal();
    if (this.onCinematicBanner) {
      this.onCinematicBanner('SANCTUARY RESTED', 'Gourd replenished • Wounds cleansed');
    }
    if (this.onHUDUpdate) this.onHUDUpdate();
  }

  // =====================================================
  // 6. ENEMY AI STATE MACHINES
  // =====================================================
  private updateEnemyAI(enemy: Fighter, dt: number) {
    if (enemy.isDead || enemy.type === 'dummy') return;

    const toPlayer = this.player.position.clone().sub(enemy.position);
    const distToPlayer = toPlayer.length();

    // Check vision & hearing
    const enemyForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.rotationY);
    const angleToPlayer = enemyForward.angleTo(toPlayer.clone().normalize());

    const isHearingSprint = this.keys['ShiftLeft'] && distToPlayer < 14;
    const isInVisionCone = angleToPlayer < Math.PI * 0.35 && distToPlayer < 24;

    if (enemy.aiState === 'idle' || enemy.aiState === 'patrol') {
      if (isInVisionCone || isHearingSprint) {
        enemy.aiState = 'combat';
        sound.setCombatIntensity(1.0);
      }
    }

    if (enemy.aiState === 'combat') {
      // Turn towards player smoothly
      const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
      enemy.rotationY = THREE.MathUtils.lerp(enemy.rotationY, targetAngle, dt * 5.0);

      // Decrement attack cooldown
      enemy.attackCooldown -= dt;

      // Distance-based combat behaviors
      if (enemy.isAttacking) {
        // Wait for attack completion
      } else if (distToPlayer > 8.0) {
        // Approach player
        const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.rotationY);
        enemy.position.addScaledVector(forward, 3.2 * dt);
        enemy.rig.setAnimation('run', 0.5);
      } else if (distToPlayer > 3.0) {
        // Circle / Strafe
        const strafe = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.rotationY);
        enemy.position.addScaledVector(strafe, 1.8 * dt);
        enemy.rig.setAnimation('walk', 0.5);

        if (enemy.attackCooldown <= 0) {
          this.triggerEnemyAttack(enemy, distToPlayer);
        }
      } else {
        // Close range: choose attack
        if (enemy.attackCooldown <= 0) {
          this.triggerEnemyAttack(enemy, distToPlayer);
        } else {
          enemy.rig.setAnimation('guard', 0.3);
        }
      }
    }
  }

  private triggerEnemyAttack(enemy: Fighter, dist: number) {
    enemy.isAttacking = true;
    enemy.attackCooldown = enemy.type === 'boss' ? 1.6 + Math.random() * 1.2 : 2.5 + Math.random() * 2.0;

    const roll = Math.random();

    if (enemy.type === 'boss') {
      const phase = enemy.bossPhase || 1;
      if (phase >= 2 && roll < 0.35) {
        // RED PERILOUS SWEEP
        this.startPerilousAttack(enemy, 'sweep');
      } else if (roll < 0.65) {
        // YELLOW PERILOUS THRUST
        this.startPerilousAttack(enemy, 'thrust');
      } else {
        // Standard fast combo
        enemy.rig.setAnimation('attack1', 0.55);
        sound.playSlash(1);
      }
    } else {
      // Ashigaru attacks
      if (roll < 0.28) {
        this.startPerilousAttack(enemy, 'thrust');
      } else {
        enemy.rig.setAnimation('attack1', 0.6);
        sound.playSlash(0);
      }
    }
  }

  private startPerilousAttack(enemy: Fighter, type: 'thrust' | 'sweep') {
    enemy.perilousType = type;
    enemy.perilousTimer = 0.55;
    enemy.perilousWarningShown = true;
    sound.playWarningCue();

    enemy.rig.setAnimation(type, 0.8);
  }

  // =====================================================
  // 7. CAMERA & LOCK-ON CONTROLLER
  // =====================================================
  private toggleLockOn() {
    if (this.lockedTarget) {
      this.lockedTarget = null;
      return;
    }

    // Find nearest live enemy within 28m
    let nearest: Fighter | null = null;
    let minDist = 28;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const d = this.player.position.distanceTo(enemy.position);
      if (d < minDist) {
        minDist = d;
        nearest = enemy;
      }
    }

    this.lockedTarget = nearest;
  }

  private cycleLockOn(dir: number) {
    const liveEnemies = this.enemies.filter(e => !e.isDead);
    if (liveEnemies.length <= 1) return;

    const idx = this.lockedTarget ? liveEnemies.indexOf(this.lockedTarget) : 0;
    const nextIdx = (idx + dir + liveEnemies.length) % liveEnemies.length;
    this.lockedTarget = liveEnemies[nextIdx];
  }

  /**
   * Third-person spring-arm camera with wall-collision raycasts.
   */
  private updateCamera(dt: number) {
    const targetLookAt = this.player.position.clone().add(new THREE.Vector3(0, CONFIG.camHeight, 0));

    if (this.lockedTarget) {
      if (this.lockedTarget.isDead) {
        this.lockedTarget = null;
      } else {
        // Orbit camera around locked target
        const toTarget = this.lockedTarget.position.clone().sub(this.player.position);
        const desiredYaw = Math.atan2(toTarget.x, toTarget.z) + Math.PI;
        this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, desiredYaw, dt * CONFIG.lockOnSmoothness);
      }
    }

    // Camera spherical offset
    const cosPitch = Math.cos(this.cameraPitch);
    const sinPitch = Math.sin(this.cameraPitch);
    const camOffset = new THREE.Vector3(
      Math.sin(this.cameraYaw) * cosPitch * CONFIG.camDistance,
      sinPitch * CONFIG.camDistance + CONFIG.camShoulderOffset,
      Math.cos(this.cameraYaw) * cosPitch * CONFIG.camDistance
    );

    const idealCamPos = targetLookAt.clone().add(camOffset);

    // Wall collision raycast
    const rayDir = idealCamPos.clone().sub(targetLookAt).normalize();
    const raycaster = new THREE.Raycaster(targetLookAt, rayDir, 0.2, CONFIG.camDistance);
    const hits = raycaster.intersectObjects(this.world.colliderMeshes, false);

    let actualDistance = CONFIG.camDistance;
    if (hits.length > 0) {
      actualDistance = Math.max(1.2, hits[0].distance - 0.3);
    }
    this.currentCamDist = THREE.MathUtils.lerp(this.currentCamDist, actualDistance, dt * 12.0);

    const actualCamOffset = rayDir.multiplyScalar(this.currentCamDist);
    let finalCamPos = targetLookAt.clone().add(actualCamOffset);

    // Screen shake
    if (this.shakeIntensity > 0.001) {
      finalCamPos.x += (Math.random() - 0.5) * this.shakeIntensity;
      finalCamPos.y += (Math.random() - 0.5) * this.shakeIntensity;
      finalCamPos.z += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.5);
    }

    this.camera.position.copy(finalCamPos);
    this.camera.lookAt(targetLookAt);
  }

  // =====================================================
  // 8. FIXED-TIMESTEP UPDATE LOOP
  // =====================================================
  private startLoop() {
    const animate = () => {
      if (this.isDestroyed) return;
      this.animationFrameId = requestAnimationFrame(animate);

      const rawDelta = Math.min(this.clock.getDelta(), 0.1);

      // Hit-stop freeze
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= rawDelta;
        this.composer.render();
        return;
      }

      this.accumulator += rawDelta;
      while (this.accumulator >= this.fixedTimeStep) {
        this.fixedUpdate(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
      }

      this.updateParticles(rawDelta);
      this.world.update(rawDelta, this.clock.getElapsedTime());

      // Screen flash decay
      if (this.screenFlashAlpha > 0) {
        this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - rawDelta * 2.8);
      }

      this.composer.render();
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  private fixedUpdate(dt: number) {
    if (this.gameState !== 'playing') return;

    this.updatePlayer(dt);
    this.updateGrapple(dt);
    this.updateCamera(dt);

    // Update all enemies
    for (const enemy of this.enemies) {
      this.updateFighter(enemy, dt);
      this.updateEnemyAI(enemy, dt);
    }

    // Check hitboxes
    this.checkBladeHitboxes();

    // Check nearest grapple point for HUD prompt
    this.updateGrappleTargetHUD();

    if (this.onHUDUpdate) this.onHUDUpdate();
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (p.isDead) return;

    // Posture recovery over time
    if (!p.isGuarding && p.posture > 0) {
      const rec = CONFIG.postureRecoveryRate * (p.health / p.maxHealth);
      p.posture = Math.max(0, p.posture - rec * dt);
    }

    // Dodge & invincibility timers
    if (p.dodgeTimer > 0) {
      p.dodgeTimer -= dt;
      if (p.dodgeTimer <= 0) p.isDodging = false;
    }
    if (p.dodgeCooldownTimer > 0) p.dodgeCooldownTimer -= dt;
    if (p.invincibleTimer > 0) p.invincibleTimer -= dt;

    // Movement calculation
    if (!p.isDodging && !this.isGrappling && !p.isStaggered) {
      const moveDir = this.getPlayerInputDirection();
      const speed = this.isCrouching
        ? CONFIG.crouchSpeed
        : this.keys['ShiftLeft']
        ? CONFIG.sprintSpeed
        : CONFIG.moveSpeed;

      if (moveDir.lengthSq() > 0.01) {
        p.position.addScaledVector(moveDir, speed * dt);

        if (!this.lockedTarget) {
          // Face movement direction
          const targetRot = Math.atan2(moveDir.x, moveDir.z);
          p.rotationY = THREE.MathUtils.lerp(p.rotationY, targetRot, dt * 14.0);
        } else {
          // Strafe facing locked enemy
          const toEnemy = this.lockedTarget.position.clone().sub(p.position);
          p.rotationY = Math.atan2(toEnemy.x, toEnemy.z);
        }

        const anim: AnimState = this.isCrouching
          ? 'crouch_walk'
          : this.keys['ShiftLeft']
          ? 'sprint'
          : 'run';
        p.rig.setAnimation(anim, 0.4);
      } else {
        const anim: AnimState = this.isCrouching ? 'crouch' : p.isGuarding ? 'guard' : 'idle';
        p.rig.setAnimation(anim, 0.3);
      }
    }

    // Apply dodge velocity
    if (p.isDodging) {
      p.position.addScaledVector(p.velocity, dt);
      p.velocity.multiplyScalar(0.92);
    }

    // Update rig transforms
    p.rig.joints.root.position.copy(p.position);
    p.rig.joints.root.rotation.y = p.rotationY;
    p.rig.update(dt);
  }

  private updateFighter(f: Fighter, dt: number) {
    if (f.isDead) return;

    // Stagger recovery
    if (f.isStaggered) {
      f.staggerTimer -= dt;
      if (f.staggerTimer <= 0) {
        f.isStaggered = false;
        f.posture = 0;
        f.rig.setAnimation('idle', 0.4);
      }
    }

    // Perilous timer
    if (f.perilousTimer > 0) {
      f.perilousTimer -= dt;
      if (f.perilousTimer <= 0) {
        f.perilousType = 'none';
        f.perilousWarningShown = false;
      }
    }

    // Material hit-flash feedback on impacts
    if (f.hitFlashTimer && f.hitFlashTimer > 0) {
      f.hitFlashTimer -= dt;
      if (f.rig.joints.chest) {
        f.rig.joints.chest.traverse(child => {
          if (child instanceof THREE.Mesh && child.material && 'emissive' in child.material) {
            (child.material as THREE.MeshStandardMaterial).emissive.setHex(0xff3333);
            (child.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
          }
        });
      }
      if (f.hitFlashTimer <= 0) {
        if (f.rig.joints.chest) {
          f.rig.joints.chest.traverse(child => {
            if (child instanceof THREE.Mesh && child.material && 'emissive' in child.material) {
              (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
              (child.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
            }
          });
        }
      }
    }

    f.rig.joints.root.position.copy(f.position);
    f.rig.joints.root.rotation.y = f.rotationY;
    f.rig.update(dt);
  }

  private checkBladeHitboxes() {
    // 1. Player sword hitting enemies
    if (this.player.isAttacking && this.player.rig.attackPhase === 'active') {
      const swordTip = new THREE.Vector3();
      this.player.rig.joints.swordTip.getWorldPosition(swordTip);

      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        const enemyCenter = enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        const distToTip = swordTip.distanceTo(enemyCenter);
        const distToPlayer = this.player.position.distanceTo(enemy.position);

        if (distToTip < 2.2 || (this.player.attackComboStep === 3 && distToPlayer < 2.6)) {
          let breaksBlock = false;
          let piercesGuard = false;
          if (this.currentStance === 'flame' && this.player.attackComboStep === 3) {
            breaksBlock = true; // Ichimonji crushes normal blocks
          }
          if (this.currentStance === 'thunder' && this.player.attackComboStep === 2) {
            piercesGuard = true; // Thunder thrust pierces straight through guard
          }

          this.processAttackHit(this.player, enemy, { breaksBlock, piercesGuard });
          this.player.isAttacking = false; // hit landed
          break;
        }
      }
    }

    // 2. Enemies hitting player
    for (const enemy of this.enemies) {
      if (enemy.isDead || !enemy.isAttacking || enemy.rig.attackPhase !== 'active') continue;

      const swordTip = new THREE.Vector3();
      enemy.rig.joints.swordTip.getWorldPosition(swordTip);
      const dist = swordTip.distanceTo(this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)));

      if (dist < 1.8) {
        this.processAttackHit(enemy, this.player);
        enemy.isAttacking = false;
      }
    }
  }

  private getPlayerInputDirection(): THREE.Vector3 {
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.z += 1;
    if (this.keys['KeyS']) move.z -= 1;
    if (this.keys['KeyA']) move.x += 1;
    if (this.keys['KeyD']) move.x -= 1;

    if (move.lengthSq() < 0.001) return move;
    move.normalize();

    // Rotate by camera yaw
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);

    return forward.multiplyScalar(move.z).add(right.multiplyScalar(move.x)).normalize();
  }

  private updateGrappleTargetHUD() {
    let nearest: GrapplePoint | null = null;
    let minDist = 32.0;

    for (const gp of this.world.grapplePoints) {
      const d = this.player.position.distanceTo(gp.position);
      if (d < minDist) {
        minDist = d;
        nearest = gp;
      }
    }

    this.activeGrappleTarget = nearest;
  }

  // =====================================================
  // 9. GAME STATE & UI HELPERS
  // =====================================================
  setGameState(state: GameState) {
    this.gameState = state;
    if (state !== 'playing' && document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (this.onStateChange) this.onStateChange(state);
  }

  togglePause() {
    if (this.gameState === 'playing') {
      this.setGameState('paused');
    } else if (this.gameState === 'paused') {
      this.setGameState('playing');
      this.container.requestPointerLock();
    }
  }

  restartEncounter() {
    this.player.health = this.player.maxHealth;
    this.player.posture = 0;
    this.player.isDead = false;
    this.player.isStaggered = false;
    this.player.position.set(0, 0, 18);
    this.player.rig.setAnimation('idle', 0.2);
    this.gourdCharges = CONFIG.maxGourdCharges;
    this.resurrectionAvailable = true;

    // Reset enemies
    for (const enemy of this.enemies) {
      enemy.health = enemy.maxHealth;
      enemy.posture = 0;
      enemy.isDead = false;
      enemy.isStaggered = false;
      enemy.aiState = 'patrol';
      if (enemy.patrolOrigin) {
        enemy.position.copy(enemy.patrolOrigin);
      }
      enemy.rig.setAnimation('idle', 0.2);
    }

    if (this.boss) {
      this.boss.health = this.boss.maxHealth;
      this.boss.posture = 0;
      this.boss.isDead = false;
      this.boss.bossPhase = 1;
      this.boss.bossSegments = 3;
      this.boss.position.set(0, 0.6, -42);
      if (this.boss.rig.joints.auraMesh) {
        const mat = this.boss.rig.joints.auraMesh.material;
        if (!Array.isArray(mat)) mat.opacity = 0;
      }
    }

    this.setGameState('playing');
  }

  destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrameId);
    this.renderer.dispose();
  }
}
