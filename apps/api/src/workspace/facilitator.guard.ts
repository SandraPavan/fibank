import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { ApiProblem } from '../http/problem';

const HEADER = 'x-facilitator-secret';

function facilitatorSecret(): string {
  return process.env.FACILITATOR_ACCESS_CODE ?? 'local-facilitator-code';
}

/**
 * Único ponto de acesso reservado ao facilitador (dev/02-arquitetura.md):
 * segredo separado por variável de ambiente, nunca em URL, relatório ou
 * frontend público. Participantes não têm este header, então nunca chegam
 * às rotas `api/v1/facilitator/*`.
 */
@Injectable()
export class FacilitatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const provided = request.headers[HEADER];
    const value = (Array.isArray(provided) ? provided[0] : provided) ?? '';
    const expected = Buffer.from(facilitatorSecret());
    const actual = Buffer.from(value);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new ApiProblem('INVALID_FACILITATOR_SECRET');
    return true;
  }
}
