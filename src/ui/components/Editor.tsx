/** CodeMirror 6 editor: DSL highlighting, live lint squiggles and two-way linked highlighting. */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { linter, lintGutter, setDiagnostics, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { EditorSelection, EditorState, StateEffect, StateField, type Range } from '@codemirror/state';
import {
  Decoration, EditorView, MatchDecorator, ViewPlugin, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { LINES } from '../../compiler/data/metro';
import type { Span } from '../../compiler/types';
import { useStore } from '../store';

// ---------------------------------------------------------------- syntax highlighting
const lineNames = LINES.map((l) => l.id).join('|');
const tokenRe = new RegExp(
  `(\\/\\/.*$)|("[^"\\n]*"?)|\\b(BOARD|ON|VIA|CHANGE|AT|EXIT)\\b|\\b(${lineNames})\\b(?!\\s+(?!AT\\b|ON\\b)[A-Za-z0-9])|(;)`,
  'gm',
);
const colorOf = Object.fromEntries(LINES.map((l) => [l.id, l.color]));
const highlighter = new MatchDecorator({
  regexp: tokenRe,
  decoration: (m) => {
    if (m[1]) return Decoration.mark({ class: 'tok-comment' });
    if (m[2]) return Decoration.mark({ class: 'tok-string' });
    if (m[3]) return Decoration.mark({ class: 'tok-kw' });
    if (m[4]) return Decoration.mark({ class: 'tok-line', attributes: { style: `color:${colorOf[m[4]] === '#FFCC00' ? '#e0a800' : colorOf[m[4]]}` } });
    return Decoration.mark({ class: 'tok-semi' });
  },
});
const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = highlighter.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = highlighter.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---------------------------------------------------------------- linked highlights
const setHl = StateEffect.define<{ hover: Span | null; step: Span | null }>();
const hlField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setHl)) {
        const len = tr.state.doc.length;
        const ranges: Range<Decoration>[] = [];
        const add = (s: Span | null, cls: string) => {
          if (!s) return;
          const a = Math.min(s.start.offset, len);
          let b = Math.min(s.end.offset, len);
          if (b <= a) b = Math.min(a + 1, len);
          if (b > a) ranges.push(Decoration.mark({ class: cls }).range(a, b));
        };
        add(e.value.step, 'cm-hl-step');
        add(e.value.hover, 'cm-hl');
        deco = Decoration.set(ranges, true);
      }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function Editor() {
  const { source, setSource, result, hover, stepSpan, setEditorHover, jumpTo, setJumpTo } = useStore();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ setSource, setEditorHover });
  cb.current = { setSource, setEditorHover };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          highlightPlugin,
          hlField,
          linter(null), // diagnostics are pushed from the compiler result
          lintGutter(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.setSource(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            mousemove: (e, v) => {
              const p = v.posAtCoords({ x: e.clientX, y: e.clientY }, false);
              cb.current.setEditorHover(p ?? null);
            },
            mouseleave: () => cb.current.setEditorHover(null),
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // external source changes (presets)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== source) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: source } });
  }, [source]);

  // diagnostics → squiggles
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    const ds: CMDiagnostic[] = result.diagnostics
      .filter((d) => d.code !== 'E-MAX')
      .map((d) => {
        const from = Math.min(d.span.start.offset, len);
        let to = Math.min(d.span.end.offset, len);
        if (to <= from) to = Math.min(from + 1, len);
        return {
          from: to > from ? from : Math.max(0, from - 1),
          to: to > from ? to : from,
          severity: d.severity,
          source: `${d.code} · ${d.phase}`,
          message: d.message + (d.hint ? `\n💡 ${d.hint}` : ''),
        };
      });
    v.dispatch(setDiagnostics(v.state, ds));
  }, [result]);

  // linked highlighting
  useEffect(() => {
    view.current?.dispatch({ effects: setHl.of({ hover, step: stepSpan }) });
  }, [hover, stepSpan]);

  // jump requests (click on a diagnostic)
  useEffect(() => {
    const v = view.current;
    if (!v || !jumpTo) return;
    const len = v.state.doc.length;
    const a = Math.min(jumpTo.start.offset, len);
    const b = Math.min(Math.max(jumpTo.end.offset, a), len);
    v.dispatch({ selection: EditorSelection.range(a, b), scrollIntoView: true });
    v.focus();
    setJumpTo(null);
  }, [jumpTo, setJumpTo]);

  return <div ref={host} className="h-full min-h-[220px] overflow-hidden" />;
}
