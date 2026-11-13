/**
 * Phase 6 — Code generation. The "target language" is a human-readable
 * itinerary plus a path the map can animate. One template per IR opcode,
 * just like instruction selection in a real back end.
 */
import { DiagnosticSink } from '../diagnostics';
import { INTERCHANGE_MIN, SERVICE_END_MIN, formatClock, lineById, rideInfo, shortestPath } from '../data/graph';
import { metrics, type IRInstr, type IRMetrics } from '../ir/irgen';
import type { LineId, PhaseResult, Span } from '../types';
import { emitCard, emitJson, lowerToJourney, type JourneyDoc, type TargetId } from './targets';

export interface ItineraryStep {
  kind: 'board' | 'ride' | 'pass' | 'change' | 'exit';
  text: string;
  detail?: string;
  line?: LineId;
  stations?: string[]; // for rides: every station along the way
  /** clock time (HH:MM) when this step completes; only when a departure time was given */
  time?: string;
  instrId: string;
  span: Span;
}

export interface CodegenOutput {
  steps: ItineraryStep[];
  text: string;
  summary: IRMetrics & { fareKm: number; depart?: string; arrive?: string };
  /** map animation path: one entry per ride */
  path: { line: LineId; stations: string[] }[];
  /** structured journey shared by the card and JSON back ends */
  journey: JourneyDoc;
  /** the same program emitted for every target (multi-target code generation) */
  targets: Record<TargetId, string>;
}

export type CodegenStep = { item: number; message: string };

const lineName = (l?: LineId) => (l ? lineById.get(l)!.name : '');

export function generate(ir: IRInstr[]): PhaseResult<CodegenOutput, CodegenStep> {
  const diags = new DiagnosticSink('codegen');
  const out: ItineraryStep[] = [];
  const path: CodegenOutput['path'] = [];
  let line: LineId | undefined;
  // Running clock (minutes after midnight). It advances by each ride's running
  // time and by INTERCHANGE_MIN per transfer, so the arrival time always equals
  // departure + the total journey time in the summary.
  const departAt = ir.find((i) => i.op === 'BOARD')?.time;
  let clock = departAt;
  const stamp = () => (clock !== undefined ? formatClock(clock) : undefined);

  ir.forEach((ins, idx) => {
    const nextRide = ir.slice(idx + 1).find((x) => x.op === 'RIDE' || x.op === 'TRANSFER');
    const towards = nextRide?.op === 'RIDE' ? nextRide.towards : undefined;
    switch (ins.op) {
      case 'BOARD':
        line = ins.line;
        out.push({
          kind: 'board', line, instrId: ins.id, span: ins.span, time: stamp(),
          text: `Board the ${lineName(line)} at ${ins.station}${towards ? `, platform towards ${towards}` : ''}${clock !== undefined ? ` at ${stamp()}` : ''}.`,
        });
        break;
      case 'RIDE': {
        const info = rideInfo(ins.line!, ins.from!, ins.to!)!;
        const cont = out[out.length - 1]?.kind === 'ride' || out[out.length - 1]?.kind === 'pass';
        if (clock !== undefined) clock += info.min;
        out.push({
          kind: 'ride', line: ins.line, instrId: ins.id, span: ins.span, stations: info.path, time: stamp(),
          text: `${cont ? 'Stay on the train' : 'Ride'} ${info.stops} stop${info.stops === 1 ? '' : 's'} to ${ins.to} (≈ ${info.min} min, ${info.km} km)${clock !== undefined ? `, arriving ≈ ${stamp()}` : ''}.`,
          detail: info.path.length > 2 ? `Passing ${info.path.slice(1, -1).join(' · ')}` : undefined,
        });
        path.push({ line: ins.line!, stations: info.path });
        break;
      }
      case 'PASS':
        out.push({ kind: 'pass', line, instrId: ins.id, span: ins.span, time: stamp(), text: `Check: you are passing ${ins.station}.` });
        break;
      case 'TRANSFER':
        line = ins.toLine;
        if (clock !== undefined) clock += INTERCHANGE_MIN;
        out.push({
          kind: 'change', line, instrId: ins.id, span: ins.span, time: stamp(),
          text: `At ${ins.station}, change to the ${lineName(ins.toLine)}${towards ? ` towards ${towards}` : ''} (allow ~${INTERCHANGE_MIN} min${clock !== undefined ? `, next train ≈ ${stamp()}` : ''}).`,
        });
        break;
      case 'ALIGHT':
        out.push({ kind: 'exit', line, instrId: ins.id, span: ins.span, time: stamp(), text: `Exit at ${ins.station}${clock !== undefined ? ` at ≈ ${stamp()}` : ''}.` });
        if (clock !== undefined && departAt !== undefined && departAt <= SERVICE_END_MIN && clock > SERVICE_END_MIN)
          diags.warn('W-C01', `You would arrive at ≈ ${stamp()}, after the last trains (≈ ${formatClock(SERVICE_END_MIN)}) — a later connection may not run.`, ins.span, 'Leave earlier, or check the last-train times for your interchanges.');
        break;
    }
  });

  const m = metrics(ir);
  const board = ir.find((i) => i.op === 'BOARD')?.station ?? '';
  const alight = ir.find((i) => i.op === 'ALIGHT')?.station ?? '';
  const fareKm = shortestPath(board, alight, 'distance')?.km ?? 0;
  const summary = {
    ...m, fareKm,
    ...(departAt !== undefined ? { depart: formatClock(departAt), arrive: formatClock(departAt + m.min) } : {}),
  };
  const text = [
    ...out.map((s, i) => `${i + 1}. ${s.time ? `[${s.time}] ` : ''}${s.text}${s.detail ? `\n   ${s.detail}` : ''}`),
    '',
    `Total: ${m.stops} stops · ${m.interchanges} interchange${m.interchanges === 1 ? '' : 's'} · ≈ ${m.min} min · ${m.km} km · fare ₹${m.fare}`,
    ...(summary.depart ? [`Depart ${summary.depart} · arrive ≈ ${summary.arrive}`] : []),
  ].join('\n');

  const journey = lowerToJourney(ir, m, fareKm);
  const targets: Record<TargetId, string> = { text: text + '\n', card: emitCard(journey), json: emitJson(journey) };

  return {
    ok: true, // warnings only — code generation cannot fail on a checked program
    result: { steps: out, text, summary, path, journey, targets },
    steps: out.map((s, i) => ({ item: i, message: s.text })),
    diagnostics: diags.list,
  };
}
