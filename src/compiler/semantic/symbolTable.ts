/** Symbol table: the global scope is pre-populated from the metro data; references are recorded while checking. */
import { didYouMean } from '../diagnostics';
import { LINES, STATIONS, aliasToStation, isInterchange, lineById, linesAt, stationById } from '../data/graph';
import type { LineId, NameRef, Span } from '../types';

export interface SymbolEntry {
  name: string;
  kind: 'station' | 'line';
  attrs: Record<string, string>;
  refs: Span[];
}

/** Real DMRC lines that exist but are outside this subset — for friendlier messages. */
const UNMODELLED_LINES = ['Pink', 'Magenta', 'Grey', 'Orange', 'Airport', 'Aqua', 'Rapid'];

export type Resolution<T> =
  | { ok: true; value: T; note?: string }
  | { ok: false; code: 'S01' | 'S02' | 'S03'; message: string; hint?: string };

export class SymbolTable {
  readonly entries = new Map<string, SymbolEntry>();

  constructor() {
    for (const l of LINES)
      this.entries.set(`line:${l.id}`, {
        name: l.id,
        kind: 'line',
        attrs: {
          color: l.color,
          stations: String(new Set(l.routes.flatMap((r) => r.stations)).size),
          termini: `${l.routes[0].towards[0]} ↔ ${l.routes[0].towards[1]}`,
          branches: String(l.routes.length),
        },
        refs: [],
      });
    for (const s of STATIONS)
      this.entries.set(`station:${s.id}`, {
        name: s.id,
        kind: 'station',
        attrs: {
          lines: (linesAt.get(s.id) ?? []).join(', '),
          interchange: isInterchange(s.id) ? 'yes' : 'no',
          ...(s.aliases?.length ? { aliases: s.aliases.join(', ') } : {}),
          ...(s.otherLines?.length ? { 'also (not modelled)': s.otherLines.join(', ') } : {}),
        },
        refs: [],
      });
  }

  private ref(kind: 'line' | 'station', name: string, span: Span) {
    this.entries.get(`${kind}:${name}`)?.refs.push(span);
  }

  resolveStation(r: NameRef): Resolution<string> {
    const n = r.name;
    if (stationById.has(n)) {
      this.ref('station', n, r.span);
      return { ok: true, value: n };
    }
    const alias = aliasToStation.get(n);
    if (alias) {
      this.ref('station', alias, r.span);
      return { ok: true, value: alias, note: `“${n}” is an alternate/former name of ${alias}.` };
    }
    if (lineById.has(n)) return { ok: false, code: 'S03', message: `“${n}” is a line, not a station.`, hint: `Use a station name here; ${n} would go after ON or CHANGE.` };
    const ci = [...stationById.keys(), ...aliasToStation.keys()].find((s) => s.toLowerCase() === n.toLowerCase());
    const sug = ci ?? didYouMean(n, [...stationById.keys(), ...aliasToStation.keys()]);
    return {
      ok: false,
      code: 'S01',
      message: `Unknown station “${n}”.`,
      hint: sug ? `Did you mean “${sug}”?${ci ? ' Station names are case-sensitive.' : ''}` : 'Check the station list in the Symbol Table (only a 56-station subset is modelled).',
    };
  }

  resolveLine(r: NameRef): Resolution<LineId> {
    const n = r.name;
    if (lineById.has(n)) {
      this.ref('line', n, r.span);
      return { ok: true, value: n as LineId };
    }
    const bare = n.replace(/\s+line$/i, '');
    const ci = LINES.find((l) => l.id.toLowerCase() === bare.toLowerCase());
    if (ci) return { ok: false, code: 'S02', message: `Unknown line “${n}”.`, hint: `Write just “${ci.id}”.` };
    const station = stationById.has(n) ? n : aliasToStation.get(n);
    if (station)
      return { ok: false, code: 'S03', message: `“${n}” is a station, not a line.`, hint: `${station} is on the ${(linesAt.get(station) ?? []).join('/')} line. Lines: ${LINES.map((l) => l.id).join(', ')}.` };
    const unmodelled = UNMODELLED_LINES.find((u) => u.toLowerCase() === bare.toLowerCase());
    if (unmodelled)
      return { ok: false, code: 'S02', message: `The ${unmodelled} line is not part of MetroCC's map subset.`, hint: `Modelled lines: ${LINES.map((l) => l.id).join(', ')}.` };
    const sug = didYouMean(bare, LINES.map((l) => l.id));
    return { ok: false, code: 'S02', message: `Unknown line “${n}”.`, hint: sug ? `Did you mean “${sug}”?` : `Lines: ${LINES.map((l) => l.id).join(', ')}.` };
  }

  list(): SymbolEntry[] {
    return [...this.entries.values()];
  }
}
