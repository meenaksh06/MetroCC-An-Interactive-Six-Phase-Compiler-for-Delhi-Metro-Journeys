/**
 * Phase 2 — Syntax analysis: a hand-written, table-driven LL(1) predictive parser.
 *
 * It is a pushdown automaton: a configuration is (stack, remaining input).
 *   start:  ([$, program], tokens $)
 *   accept: ([$], $)
 *
 * Error recovery (panic mode, Dragon Book §4.4.5):
 *   - terminal on top ≠ input  → pop the terminal (pretend it was inserted),
 *                                or delete the input token if the next one matches;
 *   - M[A, a] empty, a ∈ FOLLOW(A) → pop A (synchronise);
 *   - otherwise                    → skip input tokens until one in FIRST(A) ∪ FOLLOW(A),
 *                                    stopping after a ';' (statement boundary).
 *   Cascading errors are suppressed until the next successful match.
 */
import { DiagnosticSink, didYouMean, spanAfter, spanOf } from '../diagnostics';
import { KEYWORDS } from '../lexer/lexer';
import type { Diagnostic, PhaseResult, Program, RouteStmt, Span, Token, TreeNode } from '../types';
import { displaySym, isTerminal, productionText, PRODUCTIONS, type GSymbol, type NonTerminal, type Production } from './grammar';
import { LL1 } from './ll1Table';
import { buildAst } from './ast';

export interface ParseStep {
  kind: 'init' | 'expand' | 'match' | 'error' | 'pop' | 'skip' | 'accept' | 'reject';
  stack: string[]; // bottom → top, snapshot BEFORE the action
  ip: number; // index of the current input token, BEFORE the action
  action: string;
  production?: number;
  tokenIndex?: number;
  nodeIds?: string[]; // parse-tree nodes created or filled by this step
  suppressed?: boolean;
}

export interface ParseOutput {
  tree: TreeNode;
  /** step index at which each parse-tree node first appears (for animated building) */
  nodeStep: Record<string, number>;
  ast: Program | null;
}

interface StackEntry {
  sym: GSymbol;
  node?: TreeNode;
}

const tokenDesc = (t: Token) =>
  t.type === 'EOF' ? 'end of input' : t.type === 'NAME' ? `name '${t.value}'` : t.type === 'SEMI' ? "';'" : `keyword ${t.type}`;

const ROLE_OF: Record<string, string> = {};
for (const p of PRODUCTIONS) for (const [i, r] of Object.entries(p.roles ?? {})) ROLE_OF[`${p.id}:${i}`] = r;

const STMT_NAME: Partial<Record<NonTerminal, string>> = {
  board_stmt: 'BOARD',
  via_stmt: 'VIA',
  change_stmt: 'CHANGE',
  exit_stmt: 'EXIT',
};

/** If a NAME starts with a mis-cased or misspelled keyword, suggest the keyword. */
function caseHint(t: Token): string | undefined {
  if (t.type !== 'NAME' || t.quoted) return;
  const firstWord = t.value.split(' ')[0];
  const up = firstWord.toUpperCase();
  if ((KEYWORDS as string[]).includes(up) && firstWord !== up) return `Keywords are case-sensitive: write ${up}, not "${firstWord}".`;
  if (/^[A-Z]{3,}$/.test(firstWord)) {
    const kw = didYouMean(firstWord, KEYWORDS);
    if (kw && kw.length >= 3) return `“${firstWord}” is not a keyword — did you mean ${kw}?`;
  }
}

export function parse(tokens: Token[]): PhaseResult<ParseOutput, ParseStep> {
  const diags = new DiagnosticSink('parser');
  const steps: ParseStep[] = [];
  const nodeStep: Record<string, number> = {};
  let nodeCounter = 0;
  const mk = (label: string, kind: TreeNode['kind']): TreeNode => ({ id: `p${nodeCounter++}`, label, kind, children: [] });

  const root = mk('program', 'nonterminal');
  const stack: StackEntry[] = [{ sym: '$' }, { sym: 'program', node: root }];
  let ip = 0;
  let suppress = false;
  let trailingReported = false;

  const sym = (t: Token) => (t.type === 'EOF' ? '$' : t.type);
  const snapshot = () => stack.map((e) => e.sym as string);
  const record = (s: Omit<ParseStep, 'stack' | 'ip'>, stackSnap = snapshot(), ipSnap = ip) => {
    steps.push({ ...s, stack: stackSnap, ip: ipSnap });
    for (const id of s.nodeIds ?? []) if (!(id in nodeStep)) nodeStep[id] = steps.length - 1;
  };
  const report = (code: string, message: string, span: Span, hint?: string) => {
    if (suppress) return false;
    diags.error(code, message, span, hint);
    suppress = true;
    return true;
  };

  record({ kind: 'init', action: 'Initial configuration: stack = [$ program], input = all tokens + $', nodeIds: [root.id] });

  const prevSpan = () => (ip > 0 ? tokens[ip - 1].span : tokens[0].span);

  let guard = 0;
  while (guard++ < 10_000) {
    const top = stack[stack.length - 1];
    const tok = tokens[ip];
    const a = sym(tok);

    // ---------------- bottom of stack
    if (top.sym === '$') {
      if (a === '$') {
        const ok = diags.errorCount === 0;
        record({ kind: ok ? 'accept' : 'reject', action: ok ? 'ACCEPT — stack and input both reduced to $' : `Input consumed with ${diags.errorCount} syntax error(s) — REJECT` });
        break;
      }
      // tokens after the EXIT statement
      if (!trailingReported) {
        trailingReported = true;
        suppress = false;
        if (a === 'EXIT') report('P10', 'A journey can only EXIT once — found a second EXIT statement.', tok.span, 'Remove the extra EXIT, or turn the earlier one into VIA.');
        else if (a === 'BOARD') report('P08', 'Statements after EXIT: found BOARD. A program describes exactly one journey.', tok.span, 'Remove everything after the EXIT statement.');
        else report('P08', `Statements after EXIT: found ${tokenDesc(tok)}. EXIT must be the last statement.`, tok.span, 'Move EXIT to the end of the journey.');
      }
      record({ kind: 'skip', action: `Stack is [$] but input is not — skip ${displaySym(a)}`, tokenIndex: ip, suppressed: true });
      ip++;
      continue;
    }

    // ---------------- terminal on top
    if (isTerminal(top.sym)) {
      if (top.sym === a) {
        const node = top.node!;
        node.span = tok.span;
        node.attrs = { ...(node.attrs ?? {}), lexeme: tok.value };
        node.label = a === 'NAME' ? `NAME “${tok.value}”` : displaySym(a);
        record({ kind: 'match', action: `Match ${displaySym(a)}${a === 'NAME' ? ` “${tok.value}”` : ''} — pop and advance`, tokenIndex: ip, nodeIds: [node.id] });
        stack.pop();
        ip++;
        suppress = false;
        continue;
      }
      // mismatch
      const expected = top.sym;
      const parentProd = (top.node?.attrs?.prod ?? '') as string;
      const role = ROLE_OF[`${parentProd}:${top.node?.attrs?.idx}`];
      const stmt = STMT_NAME[(top.node?.attrs?.parent ?? '') as NonTerminal] ?? '';
      const next = tokens[ip + 1];
      const deletable = (a === 'NAME' || a === 'ON' || a === 'AT') && next && sym(next) === expected;

      if (deletable) {
        const reported = report(
          'P12',
          `Unexpected ${tokenDesc(tok)} in ${stmt} statement — expected ${displaySym(expected)}.`,
          tok.span,
          a === 'NAME' && tokens[ip - 1]?.type === 'NAME' ? 'A name cannot continue on the next line — keep each name on one line.' : 'Remove it.',
        );
        record({ kind: 'skip', action: `Error: expected ${displaySym(expected)}, found ${displaySym(a)}; next token matches → delete ${displaySym(a)}`, tokenIndex: ip, suppressed: !reported });
        ip++;
        continue;
      }

      let reported = false;
      if (expected === 'SEMI') {
        reported = report('P04', `Missing ';' at the end of the ${stmt} statement (found ${tokenDesc(tok)}).`, spanAfter(prevSpan()), 'Every statement ends with a semicolon.');
      } else if (expected === 'BOARD') {
        reported = report('P02', `A journey must start with BOARD — found ${tokenDesc(tok)}.`, tok.span, caseHint(tok) ?? 'Start with: BOARD <station> ON <line>;');
      } else if (expected === 'ON' || expected === 'AT') {
        const prev = tokens[ip - 1];
        const merged = prev?.type === 'NAME' && !prev.quoted && prev.value.includes(' ');
        reported = report(
          expected === 'ON' ? 'P03' : 'P06',
          `Missing ${expected} in ${stmt} statement — found ${tokenDesc(tok)}.`,
          a === '$' || a === 'SEMI' ? spanAfter(prevSpan()) : tok.span,
          caseHint(tok) ??
            (merged
              ? `Did you forget ${expected}? “${prev.value}” was read as ONE name because adjacent words merge into a name.`
              : expected === 'ON'
                ? 'Form: BOARD <station> ON <line>;'
                : 'Form: CHANGE <line> AT <station>;'),
        );
      } else if (expected === 'NAME') {
        const what = role === 'line' ? 'a line name' : 'a station name';
        reported = report(
          'P11',
          `Expected ${what} after ${displaySym(tokens[ip - 1]?.type ?? '')}, found ${tokenDesc(tok)}.`,
          a === '$' || a === 'SEMI' ? spanAfter(prevSpan()) : tok.span,
          a !== 'SEMI' && a !== '$' ? `${a} is a reserved keyword; wrap the name in quotes if it really contains it.` : undefined,
        );
      } else {
        reported = report('P12', `Expected ${displaySym(expected)}, found ${tokenDesc(tok)}.`, tok.span);
      }
      const node = top.node!;
      node.kind = 'error';
      node.label = `missing ${displaySym(expected)}`;
      record({ kind: 'pop', action: `Error: expected ${displaySym(expected)}, found ${displaySym(a)} → pop ${displaySym(expected)} (assume inserted)`, nodeIds: [node.id], suppressed: !reported });
      stack.pop();
      continue;
    }

    // ---------------- nonterminal on top
    const A = top.sym as NonTerminal;
    const prod = LL1.table.get(A)!.get(a);
    if (prod) {
      expand(top, prod);
      continue;
    }

    // error entry M[A, a] = ∅
    const follow = LL1.ff.follow.get(A)!;
    const first = LL1.ff.first.get(A)!;
    if (A === 'program' && a === '$') {
      report('P01', 'Empty program — a journey needs at least BOARD … and EXIT … statements.', tok.span, 'Try: BOARD Rajiv Chowk ON Blue;  EXIT Mandi House;');
      top.node!.kind = 'error';
      record({ kind: 'pop', action: 'Error: M[program, $] is empty — nothing to parse', nodeIds: [top.node!.id] });
      stack.pop();
      continue;
    }

    if (follow.has(a) || a === '$') {
      let reported = false;
      if (A === 'board_stmt')
        reported = report('P02', `Missing BOARD statement — the journey starts with ${tokenDesc(tok)}.`, tok.span, 'The first statement must be BOARD <station> ON <line>;');
      else if (A === 'route_list' || A === 'exit_stmt')
        reported = report('P07', 'Missing EXIT statement — the journey never ends.', spanAfter(prevSpan()), 'Finish with EXIT <station>;');
      else reported = report('P12', `Unexpected ${tokenDesc(tok)} while parsing ${A}.`, tok.span);
      top.node!.kind = 'error';
      record({ kind: 'pop', action: `Error: M[${A}, ${displaySym(a)}] empty, ${displaySym(a)} ∈ FOLLOW(${A}) → pop ${A} (sync)`, nodeIds: [top.node!.id], suppressed: !reported });
      stack.pop();
      continue;
    }

    const prods = PRODUCTIONS.filter((p) => p.lhs === A);
    if (prods.length === 1) {
      // Only one way forward: expand and let the terminal mismatch report the precise problem.
      expand(top, prods[0], ' (only production — error will be reported at the terminal)');
      continue;
    }

    // skip input tokens (panic mode)
    let reported = false;
    if (a === 'BOARD') reported = report('P09', 'Duplicate BOARD — a journey boards exactly once.', tok.span, 'Use CHANGE <line> AT <station>; to switch lines mid-journey.');
    else if (a === 'SEMI') reported = report('P05', "Empty statement — stray ';'.", tok.span, 'Remove the extra semicolon.');
    else if (a === 'NAME')
      reported = report('P12', `Expected VIA, CHANGE or EXIT at the start of a statement, found ${tokenDesc(tok)}.`, tok.span, caseHint(tok) ?? 'Did you forget the keyword (VIA <station>;)?');
    else reported = report('P12', `Unexpected keyword ${a} at the start of a statement — expected VIA, CHANGE or EXIT.`, tok.span, `${a} can only appear inside a ${a === 'ON' ? 'BOARD' : 'CHANGE'} statement.`);

    let first_ = true;
    while (true) {
      const t = tokens[ip];
      const s = sym(t);
      if (s === '$' || (!first_ && (first.has(s) || follow.has(s)))) break;
      record({ kind: 'skip', action: `Error: M[${A}, ${displaySym(s)}] empty → skip ${displaySym(s)} (panic mode)`, tokenIndex: ip, suppressed: !reported });
      first_ = false;
      ip++;
      if (s === 'SEMI') break; // statement boundary
    }
  }

  function expand(top: StackEntry, p: Production, note = '') {
    const stackSnap = snapshot();
    stack.pop();
    const children = p.rhs.map((s, idx) => {
      const n = mk(displaySym(s), isTerminal(s) ? 'terminal' : 'nonterminal');
      n.attrs = { prod: String(p.id), idx: String(idx), parent: p.lhs };
      const r = ROLE_OF[`${p.id}:${idx}`];
      if (r) n.label = `NAME ⟨${r}⟩`;
      return n;
    });
    if (!children.length) children.push(mk('ε', 'epsilon'));
    top.node!.children = children;
    top.node!.attrs = { ...(top.node!.attrs ?? {}), production: String(p.id) };
    for (let i = p.rhs.length - 1; i >= 0; i--) stack.push({ sym: p.rhs[i], node: children[i] });
    record({ kind: 'expand', action: `M[${p.lhs}, ${displaySym(sym(tokens[ip]))}] = ${productionText(p)}${note}`, production: p.id, nodeIds: children.map((c) => c.id) }, stackSnap);
  }

  computeSpans(root);
  const ok = diags.errorCount === 0;
  const ast = ok ? buildAst(root) : null;
  return { ok, result: { tree: root, nodeStep, ast }, steps, diagnostics: diags.list };
}

function computeSpans(n: TreeNode): Span | undefined {
  const spans = n.children.map(computeSpans).filter(Boolean) as Span[];
  if (!n.span && spans.length) n.span = spanOf(spans[0], spans[spans.length - 1]);
  return n.span;
}

/** Convenience: diagnostics only (used by tests). */
export const parseErrors = (tokens: Token[]): Diagnostic[] => parse(tokens).diagnostics;

export type { RouteStmt };
