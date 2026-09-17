import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ProblemDetails } from '@finbank/contracts';

const problems = {
  INVALID_TRANSACTION_QUERY: [
    400,
    'Consulta inválida',
    'Informe filtros e paginação válidos.',
  ],
  TRANSACTION_NOT_FOUND: [
    404,
    'Transação não encontrada',
    'A transação não foi encontrada.',
  ],
  INVALID_PIX_CONFIRMATION: [
    400,
    'Confirmação inválida',
    'Informe dados válidos para confirmar o PIX.',
  ],
  INVALID_TRANSACTION_PASSWORD: [
    422,
    'Senha transacional inválida',
    'Informe uma senha transacional válida.',
  ],
  PIX_INTENT_NOT_CONFIRMABLE: [
    409,
    'Intenção não confirmável',
    'O estado da intenção PIX não permite confirmação.',
  ],
  INVALID_PIX_INTENT: [
    400,
    'Intenção inválida',
    'Informe dados válidos para a intenção PIX.',
  ],
  INSUFFICIENT_BALANCE: [
    422,
    'Saldo insuficiente',
    'O saldo disponível é insuficiente.',
  ],
  DAILY_LIMIT_EXCEEDED: [
    422,
    'Limite diário excedido',
    'O valor excede o limite diário disponível.',
  ],
  PIX_INTENT_NOT_FOUND: [
    404,
    'Intenção não encontrada',
    'A intenção PIX não foi encontrada.',
  ],
  REQUEST_ID_CONFLICT: [
    409,
    'Conflito de idempotência',
    'O requestId já foi utilizado com um conteúdo diferente.',
  ],
  PIX_INTENT_EXPIRED: [
    410,
    'Intenção expirada',
    'A validade da intenção PIX terminou.',
  ],
  PIX_INTENT_NOT_EDITABLE: [
    409,
    'Intenção não editável',
    'O estado da intenção PIX não permite edição.',
  ],
  INVALID_PROFILE_INPUT: [
    400,
    'Cadastro inválido',
    'Informe nome e senha transacional válidos.',
  ],
  INVALID_LOCAL_PROFILE: [
    400,
    'Perfil inválido',
    'Informe um identificador de perfil local válido.',
  ],
  LOCAL_PROFILE_NOT_FOUND: [
    404,
    'Perfil não encontrado',
    'O perfil local não foi encontrado.',
  ],
  INVALID_PIX_KEY: [
    400,
    'Chave inválida',
    'Informe uma chave PIX fictícia de email válida.',
  ],
  RECIPIENT_NOT_FOUND: [
    404,
    'Destinatário não encontrado',
    'O destinatário não foi encontrado.',
  ],
  PROCESSING_ERROR: [
    500,
    'Erro de processamento',
    'Não foi possível processar a solicitação.',
  ],
  PAYLOAD_TOO_LARGE: [
    413,
    'Corpo muito grande',
    'O corpo da solicitação excede o limite permitido.',
  ],
  UNSUPPORTED_MEDIA_TYPE: [
    415,
    'Formato não suportado',
    'O formato do corpo da solicitação não é suportado.',
  ],
  INVALID_REQUEST: [400, 'Requisição inválida', 'A solicitação é inválida.'],
  ROUTE_NOT_FOUND: [404, 'Rota não encontrada', 'A rota não foi encontrada.'],
  SIMULATION_DISABLED: [
    403,
    'Simulação desabilitada',
    'Esta operação exige o modo de workshop habilitado.',
  ],
  SIMULATION_SCENARIO_NOT_FOUND: [
    404,
    'Cenário não encontrado',
    'O cenário de simulação não foi encontrado.',
  ],
  INVALID_SIMULATION_INPUT: [
    400,
    'Entrada de simulação inválida',
    'Informe dados válidos para aplicar o cenário.',
  ],
  INVALID_JOIN_INPUT: [
    400,
    'Entrada de sessão inválida',
    'Informe grupo e código de entrada válidos.',
  ],
  WORKSPACE_NOT_FOUND: [
    404,
    'Grupo não encontrado',
    'O grupo ou o código de entrada informado não é válido.',
  ],
  INVALID_FACILITATOR_SECRET: [
    401,
    'Acesso reservado inválido',
    'Informe o segredo do facilitador para esta operação.',
  ],
  INVALID_WORKSPACE_INPUT: [
    400,
    'Entrada de grupo inválida',
    'Informe um identificador de grupo válido.',
  ],
  GROUP_SLUG_TAKEN: [
    409,
    'Grupo já existe',
    'Já existe um grupo com este identificador.',
  ],
} as const;
export class ApiProblem extends Error {
  constructor(readonly code: keyof typeof problems) {
    super(code);
  }
}
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<{ url: string; method: string }>();
    const errorStatus =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof Error &&
            'status' in error &&
            'type' in error &&
            (error.type === 'entity.too.large' ||
              error.type === 'charset.unsupported' ||
              error.type === 'encoding.unsupported')
          ? error.status
          : undefined;
    let code: keyof typeof problems = 'PROCESSING_ERROR';
    if (error instanceof ApiProblem) code = error.code;
    else if (errorStatus === 413) code = 'PAYLOAD_TOO_LARGE';
    else if (errorStatus === 415) code = 'UNSUPPORTED_MEDIA_TYPE';
    else if (error instanceof HttpException && error.getStatus() === 400) {
      code =
        request.method === 'POST' &&
        /^\/api\/v1\/pix\/intents\/[^/]+\/confirm$/.test(
          request.url.split('?')[0] ?? '',
        )
          ? 'INVALID_PIX_CONFIRMATION'
          : request.method === 'POST' &&
              request.url.split('?')[0] === '/api/v1/profiles'
            ? 'INVALID_PROFILE_INPUT'
            : (request.method === 'POST' || request.method === 'PATCH') &&
                /^\/api\/v1\/pix\/intents(?:\/[^/]+)?$/.test(
                  request.url.split('?')[0] ?? '',
                )
              ? 'INVALID_PIX_INTENT'
              : 'INVALID_REQUEST';
    } else if (error instanceof HttpException && error.getStatus() === 404)
      code = 'ROUTE_NOT_FOUND';
    const [status, title, detail] = problems[code];
    const body: ProblemDetails = {
      type: `urn:finbank:problem:${code.toLowerCase()}`,
      title,
      status,
      code,
      detail,
      requestId: randomUUID(),
      traceId: randomUUID(),
    };
    context
      .getResponse<{
        status(value: number): {
          type(value: string): { json(body: ProblemDetails): void };
        };
      }>()
      .status(status)
      .type('application/problem+json')
      .json(body);
  }
}
