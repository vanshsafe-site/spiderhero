import { useCallback, useEffect, useRef, useState } from "react";

type Building = { x: number; w: number; h: number; top: number; color: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const GRAVITY = 0.55;
const WEB_MAX = 350;
const GROUND_MARGIN = 40;
const GAME_W = 800;
const GAME_H = 600;
const STILL_SPEED = 2.2; // below this speed the spider counts as "still"
const PUSH_BOOST = 9; // forward velocity given by the push button

export function SpiderGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shootRef = useRef<() => void>(() => {});
  const releaseRef = useRef<() => void>(() => {});
  const tapRef = useRef<() => void>(() => {});
  const resetRef = useRef<() => void>(() => {});
  const pushRef = useRef<() => void>(() => {});
  const musicRef = useRef<{
    ctx: AudioContext | null;
    master: GainNode | null;
    timer: number | null;
    step: number;
  }>({ ctx: null, master: null, timer: null, step: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [combo, setCombo] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [canPush, setCanPush] = useState(true);
  const [musicOn, setMusicOn] = useState(false);

  const stateRef = useRef({
    px: 200,
    py: 200,
    vx: 4,
    vy: 0,
    web: null as null | { x: number; y: number; len: number },
    holding: false,
    buildings: [] as Building[],
    particles: [] as Particle[],
    camX: 0,
    camY: 0,
    shake: 0,
    startX: 200,
    airTime: 0,
    combo: 1,
    swings: 0,
    dead: false,
    lastWeb: false,
    score: 0,
    w: 800,
    h: 600,
    maxBuildingH: 0,
  });

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.px = 200;
    s.py = 150;
    s.vx = 5;
    s.vy = 0;
    s.web = null;
    s.holding = false;
    s.buildings = [];
    s.particles = [];
    s.camX = 0;
    s.camY = 0;
    s.shake = 0;
    s.startX = 200;
    s.airTime = 0;
    s.combo = 1;
    s.swings = 0;
    s.dead = false;
    s.lastWeb = false;
    s.score = 0;
    s.w = GAME_W;
    s.h = GAME_H;
    s.maxBuildingH = 0;
    genBuildings(s, 0);
    setScore(0);
    setCombo(1);
    setSpeed(0);
    setGameOver(false);
  }, []);

  useEffect(() => {
    const b = Number(localStorage.getItem("web-high-score") || 0);
    setBest(b);
    reset();
  }, [reset]);

  // Procedural background music, generated entirely in JS via the Web Audio API
  // (no audio files) — a small synth arpeggio + bass loop.
  const stopMusic = useCallback(() => {
    const m = musicRef.current;
    if (m.timer !== null) {
      window.clearInterval(m.timer);
      m.timer = null;
    }
    if (m.master) {
      m.master.gain.setTargetAtTime(0, m.ctx!.currentTime, 0.1);
    }
  }, []);

  const startMusic = useCallback(() => {
    const m = musicRef.current;
    if (!m.ctx) {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      m.ctx = new AudioCtx();
      m.master = m.ctx.createGain();
      m.master.gain.value = 0;
      m.master.connect(m.ctx.destination);
    }
    const ctx = m.ctx!;
    if (ctx.state === "suspended") ctx.resume();
    m.master!.gain.cancelScheduledValues(ctx.currentTime);
    m.master!.gain.setTargetAtTime(0.18, ctx.currentTime, 0.2);

    if (m.timer !== null) return; // already running

    const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]; // A minor-ish
    const bassNotes = [55, 55, 65.41, 73.42];
    const stepMs = 220;

    const playNote = (freq: number, dur: number, type: OscillatorType, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(m.master!);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.05);
    };

    m.timer = window.setInterval(() => {
      const i = m.step++;
      // arpeggio lead
      const note = scale[i % scale.length];
      playNote(note, 0.18, "square", 0.05);
      // bass every 2 steps
      if (i % 2 === 0) {
        playNote(bassNotes[(i / 2) % bassNotes.length], 0.3, "sawtooth", 0.07);
      }
      // occasional shimmering high note for texture
      if (i % 8 === 5) {
        playNote(note * 2, 0.15, "triangle", 0.03);
      }
    }, stepMs);
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicOn((on) => {
      const next = !on;
      if (next) startMusic();
      else stopMusic();
      return next;
    });
  }, [startMusic, stopMusic]);

  useEffect(() => {
    return () => {
      const m = musicRef.current;
      if (m.timer !== null) window.clearInterval(m.timer);
      if (m.ctx) m.ctx.close();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    const resize = () => {
      s.w = GAME_W;
      s.h = GAME_H;
      canvas.width = GAME_W;
      canvas.height = GAME_H;
    };
    resize();

    const findAnchor = (): { x: number; y: number } | null => {
      let best: { x: number; y: number; d: number } | null = null;
      for (const b of s.buildings) {
        // candidate anchors: top-left and top-right corners
        const candidates = [
          { x: b.x, y: b.top },
          { x: b.x + b.w, y: b.top },
          { x: b.x + b.w / 2, y: b.top },
        ];
        for (const c of candidates) {
          if (c.y >= s.py + 5) continue; // must be above player
          const dx = c.x - s.px;
          const dy = c.y - s.py;
          const d = Math.hypot(dx, dy);
          if (d <= WEB_MAX && (!best || d < best.d)) {
            best = { x: c.x, y: c.y, d };
          }
        }
      }
      return best ? { x: best.x, y: best.y } : null;
    };

    const shootWeb = () => {
      if (s.dead) return;
      s.holding = true;
      const a = findAnchor();
      if (a) {
        const len = Math.hypot(a.x - s.px, a.y - s.py);
        s.web = { x: a.x, y: a.y, len };
        s.swings++;
        s.combo = Math.min(s.combo + 1, 9);
        s.score += 25 * s.combo;
        for (let i = 0; i < 12; i++) {
          s.particles.push({
            x: a.x,
            y: a.y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 20,
          });
        }
      }
    };
    const releaseWeb = () => {
      s.holding = false;
      if (s.web) {
        s.lastWeb = true;
      }
      s.web = null;
    };

    const tapWeb = () => {
      if (s.dead) return;
      if (s.web) releaseWeb();
      else shootWeb();
    };

    const pushForward = () => {
      if (s.dead) return;
      const spd = Math.hypot(s.vx, s.vy);
      if (spd > STILL_SPEED) return; // only works while the spider is still
      s.vx += PUSH_BOOST;
      s.vy -= 1.5;
      for (let i = 0; i < 10; i++) {
        s.particles.push({
          x: s.px - 10,
          y: s.py,
          vx: -(1 + Math.random() * 3),
          vy: (Math.random() - 0.5) * 3,
          life: 18,
        });
      }
    };

    shootRef.current = shootWeb;
    releaseRef.current = releaseWeb;
    tapRef.current = tapWeb;
    resetRef.current = reset;
    pushRef.current = pushForward;

    const onDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (s.dead) return;
      tapWeb();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") reset();
      if (e.key === " ") tapWeb();
      if (e.key === "p" || e.key === "P") pushForward();
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("keydown", onKey);

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(32, t - last) / 16.67;
      last = t;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };

    const step = (dt: number) => {
      if (s.dead) return;
      // physics
      s.vy += GRAVITY * dt;
      s.px += s.vx * dt;
      s.py += s.vy * dt;

      // rope constraint
      if (s.web) {
        const dx = s.px - s.web.x;
        const dy = s.py - s.web.y;
        const d = Math.hypot(dx, dy);
        if (d > s.web.len) {
          const nx = dx / d;
          const ny = dy / d;
          s.px = s.web.x + nx * s.web.len;
          s.py = s.web.y + ny * s.web.len;
          // remove radial velocity, keep tangential
          const vr = s.vx * nx + s.vy * ny;
          if (vr > 0) {
            s.vx -= vr * nx;
            s.vy -= vr * ny;
          }
        }
      }

      // air-time / distance scoring
      s.airTime += dt / 60;
      const dist = s.px - s.startX;
      s.score = Math.max(s.score, Math.floor(dist / 10)) + s.score - Math.floor(s.score); // keep integer-ish
      // simpler:
      s.score = Math.floor(dist / 10) + s.swings * 25 * 1 + Math.floor(s.airTime * 10);

      // generate buildings ahead
      genBuildings(s, s.px);
      // cull behind
      s.buildings = s.buildings.filter((b) => b.x + b.w > s.px - s.w);

      // camera
      const targetCamX = s.px - s.w * 0.3;
      s.camX += (targetCamX - s.camX) * 0.15;
      const targetCamY = s.py - s.h * 0.5;
      s.camY += (targetCamY - s.camY) * 0.08;
      s.shake *= 0.9;
      const spd = Math.hypot(s.vx, s.vy);
      if (spd > 15) s.shake = Math.min(6, spd * 0.15);

      // buildings are no longer obstacles - swing through/past them freely

      // ground death - crashing into the ground ends the game
      const groundY = s.h - GROUND_MARGIN;
      if (s.py + 12 > groundY) die();

      // particles
      for (const p of s.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life--;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // combo decay when not holding for a while
      if (!s.web && !s.holding && s.lastWeb) {
        // ok
      }

      setScore(s.score);
      setSpeed(Math.round(spd * 10));
      setCombo(s.combo);
      setCanPush(spd <= STILL_SPEED);
    };

    const die = () => {
      if (s.dead) return;
      s.dead = true;
      const finalScore = Math.max(0, s.score);
      const prev = Number(localStorage.getItem("web-high-score") || 0);
      if (finalScore > prev) {
        localStorage.setItem("web-high-score", String(finalScore));
        setBest(finalScore);
      } else {
        setBest(prev);
      }
      setGameOver(true);
    };

    const draw = () => {
      const shakeX = (Math.random() - 0.5) * s.shake;
      const shakeY = (Math.random() - 0.5) * s.shake;
      // sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, s.h);
      g.addColorStop(0, "#0a0420");
      g.addColorStop(0.6, "#1a0a3a");
      g.addColorStop(1, "#2a0f4a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.w, s.h);

      // stars
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 173.31 - s.camX * 0.1) % s.w + s.w) % s.w;
        const sy = (i * 91.7) % (s.h * 0.5);
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      // parallax skyline
      drawParallax(ctx, s, -0.3, "#1a0838", 0.5);
      drawParallax(ctx, s, -0.6, "#2a1058", 0.7);

      ctx.save();
      ctx.translate(-s.camX + shakeX, -s.camY + shakeY);

      // buildings
      for (const b of s.buildings) {
        const y0 = b.top;
        const bg = ctx.createLinearGradient(b.x, y0, b.x, s.camY + s.h);
        bg.addColorStop(0, b.color);
        bg.addColorStop(1, "#0a0218");
        ctx.fillStyle = bg;
        ctx.fillRect(b.x, y0, b.w, s.camY + s.h + 500 - y0);
        // top glow
        ctx.fillStyle = "rgba(190,120,255,0.5)";
        ctx.fillRect(b.x, y0 - 2, b.w, 3);
        // windows
        ctx.fillStyle = "rgba(255,220,120,0.75)";
        for (let wy = y0 + 20; wy < s.camY + s.h; wy += 24) {
          for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 18) {
            if (((wx * 7 + wy * 13) >> 0) % 5 === 0) continue;
            ctx.fillRect(wx, wy, 8, 10);
          }
        }
      }

      // web
      if (s.web) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.web.x, s.web.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // player
      drawSpider(ctx, s.px, s.py, Math.atan2(s.vy, s.vx));

      // particles
      for (const p of s.particles) {
        ctx.fillStyle = `rgba(255,255,255,${p.life / 20})`;
        ctx.fillRect(p.x, p.y, 2, 2);
      }

      // ground / road - matches the actual death line exactly, deep enough
      // to always fully cover any building silhouette poking through below
      const groundY = s.h - GROUND_MARGIN;
      const roadDepth = Math.max(600, s.maxBuildingH + GROUND_MARGIN + 200);
      ctx.fillStyle = "#120a24";
      ctx.fillRect(s.camX - 400, groundY, s.w + 800, roadDepth);
      // asphalt strip
      const roadGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 36);
      roadGrad.addColorStop(0, "#3a3450");
      roadGrad.addColorStop(1, "#221d34");
      ctx.fillStyle = roadGrad;
      ctx.fillRect(s.camX - 400, groundY, s.w + 800, 36);
      // lane markings
      ctx.strokeStyle = "rgba(255, 220, 120, 0.85)";
      ctx.lineWidth = 4;
      ctx.setLineDash([28, 22]);
      ctx.beginPath();
      ctx.moveTo(s.camX - 400, groundY + 18);
      ctx.lineTo(s.camX + s.w + 400, groundY + 18);
      ctx.stroke();
      ctx.setLineDash([]);
      // glowing edge right where death triggers
      ctx.fillStyle = "rgba(255,60,120,0.85)";
      ctx.fillRect(s.camX - 400, groundY - 2, s.w + 800, 3);

      ctx.restore();
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [reset]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#0a0420] via-[#12042a] to-[#1a0838] px-3 py-4 text-white select-none">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
        <header className="w-full text-center">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            🕷️ Spider Hero:{" "}
            <span className="bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
              Web Slinger
            </span>
          </h1>
          <p className="mt-1 text-xs text-purple-300 sm:text-sm">
            Sling from building to building. Chain momentum. Survive.
          </p>
        </header>

        {/* 4:3 game box */}
        <div className="relative w-full max-w-3xl">
          <div className="relative w-full overflow-hidden rounded-2xl border border-purple-500/40 bg-black shadow-[0_0_40px_rgba(140,60,220,0.35)]" style={{ aspectRatio: "4 / 3" }}>
            <canvas
              ref={canvasRef}
              className="block h-full w-full touch-none"
            />

            {/* HUD top-left */}
            <div className="pointer-events-none absolute left-3 top-3 space-y-0.5 font-mono text-xs sm:text-sm">
              <div className="text-xl font-bold text-white drop-shadow-[0_0_8px_rgba(180,120,255,0.9)] sm:text-2xl">
                {score}
              </div>
              <div className="text-purple-300">SPEED {speed}</div>
              <div className="text-pink-300">×{combo} COMBO</div>
            </div>

            {/* HUD top-right */}
            <div className="pointer-events-none absolute right-3 top-3 text-right font-mono text-xs sm:text-sm">
              <div className="text-[10px] uppercase tracking-widest text-purple-300">
                Best
              </div>
              <div className="text-lg font-bold text-white drop-shadow-[0_0_8px_rgba(255,120,200,0.8)] sm:text-xl">
                {best}
              </div>
            </div>

            {gameOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="rounded-2xl border border-purple-500/40 bg-[#12042a]/90 p-6 text-center shadow-[0_0_60px_rgba(160,80,255,0.5)] sm:p-8">
                  <div className="text-xs uppercase tracking-[0.3em] text-pink-400">
                    Wiped Out
                  </div>
                  <div className="mt-3 text-4xl font-black text-white sm:text-5xl">
                    {score}
                  </div>
                  <div className="mt-1 font-mono text-sm text-purple-300">
                    Best {best}
                  </div>
                  <button
                    onClick={() => resetRef.current()}
                    className="mt-5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-6 py-3 font-bold text-white transition hover:scale-105 hover:shadow-[0_0_30px_rgba(200,80,255,0.7)]"
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* On-screen controls (mobile + desktop) */}
        <div className="flex w-full max-w-3xl items-center justify-between gap-3">
          <button
            onClick={() => setShowHelp(true)}
            className="rounded-lg border border-purple-500/40 bg-white/5 px-4 py-2 text-sm font-medium text-purple-200 transition hover:bg-white/10"
          >
            How to Play
          </button>

          <button
            onPointerDown={(e) => {
              e.preventDefault();
              tapRef.current();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="flex-1 max-w-xs select-none rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-8 py-5 text-lg font-black text-white shadow-[0_0_30px_rgba(200,80,255,0.5)] transition active:scale-95 active:shadow-[0_0_50px_rgba(200,80,255,0.8)] touch-none"
          >
            🕸️ TAP TO SLING
          </button>

          <button
            onClick={() => resetRef.current()}
            className="rounded-lg border border-purple-500/40 bg-white/5 px-4 py-2 text-sm font-medium text-purple-200 transition hover:bg-white/10"
          >
            Restart
          </button>
        </div>

        {/* Push + music row */}
        <div className="flex w-full max-w-3xl items-center justify-between gap-3">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              pushRef.current();
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!canPush || gameOver}
            className={`flex-1 select-none rounded-2xl px-8 py-4 text-base font-black text-white shadow-[0_0_20px_rgba(80,200,255,0.4)] transition touch-none ${
              canPush && !gameOver
                ? "bg-gradient-to-r from-cyan-500 to-blue-500 active:scale-95 active:shadow-[0_0_40px_rgba(80,200,255,0.8)]"
                : "cursor-not-allowed bg-white/10 opacity-40"
            }`}
          >
            👊 PUSH {canPush ? "" : "(only while still)"}
          </button>

          <button
            onClick={toggleMusic}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              musicOn
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                : "border-purple-500/40 bg-white/5 text-purple-200 hover:bg-white/10"
            }`}
          >
            {musicOn ? "🔊 Music On" : "🔇 Music Off"}
          </button>
        </div>

        {/* Quick reference */}
        <div className="grid w-full max-w-3xl grid-cols-2 gap-2 rounded-xl border border-purple-500/20 bg-white/5 p-3 text-xs sm:grid-cols-4 sm:text-sm">
          <Kbd label="Sling" desc="Tap button / Click / Tap screen" />
          <Kbd label="Release" desc="Tap again" />
          <Kbd label="Push" desc="P key / button (only while still)" />
          <Kbd label="Keyboard" desc="Space to sling / release" />
          <Kbd label="Restart" desc="R key or button" />
          <Kbd label="Music" desc="Toggle button (JS-generated synth)" />
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-purple-500/40 bg-[#12042a] p-6 shadow-[0_0_60px_rgba(160,80,255,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-black">How to Play</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded-lg border border-purple-500/40 bg-white/5 px-3 py-1 text-sm text-purple-200 hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-purple-100">
              <Section title="🎯 Goal">
                Swing through the endless neon city. Don't crash into
                the ground. Rack up the highest score you can.
              </Section>
              <Section title="🕸️ Sling a Web">
                Tap <b>TAP TO SLING</b>, tap the game area, click, or press{" "}
                <b>Space</b> to fire a web at the nearest building within
                350px and swing like a pendulum. Tap again to release.
              </Section>
              <Section title="⚡ Build Momentum">
                Let gravity pull you down through the swing, then <b>release</b>{" "}
                at the bottom of the arc to launch forward. Time it right and
                you'll fly further each swing.
              </Section>
              <Section title="🔗 Combos">
                Chain slings back-to-back to build a combo multiplier (up to
                ×9). Every successful attach adds bonus score.
              </Section>
              <Section title="👊 Push">
                If you come to a stop with no web out, hit <b>PUSH</b> (or the{" "}
                <b>P</b> key) to shove the spider forward and get moving
                again.
              </Section>
              <Section title="🎵 Music">
                Toggle the music button for a looping synth soundtrack,
                generated live in JavaScript.
              </Section>
              <Section title="💀 You Lose If">
                You crash into the ground.
              </Section>
              <Section title="🏆 Score">
                +1 per meter · +25 × combo per attach · +10 per second airborne.
                Best score is saved on your device.
              </Section>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full rounded-lg bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-6 py-3 font-bold text-white"
            >
              Let's Swing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-purple-400">
        {label}
      </span>
      <span className="text-purple-100">{desc}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-bold text-white">{title}</div>
      <div className="mt-1 leading-relaxed">{children}</div>
    </div>
  );
}

function genBuildings(s: ReturnType<typeof stateShape>, aheadX: number) {
  const lastX = s.buildings.length
    ? s.buildings[s.buildings.length - 1].x + s.buildings[s.buildings.length - 1].w
    : 0;
  let x = lastX;
  const target = aheadX + s.w * 1.5;
  const palette = ["#3a1560", "#2a0f4a", "#4a1a70", "#20083a"];
  while (x < target) {
    const gap = 60 + Math.random() * 140;
    x += gap;
    const w = 80 + Math.random() * 140;
    // Tall skyscrapers: much higher range than before.
    const h = 600 + Math.random() * 950;
    const b: Building = {
      x,
      w,
      h,
      top: s.h - GROUND_MARGIN - h,
      color: palette[Math.floor(Math.random() * palette.length)],
    };
    s.buildings.push(b);
    if (h > s.maxBuildingH) s.maxBuildingH = h;
    x += w;
  }
}

// dummy fn just for TS inference of state shape
function stateShape() {
  return {
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    web: null as null | { x: number; y: number; len: number },
    holding: false,
    buildings: [] as Building[],
    particles: [] as Particle[],
    camX: 0,
    camY: 0,
    shake: 0,
    startX: 0,
    airTime: 0,
    combo: 1,
    swings: 0,
    dead: false,
    lastWeb: false,
    score: 0,
    w: 0,
    h: 0,
    maxBuildingH: 0,
  };
}

function drawParallax(
  ctx: CanvasRenderingContext2D,
  s: { camX: number; camY: number; w: number; h: number },
  factor: number,
  color: string,
  baseline: number,
) {
  ctx.fillStyle = color;
  const off = s.camX * factor;
  const yBase = s.h * baseline;
  for (let i = -2; i < 20; i++) {
    const bw = 120;
    const bx = ((i * 180 - off) % (s.w + 400)) + (off % 180);
    const bh = 80 + ((i * 37) % 120);
    ctx.fillRect(bx, yBase - bh + 100, bw, s.h);
  }
}

function drawSpider(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // body
  ctx.fillStyle = "#c81e2e";
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // blue accent
  ctx.fillStyle = "#1e5fc8";
  ctx.fillRect(-10, -2, 20, 6);
  // eyes
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(4, -3, 3, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-4, -3, 3, 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}