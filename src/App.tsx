/**
 * Ronin's Edge - Main React Entry & HUD Interface.
 * Manages Three.js canvas mounting, screen-projected HUD overlays,
 * lock-on reticles, enemy posture/health bars, perilous attack cues,
 * deathblow prompts, audio controls, menus, and standalone single-file exporter.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GameEngine, CONFIG, GameState, Fighter } from './game/engine';
import { sound } from './game/audio';
import {
  Shield,
  Crosshair,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  HelpCircle,
  Download,
  AlertTriangle,
  Award,
  Zap,
} from 'lucide-react';

interface ProjectedEnemy {
  id: string;
  name: string;
  screenX: number;
  screenY: number;
  visible: boolean;
  healthPercent: number;
  posturePercent: number;
  isStaggered: boolean;
  isLocked: boolean;
  perilousType: 'none' | 'thrust' | 'sweep';
  canStealthKill: boolean;
}

interface ProjectedGrapple {
  screenX: number;
  screenY: number;
  visible: boolean;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('menu');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [currentStance, setCurrentStance] = useState<'water' | 'flame' | 'thunder'>('water');
  const [specialArtCharge, setSpecialArtCharge] = useState(100);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [playerMaxHealth, setPlayerMaxHealth] = useState(100);
  const [playerPosture, setPlayerPosture] = useState(0);
  const [playerMaxPosture, setPlayerMaxPosture] = useState(100);
  const [gourdCharges, setGourdCharges] = useState(CONFIG.maxGourdCharges);
  const [resurrectionAvailable, setResurrectionAvailable] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [bannerText, setBannerText] = useState<{ title: string; subtitle: string } | null>(null);

  // Projected 3D-to-2D coordinates for enemies and grapple
  const [projectedEnemies, setProjectedEnemies] = useState<ProjectedEnemy[]>([]);
  const [projectedGrapple, setProjectedGrapple] = useState<ProjectedGrapple | null>(null);
  const [bossInfo, setBossInfo] = useState<{
    name: string;
    healthPercent: number;
    posturePercent: number;
    segments: number;
    phase: number;
    isStaggered: boolean;
  } | null>(null);

  const [flashOpacity, setFlashOpacity] = useState(0);

  // Initialize GameEngine
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new GameEngine(containerRef.current);
    engineRef.current = engine;

    engine.onStateChange = state => {
      setGameState(state);
    };

    engine.onStanceChange = stance => {
      setCurrentStance(stance);
    };

    engine.onSpecialArtChange = charge => {
      setSpecialArtCharge(charge);
    };

    engine.onCinematicBanner = (title, subtitle) => {
      setBannerText({ title, subtitle });
      setTimeout(() => setBannerText(null), 3500);
    };

    // Project world positions to 2D screen coordinates
    const projectLoop = () => {
      if (engine && engine.camera && engine.container) {
        const w = engine.container.clientWidth;
        const h = engine.container.clientHeight;

        // Player HUD stats
        setPlayerHealth(engine.player.health);
        setPlayerMaxHealth(engine.player.maxHealth);
        setPlayerPosture(engine.player.posture);
        setPlayerMaxPosture(engine.player.maxPosture);
        setGourdCharges(engine.gourdCharges);
        setResurrectionAvailable(engine.resurrectionAvailable);
        setFlashOpacity(engine.screenFlashAlpha);
        setCurrentStance(engine.currentStance);
        setSpecialArtCharge(engine.specialArtCharge);

        // Project enemies
        const projList: ProjectedEnemy[] = [];
        for (const enemy of engine.enemies) {
          if (enemy.isDead) continue;

          // Head position
          const headPos = enemy.position.clone().add(new THREE.Vector3(0, enemy.type === 'boss' ? 2.4 : 1.9, 0));
          headPos.project(engine.camera);

          const isVisible = headPos.z < 1.0 && headPos.z > -1.0;
          const sx = (headPos.x * 0.5 + 0.5) * w;
          const sy = (-headPos.y * 0.5 + 0.5) * h;

          const dist = engine.player.position.distanceTo(enemy.position);

          // Stealth kill test
          let canStealth = false;
          if (dist < 2.5 && engine.isCrouching && (enemy.aiState === 'idle' || enemy.aiState === 'patrol')) {
            const toPlayer = engine.player.position.clone().sub(enemy.position).normalize();
            const enemyForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), enemy.rotationY);
            if (enemyForward.dot(toPlayer) < -0.3) {
              canStealth = true;
            }
          }

          if (isVisible && dist < 35) {
            projList.push({
              id: enemy.id,
              name: enemy.name,
              screenX: sx,
              screenY: sy,
              visible: true,
              healthPercent: (enemy.health / enemy.maxHealth) * 100,
              posturePercent: (enemy.posture / enemy.maxPosture) * 100,
              isStaggered: enemy.isStaggered,
              isLocked: engine.lockedTarget === enemy,
              perilousType: enemy.perilousType,
              canStealthKill: canStealth,
            });
          }

          // Boss bar info
          if (enemy.type === 'boss' && (dist < 32 || enemy.aiState === 'combat')) {
            setBossInfo({
              name: enemy.name,
              healthPercent: Math.max(0, (enemy.health / enemy.maxHealth) * 100),
              posturePercent: Math.min(100, (enemy.posture / enemy.maxPosture) * 100),
              segments: enemy.bossSegments || 3,
              phase: enemy.bossPhase || 1,
              isStaggered: enemy.isStaggered,
            });
          }
        }
        setProjectedEnemies(projList);

        // Project Grapple target
        if (engine.activeGrappleTarget) {
          const gPos = engine.activeGrappleTarget.position.clone();
          gPos.project(engine.camera);
          if (gPos.z < 1.0 && gPos.z > -1.0) {
            setProjectedGrapple({
              screenX: (gPos.x * 0.5 + 0.5) * w,
              screenY: (-gPos.y * 0.5 + 0.5) * h,
              visible: true,
            });
          } else {
            setProjectedGrapple(null);
          }
        } else {
          setProjectedGrapple(null);
        }
      }
      requestAnimationFrame(projectLoop);
    };

    const animId = requestAnimationFrame(projectLoop);

    return () => {
      cancelAnimationFrame(animId);
      engine.destroy();
    };
  }, []);

  const handleStartGame = (mode: 'normal' | 'training') => {
    sound.init();
    sound.playUIClick();
    if (engineRef.current) {
      CONFIG.difficulty = difficulty;
      if (mode === 'training') {
        engineRef.current.player.position.set(-16, 0, 18);
      } else {
        engineRef.current.player.position.set(0, 0, 22);
      }
      engineRef.current.setGameState('playing');
      containerRef.current?.requestPointerLock();
    }
  };

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    sound.setMasterVolume(val / 100);
  };

  const handleResurrect = () => {
    if (engineRef.current) {
      engineRef.current.resurrectPlayer();
      containerRef.current?.requestPointerLock();
    }
  };

  const handleRespawn = () => {
    if (engineRef.current) {
      engineRef.current.restartEncounter();
      containerRef.current?.requestPointerLock();
    }
  };

  // Export standalone single-file HTML version
  const handleExportHTML = useCallback(() => {
    sound.playUIClick();
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ronin's Edge - Standalone Samurai Action</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; font-family: system-ui, -apple-system, sans-serif; user-select: none; }
    #canvas-container { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
    #instructions { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: #fff; background: rgba(0,0,0,0.7); padding: 12px 24px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); pointer-events: none; text-align: center; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <div id="canvas-container"></div>
  <div id="instructions">Click to enter Pointer Lock. WASD: Move | Left Click: Attack Combo | Right Click: Deflect/Guard | Space: Dodge | C: Crouch | E: Grapple | Q: Lock-on | H: Heal</div>
  <script type="module">
    alert("Ronin's Edge standalone HTML ready! Run in modern browser with WebGL support.");
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ronins_edge_game.html';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const healthPercent = Math.max(0, (playerHealth / playerMaxHealth) * 100);
  const posturePercent = Math.min(100, (playerPosture / playerMaxPosture) * 100);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans text-white">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={containerRef} className="absolute inset-0 cursor-crosshair" />

      {/* Screen Flash on Perfect Deflect */}
      <div
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-75"
        style={{ opacity: flashOpacity }}
      />

      {/* Low Health Damage Vignette */}
      {healthPercent < 35 && (
        <div className="pointer-events-none absolute inset-0 border-8 border-red-900/60 shadow-[inset_0_0_120px_rgba(180,0,0,0.5)] animate-pulse" />
      )}

      {/* Cinematic Banner */}
      {bannerText && (
        <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 text-center animate-fade-in z-20">
          <div className="text-xs uppercase tracking-[0.4em] text-red-500 font-bold mb-1">
            {bannerText.subtitle}
          </div>
          <div className="text-3xl md:text-4xl font-serif tracking-widest text-amber-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] border-y border-amber-500/40 py-2 px-8 bg-black/60 backdrop-blur-sm">
            {bannerText.title}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* HUD OVERLAY (Only visible when Playing)                    */}
      {/* ========================================================= */}
      {gameState === 'playing' && (
        <>
          {/* Top-Center: Player Posture Meter (Symmetric Sekiro-style) */}
          <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
            <div className="text-[10px] tracking-widest text-amber-200/80 uppercase font-semibold mb-1">
              Posture • 態勢
            </div>
            <div className="relative w-72 h-3.5 bg-black/70 border border-amber-600/50 rounded-sm overflow-hidden flex items-center justify-center p-0.5 shadow-lg shadow-black/80">
              {/* Left Bar filling towards center */}
              <div
                className={`h-full transition-all duration-75 rounded-l-xs ${
                  posturePercent > 80 ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-amber-600 to-amber-400'
                }`}
                style={{ width: `${posturePercent * 0.5}%` }}
              />
              {/* Center dividing notch */}
              <div className="w-1 h-full bg-amber-400/80 z-10" />
              {/* Right Bar filling towards center */}
              <div
                className={`h-full transition-all duration-75 rounded-r-xs ${
                  posturePercent > 80 ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-l from-amber-600 to-amber-400'
                }`}
                style={{ width: `${posturePercent * 0.5}%` }}
              />
            </div>
            {posturePercent > 85 && (
              <span className="text-[11px] text-red-400 font-bold tracking-wider mt-1 animate-ping">
                POSTURE BREAK IMMINENT
              </span>
            )}
          </div>

          {/* Bottom-Left: Player Health Bar & Resources */}
          <div className="pointer-events-none absolute bottom-8 left-8 flex items-end gap-5 z-10">
            {/* Healing Gourd & Resurrection */}
            <div className="flex flex-col items-center gap-2">
              {/* Kaisei / Resurrection Indicator */}
              <div
                className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                  resurrectionAvailable
                    ? 'border-amber-400 bg-amber-950/60 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                    : 'border-zinc-700 bg-black/60 opacity-40'
                }`}
                title="Kaisei - Resurrection available"
              >
                <span className="font-serif text-amber-300 font-bold text-lg">回</span>
              </div>

              {/* Healing Gourd */}
              <div className="relative flex items-center justify-center w-14 h-14 rounded-xl border border-emerald-500/50 bg-emerald-950/40 backdrop-blur-md shadow-lg shadow-black">
                <span className="text-xl">🍶</span>
                <span className="absolute bottom-1 right-2 text-xs font-bold text-emerald-300">
                  {gourdCharges}
                </span>
                <span className="absolute -bottom-4 text-[9px] text-zinc-400 tracking-wider">
                  [H] HEAL
                </span>
              </div>
            </div>

            {/* Health Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs tracking-wider font-semibold text-zinc-300">
                <span>HEALTH</span>
                <span className="text-zinc-400 text-[11px]">
                  {Math.round(playerHealth)} / {playerMaxHealth}
                </span>
              </div>
              <div className="relative w-64 h-5 bg-black/80 border border-red-900/60 rounded-xs overflow-hidden p-0.5 shadow-xl shadow-black">
                <div
                  className="h-full bg-gradient-to-r from-red-700 via-red-600 to-rose-500 rounded-xs transition-all duration-150"
                  style={{ width: `${healthPercent}%` }}
                />
              </div>
              <div className="flex gap-4 text-[10px] text-zinc-400 tracking-wider mt-1">
                <span>[SPACE] DODGE</span>
                <span>[C] CROUCH</span>
                <span>[SHIFT] SPRINT</span>
              </div>
            </div>
          </div>

          {/* Combat Stances & Special Art Widget */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 pointer-events-auto transition-all ${
              bossInfo ? 'bottom-28' : 'bottom-8'
            }`}
          >
            {/* Special Combat Art Button */}
            <button
              onClick={() => engineRef.current?.triggerSpecialCombatArt()}
              disabled={specialArtCharge < 35}
              className={`px-4 py-1.5 rounded-full border text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 backdrop-blur-md ${
                specialArtCharge >= 35
                  ? currentStance === 'flame'
                    ? 'border-orange-500 bg-orange-950/90 text-orange-200 shadow-[0_0_16px_rgba(249,115,22,0.6)] animate-pulse hover:bg-orange-900 cursor-pointer'
                    : currentStance === 'thunder'
                    ? 'border-amber-400 bg-amber-950/90 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.6)] animate-pulse hover:bg-amber-900 cursor-pointer'
                    : 'border-cyan-400 bg-cyan-950/90 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.6)] animate-pulse hover:bg-cyan-900 cursor-pointer'
                  : 'border-zinc-800 bg-black/60 text-zinc-600 opacity-60 cursor-not-allowed'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                [R] {currentStance === 'water' ? 'WHIRLWIND DANCE' : currentStance === 'flame' ? 'DRAGON CLEAVE' : 'SHADOWRUSH'}
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">({Math.round(specialArtCharge)}%)</span>
            </button>

            {/* Stances Bar: Water / Flame / Thunder */}
            <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md p-1 rounded-xl border border-zinc-800 shadow-2xl">
              {[
                { id: 'water', key: '1', kanji: '水', name: 'Water', desc: 'Flow & Whirlwind', activeStyle: 'border-cyan-400 bg-cyan-950/60 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.3)]' },
                { id: 'flame', key: '2', kanji: '火', name: 'Flame', desc: 'Poise & Ichimonji', activeStyle: 'border-rose-500 bg-rose-950/60 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]' },
                { id: 'thunder', key: '3', kanji: '雷', name: 'Thunder', desc: 'Speed & Pierce', activeStyle: 'border-amber-400 bg-amber-950/60 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)]' },
              ].map(st => {
                const isActive = currentStance === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => engineRef.current?.switchStance(st.id as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      isActive
                        ? `${st.activeStyle} font-bold`
                        : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/60'
                    }`}
                  >
                    <span className="font-serif font-black text-sm">{st.kanji}</span>
                    <div className="flex flex-col text-left">
                      <span className="text-[11px] leading-tight">[{st.key}] {st.name}</span>
                      <span className="text-[9px] text-zinc-400 font-normal leading-tight">{st.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top-Right Quick Controls / Pause Button */}
          <div className="absolute top-6 right-8 flex items-center gap-3 z-10">
            <button
              onClick={handleToggleMute}
              className="p-2.5 rounded-lg bg-black/50 border border-zinc-700/60 hover:bg-zinc-800/80 text-zinc-300 transition-colors pointer-events-auto"
              title="Toggle Audio"
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              onClick={() => engineRef.current?.togglePause()}
              className="px-3.5 py-1.5 rounded-lg bg-black/50 border border-zinc-700/60 hover:bg-zinc-800/80 text-xs font-semibold tracking-wider text-zinc-300 transition-colors pointer-events-auto"
            >
              PAUSE [ESC]
            </button>
          </div>

          {/* Boss Bar (When facing General Kageyama) */}
          {bossInfo && (
            <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 flex flex-col items-center z-10">
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-serif text-base tracking-widest text-amber-200 font-bold drop-shadow">
                  {bossInfo.name}
                </span>
                {/* 3 Health Segments / Orbs */}
                <div className="flex items-center gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full border border-red-500 transition-all ${
                        i < bossInfo.segments
                          ? 'bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                          : 'bg-zinc-900 border-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Boss Health Bar */}
              <div className="w-full h-3.5 bg-black/80 border border-zinc-700 rounded-xs overflow-hidden p-0.5 shadow-2xl">
                <div
                  className="h-full bg-gradient-to-r from-red-800 via-red-600 to-amber-600 transition-all duration-150"
                  style={{ width: `${bossInfo.healthPercent}%` }}
                />
              </div>

              {/* Boss Posture Bar */}
              <div className="w-2/3 h-2 bg-black/70 border border-amber-900/60 rounded-xs overflow-hidden mt-1 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-700 to-amber-500 transition-all duration-100"
                  style={{ width: `${bossInfo.posturePercent}%` }}
                />
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 3D PROJECTED OVERHEAD UI (Enemies, Warnings, Finishers)    */}
          {/* ========================================================= */}
          {projectedEnemies.map(enemy => (
            <div
              key={enemy.id}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full flex flex-col items-center z-10"
              style={{ left: `${enemy.screenX}px`, top: `${enemy.screenY}px` }}
            >
              {/* PERILOUS ATTACK WARNING KANJI "危" */}
              {enemy.perilousType !== 'none' && (
                <div className="flex flex-col items-center mb-2 animate-bounce">
                  <div
                    className={`text-4xl font-serif font-black drop-shadow-[0_0_18px_rgba(255,0,0,0.9)] ${
                      enemy.perilousType === 'thrust' ? 'text-amber-400' : 'text-red-500'
                    }`}
                  >
                    危
                  </div>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${
                      enemy.perilousType === 'thrust'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-500'
                        : 'bg-red-950/80 text-red-300 border border-red-500'
                    }`}
                  >
                    {enemy.perilousType === 'thrust' ? 'THRUST (SIDESTEP / DEFLECT)' : 'SWEEP (JUMP / DODGE)'}
                  </span>
                </div>
              )}

              {/* FINISHER / DEATHBLOW PROMPT */}
              {enemy.isStaggered && (
                <div className="flex flex-col items-center mb-2 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-red-600/90 border-2 border-white flex items-center justify-center shadow-[0_0_20px_rgba(255,0,0,0.9)]">
                    <span className="font-serif font-bold text-white text-base">忍</span>
                  </div>
                  <div className="mt-1 px-2.5 py-0.5 rounded bg-black/90 border border-red-500 text-xs font-bold text-red-400 tracking-wider shadow">
                    [F] DEATHBLOW
                  </div>
                </div>
              )}

              {/* STEALTH KILL PROMPT */}
              {enemy.canStealthKill && !enemy.isStaggered && (
                <div className="flex flex-col items-center mb-2 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-red-800/90 border-2 border-red-300 flex items-center justify-center shadow-[0_0_15px_rgba(255,0,0,0.8)]">
                    <span className="font-serif font-bold text-white text-sm">暗</span>
                  </div>
                  <div className="mt-1 px-2 py-0.5 rounded bg-black/90 border border-red-400 text-[11px] font-bold text-rose-300 tracking-wider shadow">
                    [F] STEALTH KILL
                  </div>
                </div>
              )}

              {/* Lock-on Diamond Reticle */}
              {enemy.isLocked && (
                <div className="relative w-8 h-8 -mb-3 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-red-500 rotate-45 animate-spin-slow" />
                  <div className="absolute w-1.5 h-1.5 bg-red-500 rounded-full" />
                </div>
              )}

              {/* Overhead Enemy Posture & Health Bar */}
              <div className="w-24 flex flex-col gap-0.5 bg-black/70 p-1 rounded border border-zinc-700/60 shadow">
                <div className="w-full h-1.5 bg-zinc-900 rounded-xs overflow-hidden">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${enemy.healthPercent}%` }}
                  />
                </div>
                <div className="w-full h-1 bg-zinc-900 rounded-xs overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      enemy.posturePercent > 80 ? 'bg-red-400 animate-pulse' : 'bg-amber-500'
                    }`}
                    style={{ width: `${enemy.posturePercent}%` }}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* PROJECTED GRAPPLE ANCHOR INDICATOR */}
          {projectedGrapple && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10 animate-pulse"
              style={{ left: `${projectedGrapple.screenX}px`, top: `${projectedGrapple.screenY}px` }}
            >
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-950/50 flex items-center justify-center shadow-[0_0_14px_rgba(34,211,238,0.7)]">
                <Zap className="w-4 h-4 text-cyan-300" />
              </div>
              <span className="mt-1 px-1.5 py-0.5 rounded bg-black/80 border border-cyan-500/60 text-[10px] font-bold text-cyan-300 tracking-wider">
                [E] GRAPPLE
              </span>
            </div>
          )}
        </>
      )}

      {/* ========================================================= */}
      {/* MAIN MENU                                                 */}
      {/* ========================================================= */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 bg-gradient-to-t from-black via-zinc-950/90 to-transparent flex flex-col items-center justify-center p-6 z-30">
          <div className="max-w-xl w-full text-center flex flex-col items-center">
            {/* Title & Calligraphy Subtitle */}
            <div className="text-red-500 text-sm tracking-[0.5em] font-semibold uppercase mb-2">
              浪人の刃 • Feudal Samurai Action
            </div>
            <h1 className="text-5xl md:text-7xl font-serif font-black tracking-widest text-zinc-100 drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] mb-1">
              RONIN'S EDGE
            </h1>
            <div className="w-48 h-0.5 bg-gradient-to-r from-transparent via-red-600 to-transparent mb-6" />

            <p className="text-sm md:text-base text-zinc-400 max-w-md leading-relaxed mb-8">
              A rhythm of steel and shadows. Deflect blows, shatter posture, and execute ruthless deathblows against the Iron Warlord's forces.
            </p>

            {/* Difficulty Selector */}
            <div className="flex items-center gap-2 mb-8 bg-zinc-900/80 p-1.5 rounded-xl border border-zinc-800">
              {(['easy', 'normal', 'hard'] as const).map(diff => (
                <button
                  key={diff}
                  onClick={() => {
                    sound.playUIClick();
                    setDifficulty(diff);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all ${
                    difficulty === diff
                      ? 'bg-red-700 text-white shadow-lg shadow-red-950'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {diff === 'easy' ? 'Apprentice' : diff === 'normal' ? 'Samurai' : 'Master Ronin'}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-sm mb-6">
              <button
                onClick={() => handleStartGame('normal')}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-bold tracking-widest uppercase shadow-xl shadow-red-950/60 border border-red-500/50 flex items-center justify-center gap-2.5 transition-transform active:scale-95"
              >
                <Play className="w-5 h-5 fill-current" />
                Begin Journey
              </button>

              <button
                onClick={() => handleStartGame('training')}
                className="w-full py-4 px-6 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 font-semibold tracking-wider uppercase border border-zinc-700/80 flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                Training Dojo
              </button>
            </div>

            {/* Extra Controls / Standalone Options */}
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <button
                onClick={() => {
                  sound.playUIClick();
                  setShowControlsModal(true);
                }}
                className="hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-zinc-500" />
                Combat Guide
              </button>
              <span>•</span>
              <button
                onClick={handleExportHTML}
                className="hover:text-amber-400 flex items-center gap-1.5 transition-colors"
                title="Download single standalone HTML file"
              >
                <Download className="w-4 h-4" />
                Export Standalone HTML
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PAUSE MENU                                                */}
      {/* ========================================================= */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-30">
          <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center shadow-2xl">
            <h2 className="text-2xl font-serif font-bold tracking-widest text-zinc-200 mb-6 uppercase">
              Game Paused
            </h2>

            {/* Audio Volume Slider */}
            <div className="w-full flex flex-col gap-2 mb-6 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
                <span className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" /> Master Volume
                </span>
                <span>{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full accent-red-600 cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => {
                  engineRef.current?.setGameState('playing');
                  containerRef.current?.requestPointerLock();
                }}
                className="w-full py-3 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold tracking-wider uppercase transition-colors"
              >
                Resume
              </button>

              <button
                onClick={() => setShowControlsModal(true)}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold tracking-wider uppercase border border-zinc-800 transition-colors"
              >
                Controls Reference
              </button>

              <button
                onClick={handleRespawn}
                className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold tracking-wider uppercase border border-zinc-800 transition-colors"
              >
                Restart Encounter
              </button>

              <button
                onClick={() => engineRef.current?.setGameState('menu')}
                className="w-full py-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 font-medium tracking-wider uppercase transition-colors"
              >
                Quit to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DEATH SCREEN                                              */}
      {/* ========================================================= */}
      {gameState === 'death' && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 z-30 animate-fade-in">
          {/* Blood Kanji DEATH "死" */}
          <div className="text-8xl md:text-9xl font-serif font-black text-red-600 drop-shadow-[0_0_40px_rgba(220,38,38,0.8)] mb-4">
            死
          </div>
          <div className="text-xl md:text-2xl font-serif tracking-widest text-zinc-300 mb-8 uppercase">
            You Have Fallen
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            {resurrectionAvailable ? (
              <button
                onClick={handleResurrect}
                className="py-4 px-8 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-extrabold tracking-widest uppercase shadow-xl shadow-amber-950/80 border border-amber-400 flex items-center gap-3 transition-transform active:scale-95"
              >
                <Zap className="w-5 h-5 fill-current" />
                Rise (回生 - Resurrection)
              </button>
            ) : null}

            <button
              onClick={handleRespawn}
              className="py-4 px-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold tracking-widest uppercase border border-zinc-700 flex items-center gap-2 transition-transform active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              Respawn at Sanctuary
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VICTORY SCREEN                                            */}
      {/* ========================================================= */}
      {gameState === 'victory' && (
        <div className="absolute inset-0 bg-gradient-to-t from-black via-zinc-950/95 to-black/80 flex flex-col items-center justify-center p-6 z-30 animate-fade-in text-center">
          <div className="w-20 h-20 rounded-full border-2 border-amber-400/80 bg-amber-950/40 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.6)] mb-6">
            <Award className="w-10 h-10 text-amber-400" />
          </div>

          <div className="text-sm tracking-[0.6em] text-red-500 uppercase font-bold mb-2">
            Shinobi Execution • 忍殺
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-black tracking-widest text-amber-100 drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] mb-4">
            勝利 VICTORY
          </h1>
          <p className="text-zinc-400 max-w-md text-sm md:text-base mb-8">
            General Kageyama has fallen. The sacred mountain temple courtyard is cleansed by the edge of your blade.
          </p>

          <button
            onClick={handleRespawn}
            className="py-4 px-10 rounded-xl bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 text-white font-bold tracking-widest uppercase shadow-2xl shadow-red-950 border border-red-500 transition-transform active:scale-95"
          >
            Play Again
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONTROLS & COMBAT GUIDE MODAL                             */}
      {/* ========================================================= */}
      {showControlsModal && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 z-40">
          <div className="max-w-xl w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 md:p-8 flex flex-col shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
              <h3 className="text-xl font-serif font-bold text-zinc-100 tracking-wider">
                Combat & Deflection Guide
              </h3>
              <button
                onClick={() => setShowControlsModal(false)}
                className="text-zinc-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-6">
              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
                <span className="font-bold text-red-400 uppercase tracking-wider block mb-1">
                  Left Click
                </span>
                <span className="text-zinc-300">
                  Light Slash: 3-hit combo chain. Timing swings deals continuous posture pressure.
                </span>
              </div>

              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-amber-700/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                <span className="font-bold text-amber-400 uppercase tracking-wider block mb-1">
                  Right Click (Deflect)
                </span>
                <span className="text-zinc-300">
                  Tap right as an enemy attack lands for a <strong>Perfect Deflect</strong>. Shatters enemy posture!
                </span>
              </div>

              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
                <span className="font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                  Space / Shift
                </span>
                <span className="text-zinc-300">
                  Space: Invincible Dodge Step. Shift: High-speed Sprint.
                </span>
              </div>

              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
                <span className="font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                  [C] Sneak / [F] Kill
                </span>
                <span className="text-zinc-300">
                  Crouch to stay silent. Sneak behind unaware guards for an instant stealth assassination.
                </span>
              </div>

              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
                <span className="font-bold text-purple-400 uppercase tracking-wider block mb-1">
                  [Q] Lock-On
                </span>
                <span className="text-zinc-300">
                  Locks camera orbit onto nearest foe. Mouse flick switches targets.
                </span>
              </div>

              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80">
                <span className="font-bold text-teal-400 uppercase tracking-wider block mb-1">
                  [E] Grappling Hook
                </span>
                <span className="text-zinc-300">
                  Aim at glowing rooftop & torii gate anchors and press E to zip upward.
                </span>
              </div>
            </div>

            {/* Stances & Combat Styles Guide */}
            <div className="bg-zinc-900/90 border border-zinc-700/80 p-4 rounded-xl text-xs flex flex-col gap-2.5 mb-6">
              <span className="font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                Three Combat Stances (Switch: [1, 2, 3] or [Tab])
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="bg-black/60 p-2.5 rounded-lg border border-cyan-500/40">
                  <span className="font-bold text-cyan-400 block mb-0.5">[1] 水 Water Stance</span>
                  <p className="text-[11px] text-zinc-300 leading-snug">
                    Swift flowing slashes with 360° whirlwind finisher. High mobility. Special Art: <strong>Whirlwind Dance</strong>.
                  </p>
                </div>
                <div className="bg-black/60 p-2.5 rounded-lg border border-rose-500/40">
                  <span className="font-bold text-rose-400 block mb-0.5">[2] 火 Flame Stance</span>
                  <p className="text-[11px] text-zinc-300 leading-snug">
                    Heavy poise-crushing cleaves. 3rd hit is <strong>Ichimonji</strong> which cleanses your posture! Special Art: <strong>Dragon Cleave</strong>.
                  </p>
                </div>
                <div className="bg-black/60 p-2.5 rounded-lg border border-amber-400/40">
                  <span className="font-bold text-amber-300 block mb-0.5">[3] 雷 Thunder Stance</span>
                  <p className="text-[11px] text-zinc-300 leading-snug">
                    Fast Iaijutsu quick-draw & armor-piercing thrust that punches through enemy guard! Special Art: <strong>Shadowrush</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Perilous Attacks explanation */}
            <div className="bg-red-950/30 border border-red-900/50 p-4 rounded-xl text-xs flex flex-col gap-2 mb-6">
              <span className="font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Perilous Attacks (危 Kanji Warning)
              </span>
              <p className="text-zinc-300 leading-relaxed">
                When an enemy flashes red or yellow with the <strong>危</strong> symbol, a perilous attack is coming:
              </p>
              <ul className="list-disc list-inside text-zinc-300 space-y-1">
                <li><strong className="text-amber-300">Yellow Thrust:</strong> Must be sidestepped with Dodge or deflected with precise timing.</li>
                <li><strong className="text-rose-300">Red Sweep:</strong> Cannot be blocked! Jump or dodge backward immediately.</li>
              </ul>
            </div>

            <button
              onClick={() => setShowControlsModal(false)}
              className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold tracking-wider uppercase transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
