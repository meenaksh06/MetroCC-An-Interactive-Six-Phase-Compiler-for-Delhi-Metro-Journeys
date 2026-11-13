import { describe, expect, it } from 'vitest';
import { STATIONS, pathToSource, shortestPath } from '../data/graph';
import { compile } from '../pipeline';

describe('Dijkstra — fewest-changes metric', () => {
  it('finds a route with fewer interchanges even if it is slower', () => {
    const fast = shortestPath('New Delhi', 'ITO', 'time')!;
    const few = shortestPath('New Delhi', 'ITO', 'transfers')!;
    expect(fast.interchanges).toBe(2);
    expect(few.interchanges).toBe(1);
    expect(few.legs.map((l) => l.line)).toEqual(['Yellow', 'Violet']);
    expect(few.min).toBeGreaterThan(fast.min);
  });
  it('a direct ride on one line beats a faster route with a change', () => {
    expect(shortestPath('Kashmere Gate', 'Khan Market', 'transfers')!.interchanges).toBe(0);
  });
  it('never has more interchanges than the fastest route', () => {
    for (const a of STATIONS.slice(0, 20))
      for (const b of STATIONS.slice(20, 56)) {
        const t = shortestPath(a.id, b.id, 'time')!;
        const f = shortestPath(a.id, b.id, 'transfers')!;
        expect(f.interchanges).toBeLessThanOrEqual(t.interchanges);
      }
  });
});

describe('Dijkstra — Green Line branches', () => {
  it('does not crash when a route crosses branches at Ashok Park Main', () => {
    for (const m of ['time', 'distance', 'transfers'] as const)
      for (const a of STATIONS) for (const b of STATIONS) if (a.id !== b.id) expect(() => shortestPath(a.id, b.id, m)).not.toThrow();
  });
  it('splits the branch change into a separate leg', () => {
    const p = shortestPath('Inderlok', 'Satguru Ram Singh Marg', 'time')!;
    expect(p.legs.map((l) => [l.line, l.from, l.to])).toEqual([
      ['Green', 'Inderlok', 'Ashok Park Main'],
      ['Green', 'Ashok Park Main', 'Satguru Ram Singh Marg'],
    ]);
  });
  it('a valid program whose optimal route crosses branches compiles', () => {
    const r = compile('BOARD Jahangirpuri ON Yellow;\nCHANGE Blue AT Rajiv Chowk;\nCHANGE Green AT Kirti Nagar;\nEXIT Satguru Ram Singh Marg;');
    expect(r.failedAt).toBeUndefined();
    expect(r.optimizer!.result.suggestion).toBeDefined();
  });
});

describe('route → source back-translation', () => {
  it('emits a program that compiles to the same route', () => {
    const p = shortestPath('New Delhi', 'ITO', 'transfers')!;
    const src = pathToSource(p)!;
    expect(src).toBe('BOARD New Delhi ON Yellow;\nCHANGE Violet AT Central Secretariat;\nEXIT ITO;\n');
    const r = compile(src);
    expect(r.failedAt).toBeUndefined();
    expect(r.codegen!.result.summary.min).toBe(p.min);
  });
  it('keeps the departure time', () => {
    expect(pathToSource(shortestPath('Rajiv Chowk', 'Hauz Khas')!, '08:30')).toMatch(/^BOARD Rajiv Chowk ON Yellow AT 08:30;/);
  });
  it('every emitted program for the first 15 stations compiles', () => {
    for (const a of STATIONS.slice(0, 15))
      for (const b of STATIONS) {
        if (a.id === b.id) continue;
        const src = pathToSource(shortestPath(a.id, b.id, 'transfers')!);
        if (src) expect(compile(src).failedAt).toBeUndefined();
      }
  });
  it('the optimizer exposes all alternatives as source', () => {
    const sug = compile('BOARD New Delhi ON Yellow;\nCHANGE Blue AT Rajiv Chowk;\nCHANGE Violet AT Mandi House;\nEXIT ITO;').optimizer!.result.suggestion!;
    expect(sug.fewestChanges.interchanges).toBe(1);
    expect(sug.sources.fewestChanges).toContain('CHANGE Violet AT Central Secretariat;');
    expect(sug.sources.fastest).toBeDefined();
  });
});
