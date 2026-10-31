/** Zoomable, animated tree (d3-hierarchy layout + d3-zoom, rendered with React/Framer Motion). */
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spanContains } from '../../compiler/diagnostics';
import type { TreeNode } from '../../compiler/types';
import { useStore } from '../store';

interface Props {
  root: TreeNode;
  /** only these node ids are shown (undefined = all) */
  visible?: Set<string>;
  /** nodes to emphasise (e.g. created by the current step) */
  activeIds?: string[];
  showAttrs?: boolean;
}

type Orientation = 'vertical' | 'horizontal';

const NODE_H = 30;
const ATTR_H = 14;
const HIDDEN_ATTRS = new Set(['prod', 'idx', 'parent', 'production', 'lexeme']);

function nodeColors(n: TreeNode) {
  switch (n.kind) {
    case 'nonterminal':
    case 'ast':
      return { fill: 'color-mix(in srgb, #7E3F98 18%, var(--panel))', stroke: '#7E3F98' };
    case 'terminal':
    case 'leaf':
      return { fill: 'color-mix(in srgb, #0066B3 15%, var(--panel))', stroke: '#0066B3' };
    case 'epsilon':
      return { fill: 'var(--panel-2)', stroke: 'var(--muted)' };
    case 'error':
      return { fill: 'color-mix(in srgb, #ef4444 18%, var(--panel))', stroke: '#ef4444' };
  }
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Laid-out node: (x, y) is the top-left corner of its box in screen space. */
interface Placed {
  d: HierarchyPointNode<TreeNode>;
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutTree(root: TreeNode, showAttrs: boolean, orient: Orientation) {
  const attrsOf = (n: TreeNode) => (showAttrs ? Object.entries(n.attrs ?? {}).filter(([k]) => !HIDDEN_ATTRS.has(k)) : []);
  const widthOf = (n: TreeNode) =>
    Math.min(230, Math.max(52, trunc(n.label, 28).length * 7.4 + 20, ...attrsOf(n).map(([k, v]) => (k.length + trunc(v, 26).length + 3) * 6.3 + 16)));
  const heightOf = (n: TreeNode) => NODE_H + (attrsOf(n).length ? attrsOf(n).length * ATTR_H + 6 : 0);

  const h = hierarchy(root, (d) => d.children);
  const placed: Placed[] = [];

  if (orient === 'vertical') {
    let maxH = 0;
    h.each((d) => (maxH = Math.max(maxH, heightOf(d.data))));
    const t = d3tree<TreeNode>()
      .nodeSize([1, maxH + 44])
      .separation((a, b) => (widthOf(a.data) + widthOf(b.data)) / 2 + (a.parent === b.parent ? 12 : 22));
    t(h).each((d) => placed.push({ d, x: d.x - widthOf(d.data) / 2, y: d.y, w: widthOf(d.data), h: heightOf(d.data) }));
  } else {
    // per-depth column widths so short labels don't waste space
    const colW: number[] = [];
    h.each((d) => (colW[d.depth] = Math.max(colW[d.depth] ?? 0, widthOf(d.data))));
    const colX = colW.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? 0 : acc[i - 1] + colW[i - 1] + 36], []);
    const t = d3tree<TreeNode>()
      .nodeSize([1, 1])
      .separation((a, b) => (heightOf(a.data) + heightOf(b.data)) / 2 + (a.parent === b.parent ? 8 : 16));
    t(h).each((d) => placed.push({ d, x: colX[d.depth], y: d.x - heightOf(d.data) / 2, w: widthOf(d.data), h: heightOf(d.data) }));
  }

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of placed) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x + p.w);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y + p.h);
  }
  const byId = new Map(placed.map((p) => [p.d.data.id, p]));
  return { placed, byId, attrsOf, bounds: { x0, x1, y0, y1 } };
}

const fitScale = (b: { x0: number; x1: number; y0: number; y1: number }, w: number, h: number) =>
  Math.min(1.25, (w - 30) / (b.x1 - b.x0), (h - 40) / (b.y1 - b.y0));

export function TreeView({ root, visible, activeIds, showAttrs = false }: Props) {
  const { setHover, editorHover } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState('translate(0,0) scale(1)');
  const [orientPref, setOrientPref] = useState<Orientation | 'auto'>('auto');
  const [size, setSize] = useState({ w: 600, h: 500 });

  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layouts = useMemo(
    () => ({ vertical: layoutTree(root, showAttrs, 'vertical'), horizontal: layoutTree(root, showAttrs, 'horizontal') }),
    [root, showAttrs],
  );
  const orient: Orientation =
    orientPref !== 'auto'
      ? orientPref
      : fitScale(layouts.horizontal.bounds, size.w, size.h) > fitScale(layouts.vertical.bounds, size.w, size.h) * 1.1
        ? 'horizontal'
        : 'vertical';
  const layout = layouts[orient];

  useEffect(() => {
    const svg = select(svgRef.current!);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (e) => setTransform(e.transform.toString()));
    zoomRef.current = z;
    svg.call(z);
    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  const fit = () => {
    const svg = svgRef.current;
    if (!svg || !zoomRef.current) return;
    const { x0, x1, y0, y1 } = layout.bounds;
    const k = fitScale(layout.bounds, size.w, size.h);
    const tx = size.w / 2 - ((x0 + x1) / 2) * k;
    const ty = orient === 'vertical' ? 16 - y0 * k : size.h / 2 - ((y0 + y1) / 2) * k;
    select(svg).call(zoomRef.current.transform, zoomIdentity.translate(tx, ty).scale(k));
  };

  useEffect(() => {
    const t = setTimeout(fit, 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, size.w, size.h]);

  const shown = layout.placed.filter((p) => !visible || visible.has(p.d.data.id));
  const active = new Set(activeIds ?? []);

  const link = (p: Placed) => {
    const q = layout.byId.get(p.d.parent!.data.id)!;
    if (orient === 'vertical') {
      const sx = q.x + q.w / 2, sy = q.y + q.h, tx = p.x + p.w / 2, ty = p.y, my = (sy + ty) / 2;
      return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
    }
    const sx = q.x + q.w, sy = q.y + q.h / 2, tx = p.x, ty = p.y + p.h / 2, mx = (sx + tx) / 2;
    return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
  };

  return (
    <div className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full cursor-grab active:cursor-grabbing">
        <g transform={transform}>
          {shown.map(
            (p) =>
              p.d.parent && (
                <motion.path
                  key={`l-${p.d.data.id}-${orient}`}
                  d={link(p)}
                  fill="none"
                  stroke="var(--muted)"
                  strokeOpacity={0.55}
                  strokeWidth={1.4}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3 }}
                />
              ),
          )}
          {shown.map((p) => {
            const n = p.d.data;
            const c = nodeColors(n);
            const hot = editorHover !== null && n.kind !== 'nonterminal' && n.kind !== 'ast' ? spanContains(n.span, editorHover) : false;
            const isActive = active.has(n.id);
            const attrs = layout.attrsOf(n);
            const statusColor = n.status === 'error' ? '#ef4444' : n.status === 'warning' ? '#f59e0b' : undefined;
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                onMouseEnter={() => n.span && setHover(n.span)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width={p.w}
                  height={p.h}
                  rx={n.kind === 'terminal' || n.kind === 'leaf' ? 6 : 14}
                  fill={hot ? 'var(--hl)' : c.fill}
                  stroke={statusColor ?? (isActive ? '#FFCC00' : c.stroke)}
                  strokeWidth={isActive || hot || statusColor ? 2.6 : 1.4}
                  strokeDasharray={n.kind === 'epsilon' ? '4 3' : undefined}
                />
                <text x={p.x + p.w / 2} y={p.y + 19} textAnchor="middle" className="mono" fontSize={12} fontWeight={600} fill="var(--text)">
                  {trunc(n.label, 28)}
                </text>
                {attrs.map(([k, v], i) => (
                  <text key={k} x={p.x + 8} y={p.y + NODE_H + 8 + i * ATTR_H} fontSize={10.5} className="mono" fill="var(--muted)">
                    <tspan fill="#a970c9" fontWeight={600}>{k}</tspan> = {trunc(v, 26)}
                  </text>
                ))}
              </motion.g>
            );
          })}
        </g>
      </svg>
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button
          className="btn px-2 py-0.5 text-xs"
          onClick={() => setOrientPref(orient === 'vertical' ? 'horizontal' : 'vertical')}
          title="Rotate the tree"
        >
          {orient === 'vertical' ? '↻ Horizontal' : '↻ Vertical'}
        </button>
        <button className="btn px-2 py-0.5 text-xs" onClick={fit} title="Fit to view">⤢ Fit</button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] muted">scroll to zoom · drag to pan · hover a node to see its source</div>
    </div>
  );
}
