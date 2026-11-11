import { svg, nothing, type TemplateResult } from "lit";
import type { SlatProfile } from "./types";

/*
 * SVG illustrations of the card. All colours come from CSS custom properties
 * defined in styles.ts, so the drawing follows the Home Assistant theme.
 */

/* ---------- window ---------- */

export const WIN_W = 200;
export const WIN_H = 240;
/** y of the bottom rail when the blind is fully raised / fully lowered. */
export const RAIL_TOP = 26;
export const RAIL_SPAN = 200;

const GLASS = { x: 14, y: 22, w: 172, h: 206 };
const SLAT_X = 19;
const SLAT_W = 162;
const SLAT_PITCH = 9;

export const railY = (lowered: number): number => RAIL_TOP + (lowered / 100) * RAIL_SPAN;

export const loweredFromY = (y: number): number =>
  Math.min(100, Math.max(0, ((y - RAIL_TOP) / RAIL_SPAN) * 100));

export interface WindowDrawing {
  lowered: number;
  angle: number;
  hasTilt: boolean;
  targetLowered?: number;
  uid: string;
}

export function renderWindow(d: WindowDrawing): TemplateResult {
  const yb = railY(d.lowered);
  const s = d.hasTilt ? Math.abs(Math.sin((d.angle * Math.PI) / 180)) : 0.85;
  /* Projected slat height: a thin line when horizontal, overlapping bands when closed. */
  const h = 1.2 + 8.8 * s;
  const slats: TemplateResult[] = [];
  for (let y = GLASS.y + 3; y < yb - 3; y += SLAT_PITCH) {
    slats.push(svg`<rect x=${SLAT_X} y=${(y - h / 2).toFixed(2)} width=${SLAT_W} height=${h.toFixed(2)} class="slat"></rect>`);
    if (h > 3) {
      slats.push(svg`<rect x=${SLAT_X} y=${(y - h / 2).toFixed(2)} width=${SLAT_W} height="1" class="slat-hi"></rect>`);
      slats.push(svg`<rect x=${SLAT_X} y=${(y + h / 2 - 1).toFixed(2)} width=${SLAT_W} height="1" class="slat-lo"></rect>`);
    }
  }
  const showGhost = d.targetLowered !== undefined && Math.abs(d.targetLowered - d.lowered) > 0.5;
  const gy = showGhost ? railY(d.targetLowered!) : 0;
  const clip = `rc-glass-${d.uid}`;
  return svg`
    <defs>
      <clipPath id=${clip}><rect x=${GLASS.x} y=${GLASS.y} width=${GLASS.w} height=${GLASS.h} rx="3"></rect></clipPath>
    </defs>
    <rect x="4" y="4" width="192" height="232" rx="10" class="reveal"></rect>
    <g clip-path="url(#${clip})">
      <rect x=${GLASS.x} y=${GLASS.y} width=${GLASS.w} height=${GLASS.h} class="sky"></rect>
      <circle cx="146" cy="70" r="13" class="sun"></circle>
      <path d="M14 182 C 52 150, 86 158, 118 174 S 170 160, 186 152 L 186 228 L 14 228 Z" class="hill-far"></path>
      <path d="M14 204 C 60 184, 104 196, 140 204 S 176 196, 186 192 L 186 228 L 14 228 Z" class="hill-near"></path>
      ${slats}
      <rect x="14" y=${Math.max(GLASS.y, yb - 3).toFixed(2)} width="172" height="6" rx="1.5" class="rail"></rect>
      <rect x="86" y=${(Math.max(GLASS.y, yb - 3) + 1.5).toFixed(2)} width="28" height="3" rx="1.5" class="grip"></rect>
    </g>
    <rect x="14" y="22" width="5" height="206" class="guide"></rect>
    <rect x="181" y="22" width="5" height="206" class="guide"></rect>
    <rect x="10" y="8" width="180" height="16" rx="4" class="box"></rect>
    <rect x="10" y="20" width="180" height="2" class="box-shade"></rect>
    ${showGhost
      ? svg`<line x1="14" x2="186" y1=${gy} y2=${gy} class="ghost-line"></line>
            <circle cx="186" cy=${gy} r="4" class="ghost-dot"></circle>`
      : nothing}
  `;
}

/* ---------- slat dial ---------- */

export const DIAL_W = 120;
export const DIAL_H = 240;
export const PIVOT = { x: 44, y: 112 };
const ARC_R = 44;
const SLAT_HALF = 37;
const STACK = 42;

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number, r: number) => ({
  x: PIVOT.x + r * Math.cos(rad(deg)),
  y: PIVOT.y + r * Math.sin(rad(deg)),
});

function arcPath(from: number, to: number, r: number): string {
  const a = pt(from, r);
  const b = pt(to, r);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}



/** Slat cross-section, centred on the pivot, horizontal before rotation (inside left, outside right). */
function slatPath(cy: number, profile: SlatProfile): string {
  const x0 = PIVOT.x;
  const L = SLAT_HALF;
  switch (profile) {
    case "c":
      return `M ${x0 - L} ${cy + 1.5} Q ${x0} ${cy - 8} ${x0 + L} ${cy + 1.5}`;
    case "flat":
      return `M ${x0 - L} ${cy} L ${x0 + L} ${cy}`;
    default: {
      /* Z profile: flat web, inner edge folded up, outer edge folded down; neighbours interlock when closed. */
      const lip = 6;
      const bend = 5;
      return `M ${x0 - L} ${cy - lip} L ${x0 - L + bend} ${cy} L ${x0 + L - bend} ${cy} L ${x0 + L} ${cy + lip}`;
    }
  }
}

function slatShape(cy: number, angle: number, cls: string, profile: SlatProfile): TemplateResult {
  return svg`<g transform="rotate(${angle.toFixed(2)} ${PIVOT.x} ${cy})">
    <path d=${slatPath(cy, profile)} class="${cls}"></path>
  </g>`;
}

export interface DialDrawing {
  angle: number;
  minAngle: number;
  maxAngle: number;
  /** Angle at which the slats are closed (end of the "closed" side of the arc). */
  closedAngle: number;
  targetAngle?: number;
  enabled: boolean;
  insideLabel: string;
  outsideLabel: string;
  profile: SlatProfile;
}

export function renderDial(d: DialDrawing): TemplateResult {
  const openAngle = d.closedAngle === d.maxAngle ? d.minAngle : d.maxAngle;
  const handle = pt(d.angle, ARC_R);
  const showGhost = d.targetAngle !== undefined && Math.abs(d.targetAngle - d.angle) > 1;
  const gh = showGhost ? pt(d.targetAngle!, ARC_R) : undefined;
  const ticks = [d.minAngle, (d.minAngle + d.maxAngle) / 2, d.maxAngle].map((a) => {
    const p1 = pt(a, ARC_R + 7);
    const p2 = pt(a, ARC_R + 11);
    return svg`<line x1=${p1.x.toFixed(2)} y1=${p1.y.toFixed(2)} x2=${p2.x.toFixed(2)} y2=${p2.y.toFixed(2)} class="tick"></line>`;
  });
  const labelAt = (a: number, text: string) => {
    const p = pt(a, ARC_R + 21);
    const x = Math.min(DIAL_W - 10, Math.max(10, p.x));
    const y = Math.min(DIAL_H - 4, Math.max(28, p.y + 4));
    return svg`<text x=${x.toFixed(1)} y=${y.toFixed(1)} text-anchor="middle" class="dial-num">${text}</text>`;
  };
  return svg`
    <text x="4" y="16" class="dial-side">${d.insideLabel}</text>
    <text x=${DIAL_W - 4} y="16" text-anchor="end" class="dial-side">${d.outsideLabel}</text>
    <circle cx="104" cy="34" r="7" class="sun"></circle>
    <line x1=${PIVOT.x} y1="30" x2=${PIVOT.x} y2="196" class="cord"></line>
    ${slatShape(PIVOT.y - STACK, d.angle, "slat-ctx", d.profile)}
    ${slatShape(PIVOT.y + STACK, d.angle, "slat-ctx", d.profile)}
    <path d=${arcPath(d.minAngle, d.maxAngle, ARC_R)} class="track"></path>
    ${d.enabled ? svg`<path d=${arcPath(openAngle, d.angle, ARC_R)} class="track-fill"></path>` : nothing}
    ${ticks}
    ${labelAt(d.minAngle, `${Math.round(d.minAngle)}°`)}
    ${labelAt(d.maxAngle, `${Math.round(d.maxAngle)}°`)}
    ${showGhost ? slatShape(PIVOT.y, d.targetAngle!, "slat-ghost", d.profile) : nothing}
    ${slatShape(PIVOT.y, d.angle, "slat-main", d.profile)}
    <circle cx=${PIVOT.x} cy=${PIVOT.y} r="3" class="pivot"></circle>
    ${gh ? svg`<circle cx=${gh.x.toFixed(2)} cy=${gh.y.toFixed(2)} r="7" class="handle-ghost"></circle>` : nothing}
    ${d.enabled
      ? svg`<circle cx=${handle.x.toFixed(2)} cy=${handle.y.toFixed(2)} r="8" class="handle"></circle>`
      : nothing}
  `;
}

/** Angle (degrees, 0 = horizontal pointing outside, clockwise) from a point in dial coordinates. */
export function dialAngleAt(x: number, y: number): number | undefined {
  const dx = x - PIVOT.x;
  const dy = y - PIVOT.y;
  if (Math.hypot(dx, dy) < 6) return undefined;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}
