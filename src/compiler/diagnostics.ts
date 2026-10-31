import type { Diagnostic, PhaseId, Pos, Severity, Span } from './types';

/** Upper bound on reported errors per phase, so a garbage file can't flood the UI. */
export const MAX_ERRORS_PER_PHASE = 25;

export function makeDiag(
  phase: PhaseId,
  code: string,
  severity: Severity,
  message: string,
  span: Span,
  hint?: string,
): Diagnostic {
  return { phase, code, severity, message, span, ...(hint ? { hint } : {}) };
}

export const hasErrors = (ds: Diagnostic[]) => ds.some((d) => d.severity === 'error');

/** Collects diagnostics for a phase, enforcing the error cap. */
export class DiagnosticSink {
  readonly list: Diagnostic[] = [];
  private errors = 0;
  capped = false;

  constructor(private phase: PhaseId) {}

  error(code: string, message: string, span: Span, hint?: string) {
    if (this.errors >= MAX_ERRORS_PER_PHASE) {
      if (!this.capped) {
        this.capped = true;
        this.list.push(
          makeDiag(this.phase, 'E-MAX', 'error', `Too many errors; stopped reporting after ${MAX_ERRORS_PER_PHASE}.`, span),
        );
      }
      return;
    }
    this.errors++;
    this.list.push(makeDiag(this.phase, code, 'error', message, span, hint));
  }

  warn(code: string, message: string, span: Span, hint?: string) {
    this.list.push(makeDiag(this.phase, code, 'warning', message, span, hint));
  }

  info(code: string, message: string, span: Span, hint?: string) {
    this.list.push(makeDiag(this.phase, code, 'info', message, span, hint));
  }

  get errorCount() {
    return this.errors;
  }
}

// ---------------------------------------------------------------- spans

export const pos = (offset: number, line: number, col: number): Pos => ({ offset, line, col });

export const spanOf = (a: Span, b: Span): Span => ({ start: a.start, end: b.end });

/** Zero-width span sitting at the end of another span (used for "missing ';'"). */
export const spanAfter = (s: Span): Span => ({ start: s.end, end: s.end });

export const spanContains = (s: Span | undefined, offset: number) =>
  !!s && offset >= s.start.offset && offset < Math.max(s.end.offset, s.start.offset + 1);

export const EMPTY_SPAN: Span = { start: pos(0, 1, 1), end: pos(0, 1, 1) };

// ---------------------------------------------------------------- suggestions

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Closest candidate by case-insensitive edit distance, within a length-scaled threshold. */
export function didYouMean(input: string, candidates: string[]): string | undefined {
  const needle = input.toLowerCase();
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(needle, c.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  const limit = Math.max(1, Math.floor(input.length / 3));
  return bestD <= limit ? best : undefined;
}
