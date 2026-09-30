/**
 * Procedural canvas-generated textures for Ronin's Edge.
 * Eliminates all external image downloads while delivering rich visual fidelity.
 */
import * as THREE from 'three';

class TextureGenerator {
  private cache = new Map<string, THREE.CanvasTexture>();

  /**
   * Stone courtyard flagstones / cobbles texture with normal map support.
   */
  createStoneTexture(): THREE.CanvasTexture {
    if (this.cache.has('stone')) return this.cache.get('stone')!;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dark slate color
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, size, size);

    // Draw irregular stone pavers
    const cols = 8;
    const rows = 8;
    const cellW = size / cols;
    const cellH = size / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offset = (r % 2) * (cellW * 0.45);
        const x = (c * cellW + offset) % size;
        const y = r * cellH;
        const pad = 4;

        // Varied gray tones for stone
        const tone = 48 + Math.floor(Math.sin(r * 3 + c * 7) * 16 + (Math.random() - 0.5) * 12);
        const hex = tone.toString(16).padStart(2, '0');
        ctx.fillStyle = `#${hex}${hex}${hex}`;

        // Slightly rounded stone block
        const rx = x + pad;
        const ry = y + pad;
        const rw = cellW - pad * 2;
        const rh = cellH - pad * 2;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 6);
        ctx.fill();

        // Stone edge highlight & shadow
        ctx.strokeStyle = '#474d57';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Stone texture flecks
        for (let k = 0; k < 18; k++) {
          const fx = rx + Math.random() * rw;
          const fy = ry + Math.random() * rh;
          const bright = Math.random() > 0.5 ? 80 : 30;
          ctx.fillStyle = `rgba(${bright}, ${bright}, ${bright}, 0.25)`;
          ctx.fillRect(fx, fy, 2, 2);
        }
      }
    }

    // Mortar moss lines
    ctx.fillStyle = 'rgba(25, 38, 28, 0.4)';
    for (let i = 0; i < size; i += 6) {
      if (Math.random() > 0.6) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    this.cache.set('stone', texture);
    return texture;
  }

  /**
   * Dark weathered Japanese timber texture for temple pillars, beams, and bridges.
   */
  createWoodTexture(): THREE.CanvasTexture {
    if (this.cache.has('wood')) return this.cache.get('wood')!;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Rich dark cedar / cypress base
    ctx.fillStyle = '#2d1810';
    ctx.fillRect(0, 0, size, size);

    // Wood grain lines
    for (let y = 0; y < size; y++) {
      const grain = Math.sin(y * 0.12) * 15 + Math.sin(y * 0.8) * 6;
      const alpha = 0.08 + Math.random() * 0.08;
      ctx.fillStyle = `rgba(180, 110, 60, ${alpha})`;
      ctx.fillRect(0, y + grain * 0.1, size, 1 + Math.random());
    }

    // Dark grooves / knots
    for (let i = 0; i < 6; i++) {
      const knotY = Math.random() * size;
      const knotX = Math.random() * size;
      ctx.fillStyle = 'rgba(15, 8, 4, 0.35)';
      ctx.beginPath();
      ctx.ellipse(knotX, knotY, 35, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 4);
    this.cache.set('wood', texture);
    return texture;
  }

  /**
   * Japanese curved roof tiles (Kawara).
   */
  createRoofTileTexture(): THREE.CanvasTexture {
    if (this.cache.has('roof')) return this.cache.get('roof')!;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, 0, size, size);

    const rows = 8;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      // Cylinder highlight for traditional semi-circular roof tiles
      const grad = ctx.createLinearGradient(0, y, 0, y + rowH);
      grad.addColorStop(0, '#2d333b');
      grad.addColorStop(0.3, '#3c444f');
      grad.addColorStop(0.7, '#191d21');
      grad.addColorStop(1, '#0e1114');

      ctx.fillStyle = grad;
      ctx.fillRect(0, y, size, rowH - 2);

      ctx.fillStyle = '#080a0d';
      ctx.fillRect(0, y + rowH - 2, size, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    this.cache.set('roof', texture);
    return texture;
  }

  /**
   * Tatami woven straw matting for indoor/training areas.
   */
  createTatamiTexture(): THREE.CanvasTexture {
    if (this.cache.has('tatami')) return this.cache.get('tatami')!;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#7a764d';
    ctx.fillRect(0, 0, size, size);

    // Cross-weave pattern
    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? 'rgba(50, 48, 25, 0.25)' : 'rgba(180, 175, 120, 0.25)';
      ctx.fillRect(0, y, size, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    this.cache.set('tatami', texture);
    return texture;
  }

  /**
   * Cherry blossom petal particle texture (stylized curved notch petal).
   */
  createPetalTexture(): THREE.CanvasTexture {
    if (this.cache.has('petal')) return this.cache.get('petal')!;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    const grad = ctx.createRadialGradient(32, 28, 4, 32, 32, 28);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ffb8cf');
    grad.addColorStop(0.8, '#ff7ea8');
    grad.addColorStop(1, '#e64f84');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(32, 54);
    ctx.bezierCurveTo(14, 45, 10, 20, 26, 12);
    ctx.bezierCurveTo(30, 10, 32, 16, 32, 18);
    ctx.bezierCurveTo(32, 16, 34, 10, 38, 12);
    ctx.bezierCurveTo(54, 20, 50, 45, 32, 54);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set('petal', texture);
    return texture;
  }

  /**
   * Bright spark glow particle for deflect bursts.
   */
  createSparkTexture(): THREE.CanvasTexture {
    if (this.cache.has('spark')) return this.cache.get('spark')!;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    // Glowing core with cross starburst
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, '#fff1a8');
    grad.addColorStop(0.6, '#ff9626');
    grad.addColorStop(1, 'rgba(255, 60, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    // Sharp cross rays
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(30, 4, 4, 56);
    ctx.fillRect(4, 30, 56, 4);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set('spark', texture);
    return texture;
  }

  /**
   * Kanji symbol badge for 3D world overhead indicators.
   * e.g. "危" (Danger/Perilous), "死" (Death), "忍殺" (Deathblow).
   */
  createKanjiTexture(text: string, color: string = '#ff2b2b', glow: string = '#ff8888'): THREE.CanvasTexture {
    const key = `kanji_${text}_${color}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    // Outer glow aura
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.font = 'bold 78px "Noto Serif JP", "Hiragino Mincho ProN", serif, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, size / 2);

    // Second crisp stroke
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px "Noto Serif JP", "Hiragino Mincho ProN", serif, sans-serif';
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Curved crescent slash wave blade texture for dramatic melee arc VFX.
   */
  createSlashArcTexture(color: string = '#70d6ff', coreColor: string = '#ffffff'): THREE.CanvasTexture {
    const key = `slash_arc_${color}_${coreColor}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    // Dynamic curved crescent slash ribbon
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.42;

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.2, color);
    grad.addColorStop(0.6, coreColor);
    grad.addColorStop(0.85, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 28;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI * 0.85, Math.PI * 0.25);
    ctx.stroke();

    // Hot central core line
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI * 0.65, Math.PI * 0.15);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Radial shockwave ring for ground fissures and posture break explosions.
   */
  createShockwaveRingTexture(color: string = '#ffb347'): THREE.CanvasTexture {
    const key = `shockwave_${color}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    const grad = ctx.createRadialGradient(128, 128, 70, 128, 128, 125);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, color);
    grad.addColorStop(0.85, '#ffffff');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(128, 128, 100, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }
}

export const textures = new TextureGenerator();
