import type { PhaseId } from '../compiler/types';

export const PHASE_META: Record<PhaseId, { n: number; title: string; short: string; color: string }> = {
  lexer: { n: 1, title: 'Lexical Analysis', short: 'Lexer', color: '#FFCC00' },
  parser: { n: 2, title: 'Syntax Analysis', short: 'Parser', color: '#E21F26' },
  semantic: { n: 3, title: 'Semantic Analysis', short: 'Semantic', color: '#0066B3' },
  ir: { n: 4, title: 'Intermediate Code', short: 'IR', color: '#7E3F98' },
  optimizer: { n: 5, title: 'Code Optimization', short: 'Optimizer', color: '#00A650' },
  codegen: { n: 6, title: 'Code Generation', short: 'Codegen', color: '#EC4899' },
};

export const THEORY: Record<PhaseId, { heading: string; points: string[] }> = {
  lexer: {
    heading: 'Regular languages → DFA',
    points: [
      'Each token class is a regular expression, e.g. WORD = [A-Za-z0-9][A-Za-z0-9\'.-]*, SEMI = ;, COMMENT = //[^\\n]*. Their union is recognised by one DFA (Thompson NFA → subset construction → minimisation).',
      'The scanner applies maximal munch: it follows δ(q, c) until there is no move, then emits the token of the accepting state it stopped in and restarts at q0. Halting in a non-accepting state (q4 after "/", q6 inside a quote) is a lexical error.',
      'Multi-word station names use a scanner + screener design (Dragon Book §3.4.3): the DFA emits WORDs, then the screener marks reserved keywords and merges adjacent non-keyword words on one line into a NAME. The lexer never reads the station table, so lexing stays purely regular; "is this a real station?" is a semantic question with a symbol table and "did you mean" hints.',
      'Errors are recovered in panic mode (skip the bad character and continue), so one run reports every lexical error.',
    ],
  },
  parser: {
    heading: 'Context-free grammar → LL(1) PDA',
    points: [
      'The syntax is a context-free grammar. route_stmt* is written as the right-recursive route_list → route_stmt route_list | ε, because left recursion cannot be parsed top-down. Every alternative starts with a different keyword, so no left-factoring is needed.',
      'LL(1) condition: for A → α | β, FIRST(α) ∩ FIRST(β) = ∅, and if β ⇒* ε then FIRST(α) ∩ FOLLOW(A) = ∅. Here FIRST(route_stmt route_list) = {VIA, CHANGE} and FOLLOW(route_list) = {EXIT}, so the table has no conflicts.',
      'The predictive parser is a pushdown automaton. A configuration is (stack, remaining input), not a single state as in the lexer\'s DFA. It starts at ([$ program], w$), expands with M[A, a] or matches terminals, and accepts at ([$], $). The stack is what lets it handle the nesting that a DFA cannot.',
      'Panic-mode recovery: on an empty M[A, a], pop A if a ∈ FOLLOW(A) (synchronise), otherwise skip input up to the next ";". A mismatched terminal is popped as if it had been inserted. Errors that follow from the first are suppressed until the next successful match.',
    ],
  },
  semantic: {
    heading: 'Attribute grammars & symbol tables',
    points: [
      'Context-sensitive rules ("Mandi House must be on the line you are riding", "stations in travel order") cannot be written in a CFG, so they are checked over the AST with an attribute grammar.',
      'This is an L-attributed definition, evaluated in one left-to-right pass. The inherited attributes line.in and pos.in flow from earlier statements. The synthesised attributes stops, dir and pos.out flow upward. Direction is fixed by the first move of each ride; a later move against it is an order error (S10) or a reversal (S11).',
      'The symbol table (global scope = metro data) resolves names, records every reference, and offers edit-distance suggestions.',
      'Cascade suppression: an unresolved name marks dependent attributes as unknown (?), so one typo produces one error.',
    ],
  },
  ir: {
    heading: 'Syntax-directed translation to three-address code',
    points: [
      'Each statement is translated by a rule to a few IR instructions with at most three operands, e.g. RIDE line, from → to and TRANSFER l1 → l2 @ s.',
      'The translation is deliberately naive (one RIDE per VIA, a PASS for every VIA, transfers as written), just as real front ends leave cleanup to the optimizer.',
      'Basic blocks: an instruction is a leader if it is first or follows a TRANSFER (which acts like a jump to another line). Each block is a straight-line ride on one line, and the control-flow graph links them in order.',
    ],
  },
  optimizer: {
    heading: 'Semantics-preserving transformations',
    points: [
      'Peephole optimisation looks at a small window of instructions: TRANSFER A→B; TRANSFER B→A at the same station is removed, and TRANSFER A→B; TRANSFER B→C becomes TRANSFER A→C.',
      'Dead-code elimination: PASS only asserts something the semantic phase has already proved, so it has no effect at runtime.',
      'Instruction combining: RIDE L a→b; RIDE L b→c becomes RIDE L a→c. Pass order matters: merging is blocked until the PASS between the rides is removed.',
      'Global analysis: Dijkstra on the graph of line-copies of stations (interchange edges cost +5 min) gives the best route. It is shown only as a suggestion, because an optimizer must not change what the program means, and your route is part of the meaning.',
    ],
  },
  codegen: {
    heading: 'Instruction selection → target "machine"',
    points: [
      'The target language is human instructions plus an animation path. Each IR opcode has a template (BOARD → "Board the … at … towards …"), which is instruction selection in its simplest form.',
      'Target-specific information is added here: platform direction ("towards" a terminus) from the station order, travel time, distance, and the DMRC fare. DMRC charges by the shortest-distance path, so a detour costs time but not money.',
      'The map shows the generated "program" being executed: the train marker runs the itinerary step by step.',
    ],
  },
};
