import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { PRESETS } from './examples/presets';
import { Blocked, Controls, Diagnostics, PipelineBar, TheoryPanel } from './ui/components/Chrome';
import { Editor } from './ui/components/Editor';
import { CodegenView } from './ui/phases/CodegenView';
import { IRView } from './ui/phases/IRView';
import { LexerView } from './ui/phases/LexerView';
import { OptimizerView } from './ui/phases/OptimizerView';
import { ParserView } from './ui/phases/ParserView';
import { SemanticView } from './ui/phases/SemanticView';
import { useStore } from './ui/store';
import { PHASE_META } from './ui/theory';

const VIEWS = { lexer: LexerView, parser: ParserView, semantic: SemanticView, ir: IRView, optimizer: OptimizerView, codegen: CodegenView };
const GROUPS = [...new Set(PRESETS.map((p) => p.group))];

export default function App() {
  const { phase, status, presetId, loadPreset, dark, setDark, compileAndAnimate, step, setStep, playing, setPlaying, result } = useStore();
  const View = VIEWS[phase];
  const blocked = status[phase] === 'blocked';

  // keyboard: Ctrl/Cmd+Enter compile; ←/→/space when not typing in the editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        compileAndAnimate();
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest('.cm-editor') || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight') setStep(step + 1);
      else if (e.key === 'ArrowLeft') setStep(step - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying(!playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compileAndAnimate, step, setStep, playing, setPlaying]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <Logo />
        <div className="leading-tight">
          <div className="text-[17px] font-bold tracking-tight">MetroCC</div>
          <div className="text-[11px] muted">A six-phase compiler for Delhi Metro journeys</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="btn max-w-[300px] pr-2 text-sm"
            value={presetId}
            onChange={(e) => loadPreset(e.target.value)}
            title="Example programs (valid and deliberately invalid)"
          >
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.expect.failedAt ? '✗ ' : '✓ '}
                    {p.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="btn" onClick={() => setDark(!dark)} title="Toggle dark / light">
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(340px,34%)_minmax(0,1fr)] lg:overflow-hidden">
        {/* LEFT: source */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="card flex min-h-[240px] flex-1 flex-col overflow-hidden">
            <div className="card-title">
              journey.metro
              <span className="ml-auto normal-case tracking-normal">
                {result.failedAt ? (
                  <span className="text-red-500">✗ fails in {PHASE_META[result.failedAt].short}</span>
                ) : (
                  <span className="text-emerald-500">✓ compiles</span>
                )}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Editor />
            </div>
          </div>
          <div className="flex max-h-[34%] min-h-[110px] flex-col">
            <Diagnostics />
          </div>
          <div className="max-h-[36%] min-h-0 overflow-auto rounded-xl">
            <TheoryPanel />
          </div>
        </section>

        {/* RIGHT: phases */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="card">
            <PipelineBar />
            <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold" style={{ color: PHASE_META[phase].color === '#FFCC00' ? '#d4a300' : PHASE_META[phase].color }}>
                  PHASE {PHASE_META[phase].n}
                </span>
                <span className="text-base font-semibold">{PHASE_META[phase].title}</span>
              </div>
              <div className="ml-auto">
                <Controls />
              </div>
            </div>
          </div>
          <div className="relative min-h-[420px] flex-1 overflow-auto lg:min-h-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase + (blocked ? '-blocked' : '')}
                className="h-full"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {blocked ? <div className="card h-full"><Blocked /></div> : <View />}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8">
      <rect width="32" height="32" rx="8" fill="#111827" />
      <path d="M6 22 L14 10 L26 10" stroke="#FFCC00" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M6 10 L18 22 L26 22" stroke="#7E3F98" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.5" fill="#fff" stroke="#111827" strokeWidth="1.5" />
    </svg>
  );
}
