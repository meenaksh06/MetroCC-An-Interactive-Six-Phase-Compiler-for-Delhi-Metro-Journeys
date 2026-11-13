import { describe, expect, it } from 'vitest';
import { compile } from '../pipeline';
import { SAMPLE } from './helpers';
import type { JourneyDoc } from '../codegen/targets';

const cg = (src: string) => compile(src).codegen!.result;

describe('multi-target code generation', () => {
  const out = cg(SAMPLE);

  it('emits every target from the same IR', () => {
    expect(Object.keys(out.targets).sort()).toEqual(['card', 'json', 'text']);
    expect(out.targets.text).toContain('Total: 15 stops');
  });

  it('JSON target is valid JSON that matches the summary', () => {
    const doc = JSON.parse(out.targets.json) as JourneyDoc;
    expect(doc.format).toBe('metrocc-journey');
    expect(doc.from).toBe('Jahangirpuri');
    expect(doc.to).toBe('Central Secretariat');
    expect(doc.summary.minutes).toBe(out.summary.min);
    expect(doc.summary.interchanges).toBe(1);
    expect(doc.legs.map((l) => l.line)).toEqual(['Yellow', 'Violet']);
    expect(doc.changes).toEqual([{ station: 'Kashmere Gate', fromLine: 'Yellow', toLine: 'Violet', minutes: 5 }]);
  });

  it('JSON legs add up: minutes = rides + 5 per change, stations chain end to start', () => {
    const doc = out.journey;
    const ride = doc.legs.reduce((n, l) => n + l.minutes, 0);
    expect(ride + doc.changes.length * 5).toBe(doc.summary.minutes);
    for (let i = 1; i < doc.legs.length; i++) expect(doc.legs[i].from).toBe(doc.legs[i - 1].to);
    expect(doc.legs[0].stations[0]).toBe(doc.from);
    expect(doc.legs.at(-1)!.stations.at(-1)).toBe(doc.to);
  });

  it('journey card lists stations, the interchange and the estimated time', () => {
    const card = out.targets.card;
    expect(card).toContain('METRO JOURNEY CARD');
    expect(card).toContain('Jahangirpuri → Central Secretariat');
    expect(card).toMatch(/⇄ change Yellow → Violet .*\n│ ● Kashmere Gate/);
    expect(card).not.toContain('…'); // nothing truncated for this journey
    expect(card).toContain('Lal Qila'); // an intermediate station on the Violet leg
    expect(card).toContain(`Estimated time ≈ ${out.summary.min} min`);
  });

  it('journey card is a well-formed fixed-width box', () => {
    const lines = out.targets.card.trimEnd().split('\n');
    const width = [...lines[0]].length;
    for (const l of lines) expect([...l].length).toBe(width);
    expect(lines[0].startsWith('┌')).toBe(true);
    expect(lines.at(-1)!.startsWith('└')).toBe(true);
  });

  it('carries clock times into the card and JSON when a departure time is given', () => {
    const r = cg('BOARD Jahangirpuri ON Yellow AT 08:30;\nCHANGE Violet AT Kashmere Gate;\nEXIT Mandi House;');
    expect(r.journey.depart).toBe('08:30');
    expect(r.journey.arrive).toBe(r.summary.arrive);
    expect(r.journey.legs[0].depart).toBe('08:30');
    expect(r.journey.legs[1].depart).toBe(r.steps.find((s) => s.kind === 'change')!.time);
    expect(r.targets.card).toContain('Depart 08:30');
  });
});
