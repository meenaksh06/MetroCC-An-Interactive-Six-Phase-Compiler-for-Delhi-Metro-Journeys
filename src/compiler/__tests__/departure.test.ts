import { describe, expect, it } from 'vitest';
import { formatClock, parseClock } from '../data/metro';
import { lex } from '../lexer/lexer';
import { compile } from '../pipeline';
import { codes, errorCodes } from './helpers';

const MORNING = `BOARD Jahangirpuri ON Yellow AT 08:30;
CHANGE Violet AT Kashmere Gate;
EXIT Mandi House;`;

describe('departure time — lexer', () => {
  it('scans HH:MM as one TIME token via q8 → q9 → q10', () => {
    const toks = lex('BOARD Rajiv Chowk ON Yellow AT 8:05;').result.tokens;
    expect(toks.map((t) => t.type)).toEqual(['BOARD', 'NAME', 'ON', 'NAME', 'AT', 'TIME', 'SEMI', 'EOF']);
    expect(toks[5].value).toBe('08:05'); // hours padded by the screener
  });
  it('still reads numbers inside names as words', () => {
    const toks = lex('VIA Sector 18;').result.tokens;
    expect(toks[1]).toMatchObject({ type: 'NAME', value: 'Sector 18' });
  });
  it('L06 for a time with no minutes', () => {
    expect(errorCodes('BOARD Rajiv Chowk ON Yellow AT 08:;\nEXIT Hauz Khas;')).toEqual(['L06']);
  });
});

describe('departure time — parser', () => {
  it('accepts BOARD with and without AT HH:MM', () => {
    expect(compile(MORNING).failedAt).toBeUndefined();
    expect(compile('BOARD Rajiv Chowk ON Yellow;\nEXIT Hauz Khas;').failedAt).toBeUndefined();
  });
  it('puts the time in the AST', () => {
    expect(compile(MORNING).parser!.result.ast!.board.depart?.name).toBe('08:30');
  });
  it('P13 when AT has no time', () => {
    expect(errorCodes('BOARD Rajiv Chowk ON Yellow AT;\nEXIT Hauz Khas;')).toContain('P13');
  });
  it('a missing semicolon after BOARD is still P04, not a depart error', () => {
    expect(errorCodes('BOARD Rajiv Chowk ON Yellow\nEXIT Hauz Khas;')).toEqual(['P04']);
  });
});

describe('departure time — semantics', () => {
  it('S14 for an impossible time', () => {
    expect(errorCodes('BOARD Rajiv Chowk ON Yellow AT 25:10;\nEXIT Hauz Khas;')).toEqual(['S14']);
    expect(errorCodes('BOARD Rajiv Chowk ON Yellow AT 08:75;\nEXIT Hauz Khas;')).toEqual(['S14']);
  });
  it('W-S25 outside service hours', () => {
    expect(codes('BOARD Rajiv Chowk ON Yellow AT 03:00;\nEXIT Hauz Khas;')).toContain('W-S25');
    expect(codes(MORNING)).not.toContain('W-S25');
  });
  it('clock helpers round-trip', () => {
    expect(parseClock('08:30')).toBe(510);
    expect(parseClock('24:00')).toBeUndefined();
    expect(formatClock(510)).toBe('08:30');
    expect(formatClock(1440 + 5)).toBe('00:05');
  });
});

describe('departure time — IR and code generation', () => {
  const r = compile(MORNING);
  it('BOARD carries the departure time as a third operand', () => {
    const board = r.ir!.result.ir[0];
    expect(board.time).toBe(510);
  });
  it('arrival = departure + total journey time', () => {
    const s = r.codegen!.result.summary;
    expect(s.depart).toBe('08:30');
    expect(s.arrive).toBe(formatClock(510 + s.min));
    expect(r.codegen!.result.steps.at(-1)!.time).toBe(s.arrive);
  });
  it('every step gets a clock time, never going backwards', () => {
    const times = r.codegen!.result.steps.map((st) => parseClock(st.time!)!);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });
  it('no clock times without a departure time', () => {
    const plain = compile('BOARD Rajiv Chowk ON Yellow;\nEXIT Hauz Khas;').codegen!.result;
    expect(plain.summary.depart).toBeUndefined();
    expect(plain.steps.every((st) => st.time === undefined)).toBe(true);
  });
  it('W-C01 when the journey ends after the last trains', () => {
    const late = compile('BOARD Inderlok ON Red AT 23:15;\nCHANGE Yellow AT Kashmere Gate;\nEXIT Hauz Khas;');
    expect(late.failedAt).toBeUndefined();
    expect(late.diagnostics.map((d) => d.code)).toContain('W-C01');
  });
});
