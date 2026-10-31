/**
 * Route-optimality analysis: Dijkstra over the metro graph (line-copies of
 * stations + interchange edges weighted by transfer time). The result is a
 * SUGGESTION — the user's program is never silently rewritten.
 */
import { INTERCHANGE_MIN, shortestPath, type PathResult } from '../../data/graph';
import { metrics, type IRInstr, type IRMetrics } from '../../ir/irgen';

export interface OptimalitySuggestion {
  from: string;
  to: string;
  yours: IRMetrics;
  optimal: PathResult;
  fewestStops: PathResult;
  better: boolean; // optimal is strictly faster
  savingMin: number;
}

export function routeOptimality(ir: IRInstr[], log: string[]): OptimalitySuggestion | undefined {
  const from = ir.find((i) => i.op === 'BOARD')?.station;
  const to = ir.find((i) => i.op === 'ALIGHT')?.station;
  if (!from || !to) return;
  const optimal = shortestPath(from, to, 'time');
  const fewestStops = shortestPath(from, to, 'distance');
  if (!optimal || !fewestStops) return;
  const yours = metrics(ir);
  const better = optimal.min < yours.min;
  log.push(`Dijkstra (time, +${INTERCHANGE_MIN} min per interchange): ${from} → ${to} = ${optimal.stops} stops, ${optimal.interchanges} interchange(s), ${optimal.min} min.`);
  log.push(
    better
      ? `Your route: ${yours.stops} stops, ${yours.interchanges} interchange(s), ${yours.min} min — a faster route exists (saves ${yours.min - optimal.min} min).`
      : `Your route (${yours.min} min) is already optimal.`,
  );
  return { from, to, yours, optimal, fewestStops, better, savingMin: Math.max(0, yours.min - optimal.min) };
}
