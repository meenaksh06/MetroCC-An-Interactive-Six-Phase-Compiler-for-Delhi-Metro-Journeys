/** FIRST / FOLLOW sets computed by fixed-point iteration over any grammar. */
import { EPSILON, NONTERMINALS, PRODUCTIONS, START, TERMINALS, isTerminal, type GSymbol, type NonTerminal, type Production } from './grammar';

export interface FirstFollow {
  first: Map<GSymbol, Set<string>>;
  follow: Map<NonTerminal, Set<string>>;
  firstOfSeq: (seq: GSymbol[]) => Set<string>;
  iterations: { first: number; follow: number };
}

export function computeFirstFollow(
  productions: Production[] = PRODUCTIONS,
  nonterminals: NonTerminal[] = NONTERMINALS,
  start: NonTerminal = START,
): FirstFollow {
  const first = new Map<GSymbol, Set<string>>();
  for (const t of TERMINALS) first.set(t, new Set([t]));
  for (const nt of nonterminals) first.set(nt, new Set());

  const firstOfSeq = (seq: GSymbol[]): Set<string> => {
    const out = new Set<string>();
    for (const s of seq) {
      const f = first.get(s)!;
      for (const x of f) if (x !== EPSILON) out.add(x);
      if (!f.has(EPSILON)) return out;
    }
    out.add(EPSILON); // every symbol (or none) can derive ε
    return out;
  };

  let firstIter = 0;
  for (let changed = true; changed; ) {
    changed = false;
    firstIter++;
    for (const p of productions) {
      const target = first.get(p.lhs)!;
      const before = target.size;
      for (const x of firstOfSeq(p.rhs)) target.add(x);
      if (target.size !== before) changed = true;
    }
  }

  const follow = new Map<NonTerminal, Set<string>>();
  for (const nt of nonterminals) follow.set(nt, new Set());
  follow.get(start)!.add('$');

  let followIter = 0;
  for (let changed = true; changed; ) {
    changed = false;
    followIter++;
    for (const p of productions)
      p.rhs.forEach((sym, i) => {
        if (isTerminal(sym)) return;
        const target = follow.get(sym as NonTerminal)!;
        const before = target.size;
        const rest = firstOfSeq(p.rhs.slice(i + 1));
        for (const x of rest) if (x !== EPSILON) target.add(x);
        if (rest.has(EPSILON)) for (const x of follow.get(p.lhs)!) target.add(x);
        if (target.size !== before) changed = true;
      });
  }

  return { first, follow, firstOfSeq, iterations: { first: firstIter, follow: followIter } };
}
