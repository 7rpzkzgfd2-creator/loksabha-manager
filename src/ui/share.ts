// Draws a 1200x630 result card on a canvas and shares or downloads it.
import type { GameState } from '../engine/index.ts';
import { MAJORITY } from '../engine/index.ts';
import { hemicyclePoints, orderParties } from './components.tsx';
import { SITE_URL } from './support.tsx';

const W = 1200, H = 630;

export async function makeResultCard(g: GameState, idx: number, me: string): Promise<Blob> {
  const r = g.results[idx];
  const p = g.parties[me];
  const seats = r.partySeats[me] ?? 0;
  const vote = (r.voteShare[me] ?? 0) * 100;
  await document.fonts?.ready;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#06080c'; x.fillRect(0, 0, W, H);
  x.fillStyle = p.color; x.fillRect(0, 0, 12, H);

  // chamber on the right
  const pts = hemicyclePoints();
  const dots: string[] = [];
  for (const id of orderParties(g, r.partySeats)) for (let i = 0; i < r.partySeats[id]; i++) dots.push(g.parties[id]?.color ?? '#555');
  const s = 2.05, ox = 620, oy = 120;
  pts.forEach((pt, i) => { x.beginPath(); x.arc(ox + pt.x * s, oy + pt.y * s, 2.7 * s, 0, Math.PI * 2); x.fillStyle = dots[i] ?? '#1b2330'; x.fill(); });

  x.textBaseline = 'alphabetic';
  x.fillStyle = '#ff8a1f'; x.font = '600 22px "IBM Plex Mono", monospace';
  x.fillText(`${r.year} GENERAL ELECTION`, 60, 90);
  x.fillStyle = '#e8edf3'; x.font = '800 54px Fraunces, Georgia, serif';
  fit(x, p.name, 60, 160, 540);
  x.font = '800 150px Fraunces, Georgia, serif'; x.fillStyle = p.color === '#000000' ? '#e8edf3' : lighten(p.color);
  x.fillText(String(seats), 56, 330);
  const sw = x.measureText(String(seats)).width;
  x.fillStyle = '#a9b4c2'; x.font = '500 30px "IBM Plex Sans", sans-serif';
  x.fillText(seats === 1 ? 'seat' : 'seats', 70 + sw, 330);
  x.fillText(`${vote.toFixed(1)}% of the national vote`, 60, 385);
  const top = Object.keys(r.partySeats).sort((a, b) => r.partySeats[b] - r.partySeats[a])[0];
  x.fillStyle = '#e8edf3'; x.font = '600 26px "IBM Plex Sans", sans-serif';
  x.fillText(verdict(g, idx, me, seats, top), 60, 450);

  // top four parties under the chamber
  const rows = Object.keys(r.partySeats).filter((k) => r.partySeats[k] > 0).sort((a, b) => r.partySeats[b] - r.partySeats[a]).slice(0, 4);
  rows.forEach((id, i) => {
    const cx = 640 + (i % 2) * 260, cy = 450 + Math.floor(i / 2) * 44;
    x.fillStyle = g.parties[id]?.color ?? '#555'; x.fillRect(cx, cy - 18, 18, 18);
    x.fillStyle = id === me ? '#ff8a1f' : '#e8edf3'; x.font = '600 22px "IBM Plex Sans", sans-serif';
    x.fillText(`${g.parties[id]?.short ?? id}  ${r.partySeats[id]}`, cx + 28, cy);
  });

  x.fillStyle = '#1d2633'; x.fillRect(60, 540, W - 120, 2);
  x.fillStyle = '#e8edf3'; x.font = '800 26px Fraunces, Georgia, serif';
  x.fillText('Lok Sabha Manager', 60, 590);
  x.fillStyle = '#6b7889'; x.font = '500 22px "IBM Plex Mono", monospace';
  const u = SITE_URL.replace(/^https?:\/\//, '');
  x.fillText(`Play free: ${u}`, W - 60 - x.measureText(`Play free: ${u}`).width, 590);
  return new Promise((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error('canvas'))), 'image/png'));
}

function verdict(g: GameState, idx: number, me: string, seats: number, top: string): string {
  const prev = idx > 0 ? g.results[idx - 1].partySeats[me] ?? 0 : null;
  if (seats >= MAJORITY) return 'Won an outright majority.';
  if (top === me) return `Single largest party, ${MAJORITY - seats} short of a majority.`;
  if (seats === 0) return 'Shut out this time. Back to the drawing board.';
  if (prev !== null && seats > prev) return `Up ${seats - prev} from ${prev} last time.`;
  if (prev !== null && seats < prev) return `Down ${prev - seats} from ${prev} last time.`;
  return `${g.parties[top].short} is the largest party with ${g.results[idx].partySeats[top]}.`;
}

function fit(x: CanvasRenderingContext2D, t: string, px: number, py: number, max: number) {
  let size = 54;
  while (x.measureText(t).width > max && size > 28) { size -= 2; x.font = `800 ${size}px Fraunces, Georgia, serif`; }
  x.fillText(t, px, py);
}

// dark party colours would vanish on the background
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return '#e8edf3';
  const r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  if (lum > 110) return hex;
  const k = 110 / Math.max(lum, 1);
  return `rgb(${Math.min(255, r * k + 40)},${Math.min(255, gg * k + 40)},${Math.min(255, b * k + 40)})`;
}

export async function shareResult(g: GameState, idx: number, me: string): Promise<'shared' | 'downloaded'> {
  const blob = await makeResultCard(g, idx, me);
  const file = new File([blob], `lok-sabha-${g.results[idx].year}.png`, { type: 'image/png' });
  const seats = g.results[idx].partySeats[me] ?? 0;
  const text = `I won ${seats} seat${seats === 1 ? '' : 's'} with ${g.parties[me].name} in Lok Sabha Manager. Can you beat it? ${SITE_URL}`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
