import { useEffect, useMemo, useRef, useState } from 'react';
import { spanContains } from '../../compiler/diagnostics';
import { BNF, NONTERMINALS, PRODUCTIONS, TERMINALS, displaySym, productionText } from '../../compiler/parser/grammar';
import { LL1 } from '../../compiler/parser/ll1Table';
import { astToTree } from '../../compiler/parser/ast';
import type { Token } from '../../compiler/types';
import { TreeView } from '../components/TreeView';
import { useStore } from '../store';

type Tab = 'trace' | 'table' | 'grammar';

export function ParserView() {
  const { result, step, setStepSpan } = useStore();
  const parse = result.parser!;
  const tokens = result.lexer.result.tokens;
  const [view, setView] = useState<'parse' | 'ast'>('parse');
  const [tab, setTab] = useState<Tab>('trace');
  const cur = parse.steps[Math.min(step, parse.steps.length - 1)];

  const visible = useMemo(() => {
    const s = new Set<string>();
    for (const [id, at] of Object.entries(parse.result.nodeStep)) if (at <= step) s.add(id);
    return s;
  }, [parse, step]);

  const ast = useMemo(() => (parse.result.ast ? astToTree(parse.result.ast) : null), [parse]);
  const atEnd = step >= parse.steps.length - 1;

  useEffect(() => {
    const t = tokens[cur.ip];
    setStepSpan(t && t.type !== 'EOF' ? t.span : null);
  }, [cur, tokens, setStepSpan]);
  useEffect(() => () => setStepSpan(null), [setStepSpan]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="card flex min-h-[380px] flex-col overflow-hidden">
        <div className="card-title">
          <button className={`tab ${view === 'parse' ? 'tab-active' : ''}`} onClick={() => setView('parse')}>Parse tree</button>
          <button className={`tab ${view === 'ast' ? 'tab-active' : ''}`} onClick={() => setView('ast')} disabled={!ast}>
            AST {!ast && '(needs a valid parse)'}
          </button>
          <span className="ml-auto normal-case tracking-normal">
            {cur.kind === 'accept' ? <b className="text-emerald-500">ACCEPTED</b> : cur.kind === 'reject' ? <b className="text-red-500">REJECTED</b> : `${visible.size} nodes`}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          {view === 'parse' || !ast ? (
            <TreeView root={parse.result.tree} visible={atEnd ? undefined : visible} activeIds={cur.nodeIds} showAttrs={false} />
          ) : (
            <TreeView root={ast} />
          )}
        </div>
      </div>

      <div className="card flex min-h-[380px] flex-col overflow-hidden">
        <div className="card-title">
          <button className={`tab ${tab === 'trace' ? 'tab-active' : ''}`} onClick={() => setTab('trace')}>PDA trace</button>
          <button className={`tab ${tab === 'table' ? 'tab-active' : ''}`} onClick={() => setTab('table')}>LL(1) table</button>
          <button className={`tab ${tab === 'grammar' ? 'tab-active' : ''}`} onClick={() => setTab('grammar')}>Grammar · FIRST/FOLLOW</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === 'trace' && <Trace tokens={tokens} />}
          {tab === 'table' && <TableView />}
          {tab === 'grammar' && <GrammarView />}
        </div>
      </div>
    </div>
  );
}

const tokShort = (t: Token) => (t.type === 'EOF' ? '$' : t.type === 'NAME' ? `“${t.value.length > 14 ? t.value.slice(0, 13) + '…' : t.value}”` : displaySym(t.type));

function Trace({ tokens }: { tokens: Token[] }) {
  const { result, step, setStep, setHover, editorHover } = useStore();
  const steps = result.parser!.steps;
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [step]);
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>#</th>
          <th>Stack (top →)</th>
          <th>Input</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {steps.slice(0, step + 1).map((s, i) => {
          const tok = tokens[s.ip];
          const special = s.kind === 'init' || s.kind === 'accept' || s.kind === 'reject';
          const color =
            s.kind === 'accept' ? 'text-emerald-500 font-bold' : s.kind === 'reject' ? 'text-red-500 font-bold' : s.kind === 'error' || s.kind === 'pop' || s.kind === 'skip' ? 'text-red-400' : s.kind === 'match' ? 'text-sky-500' : '';
          return (
            <tr
              key={i}
              ref={i === step ? ref : undefined}
              className={`cursor-pointer ${i === step ? 'row-step' : ''} ${tok && spanContains(tok.span, editorHover ?? -1) ? 'row-hl' : ''}`}
              style={special ? { background: s.kind === 'accept' ? 'rgba(16,185,129,.14)' : s.kind === 'reject' ? 'rgba(239,68,68,.12)' : 'rgba(126,63,152,.12)' } : undefined}
              onClick={() => setStep(i)}
              onMouseEnter={() => tok && tok.type !== 'EOF' && setHover(tok.span)}
              onMouseLeave={() => setHover(null)}
            >
              <td className="mono muted">{i}</td>
              <td className="mono break-words text-[11.5px]" style={{ maxWidth: 200 }}>{s.stack.map(displaySym).join(' ')}</td>
              <td className="mono whitespace-nowrap text-[11.5px]">
                {tokens.slice(s.ip, s.ip + 3).map(tokShort).join(' ')}
                {s.ip + 3 < tokens.length && ' …'}
              </td>
              <td className={`text-[12px] ${color} ${s.suppressed ? 'opacity-60' : ''}`}>
                {s.kind === 'init' && <b>INIT </b>}
                {s.action}
                {s.suppressed && ' (error suppressed)'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TableView() {
  const { result, step } = useStore();
  const s = result.parser!.steps[step];
  const tokens = result.lexer.result.tokens;
  const usedNt = s?.kind === 'expand' ? PRODUCTIONS.find((p) => p.id === s.production)?.lhs : undefined;
  const usedT = s?.kind === 'expand' ? (tokens[s.ip]?.type === 'EOF' ? '$' : tokens[s.ip]?.type) : undefined;
  return (
    <div className="p-2">
      <table className="tbl">
        <thead>
          <tr>
            <th>M[A, a]</th>
            {TERMINALS.map((t) => (
              <th key={t} className="mono text-center">{displaySym(t)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NONTERMINALS.map((nt) => (
            <tr key={nt}>
              <td className="mono font-semibold">{nt}</td>
              {TERMINALS.map((t) => {
                const p = LL1.table.get(nt)!.get(t);
                const hot = usedNt === nt && usedT === t;
                return (
                  <td key={t} className={`mono text-center text-[12px] ${hot ? 'row-hl font-bold' : ''}`} title={p ? productionText(p) : 'error entry'}>
                    {p ? p.id : <span className="muted opacity-40">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 grid gap-0.5 text-[12px]">
        {PRODUCTIONS.map((p) => (
          <div key={p.id} className={`mono rounded px-1 ${s?.production === p.id ? 'row-hl' : ''}`}>
            <span className="muted">{p.id}.</span> {productionText(p)}
          </div>
        ))}
      </div>
      <p className="muted mt-3 text-xs">
        {LL1.conflicts.length === 0 ? '✓ No cell holds two productions, so the grammar is LL(1).' : `✗ ${LL1.conflicts.length} conflicts`} Empty cells (·) are error entries that trigger panic-mode recovery.
      </p>
    </div>
  );
}

function GrammarView() {
  const { first, follow } = LL1.ff;
  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider muted">Context-free grammar (BNF)</div>
        <pre className="mono overflow-x-auto rounded-lg p-3 text-[12.5px] leading-relaxed" style={{ background: 'var(--panel-2)' }}>{BNF}</pre>
        <p className="muted mt-1 text-xs">Terminals: BOARD ON VIA CHANGE AT EXIT NAME ";" $. &lt;station&gt; and &lt;line&gt; are roles of NAME; they are told apart in semantic analysis.</p>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Non-terminal</th>
            <th>FIRST</th>
            <th>FOLLOW</th>
          </tr>
        </thead>
        <tbody>
          {NONTERMINALS.map((nt) => (
            <tr key={nt}>
              <td className="mono font-semibold">{nt}</td>
              <td className="mono text-[12px]">{`{ ${[...first.get(nt)!].map(displaySym).join(', ')} }`}</td>
              <td className="mono text-[12px]">{`{ ${[...follow.get(nt)!].map(displaySym).join(', ')} }`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted text-xs">
        Computed by fixed-point iteration ({LL1.ff.iterations.first} rounds for FIRST, {LL1.ff.iterations.follow} for FOLLOW). LL(1) check: FIRST(route_stmt route_list) ∩ FOLLOW(route_list) = {'{VIA, CHANGE}'} ∩ {'{EXIT}'} = ∅.
      </p>
    </div>
  );
}
