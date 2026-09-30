/**
 * Procedural world environment for Ronin's Edge.
 * Builds Japanese feudal mountain temple courtyard, pagoda, torii gates,
 * cherry blossom trees, lanterns, grapple points, and checkpoint shrines.
 */
import * as THREE from 'three';
import { textures } from './textures';

export interface GrapplePoint {
  id: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
}

export interface Checkpoint {
  id: string;
  position: THREE.Vector3;
  mesh: THREE.Group;
  light: THREE.PointLight;
}

export interface LanternLight {
  light: THREE.PointLight;
  baseIntensity: number;
  flickerSpeed: number;
  offset: number;
}

export class WorldBuilder {
  scene: THREE.Scene;
  grapplePoints: GrapplePoint[] = [];
  checkpoints: Checkpoint[] = [];
  lanternLights: LanternLight[] = [];
  colliderMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  buildAll() {
    this.createAtmosphere();
    this.createCourtyardGround();
    this.createPagoda();
    this.createToriiGates();
    this.createBridge();
    this.createStoneLanterns();
    this.createCherryBlossomTrees();
    this.createCheckpoints();
    this.createArenaEnclosure();
  }

  /**
   * Moonlit dusk twilight atmosphere with large stylized moon and light shafts.
   */
  private createAtmosphere() {
    // Sky gradient hemisphere
    const skyGeo = new THREE.SphereGeometry(180, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x0c1424,
      side: THREE.BackSide,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyDome);

    // Distant mountain silhouettes
    const mountainMat = new THREE.MeshBasicMaterial({ color: 0x080c18 });
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const dist = 140;
      const height = 45 + Math.sin(i * 3) * 20;
      const width = 60 + Math.cos(i * 2) * 25;

      const cone = new THREE.Mesh(new THREE.ConeGeometry(width, height, 5), mountainMat);
      cone.position.set(Math.cos(angle) * dist, height * 0.4 - 10, Math.sin(angle) * dist);
      this.scene.add(cone);
    }

    // Grand Full Moon
    const moonGeo = new THREE.SphereGeometry(14, 24, 24);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xf4f7ff,
    });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(60, 85, -95);
    this.scene.add(moon);

    // Moon Glow Halo
    const haloGeo = new THREE.PlaneGeometry(65, 65);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x7a9ee0,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(moon.position);
    halo.position.z += 2;
    halo.lookAt(0, 0, 0);
    this.scene.add(halo);

    // Directional Moonlight
    const moonLight = new THREE.DirectionalLight(0x96b6e8, 1.4);
    moonLight.position.set(60, 85, -95);
    moonLight.target.position.set(0, 0, 0);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 2048;
    moonLight.shadow.mapSize.height = 2048;
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 250;
    const d = 55;
    moonLight.shadow.camera.left = -d;
    moonLight.shadow.camera.right = d;
    moonLight.shadow.camera.top = d;
    moonLight.shadow.camera.bottom = -d;
    moonLight.shadow.bias = -0.0005;
    this.scene.add(moonLight);
    this.scene.add(moonLight.target);

    // Ambient Twilight Fill Light
    const ambientLight = new THREE.AmbientLight(0x28344e, 0.85);
    this.scene.add(ambientLight);

    // Fog for depth
    this.scene.fog = new THREE.FogExp2(0x0e1628, 0.012);
  }

  /**
   * Stone courtyard ground paving and gravel zen gardens.
   */
  private createCourtyardGround() {
    const stoneTex = textures.createStoneTexture();

    const groundMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.85,
      metalness: 0.1,
    });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.colliderMeshes.push(ground);

    // Raised stone boundary curbs & platforms
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x30353d, roughness: 0.8 });
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(110, 3.5, 2.0), curbMat);
    northWall.position.set(0, 1.75, -55);
    northWall.castShadow = true;
    this.scene.add(northWall);
    this.colliderMeshes.push(northWall);

    const southWall = new THREE.Mesh(new THREE.BoxGeometry(110, 3.5, 2.0), curbMat);
    southWall.position.set(0, 1.75, 55);
    southWall.castShadow = true;
    this.scene.add(southWall);
    this.colliderMeshes.push(southWall);

    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.5, 110), curbMat);
    eastWall.position.set(55, 1.75, 0);
    eastWall.castShadow = true;
    this.scene.add(eastWall);
    this.colliderMeshes.push(eastWall);

    const westWall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.5, 110), curbMat);
    westWall.position.set(-55, 1.75, 0);
    westWall.castShadow = true;
    this.scene.add(westWall);
    this.colliderMeshes.push(westWall);
  }

  /**
   * Grand 3-tier Japanese Pagoda with rooftop grapple point.
   */
  private createPagoda() {
    const pagodaGroup = new THREE.Group();
    pagodaGroup.position.set(-28, 0, -26);

    const woodTex = textures.createWoodTexture();
    const roofTex = textures.createRoofTileTexture();

    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7 });
    const vermilionMat = new THREE.MeshStandardMaterial({ color: 0xa8281b, roughness: 0.6 });

    // Stone Foundation
    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(12, 1.8, 12), woodMat);
    stoneBase.position.y = 0.9;
    stoneBase.castShadow = true;
    stoneBase.receiveShadow = true;
    pagodaGroup.add(stoneBase);
    this.colliderMeshes.push(stoneBase);

    // 3 Tiers
    const tierHeights = [4.2, 3.6, 3.2];
    const tierWidths = [9.5, 7.8, 6.2];
    let curY = 1.8;

    for (let t = 0; t < 3; t++) {
      const h = tierHeights[t];
      const w = tierWidths[t];

      // Central chamber walls
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), vermilionMat);
      wall.position.y = curY + h * 0.5;
      wall.castShadow = true;
      pagodaGroup.add(wall);
      this.colliderMeshes.push(wall);

      // Wooden corner pillars
      for (const dx of [-w * 0.5, w * 0.5]) {
        for (const dz of [-w * 0.5, w * 0.5]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, h, 8), woodMat);
          pillar.position.set(dx, curY + h * 0.5, dz);
          pillar.castShadow = true;
          pagodaGroup.add(pillar);
        }
      }

      curY += h;

      // Flared Curved Roof Eaves
      const roofOverhang = w * 1.55;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(roofOverhang, 1.6, 4), roofMat);
      roof.position.y = curY + 0.8;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      pagodaGroup.add(roof);

      curY += 1.4;
    }

    // Golden spire finial (Sorin) on top
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
    const sorin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 4.2, 8), spireMat);
    sorin.position.y = curY + 2.0;
    pagodaGroup.add(sorin);

    this.scene.add(pagodaGroup);

    // Grapple anchor on the 2nd tier roof eave
    this.addGrapplePoint('pagoda_roof', new THREE.Vector3(-28, 14.5, -26));
  }

  /**
   * Vermilion Torii Gates framing the arena entrances.
   */
  private createToriiGates() {
    const toriiMat = new THREE.MeshStandardMaterial({ color: 0xb52b1e, roughness: 0.65 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5 });

    const createGate = (x: number, z: number, rotY: number, hasGrapple: boolean = true) => {
      const gate = new THREE.Group();
      gate.position.set(x, 0, z);
      gate.rotation.y = rotY;

      const colH = 6.8;
      const colDist = 3.6;

      // 2 Main Upright Pillars (Hashira)
      for (const dir of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, colH, 12), toriiMat);
        col.position.set(dir * colDist, colH * 0.5, 0);
        col.castShadow = true;
        gate.add(col);

        // Black stone bases
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.7, 12), blackMat);
        base.position.set(dir * colDist, 0.35, 0);
        gate.add(base);
      }

      // Top curved crossbeam (Kasagi)
      const kasagi = new THREE.Mesh(new THREE.BoxGeometry(colDist * 2.8, 0.5, 0.6), toriiMat);
      kasagi.position.y = colH + 0.25;
      kasagi.castShadow = true;
      gate.add(kasagi);

      // Black top cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(colDist * 2.9, 0.15, 0.7), blackMat);
      cap.position.y = colH + 0.55;
      gate.add(cap);

      // Lower crossbeam (Nuki)
      const nuki = new THREE.Mesh(new THREE.BoxGeometry(colDist * 2.4, 0.35, 0.35), toriiMat);
      nuki.position.y = colH - 1.1;
      gate.add(nuki);

      this.scene.add(gate);

      if (hasGrapple) {
        const worldPos = new THREE.Vector3(x, colH + 0.3, z);
        this.addGrapplePoint(`torii_${x}_${z}`, worldPos);
      }
    };

    // Entrance Gate
    createGate(0, 38, 0, true);
    // Boss threshold gate
    createGate(0, -32, 0, true);
    // Side courtyard gate
    createGate(35, 5, Math.PI / 2, true);
  }

  /**
   * Traditional arched wooden bridge over dry zen gravel stream.
   */
  private createBridge() {
    const bridge = new THREE.Group();
    bridge.position.set(18, 0, -8);
    bridge.rotation.y = -Math.PI / 6;

    const woodTex = textures.createWoodTexture();
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0x9e2418, roughness: 0.7 });

    const len = 14;
    const width = 3.6;

    // Curved deck planks
    const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = (u - 0.5) * len;
      const y = Math.sin(u * Math.PI) * 1.5 + 0.2;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(len / segs + 0.05, 0.18, width), woodMat);
      plank.position.set(x, y, 0);
      plank.castShadow = true;
      plank.receiveShadow = true;
      bridge.add(plank);
      this.colliderMeshes.push(plank);
    }

    // Red lacquered railings
    for (const z of [-width * 0.5, width * 0.5]) {
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const x = (u - 0.5) * len;
        const y = Math.sin(u * Math.PI) * 1.5 + 0.6;

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), redMat);
        post.position.set(x, y, z);
        bridge.add(post);
      }
    }

    this.scene.add(bridge);
  }

  /**
   * Traditional Japanese stone lanterns (Ishidoro) with flickering warm light.
   */
  private createStoneLanterns() {
    const lanternPositions = [
      new THREE.Vector3(-12, 0, 15),
      new THREE.Vector3(12, 0, 15),
      new THREE.Vector3(-14, 0, -12),
      new THREE.Vector3(14, 0, -12),
      new THREE.Vector3(-4, 0, 32),
      new THREE.Vector3(4, 0, 32),
      new THREE.Vector3(-8, 0, -36),
      new THREE.Vector3(8, 0, -36),
    ];

    const stoneTex = textures.createStoneTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

    lanternPositions.forEach((pos, idx) => {
      const group = new THREE.Group();
      group.position.copy(pos);

      // Base pedestal
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 6), stoneMat);
      base.position.y = 0.2;
      group.add(base);

      // Post (Sao)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 6), stoneMat);
      post.position.y = 0.95;
      group.add(post);

      // Firebox light chamber (Hibukuro)
      const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.65), stoneMat);
      chamber.position.y = 1.7;
      group.add(chamber);

      // Glowing flame core inside
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), flameMat);
      flame.position.y = 1.7;
      group.add(flame);

      // Roof umbrella (Kasa)
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.35, 6), stoneMat);
      umbrella.position.y = 2.15;
      group.add(umbrella);

      this.scene.add(group);
      this.colliderMeshes.push(base);

      // Warm Point Light with flicker
      const light = new THREE.PointLight(0xff9438, 2.2, 14, 1.8);
      light.position.set(pos.x, 1.8, pos.z);
      this.scene.add(light);

      this.lanternLights.push({
        light,
        baseIntensity: 2.2,
        flickerSpeed: 3.5 + Math.random() * 2.5,
        offset: idx * 1.7,
      });

      // Volumetric light cone illusion
      const coneGeo = new THREE.ConeGeometry(2.4, 3.2, 12, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffa444,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(pos.x, 1.6, pos.z);
      this.scene.add(cone);
    });
  }

  /**
   * Procedural Cherry Blossom Trees (Sakura) with gnarled wood trunks and soft pink petals.
   */
  private createCherryBlossomTrees() {
    const treePositions = [
      new THREE.Vector3(-38, 0, 18),
      new THREE.Vector3(-42, 0, -8),
      new THREE.Vector3(38, 0, 24),
      new THREE.Vector3(42, 0, -18),
      new THREE.Vector3(26, 0, -38),
      new THREE.Vector3(-16, 0, 42),
    ];

    const woodTex = textures.createWoodTexture();
    const trunkMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });

    const blossomMat = new THREE.MeshStandardMaterial({
      color: 0xffadc7,
      roughness: 0.9,
      emissive: 0x4a1828,
      emissiveIntensity: 0.2,
    });

    treePositions.forEach((pos, idx) => {
      const tree = new THREE.Group();
      tree.position.copy(pos);
      tree.rotation.y = idx * 1.2;

      // Curved Trunk
      const trunkH = 5.5 + (idx % 3) * 0.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, trunkH, 8), trunkMat);
      trunk.position.set(0.3, trunkH * 0.5, 0);
      trunk.rotation.z = -0.08;
      trunk.castShadow = true;
      tree.add(trunk);
      this.colliderMeshes.push(trunk);

      // Main branches
      for (let b = 0; b < 4; b++) {
        const angle = (b / 4) * Math.PI * 2;
        const branchLen = 3.2;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.25, branchLen, 6), trunkMat);
        branch.position.set(Math.cos(angle) * 1.2, trunkH * 0.75, Math.sin(angle) * 1.2);
        branch.rotation.set(Math.sin(angle) * 0.6, angle, Math.cos(angle) * 0.6);
        branch.castShadow = true;
        tree.add(branch);

        // Fluffy blossom cluster spheres
        for (let c = 0; c < 3; c++) {
          const sphereR = 1.4 + Math.random() * 0.6;
          const cluster = new THREE.Mesh(new THREE.SphereGeometry(sphereR, 7, 6), blossomMat);
          cluster.position.set(
            Math.cos(angle) * (2.2 + c * 1.1) + (Math.random() - 0.5),
            trunkH * 0.85 + (Math.random() - 0.5) * 1.2,
            Math.sin(angle) * (2.2 + c * 1.1) + (Math.random() - 0.5)
          );
          cluster.castShadow = true;
          tree.add(cluster);
        }
      }

      this.scene.add(tree);
    });
  }

  /**
   * Glowing Checkpoint Stone Shrines (Jizo).
   * Standing near and interacting restores player health, revives, and refills gourd charges.
   */
  private createCheckpoints() {
    const cpPositions = [
      { id: 'courtyard_shrine', pos: new THREE.Vector3(0, 0, 22) },
      { id: 'boss_threshold_shrine', pos: new THREE.Vector3(-18, 0, -22) },
    ];

    const stoneTex = textures.createStoneTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8 });
    const blueFlameMat = new THREE.MeshBasicMaterial({ color: 0x48c0ff });

    cpPositions.forEach(cp => {
      const group = new THREE.Group();
      group.position.copy(cp.pos);

      // Stone altar
      const altar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2), stoneMat);
      altar.position.y = 0.4;
      altar.castShadow = true;
      group.add(altar);

      // Miniature torii arch atop altar
      const miniTorii = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.2), stoneMat);
      miniTorii.position.set(0, 1.3, -0.2);
      group.add(miniTorii);

      // Sacred blue soul flame
      const soulFlame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), blueFlameMat);
      soulFlame.position.set(0, 1.05, 0.1);
      group.add(soulFlame);

      // Soft blue sanctuary point light
      const light = new THREE.PointLight(0x38b2ff, 2.5, 8, 1.5);
      light.position.set(0, 1.4, 0.2);
      group.add(light);

      this.scene.add(group);
      this.colliderMeshes.push(altar);

      this.checkpoints.push({
        id: cp.id,
        position: cp.pos,
        mesh: group,
        light,
      });
    });
  }

  /**
   * Raised boss arena platform enclosure at the courtyard's north end.
   */
  private createArenaEnclosure() {
    const stoneTex = textures.createStoneTexture();
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8 });

    // Elevated arena floor
    const arenaFloor = new THREE.Mesh(new THREE.CylinderGeometry(20, 21, 1.2, 16), stoneMat);
    arenaFloor.position.set(0, 0.6, -42);
    arenaFloor.receiveShadow = true;
    this.scene.add(arenaFloor);
    this.colliderMeshes.push(arenaFloor);

    // Stone stair steps leading up to the boss arena
    for (let s = 0; s < 4; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 1.2), stoneMat);
      step.position.set(0, 0.15 + s * 0.3, -24 + s * 0.9);
      step.receiveShadow = true;
      this.scene.add(step);
      this.colliderMeshes.push(step);
    }
  }

  /**
   * Adds an interactive grapple point with a floating glowing bronze ring mesh.
   */
  private addGrapplePoint(id: string, pos: THREE.Vector3) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x48e0c8,
      wireframe: true,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 12), ringMat);
    ring.position.copy(pos);
    this.scene.add(ring);

    this.grapplePoints.push({
      id,
      position: pos,
      mesh: ring,
    });
  }

  /**
   * Evaluates dynamic lantern light flicker.
   */
  update(dt: number, time: number) {
    this.lanternLights.forEach(item => {
      const flicker = Math.sin(time * item.flickerSpeed + item.offset) * 0.25 + (Math.random() - 0.5) * 0.15;
      item.light.intensity = item.baseIntensity + flicker;
    });

    // Rotate grapple rings slowly
    this.grapplePoints.forEach(gp => {
      gp.mesh.rotation.y += dt * 1.5;
    });
  }
}
