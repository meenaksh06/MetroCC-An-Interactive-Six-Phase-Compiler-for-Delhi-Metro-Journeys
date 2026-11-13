/**
 * Route-optimality analysis: Dijkstra over the metro graph (line-copies of
 * stations + interchange edges weighted by transfer time). The result is a
 * SUGGESTION — the user's program is never silently rewritten.
 *
 * Dijkstra runs under three cost functions, giving three alternatives:
 *   fastest (time), fewest changes (transfers, ties broken by time) and
 *   shortest distance. Each alternative is also emitted as MetroCC source.
 */
import { INTERCHANGE_MIN, formatClock, pathToSource, shortestPath, type PathResult } from '../../data/graph';
import { metrics, type IRInstr, type IRMetrics } from '../../ir/irgen';

export interface OptimalitySuggestion {
  from: string;
  to: string;
  yours: IRMetrics;
  optimal: PathResult;
  fewestStops: PathResult;
  fewestChanges: PathResult;
  better: boolean; // optimal is strictly faster
  savingMin: number;
  /** each alternative as a ready-to-compile MetroCC program (undefined if the language cannot express it) */
  sources: { fastest?: string; fewestChanges?: string; shortest?: string };
}

export function routeOptimality(ir: IRInstr[], log: string[]): OptimalitySuggestion | undefined {
  const from = ir.find((i) => i.op === 'BOARD')?.station;
  const to = ir.find((i) => i.op === 'ALIGHT')?.station;
  if (!from || !to) return;
  const optimal = shortestPath(from, to, 'time');
  const fewestStops = shortestPath(from, to, 'distance');
  const fewestChanges = shortestPath(from, to, 'transfers');
  if (!optimal || !fewestStops || !fewestChanges) return;
  const yours = metrics(ir);
  const better = optimal.min < yours.min;
  log.push(`Dijkstra (time, +${INTERCHANGE_MIN} min per interchange): ${from} → ${to} = ${optimal.stops} stops, ${optimal.interchanges} interchange(s), ${optimal.min} min.`);
  log.push(
    better
      ? `Your route: ${yours.stops} stops, ${yours.interchanges} interchange(s), ${yours.min} min — a faster route exists (saves ${yours.min - optimal.min} min).`
      : `Your route (${yours.min} min) is already optimal.`,
  );
  if (fewestChanges.interchanges < optimal.interchanges)
    log.push(`Dijkstra (fewest changes): ${fewestChanges.interchanges} interchange(s), ${fewestChanges.min} min — ${fewestChanges.min - optimal.min} min slower than the fastest route but with fewer changes.`);
  else log.push(`Dijkstra (fewest changes): the fastest route already has the fewest interchanges (${optimal.interchanges}).`);
  const t = ir.find((i) => i.op === 'BOARD')?.time;
  const depart = t !== undefined ? formatClock(t) : undefined;
  return {
    from, to, yours, optimal, fewestStops, fewestChanges, better,
    savingMin: Math.max(0, yours.min - optimal.min),
    sources: { fastest: pathToSource(optimal, depart), fewestChanges: pathToSource(fewestChanges, depart), shortest: pathToSource(fewestStops, depart) },
  };
}
