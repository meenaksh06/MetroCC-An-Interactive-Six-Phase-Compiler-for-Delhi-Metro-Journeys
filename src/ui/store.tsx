/** App state: source, compile result, per-phase step cursors, playback and linked highlighting. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALL_PASSES, type PassOptions } from '../compiler/optimizer/optimizer';
import { compile, type CompileResult } from '../compiler/pipeline';
import { PHASES, type PhaseId, type Span } from '../compiler/types';
import { PRESETS } from '../examples/presets';

export type PhaseStatus = 'ok' | 'warning' | 'error' | 'blocked';

interface Store {
  source: string;
  setSource: (s: string) => void;
  presetId: string;
  loadPreset: (id: string) => void;
  result: CompileResult;
  passes: PassOptions;
  setPasses: (p: PassOptions) => void;
  phase: PhaseId;
  setPhase: (p: PhaseId) => void;
  status: Record<PhaseId, PhaseStatus>;
  stepCount: (p: PhaseId) => number;
  step: number; // step cursor of the active phase
  setStep: (n: number) => void;
  stepOf: (p: PhaseId) => number;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  speed: number; // steps per second
  setSpeed: (n: number) => void;
  compileAndAnimate: () => void;
  /** span hovered in a phase view → highlighted in the editor */
  hover: Span | null;
  setHover: (s: Span | null) => void;
  /** span of the current step → highlighted in the editor */
  stepSpan: Span | null;
  setStepSpan: (s: Span | null) => void;
  /** offset hovered in the editor → highlighted in phase views */
  editorHover: number | null;
  setEditorHover: (n: number | null) => void;
  /** request the editor to reveal/select a span */
  jumpTo: Span | null;
  setJumpTo: (s: Span | null) => void;
  dark: boolean;
  setDark: (b: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

const countSteps = (r: CompileResult, p: PhaseId): number => {
  switch (p) {
    case 'lexer':
      return r.lexer.steps.length;
    case 'parser':
      return r.parser?.steps.length ?? 0;
    case 'semantic':
      return r.semantic?.result.checks.length ?? 0;
    case 'ir':
      return r.ir?.steps.length ?? 0;
    case 'optimizer':
      return r.optimizer?.steps.length ?? 0;
    case 'codegen':
      return r.codegen?.steps.length ?? 0;
  }
};

function readDark() {
  try {
    const v = localStorage.getItem('metrocc-theme');
    if (v) return v === 'dark';
  } catch {
    /* storage unavailable */
  }
  return true;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [source, setSourceRaw] = useState(PRESETS[0].source);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [passes, setPasses] = useState<PassOptions>(ALL_PASSES);
  const [debounced, setDebounced] = useState(source);
  const [phase, setPhaseRaw] = useState<PhaseId>('lexer');
  const [steps, setSteps] = useState<Record<PhaseId, number>>({ lexer: 0, parser: 0, semantic: 0, ir: 0, optimizer: 0, codegen: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);
  const [hover, setHover] = useState<Span | null>(null);
  const [stepSpan, setStepSpan] = useState<Span | null>(null);
  const [editorHover, setEditorHover] = useState<number | null>(null);
  const [jumpTo, setJumpTo] = useState<Span | null>(null);
  const [dark, setDarkRaw] = useState(readDark);
  const animateNext = useRef(false);
  const jumpToFailure = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('metrocc-theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);

  // live compile, debounced
  useEffect(() => {
    const t = setTimeout(() => setDebounced(source), 250);
    return () => clearTimeout(t);
  }, [source]);

  const result = useMemo(() => compile(debounced, passes), [debounced, passes]);

  const status = useMemo(() => {
    const s = {} as Record<PhaseId, PhaseStatus>;
    let blocked = false;
    for (const p of PHASES) {
      if (blocked) {
        s[p] = 'blocked';
        continue;
      }
      const ds = result.diagnostics.filter((d) => d.phase === p);
      if (result.failedAt === p) {
        s[p] = 'error';
        blocked = true;
      } else s[p] = ds.some((d) => d.severity === 'warning') ? 'warning' : 'ok';
    }
    return s;
  }, [result]);

  // new result → show every phase fully computed (or from 0 when animating)
  useEffect(() => {
    const next = {} as Record<PhaseId, number>;
    for (const p of PHASES) next[p] = animateNext.current ? 0 : Math.max(0, countSteps(result, p) - 1);
    setSteps(next);
    if (animateNext.current) {
      animateNext.current = false;
      setPhaseRaw('lexer');
      setPlaying(true);
    } else if (jumpToFailure.current) {
      jumpToFailure.current = false;
      setPhaseRaw(result.failedAt ?? 'lexer');
    } else if (status[phase] === 'blocked') {
      setPhaseRaw(result.failedAt ?? 'lexer');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const stepCount = useCallback((p: PhaseId) => countSteps(result, p), [result]);
  const setStep = useCallback(
    (n: number) => setSteps((s) => ({ ...s, [phase]: Math.max(0, Math.min(n, countSteps(result, phase) - 1)) })),
    [phase, result],
  );

  // auto-play: advance the active phase; at the end move on to the next phase
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setSteps((s) => {
        const total = countSteps(result, phase);
        if (s[phase] < total - 1) return { ...s, [phase]: s[phase] + 1 };
        const i = PHASES.indexOf(phase);
        const nextPhase = PHASES[i + 1];
        if (nextPhase && status[nextPhase] !== 'blocked' && countSteps(result, nextPhase) > 0) {
          setPhaseRaw(nextPhase);
          return { ...s, [nextPhase]: 0 };
        }
        setPlaying(false);
        return s;
      });
    }, 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed, phase, result, status]);

  const setSource = useCallback((s: string) => setSourceRaw(s), []);
  const loadPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setPlaying(false);
    jumpToFailure.current = true;
    setSourceRaw(p.source);
    setDebounced(p.source);
  }, []);
  const setPhase = useCallback((p: PhaseId) => {
    setPlaying(false);
    setPhaseRaw(p);
  }, []);
  const compileAndAnimate = useCallback(() => {
    if (debounced === source) {
      // same source: just restart the animation
      setSteps({ lexer: 0, parser: 0, semantic: 0, ir: 0, optimizer: 0, codegen: 0 });
      setPhaseRaw('lexer');
      setPlaying(true);
    } else {
      animateNext.current = true;
      setDebounced(source);
    }
  }, [debounced, source]);

  const value: Store = {
    source, setSource, presetId, loadPreset, result, passes, setPasses, phase, setPhase, status, stepCount,
    step: steps[phase], setStep, stepOf: (p) => steps[p], playing, setPlaying, speed, setSpeed, compileAndAnimate,
    hover, setHover, stepSpan, setStepSpan, editorHover, setEditorHover, jumpTo, setJumpTo, dark, setDark: setDarkRaw,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
