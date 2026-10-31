/** Parse tree → AST (drops punctuation, keywords and the route_list/route_stmt scaffolding). */
import type { BoardStmt, ChangeStmt, ExitStmt, NameRef, Program, RouteStmt, Span, TreeNode, ViaStmt } from '../types';

const nameAt = (n: TreeNode, i: number): NameRef => ({ name: n.children[i].attrs!.lexeme, span: n.children[i].span! });

export function buildAst(root: TreeNode): Program {
  const [boardN, listN, exitN] = root.children;
  const board: BoardStmt = { kind: 'board', station: nameAt(boardN, 1), line: nameAt(boardN, 3), span: boardN.span! };
  const routes: RouteStmt[] = [];
  let list = listN;
  while (list.children.length === 2) {
    const stmt = list.children[0].children[0];
    if (stmt.label === 'via_stmt') routes.push({ kind: 'via', station: nameAt(stmt, 1), span: stmt.span! } satisfies ViaStmt);
    else routes.push({ kind: 'change', line: nameAt(stmt, 1), station: nameAt(stmt, 3), span: stmt.span! } satisfies ChangeStmt);
    list = list.children[1];
  }
  const exit: ExitStmt = { kind: 'exit', station: nameAt(exitN, 1), span: exitN.span! };
  return { kind: 'program', board, routes, exit, span: root.span! };
}

/** AST as a display tree for the UI. */
export function astToTree(p: Program): TreeNode {
  let id = 0;
  const leaf = (label: string, span: Span): TreeNode => ({ id: `a${id++}`, label, kind: 'leaf', span, children: [] });
  const node = (label: string, span: Span, children: TreeNode[]): TreeNode => ({ id: `a${id++}`, label, kind: 'ast', span, children });
  const stmts = [p.board, ...p.routes, p.exit].map((s) => {
    switch (s.kind) {
      case 'board':
        return node('Board', s.span, [leaf(`station: ${s.station.name}`, s.station.span), leaf(`line: ${s.line.name}`, s.line.span)]);
      case 'via':
        return node('Via', s.span, [leaf(`station: ${s.station.name}`, s.station.span)]);
      case 'change':
        return node('Change', s.span, [leaf(`line: ${s.line.name}`, s.line.span), leaf(`station: ${s.station.name}`, s.station.span)]);
      case 'exit':
        return node('Exit', s.span, [leaf(`station: ${s.station.name}`, s.station.span)]);
    }
  });
  return node('Journey', p.span, stmts);
}
