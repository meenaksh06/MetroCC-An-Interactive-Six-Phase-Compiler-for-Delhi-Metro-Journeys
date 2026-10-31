import { lineColor } from '../../compiler/data/graph';
import { metrics, type IRMetrics } from '../../compiler/ir/irgen';
import { PASSES } from '../../compiler/optimizer/optimizer';
import type { OptimalitySuggestion } from '../../compiler/optimizer/passes/routeOptimality';
import { useStore } from '../store';
import { IRLine } from './IRView';

export function OptimizerView() {
  const { result, step, setStep, passes, setPasses } = useStore();
  const opt = result.optimizer!;
  const cur = opt.steps[Math.min(step, opt.steps.length - 1)];
  const before = opt.result.before;
  const after = cur.after;
  const afterIds = new Set(after.map((i) => i.id));
  const beforeIds = new Set(before.map((i) => i.id));
  const mBefore = opt.result.metricsBefore;
  const mAfter = metrics(after);
  const sug = opt.result.suggestion;
  const showSuggestion = cur.pass === 'routeOptimality';

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="card">
          <div className="card-title">Passes (toggle to re-run · click to step)</div>
          <div className="p-2">
            {PASSES.map((p, i) => {
              const st = opt.steps[i];
              const changed = st.enabled && st.log[0] !== 'No change.';
              return (
                <div key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 ${i === step ? 'row-step' : ''} ${i > step ? 'opacity-50' : ''}`} onClick={() => setStep(i)}>
                  <input
                    type="checkbox"
                    className="mt-1 accent-emerald-600"
                    checked={passes[p.id]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPasses({ ...passes, [p.id]: e.target.checked })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="muted">{i + 1}.</span> {p.title}
                      <span className="rounded px-1.5 text-[10px] font-medium uppercase muted" style={{ background: 'var(--panel-2)' }}>{p.kind}</span>
                      {i <= step && st.enabled && <span className={`ml-auto text-xs ${changed ? 'text-emerald-500' : 'muted'}`}>{changed ? 'applied' : 'no change'}</span>}
                    </div>
                    <div className="text-xs muted">{p.description}</div>
                    {i <= step && (
                      <ul className="mt-1 space-y-0.5">
                        {st.log.map((l, k) => (
                          <li key={k} className="mono text-[11.5px]">› {l}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <Metrics before={mBefore} after={mAfter} />
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <div className="card flex min-h-[260px] flex-1 flex-col overflow-hidden">
          <div className="card-title">
            IR diff: naive → after pass {step + 1}
            <span className="ml-auto normal-case tracking-normal">
              {before.length} → {after.length} instructions
            </span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-auto p-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase muted">Before</div>
              {before.map((i, n) => (
                <IRLine key={i.id} ins={i} n={n} compact state={afterIds.has(i.id) ? undefined : 'removed'} />
              ))}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase muted">After</div>
              {after.map((i, n) => (
                <IRLine key={i.id} ins={i} n={n} compact state={beforeIds.has(i.id) ? undefined : 'added'} />
              ))}
            </div>
          </div>
        </div>
        {showSuggestion && sug && <Suggestion sug={sug} />}
      </div>
    </div>
  );
}

function Metrics({ before, after }: { before: IRMetrics; after: IRMetrics }) {
  const rows: [string, keyof IRMetrics, string][] = [
    ['IR instructions', 'instructions', ''],
    ['Stops', 'stops', ''],
    ['Interchanges', 'interchanges', ''],
    ['Travel time', 'min', ' min'],
    ['Distance', 'km', ' km'],
    ['Fare (shortest-path rule)', 'fare', ''],
  ];
  return (
    <div className="card">
      <div className="card-title">Metrics</div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Before</th>
            <th>After</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, k, unit]) => {
            const d = Math.round((after[k] - before[k]) * 10) / 10;
            return (
              <tr key={k}>
                <td>{label}</td>
                <td className="mono">{k === 'fare' ? `₹${before[k]}` : before[k] + unit}</td>
                <td className="mono font-semibold">{k === 'fare' ? `₹${after[k]}` : after[k] + unit}</td>
                <td className={`mono ${d < 0 ? 'text-emerald-500' : d > 0 ? 'text-red-500' : 'muted'}`}>{d === 0 ? '—' : d > 0 ? `+${d}` : d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Suggestion({ sug }: { sug: OptimalitySuggestion }) {
  const Legs = ({ legs }: { legs: { line: string; from: string; to: string; stops: number }[] }) => (
    <div className="flex flex-wrap items-center gap-1">
      {legs.map((l, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="muted">⇄</span>}
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: lineColor(l.line), color: l.line === 'Yellow' ? '#111' : '#fff' }}>
            {l.line}
          </span>
          <span className="text-xs">{l.from} → {l.to} ({l.stops})</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`card border-2 ${sug.better ? 'border-amber-400/60' : 'border-emerald-500/50'}`}>
      <div className="card-title">🧭 Route-optimality (Dijkstra) {sug.better ? '— suggestion' : '— optimal ✓'}</div>
      <div className="grid gap-3 p-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase muted">Your route</div>
          <div className="mono text-lg font-bold">{sug.yours.stops} stops · {sug.yours.min} min</div>
          <div className="text-xs muted">{sug.yours.interchanges} interchange(s) · {sug.yours.km} km</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase muted">Optimal (fastest)</div>
          <div className="mono text-lg font-bold text-emerald-500">{sug.optimal.stops} stops · {sug.optimal.min} min</div>
          <div className="text-xs muted">{sug.optimal.interchanges} interchange(s) · {sug.optimal.km} km</div>
        </div>
        <div className="sm:col-span-2">
          <Legs legs={sug.optimal.legs} />
          <p className="mt-2 text-xs muted">
            {sug.better
              ? `A faster route saves ${sug.savingMin} min. It is shown as a suggestion only: an optimizer must preserve the program's meaning, and the route you wrote is part of that meaning.`
              : 'Your route is already the fastest on this map.'}
          </p>
        </div>
      </div>
    </div>
  );
}

