import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spanContains } from '../../compiler/diagnostics';
import type { CheckStatus } from '../../compiler/semantic/semantic';
import { TreeView } from '../components/TreeView';
import { useStore } from '../store';

const ICON: Record<CheckStatus, string> = { pass: '✓', fail: '✗', warn: '!', skip: '–', info: 'i' };
const COLOR: Record<CheckStatus, string> = { pass: '#10b981', fail: '#ef4444', warn: '#f59e0b', skip: '#94a3b8', info: '#0ea5e9' };

export function SemanticView() {
  const { result, step, setStepSpan, setHover, editorHover, source } = useStore();
  const sem = result.semantic!;
  const checks = sem.result.checks;
  const cur = checks[Math.min(step, checks.length - 1)];
  const [right, setRight] = useState<'tree' | 'symbols'>('tree');
  const [allSymbols, setAllSymbols] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStepSpan(cur?.span ?? null);
    listRef.current?.querySelector('[data-cur="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [cur, setStepSpan]);
  useEffect(() => () => setStepSpan(null), [setStepSpan]);

  const srcLines = source.split('\n');
  const groups = useMemo(() => {
    const g = new Map<number, { idx: number; c: (typeof checks)[number] }[]>();
    checks.forEach((c, idx) => {
      if (idx > step) return;
      if (!g.has(c.stmt)) g.set(c.stmt, []);
      g.get(c.stmt)!.push({ idx, c });
    });
    return [...g.entries()];
  }, [checks, step]);

  const shown = checks.slice(0, step + 1);
  const counts = { pass: 0, fail: 0, warn: 0 } as Record<string, number>;
  shown.forEach((c) => (counts[c.status] = (counts[c.status] ?? 0) + 1));

  // annotated tree: reveal statement nodes whose checks have started
  const visibleStmts = new Set(shown.map((c) => c.stmt));
  const visible = useMemo(() => {
    const v = new Set<string>([sem.result.annotated.id]);
    sem.result.annotated.children.forEach((n, i) => {
      if (visibleStmts.has(i)) {
        v.add(n.id);
        n.children.forEach((c) => v.add(c.id));
      }
    });
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sem, step]);

  const symbols = sem.result.symbols.filter((s) => allSymbols || s.refs.length > 0);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="card flex min-h-[380px] flex-col overflow-hidden">
        <div className="card-title">
          Semantic checks
          <span className="ml-auto flex gap-3 normal-case tracking-normal">
            <span style={{ color: COLOR.pass }}>✓ {counts.pass ?? 0}</span>
            <span style={{ color: COLOR.fail }}>✗ {counts.fail ?? 0}</span>
            <span style={{ color: COLOR.warn }}>! {counts.warn ?? 0}</span>
          </span>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-2">
          {groups.map(([stmt, items]) => {
            const s0 = items[0].c.span.start.line;
            return (
              <div key={stmt} className="mb-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <div className="mono flex gap-2 rounded-t-lg px-2 py-1 text-[12px]" style={{ background: 'var(--panel-2)' }}>
                  <span className="muted">L{s0}</span>
                  <span className="truncate">{srcLines[s0 - 1]?.trim()}</span>
                </div>
                {items.map(({ idx, c }) => (
                  <motion.div
                    key={idx}
                    data-cur={idx === step ? '1' : undefined}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex cursor-pointer gap-2 px-2 py-1 text-[13px] ${idx === step ? 'row-step' : ''} ${spanContains(c.span, editorHover ?? -1) ? 'row-hl' : ''}`}
                    onMouseEnter={() => setHover(c.span)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: COLOR[c.status] }}>
                      {ICON[c.status]}
                    </span>
                    <div className="min-w-0">
                      <div className={c.status === 'skip' ? 'muted' : ''}>
                        {c.title}
                        {c.code && <span className="mono ml-2 text-[11px]" style={{ color: COLOR[c.status] }}>{c.code}</span>}
                      </div>
                      {c.detail && <div className="text-xs muted">{c.detail}</div>}
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })}
        </div>
        {step >= checks.length - 1 && (
          <div className={`border-t px-3 py-2 text-sm font-semibold ${sem.ok ? 'text-emerald-500' : 'text-red-500'}`} style={{ borderColor: 'var(--border)' }}>
            {sem.ok ? '✓ Journey is semantically valid.' : `✗ ${sem.diagnostics.filter((d) => d.severity === 'error').length} semantic error(s): pipeline stops here.`}
          </div>
        )}
      </div>

      <div className="card flex min-h-[380px] flex-col overflow-hidden">
        <div className="card-title">
          <button className={`tab ${right === 'tree' ? 'tab-active' : ''}`} onClick={() => setRight('tree')}>Annotated tree</button>
          <button className={`tab ${right === 'symbols' ? 'tab-active' : ''}`} onClick={() => setRight('symbols')}>Symbol table</button>
          {right === 'symbols' && (
            <label className="ml-auto flex items-center gap-1 normal-case tracking-normal">
              <input type="checkbox" checked={allSymbols} onChange={(e) => setAllSymbols(e.target.checked)} /> show whole global scope
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {right === 'tree' ? (
            <TreeView root={sem.result.annotated} visible={visible} showAttrs />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Attributes</th>
                  <th>Referenced at</th>
                </tr>
              </thead>
              <tbody>
                {symbols.map((s) => (
                  <tr
                    key={`${s.kind}:${s.name}`}
                    className={s.refs.some((r) => spanContains(r, editorHover ?? -1)) ? 'row-hl' : ''}
                    onMouseEnter={() => s.refs[0] && setHover(s.refs[0])}
                    onMouseLeave={() => setHover(null)}
                  >
                    <td className="font-medium">
                      {s.kind === 'line' && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.attrs.color }} />}
                      {s.name}
                    </td>
                    <td className="muted">{s.kind}</td>
                    <td className="text-xs">
                      {Object.entries(s.attrs)
                        .filter(([k]) => k !== 'color')
                        .map(([k, v]) => (
                          <span key={k} className="mr-2 inline-block">
                            <span className="muted">{k}:</span> {v}
                          </span>
                        ))}
                    </td>
                    <td className="mono text-xs muted">{s.refs.map((r) => `L${r.start.line}`).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
