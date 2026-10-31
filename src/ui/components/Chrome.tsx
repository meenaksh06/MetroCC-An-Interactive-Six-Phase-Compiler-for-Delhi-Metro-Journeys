/** Pipeline stepper, playback controls, diagnostics list and theory panel. */
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { PHASES, type Diagnostic } from '../../compiler/types';
import { PHASE_META, THEORY } from '../theory';
import { useStore } from '../store';

// ---------------------------------------------------------------- pipeline stepper (metro-line style)

export function PipelineBar() {
  const { phase, setPhase, status, stepOf, stepCount } = useStore();
  return (
    <div className="relative flex items-start justify-between px-4 pb-1 pt-3">
      <div className="absolute left-10 right-10 top-[26px] h-1.5 rounded-full" style={{ background: 'var(--border)' }} />
      {PHASES.map((p, i) => {
        const st = status[p];
        const meta = PHASE_META[p];
        const prog = stepCount(p) ? (stepOf(p) + 1) / stepCount(p) : 0;
        return (
          <div key={p} className="relative z-10 flex flex-1 flex-col items-center">
            {i > 0 && (
              <motion.div
                className="absolute right-1/2 top-[14px] h-1.5"
                style={{ background: st === 'blocked' ? 'transparent' : PHASE_META[PHASES[i - 1]].color, left: '-50%' }}
                initial={false}
                animate={{ opacity: st === 'blocked' ? 0 : 0.9 }}
              />
            )}
            <button
              onClick={() => setPhase(p)}
              disabled={st === 'blocked'}
              title={st === 'blocked' ? 'Blocked by an earlier error' : meta.title}
              className="group flex flex-col items-center gap-1 disabled:cursor-not-allowed"
            >
              <motion.span
                className="relative grid h-8 w-8 place-items-center rounded-full border-[3px] text-xs font-bold"
                style={{
                  borderColor: st === 'blocked' ? 'var(--border)' : st === 'error' ? '#ef4444' : meta.color,
                  background: phase === p ? (st === 'error' ? '#ef4444' : meta.color) : 'var(--panel)',
                  color: phase === p ? (meta.color === '#FFCC00' && st !== 'error' ? '#111' : '#fff') : st === 'blocked' ? 'var(--muted)' : 'var(--text)',
                }}
                animate={{ scale: phase === p ? 1.15 : 1 }}
              >
                {st === 'error' ? '✕' : meta.n}
                {st === 'warning' && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 bg-amber-400" style={{ borderColor: 'var(--panel)' }} />}
                {phase === p && (
                  <svg className="absolute -inset-[7px]" viewBox="0 0 46 46">
                    <circle cx="23" cy="23" r="21" fill="none" stroke={meta.color} strokeOpacity={0.6} strokeWidth="2" strokeDasharray={`${prog * 132} 200`} transform="rotate(-90 23 23)" />
                  </svg>
                )}
              </motion.span>
              <span className={`text-[11px] font-semibold ${phase === p ? '' : 'muted'} ${st === 'blocked' ? 'opacity-40' : ''}`}>{meta.short}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- playback controls

export function Controls() {
  const { step, setStep, stepCount, phase, playing, setPlaying, speed, setSpeed, compileAndAnimate, status } = useStore();
  const total = stepCount(phase);
  const blocked = status[phase] === 'blocked' || total === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-primary" onClick={compileAndAnimate} title="Compile and animate all phases (Ctrl+Enter)">
        ▶ Compile
      </button>
      <div className="mx-1 h-6 w-px" style={{ background: 'var(--border)' }} />
      <button className="btn" onClick={() => setStep(0)} disabled={blocked} title="Reset to first step">⏮</button>
      <button className="btn" onClick={() => setStep(step - 1)} disabled={blocked || step === 0} title="Step back (←)">◀</button>
      <button className="btn w-20" onClick={() => {
        if (!playing && step >= total - 1) setStep(0);
        setPlaying(!playing);
      }} disabled={blocked} title="Auto-play (Space)">
        {playing ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button className="btn" onClick={() => setStep(step + 1)} disabled={blocked || step >= total - 1} title="Step forward (→)">▶</button>
      <button className="btn" onClick={() => setStep(total - 1)} disabled={blocked} title="Show the whole phase instantly">⏭</button>
      <span className="mono min-w-[70px] text-center text-xs muted">{blocked ? '—' : `${step + 1} / ${total}`}</span>
      <label className="flex items-center gap-2 text-xs muted">
        Speed
        <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="w-24 accent-violet-600" />
        <span className="mono w-10">{speed}/s</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- diagnostics

const SEV_STYLE: Record<string, string> = {
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-sky-500',
};
const SEV_ICON: Record<string, string> = { error: '⛔', warning: '⚠️', info: 'ℹ️' };

export function Diagnostics() {
  const { result, setHover, setJumpTo } = useStore();
  const ds = result.diagnostics;
  const errors = ds.filter((d) => d.severity === 'error').length;
  const warns = ds.filter((d) => d.severity === 'warning').length;
  return (
    <div className="card flex min-h-0 flex-col">
      <div className="card-title">
        Problems
        <span className="ml-auto flex gap-3 normal-case tracking-normal">
          <span className={errors ? 'text-red-500' : ''}>⛔ {errors}</span>
          <span className={warns ? 'text-amber-500' : ''}>⚠️ {warns}</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {ds.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-emerald-500">✓ No problems: all six phases compiled cleanly.</div>
        ) : (
          <ul>
            {ds.map((d, i) => (
              <DiagRow key={i} d={d} onHover={setHover} onClick={() => setJumpTo(d.span)} />
            ))}
          </ul>
        )}
      </div>
      {result.failedAt && (
        <div className="border-t px-3 py-2 text-xs text-red-500" style={{ borderColor: 'var(--border)' }}>
          Pipeline stopped in <b>{PHASE_META[result.failedAt].title}</b>: later phases did not run.
        </div>
      )}
    </div>
  );
}

function DiagRow({ d, onHover, onClick }: { d: Diagnostic; onHover: (s: Diagnostic['span'] | null) => void; onClick: () => void }) {
  return (
    <li
      className="cursor-pointer border-b px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      style={{ borderColor: 'var(--border)' }}
      onMouseEnter={() => onHover(d.span)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className="flex items-baseline gap-2">
        <span>{SEV_ICON[d.severity]}</span>
        <span className={`mono text-xs font-semibold ${SEV_STYLE[d.severity]}`}>{d.code}</span>
        <span className="mono text-xs muted">
          {d.span.start.line}:{d.span.start.col}
        </span>
        <span className="flex-1">{d.message}</span>
      </div>
      {d.hint && <div className="ml-7 mt-0.5 text-xs muted">💡 {d.hint}</div>}
    </li>
  );
}

// ---------------------------------------------------------------- theory

export function TheoryPanel() {
  const { phase } = useStore();
  const [open, setOpen] = useState(true);
  const t = THEORY[phase];
  return (
    <div className="card overflow-hidden">
      <button className="card-title w-full text-left" onClick={() => setOpen(!open)}>
        <span>📘 Theory: {t.heading}</span>
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key={phase}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1.5 px-4 py-3 text-[13px] leading-relaxed"
          >
            {t.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_META[phase].color }} />
                <span>{p}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- blocked placeholder

export function Blocked() {
  const { result, setPhase } = useStore();
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div>
        <div className="mb-2 text-4xl">🚧</div>
        <div className="text-lg font-semibold">This phase did not run</div>
        <p className="muted mt-1 max-w-md text-sm">
          The pipeline stopped at <b>{result.failedAt ? PHASE_META[result.failedAt].title : '?'}</b> because of errors. Fix them (see Problems) and every later phase compiles again.
        </p>
        {result.failedAt && (
          <button className="btn mt-4" onClick={() => setPhase(result.failedAt!)}>
            Go to {PHASE_META[result.failedAt].short}
          </button>
        )}
      </div>
    </div>
  );
}
