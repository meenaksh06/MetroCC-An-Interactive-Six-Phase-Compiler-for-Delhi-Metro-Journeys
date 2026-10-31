/**
 * Phase 3 — Semantic analysis.
 *
 * An L-attributed definition evaluated left-to-right over the statements:
 *   inherited:   line (current line), pos (current station), dir (direction of the current ride)
 *   synthesised: stops, towards, status
 * Each rule check becomes one checklist entry (= one visualisation step).
 *
 * Cascade suppression: once a name fails to resolve, checks that depend on it
 * are marked "skipped" instead of producing follow-on errors.
 */
import { DiagnosticSink } from '../diagnostics';
import { lineById, linesAt, rideInfo, routesContaining } from '../data/graph';
import type { LineId, PhaseResult, Program, Span, Stmt, TreeNode } from '../types';
import { SymbolTable, type Resolution, type SymbolEntry } from './symbolTable';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'info';

export interface Check {
  stmt: number; // statement index (0 = BOARD)
  title: string;
  status: CheckStatus;
  code?: string;
  detail?: string;
  span: Span;
}

export interface Waypoint {
  station: string;
  stmt: number;
  kind: 'board' | 'via' | 'change' | 'exit';
  span: Span;
}

export interface Segment {
  line: LineId;
  from: string;
  to: string;
  direction: number; // +1 / -1 along the route, 0 = no movement
  towards: string;
  waypoints: Waypoint[]; // every station named in the source on this ride, incl. the start
}

export interface Journey {
  board: Waypoint & { line: LineId };
  segments: Segment[];
  exit: Waypoint;
  stmts: Stmt[];
  /** canonical names per statement (aliases resolved) */
  resolved: { station: string; line?: LineId }[];
}

export interface SemanticOutput {
  checks: Check[];
  symbols: SymbolEntry[];
  annotated: TreeNode;
  journey: Journey | null;
}

export type SemanticStep = { check: number; message: string };

const stmtKeyword = (s: Stmt) => s.kind.toUpperCase();

export function analyse(program: Program): PhaseResult<SemanticOutput, SemanticStep> {
  const diags = new DiagnosticSink('semantic');
  const symtab = new SymbolTable();
  const checks: Check[] = [];
  const stmts: Stmt[] = [program.board, ...program.routes, program.exit];

  const check = (stmt: number, title: string, status: CheckStatus, span: Span, code?: string, detail?: string, hint?: string) => {
    checks.push({ stmt, title, status, span, code, detail });
    if (status === 'fail') diags.error(code!, detail ?? title, span, hint);
    if (status === 'warn') diags.warn(code!, detail ?? title, span, hint);
    if (status === 'info' && code) diags.info(code, detail ?? title, span, hint);
  };

  // ---- structural rules (already enforced by the grammar)
  check(0, 'BOARD is the first statement, exactly once', 'pass', program.board.span, undefined, 'Guaranteed by the grammar: program → board_stmt route_list exit_stmt (violations are syntax errors P02/P09).');
  check(stmts.length - 1, 'EXIT is the last statement, exactly once', 'pass', program.exit.span, undefined, 'Guaranteed by the grammar (violations are syntax errors P07/P08/P10).');

  // ---- annotated tree scaffolding
  let nid = 0;
  const tnode = (label: string, span: Span, attrs: Record<string, string>, children: TreeNode[] = [], kind: TreeNode['kind'] = 'ast'): TreeNode => ({
    id: `s${nid++}`, label, kind, span, attrs, children,
  });
  const stmtNodes: TreeNode[] = [];

  // ---- inherited attributes (state flowing left → right)
  let line: LineId | null = null; // current line (null = unknown after an error)
  let pos: string | null = null; // current station (null = unknown)
  let segStart: string | null = null;
  let segDir = 0;
  let segPoints: Waypoint[] = [];
  let moved = false; // has the journey moved at all?
  let prevLine: LineId | null = null; // line before the most recent CHANGE
  let lastChangeAt: string | null = null; // station of the most recent CHANGE with no ride since
  const segments: Segment[] = [];
  const visited = new Map<string, number>(); // station → stmt where first passed
  let loopWarned = false;
  let boardWp: (Waypoint & { line: LineId }) | null = null;
  const resolvedNames: { station: string; line?: LineId }[] = [];

  const resolveS = (stmt: number, s: Stmt, ref: { name: string; span: Span }): string | null => {
    const r = symtab.resolveStation(ref);
    return resolved(stmt, s, ref.span, r, 'station', ref.name);
  };
  const resolveL = (stmt: number, s: Stmt, ref: { name: string; span: Span }): LineId | null => {
    const r = symtab.resolveLine(ref);
    return resolved(stmt, s, ref.span, r, 'line', ref.name);
  };
  function resolved<T>(stmt: number, _s: Stmt, span: Span, r: Resolution<T>, what: string, name: string): T | null {
    if (r.ok) {
      check(stmt, `${what === 'line' ? 'Line' : 'Station'} “${name}” exists`, 'pass', span);
      if (r.note) check(stmt, `Alias resolved`, 'info', span, 'I-S30', r.note);
      return r.value;
    }
    check(stmt, `${what === 'line' ? 'Line' : 'Station'} “${name}” exists`, 'fail', span, r.code, r.message, r.hint);
    return null;
  }

  const closeSegment = () => {
    if (line && segStart && pos && segStart !== pos) {
      const info = rideInfo(line, segStart, pos);
      if (info) segments.push({ line, from: segStart, to: pos, direction: info.direction, towards: info.towards, waypoints: segPoints });
    }
  };

  const markVisited = (path: string[], stmt: number, span: Span) => {
    for (const s of path) {
      const prev = visited.get(s);
      if (prev !== undefined && prev < stmt && !loopWarned) {
        loopWarned = true;
        check(stmt, `No station is passed twice`, 'warn', span, 'W-S21', `Your route passes ${s} twice (first in statement ${prev + 1}) — the journey loops back on itself.`, 'The route-optimality pass will suggest a shorter route.');
      }
    }
    for (const s of path) if (!visited.has(s)) visited.set(s, stmt);
  };

  /**
   * Move along the current line to `st`. Returns stops travelled, or null if the move is invalid.
   */
  const advance = (stmt: number, st: string, kind: 'via' | 'change' | 'exit', span: Span): { stops: number; towards?: string } | null => {
    if (!line) {
      check(stmt, `${st} is on the current line`, 'skip', span, undefined, 'Skipped: the current line is unknown because of an earlier error.');
      return null;
    }
    const serving = linesAt.get(st) ?? [];
    if (!serving.includes(line)) {
      const code = kind === 'via' ? 'S05' : kind === 'change' ? 'S06' : 'S09';
      const xfer = serving.length
        ? (() => {
            const shared = [...linesAt].filter(([, ls]) => ls.includes(line!) && ls.some((l) => serving.includes(l))).map(([s]) => s);
            return shared.length
              ? `${st} is on ${serving.join('/')}. Add “CHANGE ${serving.find((l) => linesAt.get(shared[0])!.includes(l))} AT ${shared[0]};” first.`
              : `${st} is on ${serving.join('/')}, which has no direct interchange with ${line}.`;
          })()
        : undefined;
      const verb = kind === 'via' ? 'pass through' : kind === 'change' ? 'change trains at' : 'exit at';
      check(stmt, `${st} is on the ${line} line`, 'fail', span, code, `You can't ${verb} ${st}: it is not on the ${line} line you are riding.`, xfer);
      return null;
    }
    check(stmt, `${st} is on the ${line} line`, 'pass', span);

    if (!pos || !segStart) {
      // position unknown after an earlier error: re-anchor here without order checks
      segStart = st;
      pos = st;
      segDir = 0;
      segPoints = [{ station: st, stmt, kind, span }];
      return { stops: 0 };
    }

    if (st === pos) {
      if (kind === 'exit' && !moved)
        check(stmt, 'Journey has non-zero length', 'fail', span, 'S13', `You EXIT at ${st}, where you boarded — the journey has zero length.`, 'Choose a different destination.');
      else if (kind === 'via')
        check(stmt, 'Each VIA names a new stop', 'warn', span, 'W-S20', `Repeated stop: you are already at ${st}.`, 'Remove this VIA; dead-VIA removal will drop it anyway.');
      return { stops: 0 };
    }

    const pts = [segStart, ...segPoints.map((w) => w.station), st];
    const routes = routesContaining(line, ...pts);
    if (!routes.length) {
      const fromRoutes = routesContaining(line, pos);
      const toRoutes = routesContaining(line, st);
      const common = fromRoutes[0]?.stations.find((s) => toRoutes.some((r) => r.stations.includes(s)));
      check(stmt, `${st} is reachable on this ${line} branch`, 'fail', span, 'S12',
        `${pos} and ${st} are on different branches of the ${line} line — no single train serves both.`,
        common ? `Ride to ${common} (where the branches meet), then continue on the other branch as a separate ride.` : undefined);
      return null;
    }
    const r = routes[0];
    const iS = r.stations.indexOf(segStart);
    const iL = r.stations.indexOf(pos);
    const iN = r.stations.indexOf(st);
    const d = Math.sign(iN - iL);
    const towardsOf = (dir: number) => (dir > 0 ? r.towards[1] : r.towards[0]);

    if (segDir === 0) {
      segDir = d;
      check(stmt, `Direction of travel established`, 'pass', span, undefined, `${line} line towards ${towardsOf(d)}.`);
    } else if (d !== segDir) {
      const between = (iN - iS) * (iL - iN) >= 0; // iN lies between start and last
      if (between)
        check(stmt, 'Stations appear in travel order', 'fail', span, 'S10',
          `Out of order: riding ${line} towards ${towardsOf(segDir)}, ${st} comes before ${pos} — you have already passed it.`,
          `List VIA stations in the order the train reaches them: ${r.stations.slice(Math.min(iS, iL), Math.max(iS, iL) + 1).filter((s) => pts.includes(s) || s === st).sort((a, b) => (r.stations.indexOf(a) - r.stations.indexOf(b)) * segDir).join(' → ')}.`);
      else
        check(stmt, 'Direction of travel does not reverse', 'fail', span, 'S11',
          `Direction reversal: you are riding ${line} towards ${towardsOf(segDir)}, but ${st} is behind you (towards ${towardsOf(-segDir)}).`,
          'A train cannot silently reverse. Exit and start a new journey, or fix the station order.');
      return null;
    } else {
      check(stmt, 'Stations appear in travel order', 'pass', span, undefined, `Continuing towards ${towardsOf(segDir)}.`);
    }

    const info = rideInfo(line, pos, st)!;
    markVisited(info.path.slice(1), stmt, span);
    pos = st;
    moved = true;
    lastChangeAt = null;
    segPoints.push({ station: st, stmt, kind, span });
    return { stops: info.stops, towards: info.towards };
  };

  // ================================================================ walk statements
  stmts.forEach((s, i) => {
    const inh = { line: line ?? '?', pos: pos ?? '?' };
    const children: TreeNode[] = [];
    let syn: Record<string, string> = {};

    switch (s.kind) {
      case 'board': {
        const l = resolveL(i, s, s.line);
        const st = resolveS(i, s, s.station);
        if (l && st) {
          if ((linesAt.get(st) ?? []).includes(l)) check(i, `${st} is served by the ${l} line`, 'pass', s.span);
          else
            check(i, `${st} is served by the ${l} line`, 'fail', s.station.span, 'S04', `${st} is not on the ${l} line.`,
              `${st} is served by: ${(linesAt.get(st) ?? []).join(', ')}.`);
        }
        line = l;
        pos = l && st && (linesAt.get(st) ?? []).includes(l) ? st : null;
        segStart = pos;
        segDir = 0;
        segPoints = pos ? [{ station: pos, stmt: i, kind: 'board', span: s.span }] : [];
        if (pos) visited.set(pos, 0);
        if (l && st) boardWp = { station: st, stmt: 0, kind: 'board', span: s.span, line: l };
        resolvedNames[i] = { station: st ?? '', line: l ?? undefined };
        children.push(tnode(`station: ${s.station.name}`, s.station.span, st ? { type: 'station', lines: (linesAt.get(st) ?? []).join(', ') } : { type: 'error' }, [], 'leaf'));
        children.push(tnode(`line: ${s.line.name}`, s.line.span, l ? { type: 'line', color: lineById.get(l)!.color } : { type: 'error' }, [], 'leaf'));
        syn = { 'line.out': line ?? '?', 'pos.out': pos ?? '?' };
        break;
      }
      case 'via': {
        const st = resolveS(i, s, s.station);
        const r = st ? advance(i, st, 'via', s.span) : null;
        resolvedNames[i] = { station: st ?? '' };
        children.push(tnode(`station: ${s.station.name}`, s.station.span, st ? { type: 'station', lines: (linesAt.get(st) ?? []).join(', ') } : { type: 'error' }, [], 'leaf'));
        syn = { stops: r ? String(r.stops) : '–', ...(r?.towards ? { dir: `→ ${r.towards}` } : {}), 'pos.out': pos ?? '?' };
        break;
      }
      case 'change': {
        const l = resolveL(i, s, s.line);
        const st = resolveS(i, s, s.station);
        const r = st ? advance(i, st, 'change', s.station.span) : null;
        const reached = r !== null || (!!st && st === pos);
        resolvedNames[i] = { station: st ?? '', line: l ?? undefined };
        if (l && line && l === line)
          check(i, 'CHANGE switches to a different line', 'fail', s.line.span, 'S08', `You are already on the ${l} line — CHANGE must switch to a different line.`, 'Remove this CHANGE, or name the line you want to switch to.');
        else if (l && line) check(i, 'CHANGE switches to a different line', 'pass', s.line.span);
        if (l && st) {
          const serving = linesAt.get(st) ?? [];
          if (serving.includes(l) && (!line || serving.includes(line)))
            check(i, `${st} is an interchange for ${line ?? '?'} ↔ ${l}`, line === l ? 'skip' : 'pass', s.station.span);
          else if (!serving.includes(l)) {
            const options = line ? [...linesAt].filter(([, ls]) => ls.includes(line!) && ls.includes(l)).map(([x]) => x) : [];
            check(i, `${st} is an interchange serving ${l}`, 'fail', s.station.span, 'S07',
              `${st} is not an interchange for the ${l} line (it is served only by ${serving.join(', ')}).`,
              options.length ? `${line} ↔ ${l} interchanges: ${options.join(', ')}.` : line ? `There is no direct ${line} ↔ ${l} interchange in this map.` : undefined);
          }
        }
        // redundant-transfer warnings (optimizer will fix them)
        if (l && line && l !== line && st && reached) {
          if (lastChangeAt === st && prevLine === l)
            check(i, 'No change-and-change-back', 'warn', s.span, 'W-S22', `You change to ${line} and straight back to ${l} at ${st} — both transfers are redundant.`, 'Redundant-transfer elimination will remove them.');
          else if (lastChangeAt === st)
            check(i, 'One transfer per interchange', 'warn', s.span, 'W-S24', `Two transfers in a row at ${st} — change directly from ${prevLine} to ${l}.`, 'Redundant-transfer elimination will merge them.');
          else if (!moved && st === boardWp?.station)
            check(i, 'Board the right line directly', 'warn', s.span, 'W-S23', `You change lines at your boarding station — just BOARD ${st} ON ${l}.`, 'Redundant-transfer elimination will rewrite the BOARD.');
        }
        if (l && line !== l) {
          closeSegment();
          prevLine = line;
          lastChangeAt = st && reached ? st : null;
          line = l;
          pos = st && reached && (linesAt.get(st) ?? []).includes(l) ? st : null;
          segStart = pos;
          segDir = 0;
          segPoints = pos ? [{ station: pos, stmt: i, kind: 'change', span: s.span }] : [];
        } else if (!l) {
          closeSegment();
          line = null; // unknown target line → suppress dependent checks
          pos = null;
        }
        children.push(tnode(`line: ${s.line.name}`, s.line.span, l ? { type: 'line', color: lineById.get(l)!.color } : { type: 'error' }, [], 'leaf'));
        children.push(tnode(`station: ${s.station.name}`, s.station.span, st ? { type: 'station', interchange: (linesAt.get(st) ?? []).length > 1 ? 'yes' : 'no' } : { type: 'error' }, [], 'leaf'));
        syn = { stops: r ? String(r.stops) : '–', 'line.out': line ?? '?', 'pos.out': pos ?? '?' };
        break;
      }
      case 'exit': {
        const st = resolveS(i, s, s.station);
        const r = st ? advance(i, st, 'exit', s.span) : null;
        resolvedNames[i] = { station: st ?? '' };
        closeSegment();
        children.push(tnode(`station: ${s.station.name}`, s.station.span, st ? { type: 'station', lines: (linesAt.get(st) ?? []).join(', ') } : { type: 'error' }, [], 'leaf'));
        syn = { stops: r ? String(r.stops) : '–', ...(r?.towards ? { dir: `→ ${r.towards}` } : {}) };
        break;
      }
    }

    const mine = checks.filter((c) => c.stmt === i);
    const status = mine.some((c) => c.status === 'fail') ? 'error' : mine.some((c) => c.status === 'warn') ? 'warning' : 'ok';
    const node = tnode(stmtKeyword(s), s.span, { 'line.in': inh.line, 'pos.in': inh.pos, ...syn }, children);
    node.status = status;
    stmtNodes.push(node);
  });

  const ok = diags.errorCount === 0;
  const totalStops = segments.reduce((n, sg) => n + Math.abs(rideInfo(sg.line, sg.from, sg.to)?.stops ?? 0), 0);
  const annotated = tnode('Journey', program.span, ok ? { rides: String(segments.length), stops: String(totalStops), valid: 'true' } : { valid: 'false' }, stmtNodes);

  const bw = boardWp as (Waypoint & { line: LineId }) | null; // assigned inside the forEach closure
  const journey: Journey | null =
    ok && bw
      ? { board: bw, segments, exit: { station: resolvedNames[stmts.length - 1].station, stmt: stmts.length - 1, kind: 'exit', span: program.exit.span }, stmts, resolved: resolvedNames }
      : null;

  // put the structural checks in statement order for the checklist
  checks.sort((a, b) => a.stmt - b.stmt);
  const steps = checks.map((c, i) => ({ check: i, message: `${c.status.toUpperCase()}: ${c.title}${c.detail ? ` — ${c.detail}` : ''}` }));
  return { ok, result: { checks, symbols: symtab.list(), annotated, journey }, steps, diagnostics: diags.list };
}
