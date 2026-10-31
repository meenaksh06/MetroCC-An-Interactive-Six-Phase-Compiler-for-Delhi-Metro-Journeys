/**
 * Phase 1 — Lexical analysis.
 *
 * Scanner: runs the DFA in dfa.ts with maximal munch, producing raw tokens
 *   (WORD, WS, SEMI, COMMENT, QUOTED).
 * Screener: classifies WORDs as reserved keywords, then coalesces runs of
 *   non-keyword words on the same line into a single NAME token
 *   ("Kashmere" "Gate" → NAME "Kashmere Gate").
 *
 * The lexer never consults the station table; whether a NAME is a real
 * station or line is a semantic question.
 */
import { DiagnosticSink, didYouMean, pos } from '../diagnostics';
import type { KeywordType, PhaseResult, Pos, RawToken, Span, Token } from '../types';
import { classify, delta, stateById, type CharClass, type StateId } from './dfa';

export const KEYWORDS: KeywordType[] = ['BOARD', 'ON', 'VIA', 'CHANGE', 'AT', 'EXIT'];

export interface LexStep {
  kind: 'start' | 'move' | 'emit' | 'error' | 'screen' | 'done';
  offset: number; // character being looked at
  ch?: string;
  cls?: CharClass;
  from?: StateId;
  to?: StateId;
  raw?: RawToken; // for emit
  tokenStart: number; // start offset of the lexeme being built
  message: string;
}

export interface LexOutput {
  tokens: Token[]; // significant tokens, ending with EOF
  raw: RawToken[]; // every scanner token incl. trivia and errors
}

export function makePosFn(src: string) {
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  return (offset: number): Pos => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return pos(offset, lo + 1, offset - lineStarts[lo] + 1);
  };
}

const show = (ch: string) =>
  ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '\\r' : ch === ' ' ? '␠' : ch === ' ' ? 'NBSP' : ch === '﻿' ? 'BOM' : ch;

export function lex(src: string): PhaseResult<LexOutput, LexStep> {
  const at = makePosFn(src);
  const span = (a: number, b: number): Span => ({ start: at(a), end: at(b) });
  const diags = new DiagnosticSink('lexer');
  const steps: LexStep[] = [{ kind: 'start', offset: 0, tokenStart: 0, to: 'q0', message: 'Scanner starts in q0.' }];
  const raw: RawToken[] = [];
  const n = src.length;
  let i = 0;
  let warnedNbsp = false;

  if (src.startsWith('﻿')) diags.warn('W-L01', 'File starts with a byte-order mark (BOM); it is treated as whitespace.', span(0, 1));

  while (i < n) {
    const start = i;
    let state: StateId = 'q0';
    // ---- run the DFA as far as it goes (maximal munch)
    while (i < n) {
      const ch = src[i];
      const cls = classify(ch);
      const next = delta(state, cls);
      if (!next) break;
      if (ch === ' ' && !warnedNbsp) {
        warnedNbsp = true;
        diags.warn('W-L02', 'Non-breaking space found; treated as an ordinary space.', span(i, i + 1));
      }
      steps.push({
        kind: 'move', offset: i, ch, cls, from: state, to: next, tokenStart: start,
        message: `δ(${stateById.get(state)!.label}, '${show(ch)}') = ${stateById.get(next)!.label}`,
      });
      state = next;
      i++;
    }

    const accepts = stateById.get(state)!.accepts;
    if (state !== 'q0' && accepts) {
      const tok: RawToken = { kind: accepts, lexeme: src.slice(start, i), span: span(start, i), dfaState: state };
      raw.push(tok);
      steps.push({
        kind: 'emit', offset: i, from: state, raw: tok, tokenStart: start,
        message: `No move on ${i < n ? `'${show(src[i])}'` : 'EOF'} — ${stateById.get(state)!.label} is accepting → emit ${accepts} "${show(tok.lexeme.length > 24 ? tok.lexeme.slice(0, 24) + '…' : tok.lexeme)}"`,
      });
      if (accepts === 'QUOTED' && tok.lexeme.slice(1, -1).trim() === '')
        diags.error('L03', 'Empty quoted name "".', tok.span, 'Write a station or line name between the quotes, or remove them.');
      continue;
    }

    // ---- error handling: DFA halted in q0 or in a non-accepting state
    const errorStep = (message: string, end: number) => {
      raw.push({ kind: 'ERROR', lexeme: src.slice(start, end), span: span(start, end), dfaState: state });
      steps.push({ kind: 'error', offset: start, from: state, tokenStart: start, message });
    };

    if (state === 'q0') {
      const ch = src[i];
      if (ch === '*' && src[i + 1] === '/') {
        diags.error('L05', 'Stray "*/" — block comments are not supported.', span(i, i + 2), 'Use // for comments.');
        i += 2;
        errorStep('Stray "*/" skipped.', i);
      } else {
        const cp = src.codePointAt(i)!;
        const len = cp > 0xffff ? 2 : 1;
        const hint =
          ch === '-' || ch === "'" || ch === '.'
            ? `'${ch}' is only allowed inside a name (e.g. "Dilli Haat - INA" in quotes).`
            : ch === ','
              ? 'Statements end with ";" — commas are not part of the language.'
              : ch === ':'
                ? 'Did you mean ";"?'
                : 'Remove it; names use letters, digits and - \' . only.';
        diags.error('L01', `Illegal character '${src.slice(i, i + len)}' (U+${cp.toString(16).toUpperCase().padStart(4, '0')}).`, span(i, i + len), hint);
        i += len;
        errorStep(`No transition from q0 on '${src.slice(start, i)}' → lexical error, skip 1 character (panic mode).`, i);
      }
      continue;
    }

    if (state === 'q_slash') {
      if (src[i] === '*') {
        const close = src.indexOf('*/', i + 1);
        const end = close === -1 ? n : close + 2;
        diags.error('L05', 'Block comments /* … */ are not supported.', span(start, Math.min(end, start + 2)), 'Use // to comment to the end of a line.');
        i = end;
        errorStep('"/*" is not a valid token; skipped to the matching "*/".', i);
      } else {
        diags.error('L04', "Lone '/' — comments start with '//'.", span(start, i), "Did you mean '//'?");
        errorStep("q4 is not accepting and has no move — lone '/' skipped.", i);
      }
      continue;
    }

    if (state === 'q_quote') {
      const content = src.slice(start + 1, i);
      diags.error(
        'L02',
        `Unterminated quoted name "${content.trim().slice(0, 30)}${content.length > 30 ? '…' : ''}" — missing closing quote.`,
        span(start, i),
        'Close the name with " before the end of the line.',
      );
      // Recovery: accept what we have as a quoted name so later tokens stay aligned.
      const tok: RawToken = { kind: 'QUOTED', lexeme: src.slice(start, i), span: span(start, i), dfaState: state };
      raw.push(tok);
      steps.push({ kind: 'error', offset: i, from: state, raw: tok, tokenStart: start, message: `Reached ${i < n ? 'end of line' : 'EOF'} inside a quoted name (q6 is not accepting) → error, recover by closing the name here.` });
      continue;
    }
  }

  // ---- screener
  const tokens: Token[] = [];
  let pending: RawToken[] = [];
  const flush = () => {
    if (!pending.length) return;
    const first = pending[0];
    const last = pending[pending.length - 1];
    tokens.push({
      index: tokens.length,
      type: 'NAME',
      lexeme: src.slice(first.span.start.offset, last.span.end.offset),
      value: pending.map((p) => p.lexeme).join(' '),
      span: { start: first.span.start, end: last.span.end },
    });
    pending = [];
  };

  for (const r of raw) {
    switch (r.kind) {
      case 'WORD': {
        if ((KEYWORDS as string[]).includes(r.lexeme)) {
          flush();
          tokens.push({ index: tokens.length, type: r.lexeme as KeywordType, lexeme: r.lexeme, value: r.lexeme, span: r.span });
          r.kind = r.lexeme as KeywordType;
        } else {
          pending.push(r);
          const upper = r.lexeme.toUpperCase();
          if ((KEYWORDS as string[]).includes(upper))
            diags.warn('W-L10', `"${r.lexeme}" looks like the keyword ${upper}, but keywords are case-sensitive — it will be read as part of a name.`, r.span, `Write ${upper} in capitals.`);
          else if (/^[A-Z]{3,}$/.test(r.lexeme)) {
            const kw = didYouMean(r.lexeme, KEYWORDS);
            if (kw && kw.length >= 3) diags.warn('W-L11', `"${r.lexeme}" is not a keyword — did you mean ${kw}?`, r.span);
          }
        }
        break;
      }
      case 'WS':
        if (r.lexeme.includes('\n')) flush();
        break;
      case 'QUOTED': {
        flush();
        const inner = r.lexeme.endsWith('"') && r.lexeme.length > 1 ? r.lexeme.slice(1, -1) : r.lexeme.slice(1);
        tokens.push({ index: tokens.length, type: 'NAME', lexeme: r.lexeme, value: inner.trim().replace(/\s+/g, ' '), span: r.span, quoted: true });
        break;
      }
      case 'SEMI':
        flush();
        tokens.push({ index: tokens.length, type: 'SEMI', lexeme: ';', value: ';', span: r.span });
        break;
      default: // COMMENT, ERROR
        flush();
    }
  }
  flush();
  tokens.push({ index: tokens.length, type: 'EOF', lexeme: '', value: '$', span: span(n, n) });

  steps.push({
    kind: 'screen', offset: n, tokenStart: n,
    message: `Screener: ${raw.filter((r) => r.kind !== 'WS' && r.kind !== 'COMMENT' && r.kind !== 'ERROR').length} raw tokens → ${tokens.length - 1} tokens (keywords recognised, adjacent words merged into NAMEs).`,
  });
  steps.push({ kind: 'done', offset: n, tokenStart: n, message: 'End of input → emit EOF ($).' });

  return { ok: diags.errorCount === 0, result: { tokens, raw }, steps, diagnostics: diags.list };
}
