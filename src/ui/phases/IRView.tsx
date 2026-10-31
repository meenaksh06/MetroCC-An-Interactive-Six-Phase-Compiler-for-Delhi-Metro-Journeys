import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { spanContains } from '../../compiler/diagnostics';
import { lineColor } from '../../compiler/data/graph';
import { formatInstr, type BasicBlock, type IRInstr } from '../../compiler/ir/irgen';
import { useStore } from '../store';

export const OP_COLOR: Record<string, string> = { BOARD: '#10b981', RIDE: '#38bdf8', PASS: '#94a3b8', TRANSFER: '#f59e0b', ALIGHT: '#ef4444' };

export function IRLine({ ins, n, active, state, compact }: { ins: IRInstr; n?: number; active?: boolean; state?: 'removed' | 'added'; compact?: boolean }) {
  const { setHover, editorHover } = useStore();
  const [op, ...rest] = formatInstr(ins).split(/\s+/);
  const bg = state === 'removed' ? 'rgba(239,68,68,.12)' : state === 'added' ? 'rgba(16,185,129,.14)' : undefined;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className={`mono flex items-start gap-2 rounded px-2 py-[3px] ${compact ? 'text-[12px]' : 'text-[13px]'} ${active ? 'row-step' : ''} ${spanContains(ins.span, editorHover ?? -1) ? 'row-hl' : ''}`}
      style={{ background: bg }}
      onMouseEnter={() => setHover(ins.span)}
      onMouseLeave={() => setHover(null)}
    >
      {n !== undefined && <span className="w-6 text-right text-[11px] muted">{n}</span>}
      <span className="w-3 text-center text-[11px] font-bold" style={{ color: state === 'removed' ? '#ef4444' : '#10b981' }}>{state === 'removed' ? '−' : state === 'added' ? '+' : ''}</span>
      <span className={`${compact ? 'w-[66px]' : 'w-[74px]'} shrink-0 font-semibold`} style={{ color: OP_COLOR[ins.op] }}>{op}</span>
      <span className={state === 'removed' ? 'line-through opacity-60' : ''}>
        {rest.join(' ')}
        {ins.op === 'RIDE' && !compact && <span className="ml-2 text-[11px] muted">; {ins.stops} stops, {ins.min} min</span>}
      </span>
    </motion.div>
  );
}

export function IRView() {
  const { result, step, setStepSpan } = useStore();
  const ir = result.ir!;
  const list = ir.result.ir;
  const cur = ir.steps[Math.min(step, ir.steps.length - 1)];
  const shown = list.slice(0, (cur?.instr ?? 0) + 1);

  useEffect(() => {
    setStepSpan(list[cur?.instr ?? 0]?.span ?? null);
  }, [cur, list, setStepSpan]);
  useEffect(() => () => setStepSpan(null), [setStepSpan]);

  const shownIds = new Set(shown.map((i) => i.id));
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="card flex min-h-[340px] flex-col overflow-hidden">
        <div className="card-title">
          Three-address IR
          <span className="ml-auto normal-case tracking-normal">{shown.length} / {list.length} instructions</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {shown.map((ins, i) => (
            <IRLine key={ins.id} ins={ins} n={i} active={i === cur?.instr} />
          ))}
        </div>
        <div className="border-t px-3 py-2 text-xs muted" style={{ borderColor: 'var(--border)' }}>
          <span className="mono">{cur?.message}</span>
        </div>
      </div>
      <div className="card flex min-h-[340px] flex-col overflow-hidden">
        <div className="card-title">Basic blocks / control-flow graph</div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <CFG blocks={ir.result.blocks} instrs={list} shownIds={shownIds} />
        </div>
      </div>
    </div>
  );
}

export function CFG({ blocks, instrs, shownIds }: { blocks: BasicBlock[]; instrs: IRInstr[]; shownIds?: Set<string> }) {
  const byId = new Map(instrs.map((i) => [i.id, i]));
  return (
    <div className="flex flex-col items-center gap-0">
      <Pill label="ENTRY" />
      {blocks.map((b) => {
        const vis = b.instrs.filter((id) => !shownIds || shownIds.has(id));
        if (!vis.length) return null;
        const c = lineColor(b.line);
        return (
          <div key={b.id} className="flex w-full flex-col items-center">
            <Arrow label={undefined} />
            <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md overflow-hidden rounded-lg border-2" style={{ borderColor: c }}>
              <div className="flex items-center justify-between px-2 py-1 text-xs font-bold" style={{ background: c, color: b.line === 'Yellow' ? '#111' : '#fff' }}>
                <span>{b.id}</span>
                <span>{b.line} line</span>
              </div>
              <div className="p-1">
                {vis.map((id) => {
                  const ins = byId.get(id)!;
                  return (
                    <div key={id} className="mono truncate px-1 text-[12px]">
                      <span style={{ color: OP_COLOR[ins.op] }} className="font-semibold">{ins.op}</span> {formatInstr(ins).split(/\s+/).slice(1).join(' ')}
                    </div>
                  );
                })}
              </div>
            </motion.div>
            {b.succ.length > 0 && <div className="mono mt-1 text-[11px] muted">↓ jump to {b.succ.join(', ')}</div>}
          </div>
        );
      })}
      <Arrow />
      <Pill label="EXIT" />
    </div>
  );
}

const Pill = ({ label }: { label: string }) => (
  <span className="mono rounded-full border px-3 py-0.5 text-[11px] font-bold muted" style={{ borderColor: 'var(--border)' }}>
    {label}
  </span>
);
const Arrow = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center">
    <div className="h-4 w-px" style={{ background: 'var(--muted)' }} />
    <span className="-mt-1 text-[10px] muted">▼{label}</span>
  </div>
);
