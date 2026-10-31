/** Builds the LL(1) predictive parsing table M[A, a] and reports any conflicts. */
import { EPSILON, NONTERMINALS, PRODUCTIONS, type NonTerminal, type Production } from './grammar';
import { computeFirstFollow, type FirstFollow } from './firstFollow';

export interface LL1Table {
  table: Map<NonTerminal, Map<string, Production>>;
  conflicts: { nt: NonTerminal; terminal: string; productions: number[] }[];
  ff: FirstFollow;
}

export function buildLL1Table(productions: Production[] = PRODUCTIONS, nonterminals: NonTerminal[] = NONTERMINALS): LL1Table {
  const ff = computeFirstFollow(productions, nonterminals);
  const table = new Map<NonTerminal, Map<string, Production>>();
  for (const nt of nonterminals) table.set(nt, new Map());
  const conflicts: LL1Table['conflicts'] = [];

  const put = (p: Production, a: string) => {
    const row = table.get(p.lhs)!;
    const existing = row.get(a);
    if (existing && existing.id !== p.id) conflicts.push({ nt: p.lhs, terminal: a, productions: [existing.id, p.id] });
    else row.set(a, p);
  };

  for (const p of productions) {
    const f = ff.firstOfSeq(p.rhs);
    for (const a of f) if (a !== EPSILON) put(p, a);
    if (f.has(EPSILON)) for (const b of ff.follow.get(p.lhs)!) put(p, b);
  }
  return { table, conflicts, ff };
}

/** Shared, memoised table for the MetroCC grammar. */
export const LL1 = buildLL1Table();
