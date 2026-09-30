/**
 * Procedural articulated 3D character rigs and animations for Ronin's Edge.
 * Builds stylized samurai humanoids using primitives (boxes, capsules, cylinders)
 * with hierarchical joints and procedural animation blending.
 */
import * as THREE from 'three';
import { textures } from './textures';

export interface RigJoints {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  leftUpperLeg: THREE.Group;
  leftLowerLeg: THREE.Group;
  rightUpperLeg: THREE.Group;
  rightLowerLeg: THREE.Group;
  leftUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  rightUpperArm: THREE.Group;
  rightForearm: THREE.Group;
  rightHand: THREE.Group;
  swordGroup: THREE.Group;
  swordBlade: THREE.Mesh;
  swordTip: THREE.Object3D;
  trailMesh?: THREE.Mesh;
  trailGeometry?: THREE.BufferGeometry;
  trailPoints: { tip: THREE.Vector3; base: THREE.Vector3; age: number }[];
  auraMesh?: THREE.Mesh;
}

export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'crouch'
  | 'crouch_walk'
  | 'guard'
  | 'deflect'
  | 'attack1'
  | 'attack2'
  | 'attack3'
  | 'water_slash1'
  | 'water_slash2'
  | 'water_whirlwind'
  | 'flame_slash1'
  | 'flame_uppercut'
  | 'ichimonji'
  | 'flame_slam'
  | 'thunder_iaijutsu'
  | 'thunder_thrust'
  | 'thunder_rush'
  | 'thrust'
  | 'sweep'
  | 'dodge'
  | 'jump'
  | 'drink'
  | 'stagger'
  | 'hit'
  | 'death'
  | 'finisher_attacker'
  | 'finisher_victim';

export class SamuraiRig {
  joints: RigJoints;
  type: 'player' | 'soldier' | 'boss' | 'dummy';
  scale: number;
  currentAnim: AnimState = 'idle';
  animTimer: number = 0;
  animDuration: number = 1.0;
  runCycle: number = 0;
  isGuarding: boolean = false;
  isAttacking: boolean = false;
  attackPhase: 'anticipation' | 'active' | 'recovery' = 'anticipation';
  attackNormalizedTime: number = 0;

  constructor(type: 'player' | 'soldier' | 'boss' | 'dummy') {
    this.type = type;
    this.scale = type === 'boss' ? 1.35 : type === 'dummy' ? 1.0 : 1.0;
    this.joints = this.buildRig();
  }

  private buildRig(): RigJoints {
    const root = new THREE.Group();
    root.scale.set(this.scale, this.scale, this.scale);

    const woodTex = textures.createWoodTexture();

    // Color palettes
    const isPlayer = this.type === 'player';
    const isBoss = this.type === 'boss';
    const isDummy = this.type === 'dummy';

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xd9a87e,
      roughness: 0.7,
    });

    const clothMainMat = new THREE.MeshStandardMaterial({
      color: isPlayer ? 0x22262d : isBoss ? 0x1a1a24 : 0x3d4247,
      roughness: 0.8,
    });

    const clothAccentMat = new THREE.MeshStandardMaterial({
      color: isPlayer ? 0x8a1c1c : isBoss ? 0xa82222 : 0x6e503b, // Crimson sash for player/boss
      roughness: 0.7,
    });

    const armorMat = new THREE.MeshStandardMaterial({
      color: isBoss ? 0x261a1a : 0x1b1f24,
      metalness: isBoss ? 0.7 : 0.4,
      roughness: 0.4,
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.25,
    });

    // Special training dummy mesh
    if (isDummy) {
      const dummyMat = new THREE.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.9,
      });
      const strawMat = new THREE.MeshStandardMaterial({
        color: 0x8f8350,
        roughness: 0.9,
      });

      // Central post
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 2.0, 10), dummyMat);
      post.position.y = 1.0;
      post.castShadow = true;
      root.add(post);

      // Straw bundle body
      const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 10), strawMat);
      bundle.position.y = 1.15;
      bundle.castShadow = true;
      root.add(bundle);

      // Ropes binding straw
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.02, 6, 16), clothAccentMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.75 + i * 0.25;
        root.add(ring);
      }

      // Wooden cross arms
      const crossArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), dummyMat);
      crossArm.rotation.z = Math.PI / 2;
      crossArm.position.y = 1.35;
      root.add(crossArm);

      // Practice bokken (wooden sword)
      const bokken = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.04), dummyMat);
      bokken.position.set(0.65, 1.25, 0.25);
      bokken.rotation.x = 0.4;
      root.add(bokken);

      const dummyJoints: RigJoints = {
        root,
        hips: root,
        spine: root,
        chest: root,
        head: root,
        leftUpperLeg: root,
        leftLowerLeg: root,
        rightUpperLeg: root,
        rightLowerLeg: root,
        leftUpperArm: root,
        leftForearm: root,
        rightUpperArm: root,
        rightForearm: root,
        rightHand: root,
        swordGroup: root,
        swordBlade: bokken,
        swordTip: bokken,
        trailPoints: [],
      };
      return dummyJoints;
    }

    // --- HIPS & PELVIS ---
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);

    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), clothMainMat);
    pelvisMesh.castShadow = true;
    hips.add(pelvisMesh);

    // Sash / Obi Belt
    const obiMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.16, 12), clothAccentMat);
    obiMesh.position.y = 0.05;
    hips.add(obiMesh);

    // --- LEGS & HAKAMA (Traditional flared samurai pleated pants) ---
    // Left leg
    const leftUpperLeg = new THREE.Group();
    leftUpperLeg.position.set(-0.13, -0.08, 0);
    hips.add(leftUpperLeg);

    const leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.42, 8), clothMainMat);
    leftThigh.position.y = -0.2;
    leftThigh.castShadow = true;
    leftUpperLeg.add(leftThigh);

    const leftLowerLeg = new THREE.Group();
    leftLowerLeg.position.set(0, -0.4, 0);
    leftUpperLeg.add(leftLowerLeg);

    const leftCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.42, 8), clothMainMat);
    leftCalf.position.y = -0.2;
    leftCalf.castShadow = true;
    leftLowerLeg.add(leftCalf);

    const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.22), armorMat);
    leftFoot.position.set(0, -0.44, 0.05);
    leftLowerLeg.add(leftFoot);

    // Right leg
    const rightUpperLeg = new THREE.Group();
    rightUpperLeg.position.set(0.13, -0.08, 0);
    hips.add(rightUpperLeg);

    const rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.42, 8), clothMainMat);
    rightThigh.position.y = -0.2;
    rightThigh.castShadow = true;
    rightUpperLeg.add(rightThigh);

    const rightLowerLeg = new THREE.Group();
    rightLowerLeg.position.set(0, -0.4, 0);
    rightUpperLeg.add(rightLowerLeg);

    const rightCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.42, 8), clothMainMat);
    rightCalf.position.y = -0.2;
    rightCalf.castShadow = true;
    rightLowerLeg.add(rightCalf);

    const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.22), armorMat);
    rightFoot.position.set(0, -0.44, 0.05);
    rightLowerLeg.add(rightFoot);

    // --- SPINE & CHEST ---
    const spine = new THREE.Group();
    spine.position.y = 0.12;
    hips.add(spine);

    const chest = new THREE.Group();
    chest.position.y = 0.22;
    spine.add(chest);

    // Torso / Kimono
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.26), clothMainMat);
    torsoMesh.castShadow = true;
    chest.add(torsoMesh);

    // Armor breastplate (Do)
    const armorPlate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.14), armorMat);
    armorPlate.position.set(0, 0, 0.08);
    chest.add(armorPlate);

    if (isBoss) {
      // Golden clan emblem on boss chest
      const bossEmblem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), goldMat);
      bossEmblem.rotation.x = Math.PI / 2;
      bossEmblem.position.set(0, 0.04, 0.16);
      chest.add(bossEmblem);

      // Armored shoulder pauldrons (Sode)
      const leftSode = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.08), armorMat);
      leftSode.position.set(-0.35, 0.12, 0);
      leftSode.rotation.z = -0.25;
      chest.add(leftSode);

      const rightSode = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.08), armorMat);
      rightSode.position.set(0.35, 0.12, 0);
      rightSode.rotation.z = 0.25;
      chest.add(rightSode);

      // Flowing boss crimson cloak
      const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.95, 0.05), clothAccentMat);
      cloak.position.set(0, -0.3, -0.16);
      cloak.rotation.x = 0.1;
      chest.add(cloak);
    }

    // --- HEAD & HELMET / HAT ---
    const head = new THREE.Group();
    head.position.y = 0.32;
    chest.add(head);

    // Head base
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinMat);
    headMesh.castShadow = true;
    head.add(headMesh);

    if (isPlayer) {
      // Ronin samurai headband / hair knot (Chonmage)
      const headband = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.02, 6, 16), clothAccentMat);
      headband.rotation.x = Math.PI / 2;
      headband.position.y = 0.03;
      head.add(headband);

      // Trailing cloth ribbons
      const ribbons = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.02), clothAccentMat);
      ribbons.position.set(0, -0.08, -0.16);
      ribbons.rotation.x = -0.2;
      head.add(ribbons);

      const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), armorMat);
      hairTop.position.set(0, 0.16, -0.05);
      head.add(hairTop);
    } else if (isBoss) {
      // Warlord Kabuto Helmet with golden crescent horn (Kuwagata)
      const kabuto = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), armorMat);
      kabuto.position.y = 0.05;
      head.add(kabuto);

      // Shikoro neck guard
      const neckGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 10, 1, true, 0, Math.PI), armorMat);
      neckGuard.position.set(0, -0.04, 0);
      neckGuard.rotation.y = Math.PI / 2;
      head.add(neckGuard);

      // Golden Kuwagata crescent
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 16, Math.PI * 0.7), goldMat);
      horn.rotation.z = Math.PI * 0.65;
      horn.position.set(0, 0.22, 0.14);
      head.add(horn);

      // Demonic Oni face mask (Menpo)
      const menpo = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.12), armorMat);
      menpo.position.set(0, -0.04, 0.1);
      head.add(menpo);
    } else {
      // Ashigaru conical straw hat (Jingasa)
      const jingasa = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.14, 12), armorMat);
      jingasa.position.y = 0.14;
      head.add(jingasa);
    }

    // --- LEFT ARM ---
    const leftUpperArm = new THREE.Group();
    leftUpperArm.position.set(-0.28, 0.12, 0);
    chest.add(leftUpperArm);

    const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.3, 8), clothMainMat);
    leftArmMesh.position.y = -0.15;
    leftArmMesh.castShadow = true;
    leftUpperArm.add(leftArmMesh);

    const leftForearm = new THREE.Group();
    leftForearm.position.set(0, -0.3, 0);
    leftUpperArm.add(leftForearm);

    const leftForearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.28, 8), skinMat);
    leftForearmMesh.position.y = -0.14;
    leftForearmMesh.castShadow = true;
    leftForearm.add(leftForearmMesh);

    // Left hand
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
    leftHand.position.y = -0.28;
    leftForearm.add(leftHand);

    // --- RIGHT ARM & WEAPON ---
    const rightUpperArm = new THREE.Group();
    rightUpperArm.position.set(0.28, 0.12, 0);
    chest.add(rightUpperArm);

    const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.3, 8), clothMainMat);
    rightArmMesh.position.y = -0.15;
    rightArmMesh.castShadow = true;
    rightUpperArm.add(rightArmMesh);

    const rightForearm = new THREE.Group();
    rightForearm.position.set(0, -0.3, 0);
    rightUpperArm.add(rightForearm);

    const rightForearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.28, 8), skinMat);
    rightForearmMesh.position.y = -0.14;
    rightForearmMesh.castShadow = true;
    rightForearm.add(rightForearmMesh);

    const rightHand = new THREE.Group();
    rightHand.position.y = -0.28;
    rightForearm.add(rightHand);

    const rightHandMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
    rightHand.add(rightHandMesh);

    // --- WEAPON (KATANA / NODACHI) ---
    const swordGroup = new THREE.Group();
    swordGroup.position.set(0, 0, 0);
    rightHand.add(swordGroup);

    // Grip / Tsuka
    const hiltLen = isBoss ? 0.45 : 0.32;
    const hiltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, hiltLen, 8), clothAccentMat);
    hiltMesh.position.y = -hiltLen * 0.3;
    swordGroup.add(hiltMesh);

    // Handguard / Tsuba
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.015, 10), goldMat);
    tsuba.position.y = 0.02;
    swordGroup.add(tsuba);

    // Steel Blade
    const bladeLen = isBoss ? 1.65 : 1.05;
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xefefef,
      metalness: 0.95,
      roughness: 0.15,
      emissive: isBoss ? 0x660011 : isPlayer ? 0x001133 : 0x111111,
      emissiveIntensity: 0.4,
    });

    const bladeGeo = new THREE.BoxGeometry(0.02, bladeLen, 0.06);
    // Taper tip slightly
    const pos = bladeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > bladeLen * 0.4) {
        pos.setZ(i, pos.getZ(i) * 0.4);
      }
    }
    bladeGeo.computeVertexNormals();

    const swordBlade = new THREE.Mesh(bladeGeo, bladeMat);
    swordBlade.position.set(0, bladeLen * 0.5 + 0.03, 0.01);
    swordBlade.castShadow = true;
    swordGroup.add(swordBlade);

    // Blade tip anchor for hit detection & motion trail
    const swordTip = new THREE.Object3D();
    swordTip.position.set(0, bladeLen + 0.05, 0);
    swordGroup.add(swordTip);

    // Initial default sword rotation in hand
    swordGroup.rotation.x = Math.PI * 0.5;

    // --- SWORD MOTION TRAIL RIBBON ---
    const trailSegments = 16;
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(trailSegments * 2 * 3);
    const trailAlphas = new Float32Array(trailSegments * 2);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(trailAlphas, 1));

    const trailMat = new THREE.MeshBasicMaterial({
      color: isBoss ? 0xff2244 : 0x70d6ff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const trailMesh = new THREE.Mesh(trailGeometry, trailMat);
    trailMesh.frustumCulled = false;

    // Boss Phase 3 Dark Fiery Aura Mesh
    let auraMesh: THREE.Mesh | undefined;
    if (isBoss) {
      const auraGeo = new THREE.SphereGeometry(1.6, 16, 16);
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0xcc1122,
        transparent: true,
        opacity: 0,
        wireframe: true,
        blending: THREE.AdditiveBlending,
      });
      auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.position.y = 1.0;
      root.add(auraMesh);
    }

    return {
      root,
      hips,
      spine,
      chest,
      head,
      leftUpperLeg,
      leftLowerLeg,
      rightUpperLeg,
      rightLowerLeg,
      leftUpperArm,
      leftForearm,
      rightUpperArm,
      rightForearm,
      rightHand,
      swordGroup,
      swordBlade,
      swordTip,
      trailMesh,
      trailGeometry,
      trailPoints: [],
      auraMesh,
    };
  }

  setBladeStanceColor(trailColor: number, bladeEmissive: number) {
    if (this.joints.trailMesh && this.joints.trailMesh.material) {
      const mat = this.joints.trailMesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(trailColor);
    }
    if (this.joints.swordBlade && this.joints.swordBlade.material) {
      const mat = this.joints.swordBlade.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(bladeEmissive);
      mat.emissiveIntensity = 0.8;
    }
  }

  setAnimation(anim: AnimState, duration: number = 0.5) {
    if (this.currentAnim === anim && (anim === 'idle' || anim === 'walk' || anim === 'run' || anim === 'sprint')) {
      return;
    }
    this.currentAnim = anim;
    this.animTimer = 0;
    this.animDuration = duration;

    const attackKeywords = [
      'attack',
      'slash',
      'thrust',
      'sweep',
      'whirlwind',
      'ichimonji',
      'slam',
      'iaijutsu',
      'rush',
      'uppercut',
    ];
    this.isAttacking = attackKeywords.some(k => anim.includes(k));
  }

  /**
   * Procedural skeletal animation updates evaluated each frame.
   */
  update(dt: number) {
    if (this.type === 'dummy') return;

    this.animTimer += dt;
    const t = this.animTimer;
    const progress = Math.min(1.0, this.animTimer / this.animDuration);
    this.attackNormalizedTime = progress;

    const j = this.joints;

    // Reset common transforms to baseline before applying anim poses
    j.hips.position.y = 0.95;
    j.hips.rotation.set(0, 0, 0);
    j.spine.rotation.set(0, 0, 0);
    j.chest.rotation.set(0, 0, 0);
    j.head.rotation.set(0, 0, 0);

    // Update motion trail
    this.updateSwordTrail(dt);

    // Apply procedural animation blends
    switch (this.currentAnim) {
      case 'idle': {
        const breathe = Math.sin(t * 2.2) * 0.03;
        j.chest.position.y = 0.22 + breathe;
        j.head.rotation.x = Math.sin(t * 2.2) * 0.04;
        j.leftUpperLeg.rotation.set(0, 0, -0.05);
        j.rightUpperLeg.rotation.set(0, 0, 0.05);
        j.leftLowerLeg.rotation.set(0, 0, 0);
        j.rightLowerLeg.rotation.set(0, 0, 0);

        if (this.isGuarding) {
          this.applyGuardPose();
        } else {
          // Relaxed ready stance
          j.leftUpperArm.rotation.set(0.2, 0, 0.3);
          j.leftForearm.rotation.set(-0.4, 0, 0);
          j.rightUpperArm.rotation.set(0.1, 0, -0.2);
          j.rightForearm.rotation.set(-0.6, 0.2, 0);
          j.swordGroup.rotation.set(1.4, 0.2, -0.4);
        }
        break;
      }

      case 'walk':
      case 'run':
      case 'sprint': {
        const speedMult = this.currentAnim === 'sprint' ? 14 : this.currentAnim === 'run' ? 9.5 : 6.0;
        this.runCycle += dt * speedMult;
        const cycle = this.runCycle;

        // Hip bounce and tilt
        const bounce = Math.abs(Math.sin(cycle)) * (this.currentAnim === 'sprint' ? 0.08 : 0.04);
        j.hips.position.y = 0.95 + bounce;
        j.spine.rotation.y = Math.sin(cycle) * 0.15;
        j.spine.rotation.x = this.currentAnim === 'sprint' ? 0.25 : 0.1; // Forward lean

        // Leg cycles
        const legAmp = this.currentAnim === 'sprint' ? 0.95 : this.currentAnim === 'run' ? 0.65 : 0.45;
        j.leftUpperLeg.rotation.x = Math.sin(cycle) * legAmp;
        j.rightUpperLeg.rotation.x = -Math.sin(cycle) * legAmp;

        j.leftLowerLeg.rotation.x = Math.max(0, -Math.sin(cycle) * legAmp * 1.3);
        j.rightLowerLeg.rotation.x = Math.max(0, Math.sin(cycle) * legAmp * 1.3);

        if (this.isGuarding) {
          this.applyGuardPose();
        } else {
          // Dynamic arm swings
          const armAmp = this.currentAnim === 'sprint' ? 0.9 : 0.5;
          j.leftUpperArm.rotation.x = -Math.sin(cycle) * armAmp;
          j.leftForearm.rotation.x = -0.5;

          j.rightUpperArm.rotation.x = Math.sin(cycle) * armAmp * 0.6;
          j.rightForearm.rotation.x = -0.4;
          j.swordGroup.rotation.set(1.5, 0, -0.2);
        }
        break;
      }

      case 'crouch':
      case 'crouch_walk': {
        j.hips.position.y = 0.65;
        j.spine.rotation.x = 0.45; // Deep stealth crouch
        j.leftUpperLeg.rotation.set(-0.6, 0, -0.2);
        j.rightUpperLeg.rotation.set(-0.6, 0, 0.2);
        j.leftLowerLeg.rotation.set(0.9, 0, 0);
        j.rightLowerLeg.rotation.set(0.9, 0, 0);

        if (this.currentAnim === 'crouch_walk') {
          this.runCycle += dt * 4.5;
          j.leftUpperLeg.rotation.x = -0.6 + Math.sin(this.runCycle) * 0.3;
          j.rightUpperLeg.rotation.x = -0.6 - Math.sin(this.runCycle) * 0.3;
        }

        j.leftUpperArm.rotation.set(0.4, 0, 0.4);
        j.rightUpperArm.rotation.set(0.3, 0, -0.3);
        j.swordGroup.rotation.set(1.2, 0, 0);
        break;
      }

      case 'guard': {
        this.applyGuardPose();
        break;
      }

      case 'deflect': {
        // Snappy forward push with sword clang recoil
        const recoil = Math.sin(progress * Math.PI);
        j.spine.rotation.x = -0.15 * recoil;
        j.spine.rotation.y = 0.2 * recoil;

        j.rightUpperArm.rotation.set(0.6 + 0.3 * recoil, 0, -0.4);
        j.rightForearm.rotation.set(-1.4 - 0.2 * recoil, 0.8, 0);
        j.leftUpperArm.rotation.set(0.7, 0, 0.4);
        j.leftForearm.rotation.set(-1.3, -0.6, 0);

        // Katana horizontal blade deflect pose
        j.swordGroup.rotation.set(0.3, 0.4, -0.8 + 0.5 * recoil);
        break;
      }

      case 'attack1': {
        // Combo 1: Horizontal right-to-left sweep
        // Phases: 0-0.3 anticipation, 0.3-0.6 active slash, 0.6-1.0 recovery
        if (progress < 0.3) {
          const windup = progress / 0.3;
          this.attackPhase = 'anticipation';
          j.spine.rotation.y = -0.6 * windup;
          j.rightUpperArm.rotation.set(0.4, -0.4, -0.6 * windup);
          j.rightForearm.rotation.set(-0.8, 0, 0);
          j.swordGroup.rotation.set(1.0, 0.6, -1.2);
        } else if (progress < 0.6) {
          const active = (progress - 0.3) / 0.3;
          this.attackPhase = 'active';
          j.spine.rotation.y = -0.6 + 1.3 * active;
          j.rightUpperArm.rotation.set(0.6, 0.6 * active, 0.3);
          j.rightForearm.rotation.set(-0.3, 0, 0);
          j.swordGroup.rotation.set(0.4, -0.2, 0.8 + 1.2 * active);
        } else {
          this.attackPhase = 'recovery';
          const rec = (progress - 0.6) / 0.4;
          j.spine.rotation.y = 0.7 * (1 - rec);
          j.swordGroup.rotation.set(1.0, 0, 0.4);
        }
        break;
      }

      case 'attack2': {
        // Combo 2: Diagonal upward rising slash
        if (progress < 0.25) {
          this.attackPhase = 'anticipation';
          const windup = progress / 0.25;
          j.spine.rotation.set(0.2, 0.5 * windup, 0);
          j.rightUpperArm.rotation.set(0.8, 0, 0.5);
          j.swordGroup.rotation.set(2.2, 0, 0.4);
        } else if (progress < 0.55) {
          this.attackPhase = 'active';
          const active = (progress - 0.25) / 0.3;
          j.spine.rotation.set(-0.15, 0.5 - 1.1 * active, 0);
          j.rightUpperArm.rotation.set(-0.6, 0.2, -0.4);
          j.swordGroup.rotation.set(-0.5, 0.3, -1.2);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'attack3': {
        // Combo 3: Overhead leaping vertical strike
        if (progress < 0.35) {
          this.attackPhase = 'anticipation';
          const p = progress / 0.35;
          j.hips.position.y = 0.95 + 0.35 * Math.sin(p * Math.PI);
          j.spine.rotation.x = -0.3;
          j.rightUpperArm.rotation.set(-1.8 * p, 0, 0);
          j.leftUpperArm.rotation.set(-1.8 * p, 0, 0);
          j.swordGroup.rotation.set(-0.4, 0, 0);
        } else if (progress < 0.65) {
          this.attackPhase = 'active';
          const active = (progress - 0.35) / 0.3;
          j.hips.position.y = 0.95 - 0.15 * active;
          j.spine.rotation.x = 0.4 * active;
          j.rightUpperArm.rotation.set(0.8, 0, 0);
          j.leftUpperArm.rotation.set(0.8, 0, 0);
          j.swordGroup.rotation.set(2.4, 0, 0);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      // ==========================================
      // WATER STYLE (FLOWING SHADOW): Fast & Fluid
      // ==========================================
      case 'water_slash1': {
        // Fast horizontal flowing cut right-to-left
        if (progress < 0.22) {
          this.attackPhase = 'anticipation';
          const w = progress / 0.22;
          j.spine.rotation.y = -0.7 * w;
          j.rightUpperArm.rotation.set(0.3, -0.5 * w, -0.6 * w);
          j.swordGroup.rotation.set(1.1, 0.4, -1.3);
        } else if (progress < 0.58) {
          this.attackPhase = 'active';
          const a = (progress - 0.22) / 0.36;
          j.spine.rotation.y = -0.7 + 1.5 * a;
          j.rightUpperArm.rotation.set(0.5, 0.6 * a, 0.4);
          j.swordGroup.rotation.set(0.4, -0.3, 0.6 + 1.4 * a);
        } else {
          this.attackPhase = 'recovery';
          const r = (progress - 0.58) / 0.42;
          j.spine.rotation.y = 0.8 * (1 - r);
        }
        break;
      }

      case 'water_slash2': {
        // Rising backhand slash left-to-right
        if (progress < 0.2) {
          this.attackPhase = 'anticipation';
          j.spine.rotation.y = 0.6;
          j.rightUpperArm.rotation.set(0.6, 0.3, 0.6);
          j.swordGroup.rotation.set(2.2, -0.4, 0.4);
        } else if (progress < 0.55) {
          this.attackPhase = 'active';
          const a = (progress - 0.2) / 0.35;
          j.spine.rotation.y = 0.6 - 1.3 * a;
          j.rightUpperArm.rotation.set(-0.7, 0.2, -0.5);
          j.swordGroup.rotation.set(-0.6, 0.4, -1.3);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'water_whirlwind': {
        // Full 360-degree spinning vortex blade sweep
        if (progress < 0.25) {
          this.attackPhase = 'anticipation';
          j.hips.position.y = 0.8;
          j.spine.rotation.y = -0.8;
          j.rightUpperArm.rotation.set(0.4, -0.4, -0.8);
          j.leftUpperArm.rotation.set(0.4, 0.4, 0.8);
          j.swordGroup.rotation.set(1.2, 0, -1.4);
        } else if (progress < 0.7) {
          this.attackPhase = 'active';
          const a = (progress - 0.25) / 0.45;
          j.root.rotation.y += dt * 18.0; // Spin full 360 rotation!
          j.hips.position.y = 0.9 + Math.sin(a * Math.PI) * 0.2;
          j.rightUpperArm.rotation.set(1.3, 0, 0.3);
          j.leftUpperArm.rotation.set(1.3, 0, -0.3);
          j.swordGroup.rotation.set(0.2, 0, 1.57); // Extended horizontal blade
        } else {
          this.attackPhase = 'recovery';
          j.hips.position.y = 0.95;
        }
        break;
      }

      // ==========================================
      // FLAME STYLE (FIERCE EMBERS): Heavy & Poise Crushing
      // ==========================================
      case 'flame_slash1': {
        // Deep step-in diagonal downward cleave
        if (progress < 0.35) {
          this.attackPhase = 'anticipation';
          const w = progress / 0.35;
          j.hips.position.y = 0.88;
          j.spine.rotation.set(-0.25, 0.4 * w, 0);
          j.rightUpperArm.rotation.set(-1.4 * w, 0, 0.3);
          j.leftUpperArm.rotation.set(-1.3 * w, 0, -0.3);
          j.swordGroup.rotation.set(-0.3, 0, 0.2);
        } else if (progress < 0.65) {
          this.attackPhase = 'active';
          const a = (progress - 0.35) / 0.3;
          j.hips.position.y = 0.85;
          j.spine.rotation.set(0.35, -0.2, 0);
          j.rightUpperArm.rotation.set(1.2, 0, -0.2);
          j.leftUpperArm.rotation.set(1.1, 0, 0.2);
          j.swordGroup.rotation.set(2.2, 0, -0.3);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'flame_uppercut': {
        // Rising vertical flame slash
        if (progress < 0.28) {
          this.attackPhase = 'anticipation';
          j.hips.position.y = 0.75;
          j.spine.rotation.x = 0.35;
          j.rightUpperArm.rotation.set(0.8, 0, 0.4);
          j.swordGroup.rotation.set(2.6, 0, 0);
        } else if (progress < 0.62) {
          this.attackPhase = 'active';
          const a = (progress - 0.28) / 0.34;
          j.hips.position.y = 0.95 + a * 0.2; // Rising jump
          j.spine.rotation.x = -0.35;
          j.rightUpperArm.rotation.set(-1.6, 0, 0);
          j.swordGroup.rotation.set(-0.5, 0, 0);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'ichimonji': {
        // Sekiro's iconic Ichimonji: Two-handed heavy overhead cleave
        if (progress < 0.45) {
          this.attackPhase = 'anticipation';
          const w = progress / 0.45;
          // Hold high overhead stance
          j.hips.position.y = 0.95;
          j.spine.rotation.set(-0.35 * w, 0, 0);
          j.head.rotation.x = 0.2;
          j.rightUpperArm.rotation.set(-2.2 * w, 0, 0.1);
          j.leftUpperArm.rotation.set(-2.2 * w, 0, -0.1);
          j.rightForearm.rotation.set(-0.4, 0, 0);
          j.leftForearm.rotation.set(-0.4, 0, 0);
          j.swordGroup.rotation.set(-0.3, 0, 0);
        } else if (progress < 0.72) {
          this.attackPhase = 'active';
          const a = (progress - 0.45) / 0.27;
          // Crushing downward cleave with deep step
          j.hips.position.y = 0.78;
          j.spine.rotation.set(0.45, 0, 0);
          j.rightUpperArm.rotation.set(1.4, 0, 0);
          j.leftUpperArm.rotation.set(1.4, 0, 0);
          j.rightForearm.rotation.set(0, 0, 0);
          j.leftForearm.rotation.set(0, 0, 0);
          j.swordGroup.rotation.set(2.7, 0, 0); // Slam blade down
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'flame_slam': {
        // Leaping ground slam
        if (progress < 0.4) {
          this.attackPhase = 'anticipation';
          const p = progress / 0.4;
          j.hips.position.y = 1.3 + Math.sin(p * Math.PI) * 0.5; // Leap high into air
          j.rightUpperArm.rotation.set(-2.4, 0, 0);
          j.leftUpperArm.rotation.set(-2.4, 0, 0);
          j.swordGroup.rotation.set(-0.5, 0, 0);
        } else if (progress < 0.7) {
          this.attackPhase = 'active';
          j.hips.position.y = 0.65; // Slam into ground
          j.spine.rotation.x = 0.55;
          j.rightUpperArm.rotation.set(1.5, 0, 0);
          j.leftUpperArm.rotation.set(1.5, 0, 0);
          j.swordGroup.rotation.set(2.8, 0, 0);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      // ==========================================
      // THUNDER STYLE (INSTANT FLASH): Speed & Thrust
      // ==========================================
      case 'thunder_iaijutsu': {
        // Lightning-fast quick draw slash from sheath
        if (progress < 0.25) {
          this.attackPhase = 'anticipation';
          j.hips.position.y = 0.8;
          j.spine.rotation.set(0.2, -0.6, 0);
          // Hand on hilt at hip
          j.rightUpperArm.rotation.set(0.3, 0, -0.4);
          j.rightForearm.rotation.set(-1.5, 0.4, 0);
          j.swordGroup.rotation.set(0.2, -0.4, -0.2);
        } else if (progress < 0.55) {
          this.attackPhase = 'active';
          const a = (progress - 0.25) / 0.3;
          // Flash draw cut across chest
          j.spine.rotation.set(-0.1, 0.8 * a, 0);
          j.rightUpperArm.rotation.set(0.7, 0.7, 0.4);
          j.rightForearm.rotation.set(-0.2, 0, 0);
          j.swordGroup.rotation.set(0.1, 0, 1.8);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'thunder_thrust': {
        // High speed forward lunging thrust
        if (progress < 0.22) {
          this.attackPhase = 'anticipation';
          j.spine.rotation.y = -0.5;
          j.rightUpperArm.rotation.set(0.5, 0, -0.5);
          j.rightForearm.rotation.set(-1.4, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0);
        } else if (progress < 0.55) {
          this.attackPhase = 'active';
          const a = (progress - 0.22) / 0.33;
          j.hips.position.z = 0.6 * a;
          j.rightUpperArm.rotation.set(1.57, 0, 0);
          j.rightForearm.rotation.set(0, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'thunder_rush': {
        // Supersonic sprint thrust forward
        if (progress < 0.2) {
          this.attackPhase = 'anticipation';
          j.spine.rotation.x = 0.4;
          j.rightUpperArm.rotation.set(1.2, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0);
        } else if (progress < 0.65) {
          this.attackPhase = 'active';
          j.spine.rotation.x = 0.5; // Streamlined forward lean
          j.rightUpperArm.rotation.set(1.57, 0, 0);
          j.rightForearm.rotation.set(0, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'thrust': {
        // Perilous Thrust: Step back then high-speed linear lunge
        if (progress < 0.4) {
          this.attackPhase = 'anticipation';
          j.spine.rotation.y = -0.5;
          j.rightUpperArm.rotation.set(0.4, 0, -0.4);
          j.rightForearm.rotation.set(-1.2, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0); // Pointing forward
        } else if (progress < 0.7) {
          this.attackPhase = 'active';
          const a = (progress - 0.4) / 0.3;
          j.hips.position.z = 0.4 * a;
          j.spine.rotation.y = 0.2;
          j.rightUpperArm.rotation.set(1.57, 0, 0);
          j.rightForearm.rotation.set(0, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0);
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'sweep': {
        // Perilous Sweep: 360 degree low spinning leg blade sweep
        if (progress < 0.3) {
          this.attackPhase = 'anticipation';
          j.hips.position.y = 0.6;
          j.spine.rotation.x = 0.4;
        } else if (progress < 0.7) {
          this.attackPhase = 'active';
          const a = (progress - 0.3) / 0.4;
          j.hips.position.y = 0.55;
          j.root.rotation.y += dt * 16.0; // Spin full turn
          j.rightUpperArm.rotation.set(1.2, 0, 0.4);
          j.swordGroup.rotation.set(0.1, 0, 1.57); // Horizontal near ground
        } else {
          this.attackPhase = 'recovery';
        }
        break;
      }

      case 'dodge': {
        // Low evasion roll / hop
        const roll = progress * Math.PI * 2;
        j.hips.position.y = 0.6 + Math.sin(progress * Math.PI) * 0.25;
        j.spine.rotation.x = 0.6;
        j.leftUpperLeg.rotation.set(-0.8, 0, 0);
        j.rightUpperLeg.rotation.set(-0.8, 0, 0);
        j.swordGroup.rotation.set(1.2, 0, 0);
        break;
      }

      case 'drink': {
        // Healing gourd drinking animation
        j.leftUpperArm.rotation.set(-0.9, 0, 0.4);
        j.leftForearm.rotation.set(-1.4, 0, 0);
        j.head.rotation.x = -0.45; // Head tilted back
        j.rightUpperArm.rotation.set(0.3, 0, -0.3);
        break;
      }

      case 'stagger': {
        // Posture Broken: head hanging back, gasping, chest open
        const shake = Math.sin(t * 18.0) * 0.05;
        j.spine.rotation.set(-0.35 + shake, shake, 0);
        j.head.rotation.set(-0.4, 0, 0);
        j.leftUpperArm.rotation.set(0.2, 0, 0.6);
        j.rightUpperArm.rotation.set(0.2, 0, -0.6);
        j.swordGroup.rotation.set(2.0, 0, 0); // Blade drooping
        break;
      }

      case 'death': {
        // Dramatic collapse to floor
        const fall = Math.min(1.0, progress * 1.5);
        j.hips.position.y = 0.95 * (1 - fall) + 0.15;
        j.root.rotation.x = fall * Math.PI * 0.45;
        j.head.rotation.x = 0.4;
        break;
      }

      case 'finisher_attacker': {
        // High execution strike: steps in, drives katana straight through victim
        if (progress < 0.4) {
          j.spine.rotation.y = -0.4;
          j.rightUpperArm.rotation.set(1.2, 0, -0.3);
          j.rightForearm.rotation.set(-0.8, 0, 0);
        } else {
          j.spine.rotation.y = 0.3;
          j.rightUpperArm.rotation.set(1.5, 0, 0);
          j.rightForearm.rotation.set(0, 0, 0);
          j.swordGroup.rotation.set(1.57, 0, 0);
        }
        break;
      }

      case 'finisher_victim': {
        // Impaled reaction: arching back, staggering
        j.spine.rotation.x = -0.55;
        j.head.rotation.x = -0.5;
        j.leftUpperArm.rotation.set(-0.6, 0, 0.8);
        j.rightUpperArm.rotation.set(-0.6, 0, -0.8);
        break;
      }
    }
  }

  private applyGuardPose() {
    const j = this.joints;
    j.spine.rotation.y = 0.25;
    j.leftUpperArm.rotation.set(0.65, 0, 0.45);
    j.leftForearm.rotation.set(-1.25, -0.4, 0);
    j.rightUpperArm.rotation.set(0.65, 0, -0.45);
    j.rightForearm.rotation.set(-1.25, 0.4, 0);
    // Two hands holding katana angled firmly across chest
    j.swordGroup.rotation.set(0.4, 0.2, -0.65);
  }

  /**
   * Tracks sword tip and base positions across frames to generate dynamic ribbon trails.
   */
  private updateSwordTrail(dt: number) {
    if (!this.joints.trailGeometry || !this.joints.trailMesh) return;

    // Get current world coordinates of sword tip and base
    const tipWorld = new THREE.Vector3();
    const baseWorld = new THREE.Vector3();
    this.joints.swordTip.getWorldPosition(tipWorld);
    this.joints.swordBlade.getWorldPosition(baseWorld);

    // Only add points if actively swinging
    if (this.isAttacking && this.attackPhase === 'active') {
      this.joints.trailPoints.unshift({
        tip: tipWorld.clone(),
        base: baseWorld.clone(),
        age: 0,
      });
    }

    // Age existing points and cull old ones
    for (let i = this.joints.trailPoints.length - 1; i >= 0; i--) {
      this.joints.trailPoints[i].age += dt;
      if (this.joints.trailPoints[i].age > 0.22) {
        this.joints.trailPoints.splice(i, 1);
      }
    }

    const maxSegments = 16;
    const pts = this.joints.trailPoints;
    const posAttr = this.joints.trailGeometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < maxSegments; i++) {
      if (i < pts.length) {
        const p = pts[i];
        posAttr.setXYZ(i * 2, p.tip.x, p.tip.y, p.tip.z);
        posAttr.setXYZ(i * 2 + 1, p.base.x, p.base.y, p.base.z);
      } else if (pts.length > 0) {
        // Collapse tail
        const last = pts[pts.length - 1];
        posAttr.setXYZ(i * 2, last.tip.x, last.tip.y, last.tip.z);
        posAttr.setXYZ(i * 2 + 1, last.base.x, last.base.y, last.base.z);
      } else {
        posAttr.setXYZ(i * 2, tipWorld.x, tipWorld.y, tipWorld.z);
        posAttr.setXYZ(i * 2 + 1, baseWorld.x, baseWorld.y, baseWorld.z);
      }
    }
    posAttr.needsUpdate = true;
  }
}
