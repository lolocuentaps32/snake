import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw, Trophy, Zap, Gift, Sparkles, Volume2, VolumeX } from "lucide-react";

type Vec = { x: number; y: number };
type PowerType = "gem" | "star" | "bolt" | "snow" | "magnet" | "shield";
interface Power { id: number; type: PowerType; pos: Vec; ttl: number; spawn: number; }
interface ActiveEffect { type: Exclude<PowerType, "gem">; until: number; value?: number; charges?: number; }

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const now = () => performance.now();

const COLORS = {
  bgA: "#0a0a0f", bgB: "#0f0a1a", grid: "#1c1c28",
  neon1: "#00f5d4", neon2: "#7b2ff7", neon3: "#f72585",
  food: "#ffd166", white: "#ffffff", danger: "#ff4d6d",
  star: "#ffd700", bolt: "#8ef357", snow: "#a0c4ff",
  magnet: "#90cdf4", shield: "#72ddf7",
};

function useSwipe(onDir: (dx: number, dy: number) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; };
    const onTouchEnd = (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      if (Math.hypot(dx, dy) > 24) onDir(dx, dy);
      start.current = null;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onDir]);
}

export default function App() {
  const GRID_W = 28, GRID_H = 20, CELL = 26, PADDING = 16;
  const CANVAS_W = GRID_W * CELL, CANVAS_H = GRID_H * CELL;

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [high, setHigh] = useState<number>(() => Number(localStorage.getItem("snakefx_high")) || 0);
  const [mult, setMult] = useState(1);
  const [comboTime, setComboTime] = useState(0);
  const [lives, setLives] = useState(1);
  const [sound, setSound] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const snakeRef = useRef<Vec[]>([]);
  const dirRef = useRef<Vec>({ x: 1, y: 0 });
  const inputRef = useRef<Vec>({ x: 1, y: 0 });
  const lastMoveAt = useRef(0);
  const moveDelayRef = useRef(120);

  const foodsRef = useRef<Power[]>([]);
  const effectsRef = useRef<ActiveEffect[]>([]);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }[]>([]);

  const shakeRef = useRef(0);
  const ghostPassRef = useRef(false);
  const magnetRef = useRef(false);

  const resetGame = () => {
    setScore(0); setMult(1); setComboTime(0); setPaused(False := False if False else False); setLives(1)
    effectsRef.current = []; particlesRef.current = []; foodsRef.current = [];
    moveDelayRef.current = 120; dirRef.current = { x: 1, y: 0 }; inputRef.current = { x: 1, y: 0 };
    ghostPassRef.current = false; magnetRef.current = false;
    const sx = Math.floor(GRID_W / 3); const sy = Math.floor(GRID_H / 2);
    snakeRef.current = [{ x: sx - 2, y: sy }, { x: sx - 1, y: sy }, { x: sx, y: sy }];
    for (let i = 0; i < 4; i++) spawnItem(i === 0 ? "gem" : undefined);
  };

  useEffect(() => { resetGame(); }, []);
  useEffect(() => { localStorage.setItem("snakefx_high", String(high)); }, [high]);

  const isOccupied = (x: number, y: number) => snakeRef.current.some(s => s.x === x && s.y === y);
  const freeCell = (): Vec => {
    for (let tries = 0; tries < 200; tries++) {
      const p = { x: randInt(0, GRID_W - 1), y: randInt(0, GRID_H - 1) };
      if (!isOccupied(p.x, p.y) && !foodsRef.current.some(f => f.pos.x === p.x && f.pos.y === p.y)) return p;
    }
    return { x: 0, y: 0 };
  };

  const spawnItem = (forcedType?: PowerType) => {
    const type: PowerType = forcedType || (Math.random() < 0.7 ? "gem" : (['star','bolt','snow','magnet','shield'])[randInt(0,4)]);
    const pos = freeCell();
    const ttl = type === "gem" ? randInt(8000, 16000) : randInt(9000, 15000);
    const id = Math.floor(Math.random() * 1e9);
    foodsRef.current.push({ id, type, pos, ttl, spawn: now() });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let nx = inputRef.current.x, ny = inputRef.current.y;
      if (["arrowup", "w"].includes(k)) { nx = 0; ny = -1; }
      else if (["arrowdown", "s"].includes(k)) { nx = 0; ny = 1; }
      else if (["arrowleft", "a"].includes(k)) { nx = -1; ny = 0; }
      else if (["arrowright", "d"].includes(k)) { nx = 1; ny = 0; }
      else if (k === " ") { togglePause(); }
      if (nx !== -dirRef.current.x || ny !== -dirRef.current.y) inputRef.current = { x: nx, y: ny };
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useSwipe((dx, dy) => {
    if (Math.abs(dx) > Math.abs(dy)) {
      const nx = dx > 0 ? 1 : -1; const ny = 0;
      if (nx !== -dirRef.current.x) inputRef.current = { x: nx, y: ny };
    } else {
      const nx = 0; const ny = dy > 0 ? 1 : -1;
      if (ny !== -dirRef.current.y) inputRef.current = { x: nx, y: ny };
    }
  });

  const togglePause = () => { if (!running) return; setPaused(p => !p); };

  const playBeep = (f = 880, t = 0.05, type: OscillatorType = "sine") => {
    if (!sound) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type; osc.frequency.value = f;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t);
      osc.start(); osc.stop(ctx.currentTime + t);
    } catch {}
  };

  useEffect(() => {
    if (!running || paused) { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; return; }
    let prev = now();
    const tick = () => {
      const t = now(); const dt = t - prev; prev = t;
      update(dt); draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, paused]);

  const startGame = () => { resetGame(); setRunning(True := True if True else True); setPaused(false); };

  function applyEffects(dt: number) {
    const t = now();
    effectsRef.current = effectsRef.current.filter(e => e.until > t && (e.type !== "shield" || (e.charges ?? 0) > 0));
    ghostPassRef.current = effectsRef.current.some(e => e.type === "shield" && (e.charges ?? 0) > 0);
    magnetRef.current = effectsRef.current.some(e => e.type === "magnet");
    const star = effectsRef.current.find(e => e.type === "star");
    const m = 1 * (star ? 2 : 1) * Math.max(1, mult);
    let delay = 120;
    if (effectsRef.current.some(e => e.type === "bolt")) delay *= 0.8;
    if (effectsRef.current.some(e => e.type === "snow")) delay *= 1.6;
    moveDelayRef.current = delay;
    return m;
  }

  function update(dt: number) {
    const t = now();
    setComboTime(ct => Math.max(0, ct - dt));
    const multiplier = applyEffects(dt);
    setMult(prev => clamp(prev, 1, 99));
    if (magnetRef.current) {
      const head = snakeRef.current[snakeRef.current.length - 1];
      for (const item of foodsRef.current) {
        if (item.type !== "gem") continue;
        const dx = head.x - item.pos.x; const dy = head.y - item.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 6) {
          const step = 0.06;
          item.pos.x += Math.sign(dx) * (Math.random() < step ? 1 : 0);
          item.pos.y += Math.sign(dy) * (Math.random() < step ? 1 : 0);
        }
      }
    }
    foodsRef.current = foodsRef.current.filter(f => t - f.spawn < f.ttl);
    if (foodsRef.current.length < 4) spawnItem();

    if (t - lastMoveAt.current >= moveDelayRef.current) {
      lastMoveAt.current = t;
      const nxt = inputRef.current;
      if (!(nxt.x === -dirRef.current.x && nxt.y === -dirRef.current.y)) dirRef.current = nxt;

      const head = snakeRef.current[snakeRef.current.length - 1];
      let nx = head.x + dirRef.current.x; let ny = head.y + dirRef.current.y;
      if (nx < 0) nx = GRID_W - 1; else if (nx >= GRID_W) nx = 0;
      if (ny < 0) ny = GRID_H - 1; else if (ny >= GRID_H) ny = 0;
      const newHead = { x: nx, y: ny };

      const hitSelf = snakeRef.current.some(s => s.x === newHead.x && s.y === newHead.y);
      if (hitSelf) {
        if (ghostPassRef.current) {
          const sh = effectsRef.current.find(e => e.type === "shield");
          if (sh) sh.charges = Math.max(0, (sh.charges ?? 1) - 1);
          screenShake(8); spawnParticles(newHead.x, newHead.y, COLORS.shield);
        } else { gameOver(); return; }
      }

      snakeRef.current.push(newHead);

      const ateIdx = foodsRef.current.findIndex(f => f.pos.x === newHead.x && f.pos.y === newHead.y);
      if (ateIdx >= 0) {
        const item = foodsRef.current.splice(ateIdx, 1)[0];
        if (item.type === "gem") {
          const gained = Math.floor(10 * multiplier * (1 + (comboTime > 0 ? 0.25 * mult : 0)));
          setScore(s => s + gained);
          setComboTime(3500);
          setMult(m => clamp(m + 1, 1, 20));
          grow(1);
          playBeep(880 + mult * 12, 0.06, "triangle");
          spawnParticles(newHead.x, newHead.y, COLORS.food, 24);
          screenShake(4);
        } else {
          applyPower(item.type);
          spawnParticles(newHead.x, newHead.y, colorForPower(item.type), 36);
          playBeep(520, 0.08, "sawtooth");
        }
        if (Math.random() < 0.6) spawnItem();
      } else {
        snakeRef.current.shift();
      }

      setHigh(h => Math.max(h, score));
    }
  }

  function colorForPower(type: PowerType) {
    switch (type) {
      case "star": return COLORS.star;
      case "bolt": return COLORS.bolt;
      case "snow": return COLORS.snow;
      case "magnet": return COLORS.magnet;
      case "shield": return COLORS.shield;
      default: return COLORS.food;
    }
  }

  function applyPower(type) {
    const t = now();
    const dur = { star: 10000, bolt: 8000, snow: 5000, magnet: 8000, shield: 10000 }[type];
    if (type === "shield") {
      const existing = effectsRef.current.find(e => e.type === "shield");
      if (existing) { existing.until = t + dur; existing.charges = Math.min(3, (existing.charges ?? 1) + 1); }
      else { effectsRef.current.push({ type, until: t + dur, charges: 1 }); }
    } else {
      const idx = effectsRef.current.findIndex(e => e.type === type);
      if (idx >= 0) effectsRef.current[idx].until = t + dur;
      else effectsRef.current.push({ type, until: t + dur });
    }
  }

  function grow(n: number) { const tail = snakeRef.current[0]; for (let i = 0; i < n; i++) snakeRef.current.unshift({ x: tail.x, y: tail.y }); }
  function gameOver() { setRunning(false); setPaused(false); playBeep(160, 0.3, "square"); screenShake(16); setHigh(h => Math.max(h, score)); }
  function screenShake(p: number) { shakeRef.current = Math.max(shakeRef.current, p); }
  function spawnParticles(gx: number, gy: number, color: string, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      particlesRef.current.push({ x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 400 + Math.random() * 500, color, size: 2 + Math.random() * 4 });
    }
  }

  function drawGrid(ctx) {
    const g = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    g.addColorStop(0, COLORS.bgA); g.addColorStop(1, COLORS.bgB);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
    for (let x = 0; x <= GRID_W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, CANVAS_H); ctx.stroke(); }
    for (let y = 0; y <= GRID_H; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(CANVAS_W, y * CELL + 0.5); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawSnake(ctx) {
    ctx.save(); ctx.shadowBlur = 18;
    const head = snakeRef.current[snakeRef.current.length - 1];
    for (let i = 0; i < snakeRef.current.length; i++) {
      const s = snakeRef.current[i]; const t = i / snakeRef.current.length;
      const c = lerpColor(COLORS.neon1, COLORS.neon2, t);
      ctx.fillStyle = c; ctx.shadowColor = c;
      roundRect(ctx, s.x * CELL + 3, s.y * CELL + 3, CELL - 6, CELL - 6, 6); ctx.fill();
    }
    const pulse = 4 + Math.sin(now() / 120) * 2;
    ctx.shadowBlur = 24; ctx.shadowColor = COLORS.neon3; ctx.fillStyle = COLORS.neon3;
    roundRect(ctx, head.x * CELL + 2, head.y * CELL + 2, CELL - 4, CELL - 4, pulse); ctx.fill();
    ctx.restore();
  }
  function drawItems(ctx) {
    for (const item of foodsRef.current) {
      const w = CELL - 10 + Math.sin(now() / 150 + item.id) * 3;
      const x = item.pos.x * CELL + (CELL - w) / 2; const y = item.pos.y * CELL + (CELL - w) / 2;
      ctx.save(); ctx.shadowBlur = 18;
      const col = colorForPower(item.type); ctx.shadowColor = col; ctx.fillStyle = col;
      roundRect(ctx, x, y, w, w, 6); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.fillStyle = COLORS.bgA;
      const pad = 6; roundRect(ctx, x + pad, y + pad, w - pad * 2, w - pad * 2, 4); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, w - 2);
      ctx.restore();
    }
  }
  function drawParticles(ctx, dt) {
    particlesRef.current.forEach(p => { p.life -= dt; p.x += p.vx * (dt / 1000); p.y += p.vy * (dt / 1000); p.vx *= 0.98; p.vy *= 0.98; });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    for (const p of particlesRef.current) { ctx.save(); ctx.globalAlpha = clamp(p.life / 600, 0, 0.9); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }
  function drawHUD(ctx) {
    const barW = CANVAS_W * 0.6, barH = 10, cx = (CANVAS_W - barW) / 2, cy = CANVAS_H - barH - 8;
    ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = "#111827"; roundRect(ctx, cx, cy, barW, barH, 6); ctx.fill();
    const pct = clamp(comboTime / 3500, 0, 1);
    const g = ctx.createLinearGradient(cx, cy, cx + barW, cy); g.addColorStop(0, COLORS.neon1); g.addColorStop(1, COLORS.neon3);
    ctx.fillStyle = g; roundRect(ctx, cx, cy, barW * pct, barH, 6); ctx.fill(); ctx.globalAlpha = 1;
    ctx.font = "700 18px ui-sans-serif, system-ui, -apple-system"; ctx.fillStyle = COLORS.white; ctx.shadowColor = COLORS.neon2; ctx.shadowBlur = 8;
    ctx.fillText(`Puntos: ${score}`, 12, 22); ctx.fillText(`Récord: ${Math.max(high, score)}`, 12, 44); ctx.fillText(`x${Math.max(1, mult)}`, CANVAS_W - 52, 22);
    const active = effectsRef.current.filter(e => e.type !== "shield" || (e.charges ?? 0) > 0);
    let ix = CANVAS_W - 24; for (const e of active) { ix -= 24; ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = colorForPower(e.type); ctx.fillStyle = colorForPower(e.type); ctx.beginPath(); ctx.arc(ix, 40, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }
  function draw() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const shake = shakeRef.current; if (shake > 0) shakeRef.current = Math.max(0, shake - 0.9);
    const ox = (Math.random() - 0.5) * shake; const oy = (Math.random() - 0.5) * shake;
    ctx.save(); ctx.translate(ox, oy);
    drawGrid(ctx); drawItems(ctx); drawSnake(ctx); drawParticles(ctx, 1000 / 120); drawHUD(ctx);
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function lerpColor(a, b, t) {
    const pa = hexToRgb(a), pb = hexToRgb(b); if (!pa || !pb) return a;
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  const scale = React.useMemo(() => {
    const vw = typeof window !== "undefined" ? Math.min(window.innerWidth, 1100) : CANVAS_W;
    const margin = 32;
    return Math.min(1, (vw - margin) / (CANVAS_W + PADDING * 2));
  }, []);

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 to-indigo-950 text-white p-4">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">Snake FX — Combos & Premios</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSound(s => !s)} className="rounded-2xl px-3 py-2 bg-slate-800/60 hover:bg-slate-700/70 transition shadow">
              {sound ? <Volume2 className="w-5 h-5"/> : <VolumeX className="w-5 h-5"/>}
            </button>
            <button onClick={() => (running ? (setPaused(p => !p)) : (setRunning(true)))} className="rounded-2xl px-3 py-2 bg-indigo-600 hover:bg-indigo-500 transition shadow flex items-center gap-2">
              {running ? (paused ? <><Play className="w-5 h-5"/><span>Reanudar</span></> : <><Pause className="w-5 h-5"/><span>Pausa</span></>) : <><Play className="w-5 h-5"/><span>Jugar</span></>}
            </button>
            <button onClick={() => { setRunning(false); setTimeout(() => { setRunning(true); }, 0); }} className="rounded-2xl px-3 py-2 bg-slate-800 hover:bg-slate-700 transition shadow flex items-center gap-2">
              <RotateCcw className="w-5 h-5"/><span>Reiniciar</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-start">
          <div className="rounded-3xl p-4 bg-slate-900/60 ring-1 ring-white/10 shadow-2xl">
            <div className="relative" style={{ width: (CANVAS_W + PADDING * 2) * scale, height: (CANVAS_H + PADDING * 2) * scale }}>
              <div className="absolute inset-0 blur-3xl opacity-30 bg-gradient-to-tr from-fuchsia-600 to-teal-400 rounded-[2rem]" />
              <div className="relative" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <div className="p-4" style={{ width: CANVAS_W + PADDING * 2, height: CANVAS_H + PADDING * 2 }}>
                  <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="rounded-2xl ring-1 ring-white/10 shadow-xl bg-black/60" style={{ display: "block", margin: "0 auto" }} />
                </div>
              </div>
              {!running && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center p-6 rounded-3xl bg-slate-900/80 ring-1 ring-white/10 backdrop-blur">
                    <h2 className="text-2xl font-bold mb-2">Listo para jugar</h2>
                    <p className="text-slate-300 max-w-md">Come <span className="text-amber-300">Gemas</span> para sumar puntos. Encadena rápido para subir el <span className="text-pink-400">combo</span>. Recoge <span className="text-emerald-400">premios</span> para efectos especiales.</p>
                    <div className="grid grid-cols-3 gap-2 text-sm mt-4 text-left">
                      <div className="p-2 bg-slate-800/60 rounded-xl">▶️ Flechas / WASD</div>
                      <div className="p-2 bg-slate-800/60 rounded-xl">📱 Desliza para girar</div>
                      <div className="p-2 bg-slate-800/60 rounded-xl">⎵ Espacio = pausa</div>
                    </div>
                    <button onClick={() => setRunning(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition">
                      <Play className="w-5 h-5"/> Empezar
                    </button>
                  </motion.div>
                </div>
              )}
              {running && paused && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center p-6 rounded-3xl bg-slate-900/80 ring-1 ring-white/10 backdrop-blur">
                    <h2 className="text-2xl font-bold mb-2">Pausa</h2>
                    <p className="text-slate-300">Pulsa <b>Espacio</b> o <b>Reanudar</b> para continuar.</p>
                    <button onClick={() => setPaused(false)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition">
                      <Play className="w-5 h-5"/> Reanudar
                    </button>
                  </motion.div>
                </div>
              )}
              {!running && score > 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center p-6 rounded-3xl bg-slate-900/80 ring-1 ring-white/10 backdrop-blur">
                    <h2 className="text-2xl font-bold mb-2">Fin de la partida</h2>
                    <p className="text-slate-300">Puntuación: <b>{score}</b> — Récord: <b>{Math.max(high, score)}</b></p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button onClick={() => { setRunning(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition">
                        <RotateCcw className="w-5 h-5"/> Jugar de nuevo
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 rounded-3xl bg-slate-900/60 ring-1 ring-white/10 shadow-xl">
            <div className="grid gap-3">
              <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400"/><div className="text-lg font-semibold">Récord: {Math.max(high, score)}</div></div>
              <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-fuchsia-400"/><div className="text-lg font-semibold">Combo x{Math.max(1, mult)}</div></div>
              <div className="flex items-center gap-2"><Gift className="w-5 h-5 text-emerald-400"/><div className="text-slate-300 text-sm">Premios: <b>⭐ Doble puntos</b>, <b>⚡ Velocidad</b>, <b>❄️ Tiempo bala</b>, <b>🧲 Imán</b>, <b>🛡️ Escudo</b></div></div>
              <div className="text-slate-400 text-sm">Consejo: encadena gemas rápido para subir el combo. El escudo te permite atravesar tu cuerpo una vez (hasta 3 cargas).</div>
            </div>
          </div>
        </div>
        <footer className="mt-4 text-center text-slate-500 text-xs">Hecho con ❤ — Usa teclado o swipe en móvil. Si no ves el juego, pulsa “Jugar”.</footer>
      </div>
    </div>
  );
}
