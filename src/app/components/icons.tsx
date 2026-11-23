import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false, ...p });

export const CheckCircle = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="6.25" fill="currentColor" fillOpacity=".18" /><path d="m5.3 8.2 1.9 1.9 3.5-3.8" /></svg>;
export const HalfCircle = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="6.25" /><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" stroke="none" /></svg>;
export const DashedCircle = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="6.25" strokeDasharray="2.2 2.2" /></svg>;
export const XCircle = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="6.25" fill="currentColor" fillOpacity=".18" /><path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" /></svg>;
export const Copy = (p: P) => <svg {...base(p)}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5" /></svg>;
export const Check = (p: P) => <svg {...base(p)}><path d="m3.5 8.5 3 3 6-7" /></svg>;
export const Sun = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="2.75" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></svg>;
export const Moon = (p: P) => <svg {...base(p)}><path d="M13.25 9.4A5.5 5.5 0 0 1 6.6 2.75a5.5 5.5 0 1 0 6.65 6.65Z" /></svg>;
export const Alert = (p: P) => <svg {...base(p)}><path d="M8 2 1.8 13.2h12.4L8 2Z" /><path d="M8 6.5v3M8 11.3v.2" /></svg>;
export const Info = (p: P) => <svg {...base(p)}><circle cx="8" cy="8" r="6.25" /><path d="M8 7.2v3.6M8 5v.2" /></svg>;
export const Wifi = (p: P) => <svg {...base(p)}><path d="M2 6.2a8 8 0 0 1 12 0M4.2 8.7a5 5 0 0 1 7.6 0M6.4 11.2a2 2 0 0 1 3.2 0" /><circle cx="8" cy="13" r=".6" fill="currentColor" /></svg>;
export const WifiOff = (p: P) => <svg {...base(p)}><path d="M2 6.2a8 8 0 0 1 3-1.9M14 6.2a8 8 0 0 0-3-1.9M4.2 8.7a5 5 0 0 1 2-1.2M11.8 8.7a5 5 0 0 0-2-1.2M6.4 11.2a2 2 0 0 1 3.2 0M2 2l12 12" /></svg>;
export const Logo = (p: P) => <svg {...base({ width: 20, height: 20, viewBox: "0 0 20 20", ...p })}><rect x="2" y="2" width="16" height="16" rx="4" fill="currentColor" fillOpacity=".12" /><path d="M6 14 10 5l4 9M7.4 11.4h5.2" /></svg>;
export const Refresh = (p: P) => <svg {...base(p)}><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" /></svg>;
export const Graph = (p: P) => <svg {...base(p)}><circle cx="3.5" cy="4" r="1.5" /><circle cx="3.5" cy="12" r="1.5" /><circle cx="12.5" cy="8" r="1.5" /><path d="M5 4l6 3.6M5 12l6-3.6" /></svg>;
export const List = (p: P) => <svg {...base(p)}><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" /></svg>;

/** Four-step severity meter: n of 4 bars filled. */
export function SeverityMeter({ level, ...p }: P & { level: 1 | 2 | 3 | 4 }) {
  return (
    <svg width={16} height={14} viewBox="0 0 16 14" aria-hidden focusable={false} {...p}>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 4.2} y={10 - i * 3} width="3" height={4 + i * 3} rx="0.8" fill="currentColor" fillOpacity={i < level ? 1 : 0.25} />)}
    </svg>
  );
}
