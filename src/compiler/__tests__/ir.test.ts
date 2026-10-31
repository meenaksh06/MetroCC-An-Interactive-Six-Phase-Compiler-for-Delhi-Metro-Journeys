import { describe, expect, it } from 'vitest';
import { formatInstr } from '../ir/irgen';
import { compile } from '../pipeline';
import { SAMPLE } from './helpers';

const ir = (src: string) => compile(src).ir!.result;
const fmt = (src: string) => ir(src).ir.map((i) => formatInstr(i).replace(/\s+/g, ' '));

describe('IR generation', () => {
  it('translates the sample into naive three-address IR', () => {
    expect(fmt(SAMPLE)).toEqual([
      'BOARD Yellow @ Jahangirpuri',
      'RIDE Yellow, Jahangirpuri → Kashmere Gate',
      'PASS Kashmere Gate',
      'TRANSFER Yellow → Violet @ Kashmere Gate',
      'RIDE Violet, Kashmere Gate → Mandi House',
      'PASS Mandi House',
      'RIDE Violet, Mandi House → Central Secretariat',
      'ALIGHT Central Secretariat',
    ]);
  });
  it('computes ride metrics from the metro data', () => {
    const r = ir(SAMPLE).ir[1];
    expect(r).toMatchObject({ stops: 8, towards: 'Millennium City Centre Gurugram' });
    expect(r.km).toBeCloseTo(9.8, 1);
  });
  it('splits into one basic block per line', () => {
    const b = ir(SAMPLE).blocks;
    expect(b.map((x) => x.line)).toEqual(['Yellow', 'Violet']);
    expect(b[0].succ).toEqual(['B1']);
    expect(b[0].instrs.length).toBe(4);
  });
  it('maps every instruction back to a source statement', () => {
    for (const i of ir(SAMPLE).ir) expect(i.span.start.line).toBeGreaterThan(0);
  });
  it('is not generated for invalid programs', () => {
    expect(compile('BOARD Rajiv Chowk ON Blue; EXIT Rajiv Chowk;').ir).toBeUndefined();
  });
});
