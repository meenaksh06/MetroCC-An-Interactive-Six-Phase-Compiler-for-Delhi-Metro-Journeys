/**
 * Dead-VIA removal: PASS instructions are assertions already proven by the
 * semantic phase (the station lies on the ride). They have no runtime effect,
 * so they are dead code once checked.
 */
import type { IRInstr } from '../../ir/irgen';

export function deadVia(ir: IRInstr[], log: string[]): IRInstr[] {
  const out = ir.filter((i) => i.op !== 'PASS');
  for (const p of ir.filter((i) => i.op === 'PASS')) log.push(`Removed PASS ${p.station}: an intermediate stop already verified by the semantic phase.`);
  return out;
}
