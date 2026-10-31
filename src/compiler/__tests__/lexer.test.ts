import { describe, expect, it } from 'vitest';
import { lex } from '../lexer/lexer';
import { DFA_STATES, DFA_TRANSITIONS, classify, delta } from '../lexer/dfa';
import { SAMPLE } from './helpers';

const types = (src: string) => lex(src).result.tokens.map((t) => t.type);
const values = (src: string) => lex(src).result.tokens.map((t) => t.value);

describe('DFA', () => {
  it('is deterministic: at most one transition per (state, class)', () => {
    for (const s of DFA_STATES)
      for (const c of ['letter', 'digit', 'wpunct', 'space', 'newline', 'semi', 'slash', 'quote', 'star', 'other'] as const)
        expect(DFA_TRANSITIONS.filter((t) => t.from === s.id && t.on.includes(c)).length).toBeLessThanOrEqual(1);
  });
  it('classifies characters', () => {
    expect(classify('a')).toBe('letter');
    expect(classify('7')).toBe('digit');
    expect(classify('-')).toBe('wpunct');
    expect(classify('\n')).toBe('newline');
    expect(classify('@')).toBe('other');
    expect(delta('q0', 'letter')).toBe('q_word');
    expect(delta('q_word', 'semi')).toBeUndefined();
  });
});

describe('lexer — valid input', () => {
  it('tokenises the sample program', () => {
    expect(types(SAMPLE)).toEqual([
      'BOARD', 'NAME', 'ON', 'NAME', 'SEMI',
      'VIA', 'NAME', 'SEMI',
      'CHANGE', 'NAME', 'AT', 'NAME', 'SEMI',
      'VIA', 'NAME', 'SEMI',
      'EXIT', 'NAME', 'SEMI', 'EOF',
    ]);
    expect(lex(SAMPLE).ok).toBe(true);
  });
  it('merges multi-word names on one line and normalises spacing', () => {
    expect(values('VIA Central   Secretariat;')).toEqual(['VIA', 'Central Secretariat', ';', '$']);
  });
  it('does not merge names across newlines', () => {
    expect(types('VIA Mandi\nHouse;')).toEqual(['VIA', 'NAME', 'NAME', 'SEMI', 'EOF']);
  });
  it('supports quoted names and strips the quotes', () => {
    const t = lex('EXIT "Dilli Haat - INA";').result.tokens[1];
    expect(t).toMatchObject({ type: 'NAME', value: 'Dilli Haat - INA', quoted: true });
  });
  it('skips comments and records line:col', () => {
    const toks = lex('// hello\n  BOARD X ON Y;').result.tokens;
    expect(toks[0]).toMatchObject({ type: 'BOARD', span: { start: { line: 2, col: 3 } } });
  });
  it('keywords are case-sensitive (lowercase → name + warning)', () => {
    const r = lex('board X ON Y;');
    expect(r.result.tokens[0].type).toBe('NAME');
    expect(r.diagnostics.map((d) => d.code)).toContain('W-L10');
  });
  it('warns about misspelled keywords', () => {
    expect(lex('BORD X ON Y;').diagnostics.map((d) => d.code)).toContain('W-L11');
  });
  it('accepts CRLF line endings and a BOM', () => {
    const r = lex('﻿BOARD X ON Y;\r\nEXIT Z;\r\n');
    expect(r.ok).toBe(true);
    expect(r.result.tokens.map((t) => t.type)).toEqual(['BOARD', 'NAME', 'ON', 'NAME', 'SEMI', 'EXIT', 'NAME', 'SEMI', 'EOF']);
  });
  it('produces DFA steps that end in screen + done', () => {
    const steps = lex('VIA X;').steps;
    expect(steps[0].kind).toBe('start');
    expect(steps.filter((s) => s.kind === 'emit').length).toBe(4); // VIA, ws, X, ;
    expect(steps.at(-1)!.kind).toBe('done');
  });
});

describe('lexer — errors', () => {
  const errs = (src: string) => lex(src).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
  it('L01 illegal characters, recovering to find all of them', () => {
    expect(errs('BOARD X @ ON # Y;')).toEqual(['L01', 'L01']);
  });
  it('L02 unterminated quoted name', () => expect(errs('BOARD "Rajiv Chowk ON Blue;\nEXIT X;')).toEqual(['L02']));
  it('L03 empty quoted name', () => expect(errs('EXIT "";')).toEqual(['L03']));
  it('L04 lone slash', () => expect(errs('EXIT X; / oops')).toEqual(['L04']));
  it('L05 block comments', () => expect(errs('/* no */ EXIT X;')).toEqual(['L05']));
  it('L05 stray */', () => expect(errs('EXIT X; */')).toEqual(['L05']));
  it('caps the number of reported errors', () => {
    const r = lex('@'.repeat(100));
    expect(r.diagnostics.length).toBe(26); // 25 + "too many errors"
    expect(r.diagnostics.at(-1)!.code).toBe('E-MAX');
  });
  it('reports the exact position of the error', () => {
    const d = lex('BOARD X ON Y;\nVIA Z $;').diagnostics[0];
    expect(d.span.start).toMatchObject({ line: 2, col: 7 });
  });
});
