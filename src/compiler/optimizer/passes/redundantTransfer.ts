/**
 * Redundant-transfer elimination (peephole):
 *   TRANSFER A→A @X                         ⇒ (deleted)
 *   TRANSFER A→B @X ; TRANSFER B→A @X        ⇒ (both deleted)
 *   TRANSFER A→B @X ; TRANSFER B→C @X        ⇒ TRANSFER A→C @X
 *   BOARD A @X ; TRANSFER A→B @X             ⇒ BOARD B @X
 * PASS X instructions between the pair don't block the pattern (no movement).
 */
import type { IRInstr } from '../../ir/irgen';

export function redundantTransfer(ir: IRInstr[], log: string[]): IRInstr[] {
  let out = [...ir];
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      const a = out[i];
      if (a.op === 'TRANSFER' && a.fromLine === a.toLine) {
        log.push(`Removed TRANSFER ${a.fromLine} → ${a.toLine} @ ${a.station}: transfer to the same line.`);
        out.splice(i, 1);
        changed = true;
        break;
      }
      if (a.op !== 'TRANSFER' && a.op !== 'BOARD') continue;
      // next instruction that is not a PASS at the same station
      let j = i + 1;
      while (j < out.length && out[j].op === 'PASS' && out[j].station === a.station) j++;
      const b = out[j];
      if (!b || b.op !== 'TRANSFER' || b.station !== a.station) continue;

      if (a.op === 'BOARD') {
        log.push(`BOARD ${a.line} @ ${a.station} ; TRANSFER ${b.fromLine} → ${b.toLine} ⇒ BOARD ${b.toLine} @ ${a.station} (board the right line directly).`);
        out = [...out.slice(0, i), { ...a, id: `${a.id}'`, line: b.toLine, note: 'boards the target line directly' }, ...out.slice(i + 1, j), ...out.slice(j + 1)];
      } else if (b.toLine === a.fromLine) {
        log.push(`Removed TRANSFER ${a.fromLine} → ${a.toLine} and TRANSFER ${b.fromLine} → ${b.toLine} @ ${a.station}: change and immediately change back.`);
        out = [...out.slice(0, i), ...out.slice(i + 1, j), ...out.slice(j + 1)];
      } else {
        log.push(`TRANSFER ${a.fromLine} → ${a.toLine} ; TRANSFER ${b.fromLine} → ${b.toLine} @ ${a.station} ⇒ TRANSFER ${a.fromLine} → ${b.toLine}.`);
        out = [...out.slice(0, i), { ...a, id: `${a.id}+${b.id}`, toLine: b.toLine, note: 'two transfers fused' }, ...out.slice(i + 1, j), ...out.slice(j + 1)];
      }
      changed = true;
    }
  }
  return out;
}
