/**
 * Phase 4 — Intermediate code generation.
 *
 * A syntax-directed translation of the checked AST into a linear,
 * three-address-style IR (each instruction has at most three operands):
 *
 *   BOARD    line @ station
 *   RIDE     line, from → to
 *   PASS     station              (a VIA assertion: "the ride passes here")
 *   TRANSFER line1 → line2 @ station
 *   ALIGHT   station
 *
 * The translation is deliberately naive (one RIDE per VIA, transfers kept
 * as written) so the optimizer has something to improve.
 */
import { INTERCHANGE_MIN, fareBetween, rideInfo, round1 } from '../data/graph';
import type { Journey } from '../semantic/semantic';
import type { LineId, PhaseResult, Span } from '../types';

export type IROp = 'BOARD' | 'RIDE' | 'PASS' | 'TRANSFER' | 'ALIGHT';

export interface IRInstr {
  id: string;
  op: IROp;
  line?: LineId; // BOARD, RIDE
  from?: string; // RIDE
  to?: string; // RIDE
  fromLine?: LineId; // TRANSFER
  toLine?: LineId; // TRANSFER
  station?: string; // BOARD, PASS, TRANSFER, ALIGHT
  stops?: number;
  km?: number;
  min?: number;
  towards?: string;
  stmt: number; // source statement (for linked highlighting)
  span: Span;
  note?: string; // why the instruction was created / changed
}

export interface BasicBlock {
  id: string;
  line: LineId;
  instrs: string[]; // instruction ids
  succ: string[];
  label: string;
}

export interface IROutput {
  ir: IRInstr[];
  blocks: BasicBlock[];
  metrics: IRMetrics;
}

export interface IRMetrics {
  instructions: number;
  stops: number;
  interchanges: number;
  km: number;
  min: number;
  fare: number;
}

export type IRStep = { instr: number; message: string };

export function formatInstr(i: IRInstr): string {
  switch (i.op) {
    case 'BOARD':
      return `BOARD    ${i.line} @ ${i.station}`;
    case 'RIDE':
      return `RIDE     ${i.line}, ${i.from} → ${i.to}`;
    case 'PASS':
      return `PASS     ${i.station}`;
    case 'TRANSFER':
      return `TRANSFER ${i.fromLine} → ${i.toLine} @ ${i.station}`;
    case 'ALIGHT':
      return `ALIGHT   ${i.station}`;
  }
}

/** Fill stops/km/min/towards on a RIDE from the metro data. */
export function ride(id: string, line: LineId, from: string, to: string, stmt: number, span: Span, note?: string): IRInstr {
  const info = rideInfo(line, from, to);
  return { id, op: 'RIDE', line, from, to, stmt, span, stops: info?.stops ?? 0, km: info?.km ?? 0, min: info?.min ?? 0, towards: info?.towards, note };
}

export function generateIR(journey: Journey): PhaseResult<IROutput, IRStep> {
  const ir: IRInstr[] = [];
  const steps: IRStep[] = [];
  let n = 0;
  const id = () => `i${n++}`;
  const emit = (instr: IRInstr, why: string) => {
    ir.push(instr);
    steps.push({ instr: ir.length - 1, message: `${formatInstr(instr).replace(/\s+/g, ' ')}  ← ${why}` });
  };

  let line: LineId = journey.board.line;
  let pos = journey.board.station;
  journey.stmts.forEach((s, k) => {
    const r = journey.resolved[k];
    switch (s.kind) {
      case 'board':
        emit({ id: id(), op: 'BOARD', line, station: pos, stmt: k, span: s.span }, `BOARD statement (line ${s.span.start.line})`);
        break;
      case 'via':
        if (r.station !== pos) emit(ride(id(), line, pos, r.station, k, s.span), `ride to the VIA station`);
        emit({ id: id(), op: 'PASS', station: r.station, stmt: k, span: s.span }, `VIA asserts the route passes ${r.station}`);
        pos = r.station;
        break;
      case 'change':
        if (r.station !== pos) emit(ride(id(), line, pos, r.station, k, s.span), `ride to the interchange`);
        emit({ id: id(), op: 'TRANSFER', fromLine: line, toLine: r.line!, station: r.station, stmt: k, span: s.span }, 'CHANGE statement');
        line = r.line!;
        pos = r.station;
        break;
      case 'exit':
        if (r.station !== pos) emit(ride(id(), line, pos, r.station, k, s.span), `ride to the destination`);
        emit({ id: id(), op: 'ALIGHT', station: r.station, stmt: k, span: s.span }, 'EXIT statement');
        pos = r.station;
        break;
    }
  });

  return { ok: true, result: { ir, blocks: basicBlocks(ir), metrics: metrics(ir) }, steps, diagnostics: [] };
}

/**
 * Basic blocks: a leader is the first instruction or any instruction following
 * a TRANSFER (a TRANSFER acts like a jump to another line). Each block is a
 * straight-line ride on one line.
 */
export function basicBlocks(ir: IRInstr[]): BasicBlock[] {
  const blocks: BasicBlock[] = [];
  let cur: BasicBlock | null = null;
  let line: LineId | undefined;
  for (const ins of ir) {
    if (ins.op === 'BOARD') line = ins.line;
    if (!cur) {
      cur = { id: `B${blocks.length}`, line: line!, instrs: [], succ: [], label: '' };
      blocks.push(cur);
    }
    cur.instrs.push(ins.id);
    if (ins.op === 'TRANSFER') {
      line = ins.toLine;
      cur.label = `${cur.line} → ${ins.toLine}`;
      cur.succ.push(`B${blocks.length}`);
      cur = null;
    }
  }
  for (const b of blocks) if (!b.label) b.label = b.line;
  return blocks;
}

export function metrics(ir: IRInstr[]): IRMetrics {
  const rides = ir.filter((i) => i.op === 'RIDE');
  const transfers = ir.filter((i) => i.op === 'TRANSFER').length;
  const board = ir.find((i) => i.op === 'BOARD')?.station;
  const alight = ir.find((i) => i.op === 'ALIGHT')?.station;
  return {
    instructions: ir.length,
    stops: rides.reduce((a, r) => a + (r.stops ?? 0), 0),
    interchanges: transfers,
    km: round1(rides.reduce((a, r) => a + (r.km ?? 0), 0)),
    min: rides.reduce((a, r) => a + (r.min ?? 0), 0) + transfers * INTERCHANGE_MIN,
    fare: board && alight ? fareBetween(board, alight) : 0,
  };
}
