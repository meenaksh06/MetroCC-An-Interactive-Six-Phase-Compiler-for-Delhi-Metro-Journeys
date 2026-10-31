/**
 * Phase 6 — Code generation. The "target language" is a human-readable
 * itinerary plus a path the map can animate. One template per IR opcode,
 * just like instruction selection in a real back end.
 */
import { INTERCHANGE_MIN, lineById, rideInfo, shortestPath } from '../data/graph';
import { metrics, type IRInstr, type IRMetrics } from '../ir/irgen';
import type { LineId, PhaseResult, Span } from '../types';

export interface ItineraryStep {
  kind: 'board' | 'ride' | 'pass' | 'change' | 'exit';
  text: string;
  detail?: string;
  line?: LineId;
  stations?: string[]; // for rides: every station along the way
  instrId: string;
  span: Span;
}

export interface CodegenOutput {
  steps: ItineraryStep[];
  text: string;
  summary: IRMetrics & { fareKm: number };
  /** map animation path: one entry per ride */
  path: { line: LineId; stations: string[] }[];
}

export type CodegenStep = { item: number; message: string };

const lineName = (l?: LineId) => (l ? lineById.get(l)!.name : '');

export function generate(ir: IRInstr[]): PhaseResult<CodegenOutput, CodegenStep> {
  const out: ItineraryStep[] = [];
  const path: CodegenOutput['path'] = [];
  let line: LineId | undefined;

  ir.forEach((ins, idx) => {
    const nextRide = ir.slice(idx + 1).find((x) => x.op === 'RIDE' || x.op === 'TRANSFER');
    const towards = nextRide?.op === 'RIDE' ? nextRide.towards : undefined;
    switch (ins.op) {
      case 'BOARD':
        line = ins.line;
        out.push({ kind: 'board', line, instrId: ins.id, span: ins.span, text: `Board the ${lineName(line)} at ${ins.station}${towards ? `, platform towards ${towards}` : ''}.` });
        break;
      case 'RIDE': {
        const info = rideInfo(ins.line!, ins.from!, ins.to!)!;
        const cont = out[out.length - 1]?.kind === 'ride' || out[out.length - 1]?.kind === 'pass';
        out.push({
          kind: 'ride', line: ins.line, instrId: ins.id, span: ins.span, stations: info.path,
          text: `${cont ? 'Stay on the train' : 'Ride'} ${info.stops} stop${info.stops === 1 ? '' : 's'} to ${ins.to} (≈ ${info.min} min, ${info.km} km).`,
          detail: info.path.length > 2 ? `Passing ${info.path.slice(1, -1).join(' · ')}` : undefined,
        });
        path.push({ line: ins.line!, stations: info.path });
        break;
      }
      case 'PASS':
        out.push({ kind: 'pass', line, instrId: ins.id, span: ins.span, text: `Check: you are passing ${ins.station}.` });
        break;
      case 'TRANSFER':
        line = ins.toLine;
        out.push({
          kind: 'change', line, instrId: ins.id, span: ins.span,
          text: `At ${ins.station}, change to the ${lineName(ins.toLine)}${towards ? ` towards ${towards}` : ''} (allow ~${INTERCHANGE_MIN} min).`,
        });
        break;
      case 'ALIGHT':
        out.push({ kind: 'exit', line, instrId: ins.id, span: ins.span, text: `Exit at ${ins.station}.` });
        break;
    }
  });

  const m = metrics(ir);
  const board = ir.find((i) => i.op === 'BOARD')?.station ?? '';
  const alight = ir.find((i) => i.op === 'ALIGHT')?.station ?? '';
  const fareKm = shortestPath(board, alight, 'distance')?.km ?? 0;
  const summary = { ...m, fareKm };
  const text = [
    ...out.map((s, i) => `${i + 1}. ${s.text}${s.detail ? `\n   ${s.detail}` : ''}`),
    '',
    `Total: ${m.stops} stops · ${m.interchanges} interchange${m.interchanges === 1 ? '' : 's'} · ≈ ${m.min} min · ${m.km} km · fare ₹${m.fare}`,
  ].join('\n');

  return {
    ok: true,
    result: { steps: out, text, summary, path },
    steps: out.map((s, i) => ({ item: i, message: s.text })),
    diagnostics: [],
  };
}
