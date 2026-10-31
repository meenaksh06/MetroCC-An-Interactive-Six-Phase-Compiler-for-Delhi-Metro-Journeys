import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spanContains } from '../../compiler/diagnostics';
import { DFA_STATES, DFA_TRANSITIONS, stateById, type StateId } from '../../compiler/lexer/dfa';
import { makePosFn } from '../../compiler/lexer/lexer';
import type { RawToken } from '../../compiler/types';
import { useStore } from '../store';

const TOKEN_COLOR: Record<string, string> = {
  BOARD: '#c084fc', ON: '#c084fc', VIA: '#c084fc', CHANGE: '#c084fc', AT: '#c084fc', EXIT: '#c084fc',
  NAME: '#38bdf8', SEMI: '#94a3b8', EOF: '#94a3b8', WORD: '#38bdf8', QUOTED: '#34d399', WS: '#64748b', COMMENT: '#64748b', ERROR: '#ef4444',
};

export function LexerView() {
  const { result, step, setHover, setStepSpan, editorHover } = useStore();
  const lex = result.lexer;
  const cur = lex.steps[Math.min(step, lex.steps.length - 1)];
  const [showTrivia, setShowTrivia] = useState(false);
  const [tab, setTab] = useState<'auto' | 'raw' | 'final'>('auto');

  const src = useMemo(() => {
    // reconstruct source from raw tokens' spans is lossy; use positions from steps instead
    return result.lexer.result.raw.map((r) => r.lexeme).join('');
  }, [result]);

  const emittedRaw = useMemo(() => {
    const out: RawToken[] = [];
    for (let i = 0; i <= step && i < lex.steps.length; i++) {
      const s = lex.steps[i];
      if ((s.kind === 'emit' || s.kind === 'error') && s.raw) out.push(s.raw);
      else if (s.kind === 'error') {
        const r = lex.result.raw.find((x) => x.kind === 'ERROR' && x.span.start.offset === s.tokenStart);
        if (r) out.push(r);
      }
    }
    return out;
  }, [lex, step]);

  const screened = cur.kind === 'screen' || cur.kind === 'done';
  const showFinal = tab === 'final' || (tab === 'auto' && screened);

  // highlight the lexeme being built in the editor
  useEffect(() => {
    if (cur.kind === 'start' || cur.kind === 'done' || cur.kind === 'screen') {
      setStepSpan(null);
      return;
    }
    const posAt = makePosFn(src);
    const end = cur.kind === 'move' ? cur.offset + 1 : Math.max(cur.offset, cur.tokenStart + 1);
    setStepSpan({ start: posAt(cur.tokenStart), end: posAt(end) });
  }, [cur, src, setStepSpan]);
  useEffect(() => () => setStepSpan(null), [setStepSpan]);

  const activeState: StateId | undefined = cur.kind === 'move' || cur.kind === 'start' ? cur.to : cur.kind === 'emit' ? cur.from : undefined;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-3">
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="card flex min-h-[340px] min-w-0 flex-col overflow-hidden">
        <div className="card-title">Scanner DFA</div>
        <div className="mono border-b px-3 py-1.5 text-[13px]" style={{ borderColor: 'var(--border)' }}>{cur.message}</div>
        <div className="min-h-0 flex-1">
          <DfaDiagram active={activeState} usedEdge={cur.kind === 'move' ? `${cur.from}->${cur.to}` : undefined} emitted={cur.kind === 'emit' ? cur.from : undefined} error={cur.kind === 'error'} stepKey={step} />
        </div>
      </div>

      <div className="card flex min-h-[340px] min-w-0 flex-col overflow-hidden">
        <div className="card-title">
          <button className={`tab ${!showFinal ? 'tab-active' : ''}`} onClick={() => setTab('raw')}>Scanner ({emittedRaw.filter((r) => showTrivia || (r.kind !== 'WS' && r.kind !== 'COMMENT')).length})</button>
          <button className={`tab ${showFinal ? 'tab-active' : ''}`} onClick={() => setTab('final')}>After screener ({lex.result.tokens.length})</button>
          {!showFinal && (
            <label className="ml-auto flex items-center gap-1 normal-case tracking-normal">
              <input type="checkbox" checked={showTrivia} onChange={(e) => setShowTrivia(e.target.checked)} /> trivia
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Lexeme</th>
                <th>{showFinal ? 'Value' : 'DFA state'}</th>
                <th>Line:Col</th>
              </tr>
            </thead>
            <tbody>
              {showFinal
                ? lex.result.tokens.map((t) => (
                    <tr key={t.index} className={spanContains(t.span, editorHover ?? -1) ? 'row-hl' : ''} onMouseEnter={() => setHover(t.span)} onMouseLeave={() => setHover(null)}>
                      <td className="mono muted">{t.index}</td>
                      <td><TypeChip type={t.type} /></td>
                      <td className="mono">{t.type === 'EOF' ? '' : t.lexeme}</td>
                      <td className="mono">{t.value}{t.quoted ? <span className="muted"> (quoted)</span> : null}</td>
                      <td className="mono muted">{t.span.start.line}:{t.span.start.col}</td>
                    </tr>
                  ))
                : emittedRaw
                    .filter((r) => showTrivia || (r.kind !== 'WS' && r.kind !== 'COMMENT'))
                    .map((r, i, arr) => (
                      <motion.tr
                        key={`${r.span.start.offset}-${r.kind}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`${spanContains(r.span, editorHover ?? -1) ? 'row-hl' : ''} ${i === arr.length - 1 && !screened ? 'row-step' : ''}`}
                        onMouseEnter={() => setHover(r.span)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <td className="mono muted">{i}</td>
                        <td><TypeChip type={r.kind} /></td>
                        <td className="mono whitespace-pre">{JSON.stringify(r.lexeme).slice(1, -1)}</td>
                        <td className="mono muted">{stateById.get(r.dfaState as StateId)?.label ?? r.dfaState}</td>
                        <td className="mono muted">{r.span.start.line}:{r.span.start.col}</td>
                      </motion.tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <InputTape src={src} offset={cur.offset} tokenStart={cur.tokenStart} kind={cur.kind} />
    </div>
  );
}

function TypeChip({ type }: { type: string }) {
  const c = TOKEN_COLOR[type] ?? '#94a3b8';
  return (
    <span className="mono rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------- input tape

function InputTape({ src, offset, tokenStart, kind }: { src: string; offset: number; tokenStart: number; kind: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[data-cur="1"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [offset]);
  const chars = [...src];
  return (
    <div className="card min-w-0">
      <div className="card-title">Input tape (▲ = read head, shaded = current lexeme)</div>
      <div ref={ref} className="flex overflow-x-auto px-3 py-2">
        {chars.map((ch, i) => {
          const isCur = i === offset && kind === 'move';
          const inLexeme = i >= tokenStart && i < (kind === 'move' ? offset + 1 : offset) && kind !== 'start' && kind !== 'screen' && kind !== 'done';
          return (
            <div key={i} data-cur={isCur || (kind !== 'move' && i === offset) ? '1' : undefined} className="flex flex-col items-center">
              <span
                className="mono grid h-7 min-w-[20px] place-items-center rounded-sm border px-0.5 text-[13px]"
                style={{
                  borderColor: isCur ? '#FFCC00' : 'var(--border)',
                  background: inLexeme ? 'var(--hl-step)' : 'var(--panel-2)',
                  color: ch === '\n' || ch === ' ' ? 'var(--muted)' : 'var(--text)',
                }}
              >
                {ch === '\n' ? '↵' : ch === ' ' ? '·' : ch === '\t' ? '⇥' : ch}
              </span>
              <span className="h-3 text-[10px] text-amber-400">{isCur ? '▲' : ''}</span>
            </div>
          );
        })}
        <div className="flex flex-col items-center">
          <span className="mono grid h-7 min-w-[24px] place-items-center rounded-sm border text-[11px] muted" style={{ borderColor: 'var(--border)' }}>$</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- DFA diagram

const R = 24;

function DfaDiagram({ active, usedEdge, emitted, error, stepKey }: { active?: StateId; usedEdge?: string; emitted?: StateId; error: boolean; stepKey: number }) {
  return (
    <svg viewBox="0 20 700 470" className="h-full max-h-[480px] w-full">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
        </marker>
        <marker id="arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#FFCC00" />
        </marker>
      </defs>
      {/* start arrow */}
      <line x1={6} y1={215} x2={70 - R - 2} y2={215} stroke="var(--muted)" strokeWidth={1.6} markerEnd="url(#arr)" />
      <text x={6} y={205} fontSize={11} fill="var(--muted)">start</text>

      {DFA_TRANSITIONS.map((t) => {
        const a = stateById.get(t.from)!;
        const b = stateById.get(t.to)!;
        const hot = usedEdge === `${t.from}->${t.to}`;
        const stroke = hot ? '#FFCC00' : 'var(--muted)';
        if (t.from === t.to) {
          const sgn = a.loop === 'down' ? 1 : -1;
          const y0 = a.y + sgn * (R - 3);
          const yc = a.y + sgn * (R + 46);
          const d = `M${a.x - 12},${y0} C${a.x - 38},${yc} ${a.x + 38},${yc} ${a.x + 12},${y0}`;
          return (
            <g key={`${t.from}-${t.to}`}>
              <path d={d} fill="none" stroke={stroke} strokeWidth={hot ? 2.6 : 1.4} markerEnd={hot ? 'url(#arr-hot)' : 'url(#arr)'} />
              <text x={a.x} y={a.y + sgn * (R + 40) + (sgn > 0 ? 10 : 0)} textAnchor="middle" fontSize={11} className="mono" fill={hot ? '#FFCC00' : 'var(--muted)'}>{t.label}</text>
            </g>
          );
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const x1 = a.x + ux * R;
        const y1 = a.y + uy * R;
        const x2 = b.x - ux * (R + 2);
        const y2 = b.y - uy * (R + 2);
        const mx = (x1 + x2) / 2 - uy * 10;
        const my = (y1 + y2) / 2 + ux * 10;
        return (
          <g key={`${t.from}-${t.to}`}>
            <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={hot ? 2.6 : 1.4} markerEnd={hot ? 'url(#arr-hot)' : 'url(#arr)'} />
            <text x={mx - uy * 8} y={my + ux * 8 + 4} textAnchor="middle" fontSize={11} className="mono" fill={hot ? '#FFCC00' : 'var(--muted)'}>{t.label}</text>
          </g>
        );
      })}

      {DFA_STATES.map((s) => {
        const isActive = active === s.id;
        const isEmit = emitted === s.id;
        const fill = isEmit ? '#00A650' : isActive ? (error ? '#ef4444' : '#7E3F98') : 'var(--panel)';
        return (
          <g key={s.id}>
            {isEmit && (
              <motion.circle key={`flash-${stepKey}`} cx={s.x} cy={s.y} r={R} fill="none" stroke="#00A650" strokeWidth={3} initial={{ r: R, opacity: 0.9 }} animate={{ r: R + 22, opacity: 0 }} transition={{ duration: 0.7 }} />
            )}
            <motion.circle cx={s.x} cy={s.y} r={R} initial={false} animate={{ fill }} stroke={isActive || isEmit ? 'transparent' : 'var(--muted)'} strokeWidth={1.6} />
            {s.accepts && <circle cx={s.x} cy={s.y} r={R - 5} fill="none" stroke={isActive || isEmit ? '#fff' : 'var(--muted)'} strokeWidth={1.4} />}
            <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize={13} fontWeight={700} className="mono" fill={isActive || isEmit ? '#fff' : 'var(--text)'}>{s.label}</text>
            {s.accepts && (
              <text x={s.loop === 'down' ? s.x + R + 6 : s.x} y={s.loop === 'down' ? s.y + 4 : s.y + R + 15} textAnchor={s.loop === 'down' ? 'start' : 'middle'} fontSize={11} fontWeight={600} fill="#00A650">{s.accepts}</text>
            )}
            {!s.accepts && s.id !== 'q0' && <text x={s.x} y={s.y + R + 15} textAnchor="middle" fontSize={10} fill="var(--muted)">non-accepting</text>}
          </g>
        );
      })}
      <text x={8} y={484} textAnchor="start" fontSize={10.5} fill="var(--muted)">◎ accepting · after each emit the scanner restarts in q0 · no edge = halt</text>
    </svg>
  );
}
