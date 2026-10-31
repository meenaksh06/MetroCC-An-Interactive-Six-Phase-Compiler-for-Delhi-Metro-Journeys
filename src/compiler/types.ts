// Shared types for every compiler phase.

export interface Pos {
  offset: number; // 0-based character offset into the source
  line: number; // 1-based
  col: number; // 1-based
}

export interface Span {
  start: Pos;
  end: Pos; // exclusive
}

export type PhaseId = 'lexer' | 'parser' | 'semantic' | 'ir' | 'optimizer' | 'codegen';

export const PHASES: PhaseId[] = ['lexer', 'parser', 'semantic', 'ir', 'optimizer', 'codegen'];

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string; // e.g. L01, P04, S10, W-S20
  severity: Severity;
  phase: PhaseId;
  message: string;
  hint?: string;
  span: Span;
}

/** Every phase is a pure function returning its result, the steps for visualisation, and diagnostics. */
export interface PhaseResult<R, S> {
  ok: boolean; // false iff at least one error-severity diagnostic
  result: R;
  steps: S[];
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------- tokens

export type KeywordType = 'BOARD' | 'ON' | 'VIA' | 'CHANGE' | 'AT' | 'EXIT';
export type TokenType = KeywordType | 'NAME' | 'SEMI' | 'EOF';
export type TriviaType = 'WS' | 'COMMENT' | 'ERROR';

export interface Token {
  index: number; // position in the significant-token stream
  type: TokenType;
  lexeme: string; // exact source slice
  value: string; // normalised value (names: single-spaced, quotes removed)
  span: Span;
  quoted?: boolean;
}

/** Every token the scanner produced, including skipped trivia, for the token table. */
export interface RawToken {
  kind: TokenType | TriviaType | 'WORD' | 'QUOTED';
  lexeme: string;
  span: Span;
  dfaState: string; // accepting DFA state that produced it
}

// ---------------------------------------------------------------- trees

/** Generic display tree used by the UI for parse trees, ASTs and annotated trees. */
export interface TreeNode {
  id: string;
  label: string;
  kind: 'nonterminal' | 'terminal' | 'epsilon' | 'error' | 'ast' | 'leaf';
  span?: Span;
  attrs?: Record<string, string>;
  status?: 'ok' | 'error' | 'warning';
  children: TreeNode[];
}

// ---------------------------------------------------------------- AST

export interface NameRef {
  name: string;
  span: Span;
}

export interface BoardStmt {
  kind: 'board';
  station: NameRef;
  line: NameRef;
  span: Span;
}
export interface ViaStmt {
  kind: 'via';
  station: NameRef;
  span: Span;
}
export interface ChangeStmt {
  kind: 'change';
  line: NameRef;
  station: NameRef;
  span: Span;
}
export interface ExitStmt {
  kind: 'exit';
  station: NameRef;
  span: Span;
}
export type RouteStmt = ViaStmt | ChangeStmt;
export type Stmt = BoardStmt | RouteStmt | ExitStmt;

export interface Program {
  kind: 'program';
  board: BoardStmt;
  routes: RouteStmt[];
  exit: ExitStmt;
  span: Span;
}

export type LineId = 'Yellow' | 'Red' | 'Blue' | 'Violet' | 'Green';
