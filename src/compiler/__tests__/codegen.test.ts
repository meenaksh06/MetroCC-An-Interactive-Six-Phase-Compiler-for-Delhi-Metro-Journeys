import { describe, expect, it } from 'vitest';
import { fareFor } from '../data/metro';
import { shortestPath } from '../data/graph';
import { compile } from '../pipeline';
import { SAMPLE } from './helpers';

describe('code generation', () => {
  const out = compile(SAMPLE).codegen!.result;
  it('produces a readable itinerary', () => {
    expect(out.steps.map((s) => s.kind)).toEqual(['board', 'ride', 'change', 'ride', 'exit']);
    expect(out.steps[0].text).toBe('Board the Yellow Line at Jahangirpuri, platform towards Millennium City Centre Gurugram.');
    expect(out.steps[2].text).toMatch(/change to the Violet Line towards Raja Nahar Singh/);
    expect(out.text).toMatch(/Total: 15 stops · 1 interchange/);
  });
  it('gives the animated map one path per ride', () => {
    expect(out.path.map((p) => p.line)).toEqual(['Yellow', 'Violet']);
    expect(out.path[0].stations[0]).toBe('Jahangirpuri');
    expect(out.path[1].stations.at(-1)).toBe('Central Secretariat');
  });
  it('charges the DMRC fare for the shortest distance', () => {
    expect(out.summary.fare).toBe(fareFor(shortestPath('Jahangirpuri', 'Central Secretariat', 'distance')!.km));
  });
  it('fare slabs', () => {
    expect(fareFor(1.5)).toBe(11);
    expect(fareFor(4)).toBe(21);
    expect(fareFor(40)).toBe(64);
  });
});
