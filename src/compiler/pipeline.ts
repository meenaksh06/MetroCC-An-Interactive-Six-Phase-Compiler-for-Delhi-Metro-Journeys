/** Runs the six phases in order, stopping after the first phase that reports an error. */
import { generate, type CodegenOutput, type CodegenStep } from './codegen/codegen';
import { generateIR, type IROutput, type IRStep } from './ir/irgen';
import { lex, type LexOutput, type LexStep } from './lexer/lexer';
import { ALL_PASSES, optimize, type OptOutput, type OptStep, type PassOptions } from './optimizer/optimizer';
import { parse, type ParseOutput, type ParseStep } from './parser/parser';
import { analyse, type SemanticOutput, type SemanticStep } from './semantic/semantic';
import type { Diagnostic, PhaseId, PhaseResult } from './types';

export interface CompileResult {
  lexer: PhaseResult<LexOutput, LexStep>;
  parser?: PhaseResult<ParseOutput, ParseStep>;
  semantic?: PhaseResult<SemanticOutput, SemanticStep>;
  ir?: PhaseResult<IROutput, IRStep>;
  optimizer?: PhaseResult<OptOutput, OptStep>;
  codegen?: PhaseResult<CodegenOutput, CodegenStep>;
  /** first phase that failed, if any */
  failedAt?: PhaseId;
  diagnostics: Diagnostic[];
}

export function compile(src: string, passes: PassOptions = ALL_PASSES): CompileResult {
  const res: CompileResult = { lexer: lex(src), diagnostics: [] };
  const collect = (p: PhaseResult<unknown, unknown>) => res.diagnostics.push(...p.diagnostics);
  collect(res.lexer);
  if (!res.lexer.ok) return { ...res, failedAt: 'lexer' };

  res.parser = parse(res.lexer.result.tokens);
  collect(res.parser);
  if (!res.parser.ok || !res.parser.result.ast) return { ...res, failedAt: 'parser' };

  res.semantic = analyse(res.parser.result.ast);
  collect(res.semantic);
  if (!res.semantic.ok || !res.semantic.result.journey) return { ...res, failedAt: 'semantic' };

  res.ir = generateIR(res.semantic.result.journey);
  res.optimizer = optimize(res.ir.result.ir, passes);
  res.codegen = generate(res.optimizer.result.after);
  return res;
}
