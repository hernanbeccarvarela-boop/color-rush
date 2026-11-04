import { useEffect, useRef } from 'react';
import { getTrack, pointAt } from '../../../shared/track';
import { hud } from '../game/RaceScene';

function drawTrack(ctx: CanvasRenderingContext2D, w: number, h: number, pad: number) {
  const t = getTrack();
  const sc = Math.min((w - pad * 2) / t.width, (h - pad * 2) / t.height);
  const ox = (w - t.width * sc) / 2, oy = (h - t.height * sc) / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= t.n; i += 4) {
      const k = i % t.n;
      const x = ox + t.px[k] * sc, y = oy + t.py[k] * sc;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  path(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(5, 300 * sc); ctx.stroke();
  path(); ctx.strokeStyle = '#3a3e4d'; ctx.lineWidth = Math.max(3, 250 * sc); ctx.stroke();
  // start line
  const a = pointAt(t, 0, -t.hw[0]), b = pointAt(t, 0, t.hw[0]);
  ctx.strokeStyle = '#ffd31a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(ox + a.x * sc, oy + a.y * sc); ctx.lineTo(ox + b.x * sc, oy + b.y * sc); ctx.stroke();
  return { sc, ox, oy };
}

/** Static track thumbnail for the lobby. */
export function TrackThumb() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 300 * dpr; c.height = 210 * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr);
    drawTrack(ctx, 300, 210, 12);
  }, []);
  return <canvas ref={ref} className="track-thumb" style={{ width: 300, height: 210 }} aria-label="Track map" role="img" />;
}

/** Live minimap with every kart's position. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = 210, H = 160, dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const bg = document.createElement('canvas'); bg.width = W * dpr; bg.height = H * dpr;
    const bctx = bg.getContext('2d')!; bctx.scale(dpr, dpr);
    const { sc, ox, oy } = drawTrack(bctx, W, H, 10);
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(bg, 0, 0);
      ctx.scale(dpr, dpr);
      let mine: { x: number; y: number; color: string } | null = null;
      for (const p of hud.positions.values()) {
        if (p.me) { mine = p; continue; }
        ctx.beginPath(); ctx.arc(ox + p.x * sc, oy + p.y * sc, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0d0f1a'; ctx.stroke();
      }
      if (mine) {
        ctx.beginPath(); ctx.arc(ox + mine.x * sc, oy + mine.y * sc, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = mine.color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="minimap" style={{ width: 210, height: 160 }} aria-label="Minimap" role="img" />;
}
