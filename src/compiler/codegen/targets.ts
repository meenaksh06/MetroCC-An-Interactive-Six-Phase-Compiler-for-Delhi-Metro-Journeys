/**
 * Phase 6, extra back ends — multi-target code generation.
 *
 * The same optimised IR is lowered to several target "languages":
 *   text  the numbered itinerary (codegen.ts)
 *   card  a printable journey card: stations, interchanges and estimated time
 *   json  a machine-readable itinerary for other programs (apps, widgets, tests)
 *
 * Each back end walks the IR once. Only this layer knows about output format,
 * just as a real compiler keeps one IR and plugs in one back end per machine.
 */
import { INTERCHANGE_MIN, formatClock, lineById, rideInfo } from '../data/graph';
import type { IRInstr, IRMetrics } from '../ir/irgen';
import type { LineId } from '../types';

export type TargetId = 'text' | 'card' | 'json';

export const TARGETS: { id: TargetId; title: string; file: string; mime: string }[] = [
  { id: 'text', title: 'Itinerary', file: 'itinerary.txt', mime: 'text/plain' },
  { id: 'card', title: 'Journey card', file: 'journey-card.txt', mime: 'text/plain' },
  { id: 'json', title: 'JSON', file: 'journey.json', mime: 'application/json' },
];

export interface JourneyLeg {
  line: LineId;
  from: string;
  to: string;
  towards?: string;
  stops: number;
  km: number;
  minutes: number;
  stations: string[];
  depart?: string;
  arrive?: string;
}

export interface JourneyChange {
  station: string;
  fromLine: LineId;
  toLine: LineId;
  minutes: number;
}

export interface JourneyDoc {
  format: 'metrocc-journey';
  version: 1;
  from: string;
  to: string;
  depart?: string;
  arrive?: string;
  summary: { stops: number; interchanges: number; minutes: number; km: number; fare: number; fareKm: number };
  legs: JourneyLeg[];
  changes: JourneyChange[];
}

/** IR → structured journey (shared by the card and JSON back ends). */
export function lowerToJourney(ir: IRInstr[], m: IRMetrics, fareKm: number): JourneyDoc {
  const board = ir.find((i) => i.op === 'BOARD');
  const alight = ir.find((i) => i.op === 'ALIGHT');
  let clock = board?.time;
  const t = () => (clock !== undefined ? formatClock(clock) : undefined);
  const legs: JourneyLeg[] = [];
  const changes: JourneyChange[] = [];
  for (const ins of ir) {
    if (ins.op === 'RIDE') {
      const info = rideInfo(ins.line!, ins.from!, ins.to!)!;
      const depart = t();
      if (clock !== undefined) clock += info.min;
      legs.push({
        line: ins.line!, from: ins.from!, to: ins.to!, towards: info.towards, stops: info.stops, km: info.km, minutes: info.min, stations: info.path,
        ...(depart ? { depart, arrive: t() } : {}),
      });
    } else if (ins.op === 'TRANSFER') {
      if (clock !== undefined) clock += INTERCHANGE_MIN;
      changes.push({ station: ins.station!, fromLine: ins.fromLine!, toLine: ins.toLine!, minutes: INTERCHANGE_MIN });
    }
  }
  return {
    format: 'metrocc-journey',
    version: 1,
    from: board?.station ?? '',
    to: alight?.station ?? '',
    ...(board?.time !== undefined ? { depart: formatClock(board.time), arrive: formatClock(board.time + m.min) } : {}),
    summary: { stops: m.stops, interchanges: m.interchanges, minutes: m.min, km: m.km, fare: m.fare, fareKm },
    legs,
    changes,
  };
}

export const emitJson = (doc: JourneyDoc) => JSON.stringify(doc, null, 2) + '\n';

const W = 50; // inner width of the card

/** Greedy word-wrap of a station list into lines of at most `width` characters. */
function wrap(words: string[], width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} · ${w}` : w;
    if (next.length > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** A fixed-width journey card: stations, interchanges and estimated time. */
export function emitCard(doc: JourneyDoc): string {
  const row = (s = '') => `│ ${s.length > W ? s.slice(0, W - 1) + '…' : s.padEnd(W)} │`;
  const split = (l: string, r: string) => row(l.padEnd(W - r.length) + r);
  const rule = (a: string, b: string) => `${a}${'─'.repeat(W + 2)}${b}`;
  const lineName = (l: LineId) => lineById.get(l)!.name;

  const out = [rule('┌', '┐'), row('METRO JOURNEY CARD'), row(`${doc.from} → ${doc.to}`)];
  if (doc.depart) out.push(row(`Depart ${doc.depart} · arrive ≈ ${doc.arrive}`));
  out.push(rule('├', '┤'));

  doc.legs.forEach((leg, i) => {
    if (i > 0) {
      const c = doc.changes[i - 1];
      if (c) out.push(row(`⇄ change ${c.fromLine} → ${c.toLine} (interchange, ~${c.minutes} min)`)); // station is on the next row
    }
    out.push(split(`● ${leg.from}`, leg.depart ?? ''));
    out.push(row(`│ ${lineName(leg.line)}`));
    if (leg.towards) out.push(row(`│ towards ${leg.towards}`));
    out.push(row(`│ ${leg.stops} stop${leg.stops === 1 ? '' : 's'} · ${leg.km} km · ≈ ${leg.minutes} min`));
    const between = leg.stations.slice(1, -1);
    if (between.length) for (const l of wrap(between, W - 4)) out.push(row(`│   ${l}`));
  });
  const last = doc.legs[doc.legs.length - 1];
  out.push(split(`◉ ${doc.to}`, last?.arrive ?? ''));

  const s = doc.summary;
  out.push(rule('├', '┤'));
  out.push(row(`Stations ${s.stops + 1} · Interchanges ${s.interchanges}`));
  out.push(row(`Estimated time ≈ ${s.minutes} min · ${s.km} km · fare ₹${s.fare}`));
  out.push(rule('└', '┘'));
  return out.join('\n') + '\n';
}
