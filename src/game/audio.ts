/**
 * Procedural Web Audio API sound synthesis for Ronin's Edge.
 * Generates all sound effects and dynamic background ambient drone in real time.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private tensionGain: GainNode | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 0.8;
  private sfxVolume: number = 0.9;
  private ambientVolume: number = 0.5;
  private isInitialized: boolean = false;
  private combatTension: number = 0; // 0 (calm) to 1 (in battle)
  private noiseBuffer: AudioBuffer | null = null;

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      this.generateNoiseBuffer();
      this.startAmbientDrone();
      this.isInitialized = true;
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private generateNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  getVolume(): number {
    return this.masterVolume;
  }

  setCombatIntensity(level: number) {
    this.combatTension = Math.max(0, Math.min(1, level));
    if (this.tensionGain && this.ctx) {
      this.tensionGain.gain.setTargetAtTime(this.combatTension * 0.4, this.ctx.currentTime, 0.5);
    }
  }

  /**
   * Ambient atmospheric wind and Japanese pentatonic drone.
   */
  private startAmbientDrone() {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;

    // Wind noise generator
    if (this.noiseBuffer) {
      const windSource = this.ctx.createBufferSource();
      windSource.buffer = this.noiseBuffer;
      windSource.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(320, now);
      windFilter.Q.setValueAtTime(2.5, now);

      // Slow LFO for wind gust
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.15, now);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(180, now);
      lfo.connect(lfoGain);
      lfoGain.connect(windFilter.frequency);
      lfo.start();

      const windGain = this.ctx.createGain();
      windGain.gain.setValueAtTime(0.08, now);

      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.ambientGain);
      windSource.start();
    }

    // Peaceful meditative drone: root and fifth notes (D2 = 73.4Hz, A2 = 110Hz, D3 = 146.8Hz)
    const baseFreqs = [73.42, 110.0, 146.83, 220.0];
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.12, now);
    this.droneGain.connect(this.ambientGain);

    baseFreqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 0.4, now);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.05 / (idx + 1), now);

      osc.connect(oscGain);
      oscGain.connect(this.droneGain!);
      osc.start();
      this.droneOscs.push(osc);
    });

    // Battle tension layer (ominous pulsing war hum)
    this.tensionGain = this.ctx.createGain();
    this.tensionGain.gain.setValueAtTime(0, now);
    this.tensionGain.connect(this.ambientGain);

    const tensionOsc = this.ctx.createOscillator();
    tensionOsc.type = 'sawtooth';
    tensionOsc.frequency.setValueAtTime(55.0, now); // Low A1

    const tensionFilter = this.ctx.createBiquadFilter();
    tensionFilter.type = 'lowpass';
    tensionFilter.frequency.setValueAtTime(140, now);

    tensionOsc.connect(tensionFilter);
    tensionFilter.connect(this.tensionGain);
    tensionOsc.start();
    this.droneOscs.push(tensionOsc);

    // Occasional gentle koto plucks
    this.scheduleNextKotoNote();
  }

  private scheduleNextKotoNote() {
    if (!this.ctx) return;
    const delay = 4 + Math.random() * 6; // Every 4-10 seconds
    setTimeout(() => {
      if (this.ctx && !this.isMuted) {
        this.playKotoPluck();
      }
      this.scheduleNextKotoNote();
    }, delay * 1000);
  }

  private playKotoPluck() {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    // Japanese Insen / Hirajoshi scale notes (D, Eb, G, A, Bb)
    const scale = [293.66, 311.13, 392.00, 440.00, 466.16, 587.33];
    const freq = scale[Math.floor(Math.random() * scale.length)];

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + 1.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    osc.start(now);
    osc.stop(now + 1.8);
  }

  // --- COMBAT SOUND EFFECTS ---

  /**
   * Fast sharp katana slash whoosh with style-based pitch and texture.
   */
  playSlash(variation: number = 0, style: 'water' | 'flame' | 'thunder' = 'water') {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';

    let startFreq = 800 + variation * 300;
    let endFreq = 2600 + variation * 400;

    if (style === 'flame') {
      startFreq = 450 + variation * 200;
      endFreq = 1600 + variation * 350; // Deeper, heavier whoosh
    } else if (style === 'thunder') {
      startFreq = 1200 + variation * 400;
      endFreq = 4200 + variation * 600; // Sharp, electric whistle
    }

    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);
    filter.Q.setValueAtTime(style === 'thunder' ? 5.5 : 3.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(style === 'flame' ? 0.6 : 0.45, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (style === 'flame' ? 0.24 : 0.18));

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start(now);
    source.stop(now + 0.25);
  }

  /**
   * HEAVY CLEAVE / ICHIMONJI (Flame Style Special Art):
   * Deep earth-shattering boom + heavy steel split.
   */
  playHeavyCleave() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // 1. Heavy sub-bass earthquake punch
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.85, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(now);
    subOsc.stop(now + 0.55);

    // 2. Heavy steel crunch
    const bladeOsc = this.ctx.createOscillator();
    bladeOsc.type = 'sawtooth';
    bladeOsc.frequency.setValueAtTime(650, now);
    bladeOsc.frequency.exponentialRampToValueAtTime(140, now + 0.25);

    const bladeGain = this.ctx.createGain();
    bladeGain.gain.setValueAtTime(0.5, now);
    bladeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    bladeOsc.connect(bladeGain);
    bladeGain.connect(this.sfxGain);
    bladeOsc.start(now);
    bladeOsc.stop(now + 0.35);
  }

  /**
   * WHIRLWIND SLASH (Water Style Special Art):
   * Dual spinning vortex swoosh.
   */
  playWhirlwindSlash() {
    this.playSlash(1, 'water');
    setTimeout(() => this.playSlash(2, 'water'), 90);
    setTimeout(() => this.playSlash(3, 'water'), 180);
  }

  /**
   * THUNDER THRUST / SHADOWRUSH (Thunder Style Special Art):
   * Piercing supersonic crackle.
   */
  playThunderThrust() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.22);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Stance Switch chime.
   */
  playStanceSwitch() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(1650, now + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /**
   * PERFECT DEFLECT: Signature Sekiro-style bright high metallic clang!
   * Multi-frequency ringing bell harmonics with crisp punchy attack.
   */
  playDeflect() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // 1. High metallic ringing harmonics
    const bellFrequencies = [1850, 2940, 4120, 5800];
    bellFrequencies.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.02), now);

      const gain = this.ctx.createGain();
      const initialVol = 0.35 / (i + 1);
      gain.gain.setValueAtTime(initialVol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 + i * 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.6);
    });

    // 2. Punchy transient metal impact click
    if (this.noiseBuffer) {
      const click = this.ctx.createBufferSource();
      click.buffer = this.noiseBuffer;

      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = 'highpass';
      clickFilter.frequency.setValueAtTime(3500, now);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.6, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      click.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.sfxGain);

      click.start(now);
      click.stop(now + 0.06);
    }

    // 3. Resonant steel body thud
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(380, now);
    subOsc.frequency.exponentialRampToValueAtTime(120, now + 0.12);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.4, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(now);
    subOsc.stop(now + 0.16);
  }

  /**
   * REGULAR BLOCK: Dull, dampened metallic thud.
   */
  playBlock() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Subtle clang
    const clang = this.ctx.createOscillator();
    clang.type = 'square';
    clang.frequency.setValueAtTime(980, now);

    const clangFilter = this.ctx.createBiquadFilter();
    clangFilter.type = 'bandpass';
    clangFilter.frequency.setValueAtTime(1200, now);

    const clangGain = this.ctx.createGain();
    clangGain.gain.setValueAtTime(0.15, now);
    clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    clang.connect(clangFilter);
    clangFilter.connect(clangGain);
    clangGain.connect(this.sfxGain);
    clang.start(now);
    clang.stop(now + 0.09);
  }

  /**
   * HIT IMPACT: Blade cutting armor/flesh.
   */
  playHit() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * PERILOUS ATTACK WARNING CUE: Ominous high-tension gong / chime.
   */
  playWarningCue() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const freqs = [1046.5, 1055.0, 1568.0];
    freqs.forEach(freq => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.6);
    });
  }

  /**
   * DEATHBLOW / FINISHER: Thunderous Taiko drum impact + sharp steel cut!
   */
  playDeathblow() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // 1. Heavy resonant Taiko drum body
    const drum = this.ctx.createOscillator();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(140, now);
    drum.frequency.exponentialRampToValueAtTime(42, now + 0.35);

    const drumGain = this.ctx.createGain();
    drumGain.gain.setValueAtTime(0.9, now);
    drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    drum.connect(drumGain);
    drumGain.connect(this.sfxGain);
    drum.start(now);
    drum.stop(now + 0.85);

    // 2. High steel slice
    const slice = this.ctx.createOscillator();
    slice.type = 'triangle';
    slice.frequency.setValueAtTime(3200, now + 0.05);
    slice.frequency.exponentialRampToValueAtTime(800, now + 0.35);

    const sliceGain = this.ctx.createGain();
    sliceGain.gain.setValueAtTime(0.001, now);
    sliceGain.gain.setValueAtTime(0.4, now + 0.05);
    sliceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    slice.connect(sliceGain);
    sliceGain.connect(this.sfxGain);
    slice.start(now);
    slice.stop(now + 0.5);
  }

  /**
   * POSTURE BREAK SHATTER: Cracking glass/wood resonance.
   */
  playPostureBreak() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const freqs = [620, 890, 1340, 1920];
    freqs.forEach(freq => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.25);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  /**
   * HEALING GOURD: Soothing liquid drink & restorative hum.
   */
  playHeal() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Gulp / liquid bubble
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.linearRampToValueAtTime(440, now + 0.15);
    osc.frequency.linearRampToValueAtTime(300, now + 0.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);

    // Sacred restorative chime
    const chime = this.ctx.createOscillator();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(587.33, now + 0.2); // D5
    chime.frequency.setValueAtTime(880.0, now + 0.35); // A5

    const chimeGain = this.ctx.createGain();
    chimeGain.gain.setValueAtTime(0.001, now);
    chimeGain.gain.setValueAtTime(0.2, now + 0.2);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    chime.connect(chimeGain);
    chimeGain.connect(this.sfxGain);
    chime.start(now);
    chime.stop(now + 1.0);
  }

  /**
   * DODGE: Fast cloth whoosh.
   */
  playDodge() {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);
    source.stop(now + 0.24);
  }

  /**
   * GRAPPLING HOOK: Mechanical wire launch + zip sound.
   */
  playGrapple() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Launch snap
    const snap = this.ctx.createOscillator();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(1400, now);
    snap.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.4, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    snap.connect(snapGain);
    snapGain.connect(this.sfxGain);
    snap.start(now);
    snap.stop(now + 0.12);

    // Whizzing cable zip
    if (this.noiseBuffer) {
      const zip = this.ctx.createBufferSource();
      zip.buffer = this.noiseBuffer;

      const zipFilter = this.ctx.createBiquadFilter();
      zipFilter.type = 'bandpass';
      zipFilter.frequency.setValueAtTime(2200, now + 0.05);
      zipFilter.frequency.linearRampToValueAtTime(3600, now + 0.4);
      zipFilter.Q.setValueAtTime(6.0, now);

      const zipGain = this.ctx.createGain();
      zipGain.gain.setValueAtTime(0.001, now);
      zipGain.gain.setValueAtTime(0.25, now + 0.06);
      zipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      zip.connect(zipFilter);
      zipFilter.connect(zipGain);
      zipGain.connect(this.sfxGain);
      zip.start(now + 0.05);
      zip.stop(now + 0.5);
    }
  }

  /**
   * Subtle footstep.
   */
  playFootstep() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120 + Math.random() * 40, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * UI Click.
   */
  playUIClick() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

export const sound = new SoundEngine();
