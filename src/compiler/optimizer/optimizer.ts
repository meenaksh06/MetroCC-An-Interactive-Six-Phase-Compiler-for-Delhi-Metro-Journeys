/**
 * Phase 5 — Code optimization. Four passes, each individually switchable:
 *   1. redundant-transfer elimination   (peephole)
 *   2. dead-VIA removal                 (dead-code elimination)
 *   3. segment merging                  (instruction combining)
 *   4. route-optimality analysis        (global analysis via Dijkstra; suggestion only)
 */
import { basicBlocks, metrics, type BasicBlock, type IRInstr, type IRMetrics } from '../ir/irgen';
import type { PhaseResult } from '../types';
import { deadVia } from './passes/deadVia';
import { mergeSegments } from './passes/mergeSegments';
import { redundantTransfer } from './passes/redundantTransfer';
import { routeOptimality, type OptimalitySuggestion } from './passes/routeOptimality';

export type PassId = 'redundantTransfer' | 'deadVia' | 'mergeSegments' | 'routeOptimality';

export const PASSES: { id: PassId; title: string; kind: string; description: string }[] = [
  { id: 'redundantTransfer', title: 'Redundant-transfer elimination', kind: 'peephole', description: 'Drops a transfer to the same line, a change followed by an immediate change back, and fuses back-to-back transfers at one station.' },
  { id: 'deadVia', title: 'Dead-VIA removal', kind: 'dead-code elimination', description: 'PASS instructions only assert that a ride goes through a station; once verified they have no effect.' },
  { id: 'mergeSegments', title: 'Segment merging', kind: 'instruction combining', description: 'Consecutive rides on the same line become a single ride.' },
  { id: 'routeOptimality', title: 'Route-optimality analysis', kind: 'global analysis (Dijkstra)', description: 'Finds the fastest route on the metro graph and suggests it — never rewrites your program.' },
];

export type PassOptions = Record<PassId, boolean>;
export const ALL_PASSES: PassOptions = { redundantTransfer: true, deadVia: true, mergeSegments: true, routeOptimality: true };

export interface OptStep {
  pass: PassId;
  enabled: boolean;
  before: IRInstr[];
  after: IRInstr[];
  log: string[];
}

export interface OptOutput {
  before: IRInstr[];
  after: IRInstr[];
  blocks: BasicBlock[];
  metricsBefore: IRMetrics;
  metricsAfter: IRMetrics;
  suggestion?: OptimalitySuggestion;
}

export function optimize(ir: IRInstr[], options: PassOptions = ALL_PASSES): PhaseResult<OptOutput, OptStep> {
  const steps: OptStep[] = [];
  let cur = ir;
  let suggestion: OptimalitySuggestion | undefined;
  for (const p of PASSES) {
    const log: string[] = [];
    const before = cur;
    if (options[p.id]) {
      if (p.id === 'redundantTransfer') cur = redundantTransfer(cur, log);
      else if (p.id === 'deadVia') cur = deadVia(cur, log);
      else if (p.id === 'mergeSegments') cur = mergeSegments(cur, log);
      else suggestion = routeOptimality(cur, log);
      if (!log.length) log.push('No change.');
    } else log.push('Pass disabled.');
    steps.push({ pass: p.id, enabled: options[p.id], before, after: cur, log });
  }
  return {
    ok: true,
    result: { before: ir, after: cur, blocks: basicBlocks(cur), metricsBefore: metrics(ir), metricsAfter: metrics(cur), suggestion },
    steps,
    diagnostics: [],
  };
}
