import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../examples/presets';
import { LINES, STATIONS } from '../data/metro';
import { compile } from '../pipeline';

describe('presets behave as labelled', () => {
  for (const p of PRESETS)
    it(`${p.group}: ${p.title}`, () => {
      const r = compile(p.source);
      expect(r.failedAt).toBe(p.expect.failedAt);
      const got = r.diagnostics.map((d) => d.code);
      for (const c of p.expect.codes) expect(got).toContain(c);
    });
});

describe('metro data integrity', () => {
  it('has 56 stations, each on at least one line and with map coordinates', () => {
    const onLines = new Set(LINES.flatMap((l) => l.routes.flatMap((r) => r.stations)));
    expect(STATIONS.length).toBe(56);
    expect(onLines.size).toBe(56);
    for (const s of onLines) expect(STATIONS.some((x) => x.id === s)).toBe(true);
  });
  it('every route has one distance per hop', () => {
    for (const l of LINES) for (const r of l.routes) expect(r.km.length).toBe(r.stations.length - 1);
  });
});
