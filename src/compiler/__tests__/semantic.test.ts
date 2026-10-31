import { describe, expect, it } from 'vitest';
import { compile } from '../pipeline';
import { SAMPLE, codes, errorCodes } from './helpers';

describe('semantic — valid journeys', () => {
  it('accepts the sample and records two ride segments', () => {
    const r = compile(SAMPLE);
    expect(r.semantic!.ok).toBe(true);
    const segs = r.semantic!.result.journey!.segments;
    expect(segs.map((s) => [s.line, s.from, s.to])).toEqual([
      ['Yellow', 'Jahangirpuri', 'Kashmere Gate'],
      ['Violet', 'Kashmere Gate', 'Central Secretariat'],
    ]);
    expect(segs[0].towards).toBe('Millennium City Centre Gurugram');
  });
  it('resolves aliases with an info note', () => {
    const r = compile('BOARD Race Course ON Yellow; EXIT Hauz Khas;');
    expect(r.semantic!.ok).toBe(true);
    expect(codes('BOARD Race Course ON Yellow; EXIT Hauz Khas;')).toContain('I-S30');
  });
  it('builds a symbol table and annotated tree', () => {
    const r = compile(SAMPLE).semantic!.result;
    const kg = r.symbols.find((s) => s.name === 'Kashmere Gate')!;
    expect(kg.attrs.interchange).toBe('yes');
    expect(kg.refs.length).toBe(2);
    expect(r.annotated.children[1].attrs).toMatchObject({ 'line.in': 'Yellow', 'pos.in': 'Jahangirpuri', stops: '8' });
  });
  it('travels along a Green Line branch', () =>
    expect(errorCodes('BOARD Kirti Nagar ON Green; VIA Ashok Park Main; EXIT Madipur;')).toEqual([]));
});

describe('semantic — errors', () => {
  it('S01 unknown station with suggestion', () => {
    const d = compile('BOARD Rajiv Chok ON Blue; EXIT Mandi House;').diagnostics[0];
    expect(d.code).toBe('S01');
    expect(d.hint).toMatch(/Rajiv Chowk/);
  });
  it('S02 unknown line', () => expect(errorCodes('BOARD Rajiv Chowk ON Purple; EXIT Mandi House;')).toEqual(['S02']));
  it('S02 recognises real but unmodelled lines', () =>
    expect(compile('BOARD Rajiv Chowk ON Pink; EXIT Mandi House;').diagnostics[0].message).toMatch(/not part of/));
  it('S03 station used as a line, and line as a station', () =>
    expect(errorCodes('BOARD Rajiv Chowk ON Blue; CHANGE Green Park AT Mandi House; EXIT Yellow;')).toEqual(['S03', 'S03']));
  it('S04 boarding station not on the line', () => expect(errorCodes('BOARD Rajiv Chowk ON Violet; EXIT Mandi House;')).toEqual(['S04']));
  it('S05 VIA station not on the current line (with fix hint)', () => {
    const d = compile('BOARD Jahangirpuri ON Yellow; VIA Mandi House; EXIT Central Secretariat;').diagnostics[0];
    expect(d.code).toBe('S05');
    expect(d.hint).toMatch(/CHANGE Violet AT Kashmere Gate/);
  });
  it('S06 CHANGE at a station unreachable on the current line', () =>
    expect(errorCodes('BOARD Jahangirpuri ON Yellow; CHANGE Violet AT Mandi House; EXIT ITO;')).toEqual(['S06']));
  it('S07 CHANGE at a non-interchange', () =>
    expect(errorCodes('BOARD Rajiv Chowk ON Blue; CHANGE Violet AT Karol Bagh; EXIT ITO;')).toEqual(['S07']));
  it('S08 CHANGE to the same line', () =>
    expect(errorCodes('BOARD Rajiv Chowk ON Blue; CHANGE Blue AT Mandi House; EXIT Yamuna Bank;')).toEqual(['S08']));
  it('S09 EXIT not on the current line', () =>
    expect(errorCodes('BOARD Rajiv Chowk ON Blue; EXIT Hauz Khas;')).toEqual(['S09']));
  it('S10 VIA stations out of order (the A,C,B,D case)', () =>
    expect(errorCodes('BOARD Kirti Nagar ON Blue; VIA Karol Bagh; VIA Shadipur; EXIT Rajiv Chowk;')).toEqual(['S10']));
  it('S11 direction reversal', () => expect(errorCodes('BOARD Karol Bagh ON Blue; VIA Rajiv Chowk; EXIT Kirti Nagar;')).toEqual(['S11']));
  it('S12 different branches of one line', () => expect(errorCodes('BOARD Inderlok ON Green; EXIT Kirti Nagar;')).toEqual(['S12']));
  it('S13 zero-length journey', () => expect(errorCodes('BOARD Rajiv Chowk ON Blue; EXIT Rajiv Chowk;')).toEqual(['S13']));
  it('reports all independent errors in one pass', () =>
    expect(errorCodes('BOARD Rajiv Chok ON Blue; VIA mandi house; CHANGE Green Park AT Mandi House; CHANGE Pink AT ITO; EXIT Yellow;')).toEqual([
      'S01', 'S01', 'S03', 'S02', 'S03',
    ]));
  it('suppresses cascades after an unknown line', () =>
    expect(errorCodes('BOARD Rajiv Chowk ON Bleu; VIA Mandi House; EXIT Yamuna Bank;')).toEqual(['S02']));
  it('warnings: repeated VIA, change-back, change at boarding station, loop', () => {
    expect(codes('BOARD Rajiv Chowk ON Blue; VIA Mandi House; VIA Mandi House; EXIT Yamuna Bank;')).toContain('W-S20');
    expect(codes('BOARD Jahangirpuri ON Yellow; CHANGE Violet AT Kashmere Gate; CHANGE Yellow AT Kashmere Gate; EXIT Rajiv Chowk;')).toContain('W-S22');
    expect(codes('BOARD Rajiv Chowk ON Yellow; CHANGE Blue AT Rajiv Chowk; EXIT Mandi House;')).toContain('W-S23');
  });
});
