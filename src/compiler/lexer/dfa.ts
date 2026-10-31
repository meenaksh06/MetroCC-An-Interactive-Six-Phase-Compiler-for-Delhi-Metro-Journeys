/**
 * The scanner's DFA. This single definition is used both by the lexer and by
 * the SVG diagram in the UI, so what is drawn is exactly what runs.
 *
 *   WORD    = [A-Za-z0-9] [A-Za-z0-9'.-]*
 *   WS      = [ \t\r]+ | \n  (any mix)
 *   SEMI    = ;
 *   COMMENT = // [^\n]*
 *   QUOTED  = " [^"\n]* "
 */

export type CharClass =
  | 'letter'
  | 'digit'
  | 'wpunct'
  | 'space'
  | 'newline'
  | 'semi'
  | 'slash'
  | 'quote'
  | 'star'
  | 'other';

export const CHAR_CLASS_LABEL: Record<CharClass, string> = {
  letter: '[A-Za-z]',
  digit: '[0-9]',
  wpunct: "[-'.]",
  space: '[ \\t\\r]',
  newline: '\\n',
  semi: ';',
  slash: '/',
  quote: '"',
  star: '*',
  other: 'other',
};

export type StateId = 'q0' | 'q_word' | 'q_ws' | 'q_semi' | 'q_slash' | 'q_comment' | 'q_quote' | 'q_qend';

export interface DfaState {
  id: StateId;
  label: string;
  /** Token kind produced when the DFA halts in this state (undefined = non-accepting). */
  accepts?: 'WORD' | 'WS' | 'SEMI' | 'COMMENT' | 'QUOTED';
  x: number;
  y: number;
  /** which side the self-loop is drawn on */
  loop?: 'up' | 'down';
  description: string;
}

export const DFA_STATES: DfaState[] = [
  { id: 'q0', label: 'q0', x: 70, y: 215, description: 'Start state: nothing consumed yet.' },
  { id: 'q_word', label: 'q1', accepts: 'WORD', x: 260, y: 85, loop: 'up', description: 'Inside a word (keyword or part of a name).' },
  { id: 'q_semi', label: 'q3', accepts: 'SEMI', x: 260, y: 172, description: 'Statement terminator.' },
  { id: 'q_ws', label: 'q2', accepts: 'WS', x: 260, y: 290, loop: 'down', description: 'Whitespace run (skipped).' },
  { id: 'q_slash', label: 'q4', x: 140, y: 400, description: 'Saw one "/": a second one is needed for a comment.' },
  { id: 'q_comment', label: 'q5', accepts: 'COMMENT', x: 400, y: 400, loop: 'down', description: 'Inside a // comment until end of line.' },
  { id: 'q_quote', label: 'q6', x: 470, y: 215, loop: 'up', description: 'Inside a "quoted name".' },
  { id: 'q_qend', label: 'q7', accepts: 'QUOTED', x: 630, y: 120, description: 'Closing quote seen.' },
];

export interface DfaTransition {
  from: StateId;
  to: StateId;
  on: CharClass[];
  label: string;
}

const ALL: CharClass[] = ['letter', 'digit', 'wpunct', 'space', 'newline', 'semi', 'slash', 'quote', 'star', 'other'];
const except = (...xs: CharClass[]) => ALL.filter((c) => !xs.includes(c));

export const DFA_TRANSITIONS: DfaTransition[] = [
  { from: 'q0', to: 'q_word', on: ['letter', 'digit'], label: '[A-Za-z0-9]' },
  { from: 'q_word', to: 'q_word', on: ['letter', 'digit', 'wpunct'], label: "[A-Za-z0-9'.-]" },
  { from: 'q0', to: 'q_ws', on: ['space', 'newline'], label: 'ws' },
  { from: 'q_ws', to: 'q_ws', on: ['space', 'newline'], label: 'ws' },
  { from: 'q0', to: 'q_semi', on: ['semi'], label: ';' },
  { from: 'q0', to: 'q_slash', on: ['slash'], label: '/' },
  { from: 'q_slash', to: 'q_comment', on: ['slash'], label: '/' },
  { from: 'q_comment', to: 'q_comment', on: except('newline'), label: '[^\\n]' },
  { from: 'q0', to: 'q_quote', on: ['quote'], label: '"' },
  { from: 'q_quote', to: 'q_quote', on: except('quote', 'newline'), label: '[^"\\n]' },
  { from: 'q_quote', to: 'q_qend', on: ['quote'], label: '"' },
];

export const stateById = new Map(DFA_STATES.map((s) => [s.id, s]));

export function classify(ch: string): CharClass {
  if (/\p{L}/u.test(ch)) return 'letter';
  if (/[0-9]/.test(ch)) return 'digit';
  if (ch === '-' || ch === "'" || ch === '.') return 'wpunct';
  if (ch === '\n') return 'newline';
  if (ch === ' ' || ch === '\t' || ch === '\r' || ch === ' ' || ch === '﻿') return 'space';
  if (ch === ';') return 'semi';
  if (ch === '/') return 'slash';
  if (ch === '"') return 'quote';
  if (ch === '*') return 'star';
  return 'other';
}

/** δ(state, class) — undefined means "no transition" (halt). */
export function delta(state: StateId, cls: CharClass): StateId | undefined {
  return DFA_TRANSITIONS.find((t) => t.from === state && t.on.includes(cls))?.to;
}
