/**
 * Segment merging: consecutive rides on the same line are one ride.
 *   RIDE L, a → b ; RIDE L, b → c   ⇒   RIDE L, a → c
 * (If a = c the rides cancel out and both are deleted.)
 * Only directly adjacent RIDEs merge — a PASS in between blocks it, which is
 * why pass order matters (run dead-VIA removal first).
 */
import { ride, type IRInstr } from '../../ir/irgen';

export function mergeSegments(ir: IRInstr[], log: string[]): IRInstr[] {
  const out: IRInstr[] = [];
  for (const ins of ir) {
    const prev = out[out.length - 1];
    if (prev && prev.op === 'RIDE' && ins.op === 'RIDE' && prev.line === ins.line && prev.to === ins.from) {
      out.pop();
      if (prev.from === ins.to) {
        log.push(`RIDE ${prev.from} → ${prev.to} and RIDE ${ins.from} → ${ins.to} cancel out — both removed.`);
        continue;
      }
      const merged = ride(`${prev.id}+${ins.id}`, ins.line!, prev.from!, ins.to!, prev.stmt, { start: prev.span.start, end: ins.span.end }, 'merged ride');
      log.push(`Merged RIDE ${prev.line}, ${prev.from} → ${prev.to} + ${ins.from} → ${ins.to} ⇒ ${merged.from} → ${merged.to} (${merged.stops} stops).`);
      out.push(merged);
    } else out.push(ins);
  }
  return out;
}
