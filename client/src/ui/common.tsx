import { KART_COLORS, colorById } from '../../../shared/constants';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtLap(ms: number): string {
  if (!ms) return '—';
  const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** SVG kart matching the in-game sprite. */
export function KartPreview({ color, size = 120, spin = false }: { color: string; size?: number; spin?: boolean }) {
  const c = colorById(color);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const fill = hex(c.fill), dark = hex(c.dark), out = hex(c.outline);
  return (
    <svg className={spin ? 'kart-svg spin' : 'kart-svg'} width={size} height={size * 0.66} viewBox="-2 -2 56 38" aria-label={`${c.name} kart`} role="img">
      <ellipse cx="28" cy="20" rx="27" ry="15" fill="rgba(0,0,0,.25)" />
      <g fill="#15161b">
        <rect x="7" y="1" width="12" height="7" rx="2" /><rect x="7" y="26" width="12" height="7" rx="2" />
        <rect x="34" y="3" width="10" height="6" rx="2" /><rect x="34" y="25" width="10" height="6" rx="2" />
      </g>
      <rect x="1" y="5" width="7" height="24" rx="2" fill={dark} stroke={out} strokeWidth="1.5" />
      <path d="M40 9 L51 17 L40 25 Z" fill={fill} stroke={out} strokeWidth="2" strokeLinejoin="round" />
      <rect x="6" y="8" width="38" height="18" rx="8" fill={fill} stroke={out} strokeWidth="2" />
      <rect x="10" y="15" width="34" height="4" rx="2" fill={dark} />
      <rect x="14" y="6" width="16" height="4" rx="2" fill={dark} /><rect x="14" y="24" width="16" height="4" rx="2" fill={dark} />
      <circle cx="24" cy="17" r="7" fill="#fff" stroke={out} strokeWidth="2" />
      <rect x="25" y="13" width="5" height="8" rx="2" fill={dark} />
    </svg>
  );
}

export function ColorDot({ color, size = 14 }: { color: string; size?: number }) {
  const c = colorById(color);
  return <span className="color-dot" style={{ width: size, height: size, background: c.css, boxShadow: c.id === 'graphite' ? '0 0 0 2px #fff' : undefined }} />;
}

export function ColorPicker({ value, taken, onChange }: { value: string; taken: string[]; onChange: (id: string) => void }) {
  return (
    <div className="color-grid" role="radiogroup" aria-label="Kart color">
      {KART_COLORS.map((c) => {
        const isTaken = taken.includes(c.id) && c.id !== value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            aria-label={`${c.name}${isTaken ? ' (taken)' : ''}`}
            title={isTaken ? `${c.name} — taken` : c.name}
            disabled={isTaken}
            className={`swatch ${value === c.id ? 'selected' : ''} ${isTaken ? 'taken' : ''} ${c.id}`}
            style={{ background: c.css }}
            onClick={() => onChange(c.id)}
          />
        );
      })}
    </div>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  const letters = 'COLOR'.split('');
  const cols = ['#ff3b47', '#ff8a1f', '#ffd31a', '#2fd35a', '#2f7bff'];
  return (
    <h1 className={small ? 'logo small' : 'logo'} aria-label="Color Rush">
      <span className="logo-color">{letters.map((l, i) => <span key={i} style={{ color: cols[i] }}>{l}</span>)}</span>
      <span className="logo-rush">RUSH</span>
    </h1>
  );
}
