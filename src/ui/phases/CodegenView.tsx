import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { spanContains } from '../../compiler/diagnostics';
import { lineColor } from '../../compiler/data/graph';
import { MetroMap } from '../components/MetroMap';
import { useStore } from '../store';

const KIND_ICON: Record<string, string> = { board: '🚉', ride: '🚇', pass: '·', change: '🔁', exit: '🏁' };

export function CodegenView() {
  const { result, step, setStepSpan, setHover, editorHover } = useStore();
  const cg = result.codegen!;
  const items = cg.result.steps;
  const cur = Math.min(step, items.length - 1);
  const [replay, setReplay] = useState(0);
  const [copied, setCopied] = useState(false);
  const revealedRides = items.slice(0, cur + 1).filter((s) => s.kind === 'ride').length;
  const s = cg.result.summary;

  useEffect(() => {
    setStepSpan(items[cur]?.span ?? null);
  }, [cur, items, setStepSpan]);
  useEffect(() => () => setStepSpan(null), [setStepSpan]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cg.result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid grid-cols-5 gap-1.5">
          {[
            ['Stops', s.stops],
            ['Changes', s.interchanges],
            ['Time', `${s.min} min`],
            ['Distance', `${s.km} km`],
            ['Fare', `₹${s.fare}`],
          ].map(([k, v]) => (
            <div key={k} className="card px-2 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider muted">{k}</div>
              <div className="mono whitespace-nowrap text-[14px] font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="card-title">
            Itinerary (target code)
            <button className="btn ml-auto px-2 py-0.5 text-xs normal-case tracking-normal" onClick={copy}>{copied ? '✓ Copied' : 'Copy text'}</button>
          </div>
          <ol className="min-h-0 flex-1 space-y-1.5 overflow-auto p-3">
            {items.slice(0, cur + 1).map((it, i) => (
              <motion.li
                key={it.instrId + i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 rounded-lg border-l-4 px-3 py-2 ${i === cur ? 'row-step' : ''} ${spanContains(it.span, editorHover ?? -1) ? 'row-hl' : ''}`}
                style={{ borderColor: it.line ? lineColor(it.line) : 'var(--border)', background: i === cur ? undefined : 'var(--panel-2)' }}
                onMouseEnter={() => setHover(it.span)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="text-lg">{KIND_ICON[it.kind]}</span>
                <div>
                  <div className="text-[14px] font-medium">
                    <span className="muted mr-1">{i + 1}.</span>
                    {it.text}
                  </div>
                  {it.detail && <div className="mt-0.5 text-xs muted">{it.detail}</div>}
                </div>
              </motion.li>
            ))}
          </ol>
          <div className="border-t px-3 py-2 text-xs muted" style={{ borderColor: 'var(--border)' }}>
            Fare is charged on the shortest-distance path ({s.fareKm} km), as DMRC does. Time includes ~5 min per interchange.
          </div>
        </div>
      </div>
      <div className="card flex min-h-[420px] flex-col overflow-hidden">
        <div className="card-title">
          Route map
          <button className="btn ml-auto px-2 py-0.5 text-xs normal-case tracking-normal" onClick={() => setReplay((r) => r + 1)}>↻ Replay train</button>
        </div>
        <div className="min-h-0 flex-1 p-2">
          <MetroMap rides={cg.result.path} revealed={revealedRides} replayKey={replay} />
        </div>
      </div>
    </div>
  );
}
