/**
 * The MetroCC context-free grammar (LL(1) form).
 *
 *   program     → board_stmt route_list exit_stmt
 *   board_stmt  → BOARD NAME ON NAME ;
 *   route_list  → route_stmt route_list | ε        (EBNF route_stmt* made right-recursive)
 *   route_stmt  → via_stmt | change_stmt
 *   via_stmt    → VIA NAME ;
 *   change_stmt → CHANGE NAME AT NAME ;
 *   exit_stmt   → EXIT NAME ;
 */

export type Terminal = 'BOARD' | 'ON' | 'VIA' | 'CHANGE' | 'AT' | 'EXIT' | 'NAME' | 'SEMI' | '$';
export type NonTerminal = 'program' | 'board_stmt' | 'route_list' | 'route_stmt' | 'via_stmt' | 'change_stmt' | 'exit_stmt';
export type GSymbol = Terminal | NonTerminal;

export const EPSILON = 'ε';

export interface Production {
  id: number;
  lhs: NonTerminal;
  rhs: GSymbol[]; // [] = ε
  /** Semantic role of NAME occurrences, by rhs index (for display + AST building). */
  roles?: Record<number, 'station' | 'line'>;
}

export const START: NonTerminal = 'program';

export const TERMINALS: Terminal[] = ['BOARD', 'ON', 'VIA', 'CHANGE', 'AT', 'EXIT', 'NAME', 'SEMI', '$'];
export const NONTERMINALS: NonTerminal[] = ['program', 'board_stmt', 'route_list', 'route_stmt', 'via_stmt', 'change_stmt', 'exit_stmt'];

export const PRODUCTIONS: Production[] = [
  { id: 1, lhs: 'program', rhs: ['board_stmt', 'route_list', 'exit_stmt'] },
  { id: 2, lhs: 'board_stmt', rhs: ['BOARD', 'NAME', 'ON', 'NAME', 'SEMI'], roles: { 1: 'station', 3: 'line' } },
  { id: 3, lhs: 'route_list', rhs: ['route_stmt', 'route_list'] },
  { id: 4, lhs: 'route_list', rhs: [] },
  { id: 5, lhs: 'route_stmt', rhs: ['via_stmt'] },
  { id: 6, lhs: 'route_stmt', rhs: ['change_stmt'] },
  { id: 7, lhs: 'via_stmt', rhs: ['VIA', 'NAME', 'SEMI'], roles: { 1: 'station' } },
  { id: 8, lhs: 'change_stmt', rhs: ['CHANGE', 'NAME', 'AT', 'NAME', 'SEMI'], roles: { 1: 'line', 3: 'station' } },
  { id: 9, lhs: 'exit_stmt', rhs: ['EXIT', 'NAME', 'SEMI'], roles: { 1: 'station' } },
];

export const isTerminal = (s: string): s is Terminal => (TERMINALS as string[]).includes(s);
export const isNonTerminal = (s: string): s is NonTerminal => (NONTERMINALS as string[]).includes(s);

export const displaySym = (s: string) => (s === 'SEMI' ? "';'" : s);

export const productionText = (p: Production) =>
  `${p.lhs} → ${p.rhs.length ? p.rhs.map(displaySym).join(' ') : EPSILON}`;

/** BNF shown in the UI. */
export const BNF = `<program>     ::= <board_stmt> <route_list> <exit_stmt>
<board_stmt>  ::= BOARD <station> ON <line> ";"
<route_list>  ::= <route_stmt> <route_list> | ε
<route_stmt>  ::= <via_stmt> | <change_stmt>
<via_stmt>    ::= VIA <station> ";"
<change_stmt> ::= CHANGE <line> AT <station> ";"
<exit_stmt>   ::= EXIT <station> ";"
<station>     ::= NAME
<line>        ::= NAME`;
