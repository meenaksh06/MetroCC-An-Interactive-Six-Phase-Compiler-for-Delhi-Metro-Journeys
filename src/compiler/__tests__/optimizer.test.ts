import { describe, expect, it } from 'vitest';
import { formatInstr } from '../ir/irgen';
import { ALL_PASSES } from '../optimizer/optimizer';
import { compile } from '../pipeline';
import { SAMPLE } from './helpers';

const after = (src: string, passes = ALL_PASSES) => compile(src, passes).optimizer!.result.after.map((i) => formatInstr(i).replace(/\s+/g, ' '));

describe('optimizer', () => {
  it('removes dead VIAs and merges segments in the sample', () => {
    expect(after(SAMPLE)).toEqual([
      'BOARD Yellow @ Jahangirpuri',
      'RIDE Yellow, Jahangirpuri → Kashmere Gate',
      'TRANSFER Yellow → Violet @ Kashmere Gate',
      'RIDE Violet, Kashmere Gate → Central Secretariat',
      'ALIGHT Central Secretariat',
    ]);
  });
  it('metrics before vs after: fewer instructions, same journey', () => {
    const r = compile(SAMPLE).optimizer!.result;
    expect(r.metricsBefore.instructions).toBe(8);
    expect(r.metricsAfter.instructions).toBe(5);
    expect(r.metricsAfter.stops).toBe(r.metricsBefore.stops);
  });
  it('eliminates change-and-change-back, then merges the rides', () => {
    expect(after('BOARD Jahangirpuri ON Yellow; CHANGE Violet AT Kashmere Gate; CHANGE Yellow AT Kashmere Gate; EXIT Rajiv Chowk;')).toEqual([
      'BOARD Yellow @ Jahangirpuri',
      'RIDE Yellow, Jahangirpuri → Rajiv Chowk',
      'ALIGHT Rajiv Chowk',
    ]);
  });
  it('fuses consecutive transfers and rewrites BOARD + TRANSFER', () => {
    expect(after('BOARD Kashmere Gate ON Red; CHANGE Yellow AT Kashmere Gate; CHANGE Violet AT Kashmere Gate; EXIT ITO;')).toEqual([
      'BOARD Violet @ Kashmere Gate',
      'RIDE Violet, Kashmere Gate → ITO',
      'ALIGHT ITO',
    ]);
  });
  it('passes can be disabled individually (merge is blocked by PASS)', () => {
    const r = after(SAMPLE, { ...ALL_PASSES, deadVia: false });
    expect(r.filter((x) => x.startsWith('RIDE')).length).toBe(3);
  });
  it('route-optimality suggests the direct Yellow route without rewriting', () => {
    const r = compile(SAMPLE).optimizer!.result;
    expect(r.suggestion!.better).toBe(true);
    expect(r.suggestion!.optimal.legs.map((l) => l.line)).toEqual(['Yellow']);
    expect(r.after.some((i) => i.op === 'TRANSFER')).toBe(true); // program unchanged
  });
  it('reports an already-optimal route', () => {
    expect(compile('BOARD Rajiv Chowk ON Blue; EXIT Yamuna Bank;').optimizer!.result.suggestion!.better).toBe(false);
  });
});
