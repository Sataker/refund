// Business-condition errors of the engine primitives. They stay RangeError (the primitives' contract since E1), but
// carry a stable code so `analyze`/`recalculate` turn them into `Result` errors: no exception crosses the package
// boundary (CLAUDE.md; EXECUTION §9, E5 row of 14/11).
import type { DomainError } from './types.ts';

export type EngineErrorCode =
  | 'RBT12_ABOVE_CEILING'
  | 'ANEXO_WITHOUT_TABLE'
  | 'PARAMETER_NOT_IN_FORCE'
  | 'START_OF_ACTIVITY_NOT_SUPPORTED'
  | 'UNKNOWN_ASSUMPTION'
  | 'INVALID_ASSUMPTION'
  | 'INVALID_FACTS'
  | 'UNKNOWN_PARAMETER_SET'
  | 'ENGINE_INTERNAL_ERROR';

/** User-facing messages (PT-BR), one per code. */
const MESSAGES: Record<EngineErrorCode, string> = {
  RBT12_ABOVE_CEILING:
    'A receita dos últimos 12 meses passa do teto do Simples Nacional (R$ 4,8 milhões); o cálculo do DAS não se aplica.',
  ANEXO_WITHOUT_TABLE: 'Ainda não calculamos empresas neste anexo do Simples Nacional.',
  PARAMETER_NOT_IN_FORCE: 'Não há parâmetro legal vigente para um dos meses da análise.',
  START_OF_ACTIVITY_NOT_SUPPORTED:
    'A empresa tem menos de 14 meses de atividade; ainda não calculamos o Fator R nesse período.',
  UNKNOWN_ASSUMPTION: 'Premissa desconhecida.',
  INVALID_ASSUMPTION: 'Valor de premissa inválido.',
  INVALID_FACTS: 'Dados de entrada inválidos.',
  UNKNOWN_PARAMETER_SET: 'Conjunto de parâmetros desconhecido.',
  ENGINE_INTERNAL_ERROR: 'Erro interno do motor de cálculo.',
};

export class EngineError extends RangeError {
  readonly code: EngineErrorCode;
  readonly detail: Record<string, unknown> | undefined;
  constructor(code: EngineErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.detail = detail;
  }
}

/** Any thrown value → DomainError with a stable code and a PT-BR message (never PII in `detail`). */
export function toDomainError(e: unknown): DomainError {
  if (e instanceof EngineError) {
    const out: DomainError = { code: e.code, message: MESSAGES[e.code], recoverable: false };
    if (e.detail !== undefined) out.detail = e.detail;
    return out;
  }
  return {
    code: 'ENGINE_INTERNAL_ERROR',
    message: MESSAGES.ENGINE_INTERNAL_ERROR,
    recoverable: false,
    detail: { reason: e instanceof Error ? e.message : String(e) },
  };
}
