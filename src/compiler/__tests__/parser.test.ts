import { describe, expect, it } from 'vitest';
import { lex } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { LL1 } from '../parser/ll1Table';
import { computeFirstFollow } from '../parser/firstFollow';
import { SAMPLE } from './helpers';

const p = (src: string) => parse(lex(src).result.tokens);
const errs = (src: string) => p(src).diagnostics.map((d) => d.code);
const set = (s: Set<string> | undefined) => [...(s ?? [])].sort();

describe('FIRST / FOLLOW / LL(1) table', () => {
  const ff = computeFirstFollow();
  it('computes FIRST sets', () => {
    expect(set(ff.first.get('program'))).toEqual(['BOARD']);
    expect(set(ff.first.get('route_list'))).toEqual(['CHANGE', 'VIA', 'ε']);
    expect(set(ff.first.get('route_stmt'))).toEqual(['CHANGE', 'VIA']);
    expect(set(ff.first.get('exit_stmt'))).toEqual(['EXIT']);
  });
  it('computes FOLLOW sets', () => {
    expect(set(ff.follow.get('program'))).toEqual(['$']);
    expect(set(ff.follow.get('board_stmt'))).toEqual(['CHANGE', 'EXIT', 'VIA']);
    expect(set(ff.follow.get('route_list'))).toEqual(['EXIT']);
    expect(set(ff.follow.get('via_stmt'))).toEqual(['CHANGE', 'EXIT', 'VIA']);
    expect(set(ff.follow.get('exit_stmt'))).toEqual(['$']);
  });
  it('the grammar is LL(1): no table conflicts', () => {
    expect(LL1.conflicts).toEqual([]);
    expect(LL1.table.get('route_list')!.get('EXIT')!.id).toBe(4); // ε-production on FOLLOW
    expect(LL1.table.get('route_list')!.get('VIA')!.id).toBe(3);
  });
});

describe('parser — valid input', () => {
  it('accepts the sample and builds an AST', () => {
    const r = p(SAMPLE);
    expect(r.ok).toBe(true);
    expect(r.result.ast!.board.station.name).toBe('Jahangirpuri');
    expect(r.result.ast!.routes.map((s) => s.kind)).toEqual(['via', 'change', 'via']);
    expect(r.result.ast!.exit.station.name).toBe('Central Secretariat');
  });
  it('first step is the initial configuration and last is ACCEPT', () => {
    const steps = p(SAMPLE).steps;
    expect(steps[0]).toMatchObject({ kind: 'init', stack: ['$', 'program'], ip: 0 });
    expect(steps.at(-1)).toMatchObject({ kind: 'accept', stack: ['$'] });
  });
  it('accepts the minimal journey (route_list → ε)', () => expect(p('BOARD A ON B; EXIT C;').ok).toBe(true));
  it('every parse-tree node appears at some step', () => {
    const r = p(SAMPLE);
    const ids: string[] = [];
    const walk = (n: typeof r.result.tree) => (ids.push(n.id), n.children.forEach(walk));
    walk(r.result.tree);
    for (const id of ids) expect(r.result.nodeStep[id]).toBeTypeOf('number');
  });
});

describe('parser — errors and panic-mode recovery', () => {
  it('P01 empty program', () => expect(errs('')).toEqual(['P01']));
  it('P02 missing BOARD', () => expect(errs('VIA A; EXIT B;')).toEqual(['P02']));
  it('P02 with case hint for lowercase keyword', () => {
    const d = p('board A ON B; EXIT C;').diagnostics[0];
    expect(d.code).toBe('P02');
    expect(d.hint).toMatch(/case-sensitive/);
  });
  it('P03 missing ON (merged-name hint)', () => {
    const d = p('BOARD Rajiv Chowk Blue; EXIT C;').diagnostics[0];
    expect(d.code).toBe('P03');
    expect(d.hint).toMatch(/read as ONE name/);
  });
  it('P04 missing semicolon, positioned after the previous token', () => {
    const d = p('BOARD A ON B\nEXIT C;').diagnostics[0];
    expect(d.code).toBe('P04');
    expect(d.span.start).toMatchObject({ line: 1, col: 13 });
  });
  it('P05 stray semicolon', () => expect(errs('BOARD A ON B;; EXIT C;')).toEqual(['P05']));
  it('P06 missing AT', () => expect(errs('BOARD A ON B; CHANGE C D; EXIT E;')).toEqual(['P06']));
  it('P07 missing EXIT', () => expect(errs('BOARD A ON B; VIA C;')).toEqual(['P07']));
  it('P08 statements after EXIT', () => expect(errs('BOARD A ON B; EXIT C; VIA D;')).toEqual(['P08']));
  it('P09 duplicate BOARD', () => expect(errs('BOARD A ON B; BOARD C ON D; EXIT E;')).toEqual(['P09']));
  it('P10 duplicate EXIT', () => expect(errs('BOARD A ON B; EXIT C; EXIT D;')).toEqual(['P10']));
  it('P11 keyword where a name is expected', () => expect(errs('BOARD A ON B; VIA ; EXIT C;')).toEqual(['P11']));
  it('P12 name split across lines (token deletion)', () => expect(errs('BOARD A ON B; VIA Mandi\nHouse; EXIT C;')).toEqual(['P12']));
  it('P12 statement without keyword', () => expect(errs('BOARD A ON B; Mandi House; EXIT C;')).toEqual(['P12']));
  it('recovers to report several independent errors in one run', () => {
    expect(errs('board A ON B;\nVIA C\nCHANGE D E;\nEXIT ;')).toEqual(['P02', 'P04', 'P06', 'P11']);
  });
  it('suppresses cascades (one root cause → one error)', () => {
    expect(errs('BOARD A ON B; VIA EXIT C;').length).toBe(1);
  });
  it('ends with a REJECT row and records skip/pop actions', () => {
    const steps = p('BOARD A ON B; BOARD C ON D; EXIT E;').steps;
    expect(steps.at(-1)!.kind).toBe('reject');
    expect(steps.some((s) => s.kind === 'skip')).toBe(true);
  });
  it('always terminates on garbage input', () => {
    const r = p('ON ON AT ; ; VIA VIA CHANGE AT ON EXIT EXIT BOARD');
    expect(r.ok).toBe(false);
    expect(r.steps.length).toBeLessThan(500);
  });
});
