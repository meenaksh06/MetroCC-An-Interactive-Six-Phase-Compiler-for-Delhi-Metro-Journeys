/**
 * Metro graph + lookup helpers derived from metro.ts.
 * Nodes are line-copies of stations ("Yellow:Rajiv Chowk"); edges join adjacent
 * stations on a route and the copies of the same station (interchange edges).
 */
import type { LineId } from '../types';
import {
  FARE_SLABS, INTERCHANGE_MIN, LINES, SERVICE_END_MIN, SERVICE_START_MIN, STATIONS, fareFor, formatClock, hopMinutes, parseClock,
  type LineDef, type Route, type StationDef,
} from './metro';

export { FARE_SLABS, INTERCHANGE_MIN, SERVICE_END_MIN, SERVICE_START_MIN, fareFor, formatClock, hopMinutes, parseClock };

export const LINE_IDS = LINES.map((l) => l.id);
export const lineById = new Map<string, LineDef>(LINES.map((l) => [l.id, l]));
export const stationById = new Map<string, StationDef>(STATIONS.map((s) => [s.id, s]));

/** alias (exact) → canonical station id */
export const aliasToStation = new Map<string, string>();
for (const s of STATIONS) for (const a of s.aliases ?? []) aliasToStation.set(a, s.id);

/** station → lines serving it (in this subset) */
export const linesAt = new Map<string, LineId[]>();
for (const l of LINES)
  for (const r of l.routes)
    for (const s of r.stations) {
      const arr = linesAt.get(s) ?? [];
      if (!arr.includes(l.id)) arr.push(l.id);
      linesAt.set(s, arr);
    }

export const isInterchange = (station: string) => (linesAt.get(station)?.length ?? 0) > 1;

export const lineColor = (line: string) => lineById.get(line)?.color ?? '#888';

export const routesContaining = (line: LineId, ...stations: string[]): Route[] =>
  lineById.get(line)?.routes.filter((r) => stations.every((s) => r.stations.includes(s))) ?? [];

/** Stations, km and minutes for a ride along one line between two stations on a common route. */
export function rideInfo(line: LineId, from: string, to: string) {
  const route = routesContaining(line, from, to)[0];
  if (!route) return undefined;
  const a = route.stations.indexOf(from);
  const b = route.stations.indexOf(to);
  const dir = Math.sign(b - a);
  const path: string[] = [];
  let km = 0;
  let min = 0;
  for (let i = a; i !== b; i += dir) {
    path.push(route.stations[i]);
    const hop = route.km[Math.min(i, i + dir)];
    km += hop;
    min += hopMinutes(hop);
  }
  path.push(to);
  const towards = dir >= 0 ? route.towards[1] : route.towards[0];
  return { route, path, stops: Math.abs(b - a), km: round1(km), min, towards, direction: dir };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- graph + Dijkstra

interface Edge {
  to: string;
  min: number;
  km: number;
  kind: 'ride' | 'transfer';
  line?: LineId;
}

const node = (line: string, st: string) => `${line}:${st}`;
const graph = new Map<string, Edge[]>();
const addEdge = (a: string, e: Edge) => {
  const list = graph.get(a) ?? [];
  if (!list.some((x) => x.to === e.to)) list.push(e);
  graph.set(a, list);
};
for (const l of LINES)
  for (const r of l.routes)
    for (let i = 0; i + 1 < r.stations.length; i++) {
      const a = node(l.id, r.stations[i]);
      const b = node(l.id, r.stations[i + 1]);
      const km = r.km[i];
      addEdge(a, { to: b, km, min: hopMinutes(km), kind: 'ride', line: l.id });
      addEdge(b, { to: a, km, min: hopMinutes(km), kind: 'ride', line: l.id });
    }
for (const [st, ls] of linesAt)
  for (const a of ls) for (const b of ls) if (a !== b) addEdge(node(a, st), { to: node(b, st), km: 0, min: INTERCHANGE_MIN, kind: 'transfer' });

export const graphStats = () => ({
  nodes: graph.size,
  edges: [...graph.values()].reduce((n, es) => n + es.length, 0),
});

export interface Leg {
  line: LineId;
  from: string;
  to: string;
  stops: number;
  km: number;
  min: number;
}

export interface PathResult {
  legs: Leg[];
  stops: number;
  interchanges: number;
  km: number;
  min: number;
  stations: string[];
}

/**
 * - time:      minutes, +INTERCHANGE_MIN per change (fastest route)
 * - distance:  km (what DMRC charges by)
 * - transfers: lexicographic (fewest changes first, then fastest) — implemented
 *              by giving each interchange edge a cost larger than any possible ride
 */
export type PathMetric = 'time' | 'distance' | 'transfers';

/** Bigger than the running time of any whole journey on this map, so one change always outweighs riding. */
const TRANSFER_PENALTY = 10_000;

/** Dijkstra from every line-copy of `from` to any line-copy of `to`. */
export function shortestPath(from: string, to: string, metric: PathMetric = 'time'): PathResult | undefined {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const done = new Set<string>();
  const cost = (e: Edge) =>
    metric === 'time' ? e.min : metric === 'transfers' ? (e.kind === 'transfer' ? TRANSFER_PENALTY + e.min : e.min) : e.kind === 'transfer' ? 0.001 : e.km;
  for (const l of linesAt.get(from) ?? []) dist.set(node(l, from), 0);
  while (true) {
    let u: string | undefined;
    let best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) ((best = d), (u = k));
    if (u === undefined) return undefined;
    if (u.endsWith(`:${to}`)) return buildPath(u, prev);
    done.add(u);
    for (const e of graph.get(u) ?? []) {
      const nd = best + cost(e);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
      }
    }
  }
}

function buildPath(end: string, prev: Map<string, string>): PathResult {
  const nodes: string[] = [end];
  while (prev.has(nodes[0])) nodes.unshift(prev.get(nodes[0])!);
  const split = (n: string) => {
    const i = n.indexOf(':');
    return [n.slice(0, i) as LineId, n.slice(i + 1)] as const;
  };
  const legs: Leg[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const [la, sa] = split(nodes[i]);
    const [lb, sb] = split(nodes[i + 1]);
    if (la !== lb) continue; // transfer edge
    const km = graph.get(nodes[i])!.find((e) => e.to === nodes[i + 1])!.km;
    const last = legs[legs.length - 1];
    // Extend the current leg only while one route still serves it. On the
    // Green Line "Y" a path can pass Ashok Park Main from one branch to the
    // other; no single train does that, so it becomes a new leg (a change of
    // trains on the same line) instead of an impossible ride.
    if (last && last.line === la && last.to === sa && routesContaining(la, last.from, sb).length) {
      last.to = sb;
      last.stops++;
      last.km = round1(last.km + km);
      last.min += hopMinutes(km);
    } else legs.push({ line: la, from: sa, to: sb, stops: 1, km, min: hopMinutes(km) });
  }
  const stations = legs.length ? [legs[0].from, ...legs.flatMap((l) => rideInfo(l.line, l.from, l.to)!.path.slice(1))] : [];
  return {
    legs,
    stops: legs.reduce((n, l) => n + l.stops, 0),
    interchanges: Math.max(0, legs.length - 1),
    km: round1(legs.reduce((n, l) => n + l.km, 0)),
    min: legs.reduce((n, l) => n + l.min, 0) + Math.max(0, legs.length - 1) * INTERCHANGE_MIN,
    stations,
  };
}

/**
 * Back-translate a path into MetroCC source: the inverse of the front end.
 * The result is a valid program that compiles to exactly this route.
 */
export function pathToSource(p: PathResult, depart?: string): string | undefined {
  if (!p.legs.length) return undefined;
  // A same-line branch change (Green Line at Ashok Park Main) has no MetroCC syntax.
  if (p.legs.some((l, i) => i > 0 && p.legs[i - 1].line === l.line)) return undefined;
  const q = (n: string) => (/^[A-Za-z0-9][A-Za-z0-9'. -]*$/.test(n) && !/\b(BOARD|ON|VIA|CHANGE|AT|EXIT)\b/.test(n) ? n : `"${n}"`);
  const lines = [`BOARD ${q(p.legs[0].from)} ON ${p.legs[0].line}${depart ? ` AT ${depart}` : ''};`];
  for (let i = 1; i < p.legs.length; i++) lines.push(`CHANGE ${p.legs[i].line} AT ${q(p.legs[i].from)};`);
  lines.push(`EXIT ${q(p.legs[p.legs.length - 1].to)};`);
  return lines.join('\n') + '\n';
}

/** DMRC charges by the shortest-distance path between origin and destination. */
export const fareBetween = (from: string, to: string) => {
  const p = shortestPath(from, to, 'distance');
  return p ? fareFor(p.km) : 0;
};

export { LINES, STATIONS };
