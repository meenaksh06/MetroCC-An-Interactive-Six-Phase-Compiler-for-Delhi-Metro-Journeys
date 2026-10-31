/** Schematic SVG metro map with the compiled route highlighted and an animated train marker. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { isInterchange, stationById } from '../../compiler/data/graph';
import { LINES, STATIONS } from '../../compiler/data/metro';

interface Props {
  /** rides of the journey, in order */
  rides: { line: string; stations: string[] }[];
  /** how many rides are revealed (train runs through them) */
  revealed: number;
  replayKey?: number;
}

const SHORT: Record<string, string> = { 'Ramakrishna Ashram Marg': 'RK Ashram', 'Satguru Ram Singh Marg': 'Satguru RS Marg', 'Central Secretariat': 'Central Sectt.', 'Barakhamba Road': 'Barakhamba' };

const pt = (s: string) => {
  const st = stationById.get(s)!;
  return [st.x, st.y] as const;
};

export function MetroMap({ rides, revealed, replayKey = 0 }: Props) {
  // flattened polyline of the whole journey + cumulative lengths per ride end
  const { points, rideEnds } = useMemo(() => {
    const points: [number, number][] = [];
    const rideEnds: number[] = [];
    let total = 0;
    for (const r of rides) {
      r.stations.forEach((s, i) => {
        const p = pt(s) as [number, number];
        const last = points[points.length - 1];
        if (last && (i > 0 || last[0] !== p[0] || last[1] !== p[1])) total += Math.hypot(p[0] - last[0], p[1] - last[1]);
        points.push(p);
      });
      rideEnds.push(total);
    }
    return { points, rideEnds };
  }, [rides]);

  const target = revealed <= 0 ? 0 : rideEnds[Math.min(revealed, rideEnds.length) - 1] ?? 0;
  const [dist, setDist] = useState(0);
  const distRef = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    distRef.current = 0;
    setDist(0);
  }, [rides, replayKey]);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const from = distRef.current;
    const to = target;
    if (from === to) return;
    const dur = Math.min(2600, Math.max(500, Math.abs(to - from) * 4));
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const d = from + (to - from) * e;
      distRef.current = d;
      setDist(d);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, replayKey]);

  // position along the polyline
  const train = useMemo(() => {
    if (points.length < 2) return points[0];
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (acc + seg >= dist) {
        const k = seg ? (dist - acc) / seg : 0;
        return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k] as const;
      }
      acc += seg;
    }
    return points[points.length - 1];
  }, [points, dist]);

  const onRoute = new Set(rides.flatMap((r) => r.stations));
  const hasRoute = rides.length > 0;
  const start = rides[0]?.stations[0];
  const end = rides[rides.length - 1]?.stations.at(-1);

  return (
    <svg viewBox="10 15 990 720" className="h-full w-full">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* base network */}
      {LINES.flatMap((l) =>
        l.routes.map((r, i) => (
          <polyline
            key={`${l.id}-${i}`}
            points={r.stations.map((s) => pt(s).join(',')).join(' ')}
            fill="none"
            stroke={l.color}
            strokeWidth={7}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={hasRoute ? 0.22 : 0.9}
          />
        )),
      )}
      {/* journey */}
      {rides.map((r, i) => (
        <polyline
          key={`ride-${i}`}
          points={r.stations.map((s) => pt(s).join(',')).join(' ')}
          fill="none"
          stroke={LINES.find((l) => l.id === r.line)!.color}
          strokeWidth={i < revealed ? 10 : 7}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={i < revealed ? 1 : 0.45}
          filter={i < revealed ? 'url(#glow)' : undefined}
        />
      ))}
      {/* stations */}
      {STATIONS.map((s) => {
        const ic = isInterchange(s.id);
        const lit = !hasRoute || onRoute.has(s.id);
        const [dx, dy, anchor] = s.label === 'r' ? [12, 5, 'start'] : s.label === 'l' ? [-12, 5, 'end'] : s.label === 't' ? [0, -12, 'middle'] : [0, 22, 'middle'];
        return (
          <g key={s.id} opacity={lit ? 1 : 0.45}>
            <circle cx={s.x} cy={s.y} r={ic ? 7 : 4} fill="var(--panel)" stroke={ic ? 'var(--text)' : 'var(--muted)'} strokeWidth={ic ? 2.4 : 1.6} />
            <text x={s.x + dx} y={s.y + dy} textAnchor={anchor} fontSize={ic ? 14 : 12} fontWeight={ic || onRoute.has(s.id) ? 700 : 500} fill="var(--text)">
              {SHORT[s.id] ?? s.id}
            </text>
          </g>
        );
      })}
      {start && <Pin at={start} label="BOARD" color="#10b981" />}
      {end && <Pin at={end} label="EXIT" color="#ef4444" />}
      {train && hasRoute && (
        <g transform={`translate(${train[0]},${train[1]})`}>
          <circle r={13} fill="#FFCC00" opacity={0.25} />
          <circle r={9} fill="#111827" stroke="#FFCC00" strokeWidth={3} />
          <text y={4} textAnchor="middle" fontSize={10}>🚇</text>
        </g>
      )}
      {/* legend */}
      <g transform="translate(20,640)">
        {LINES.map((l, i) => (
          <g key={l.id} transform={`translate(0,${i * 18})`}>
            <rect width={22} height={6} y={-4} rx={3} fill={l.color} />
            <text x={30} y={3} fontSize={13} fill="var(--text)">{l.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function Pin({ at, label, color }: { at: string; label: string; color: string }) {
  const [x, y] = pt(at);
  return (
    <g transform={`translate(${x},${y - 14})`}>
      <path d="M0,10 L-7,-2 A8,8 0 1 1 7,-2 Z" fill={color} />
      <text y={-22} textAnchor="middle" fontSize={10} fontWeight={800} fill={color}>{label}</text>
    </g>
  );
}
