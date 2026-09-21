import type {
  PixConfirmationResponse,
  PixRequestStatusResponse,
  RecipientResponse,
} from '@finbank/contracts';
import { defineStore } from 'pinia';
import {
  confirmPixIntent,
  createPixIntent,
  getFrequentRecipients,
  getPixRequestStatus,
  resolveRecipient,
  updatePixIntent,
} from '../api/banking';
import { getDeviceId } from '../api/device';
import { ApiError, RequestTimeoutError } from '../api/http';

interface PixTransferState {
  pixKey: string;
  amountCents: number;
  description: string;
  recipient: RecipientResponse | null;
  requestId: string | null;
  frequentRecipients: RecipientResponse[];
  submitting: boolean;
  errorMessage: string | null;
  confirming: boolean;
  confirmError: string | null;
  /**
   * `known-error`: o backend respondeu com um `problem+json` — a UI pode
   * mostrar `confirmError` e deixar o usuário corrigir (ex.: senha).
   * `unknown-result`: o cliente não recebeu resposta a tempo; o backend
   * pode ou não ter concluído a operação (dev/04-fluxos.md — F05/RP-07).
   */
  confirmOutcome: 'known-error' | 'unknown-result' | null;
  lastConfirmation: PixConfirmationResponse | null;
  reconciling: boolean;
}

/**
 * Estado da intenção PIX em andamento (T01/T02 — DEV-031).
 *
 * Vive em um store Pinia, e não em refs locais das views, porque RP-02
 * exige que "Editar Dados" volte de T02 para T01 sem perder os valores
 * já informados; refs locais seriam descartados ao desmontar a view.
 */
export const usePixTransferStore = defineStore('pixTransfer', {
  state: (): PixTransferState => ({
    pixKey: '',
    amountCents: 0,
    description: '',
    recipient: null,
    requestId: null,
    frequentRecipients: [],
    submitting: false,
    errorMessage: null,
    confirming: false,
    confirmError: null,
    confirmOutcome: null,
    lastConfirmation: null,
    reconciling: false,
  }),
  actions: {
    async loadFrequentRecipients() {
      this.frequentRecipients = await getFrequentRecipients();
    },

    setPixKey(key: string) {
      this.pixKey = key;
      // Editar a chave manualmente invalida um destinatário já resolvido
      // (seja por resolução anterior, seja por seleção de contato).
      this.recipient = null;
    },

    selectFrequentRecipient(recipient: RecipientResponse) {
      // RP-01: selecionar um contato frequente preenche o destinatário
      // sem executar a transação — só marca o destinatário como
      // resolvido; a intenção só é criada ao avançar para T02.
      this.recipient = recipient;
      this.pixKey = '';
    },

    reset() {
      this.$reset();
    },

    /**
     * Valida e avança de T01 para T02: resolve a chave (RP-01) quando
     * necessário e cria ou atualiza a `PixIntent` (T02 "editar antes da
     * autenticação"). Nunca chama `.../confirm` — isso é DEV-032 (T03).
     */
    async continueToReview(): Promise<boolean> {
      this.errorMessage = null;

      if (this.amountCents <= 0) {
        this.errorMessage = 'Informe um valor maior que zero.';
        return false;
      }
      if (!this.recipient && !this.pixKey.trim()) {
        this.errorMessage = 'Informe a chave PIX do destinatário.';
        return false;
      }

      this.submitting = true;
      try {
        if (!this.recipient) {
          this.recipient = await resolveRecipient(this.pixKey.trim());
        }

        const payload = {
          recipientId: this.recipient.recipientId,
          amountCents: this.amountCents,
          deviceId: getDeviceId(),
          description: this.description || undefined,
        };

        if (this.requestId) {
          await updatePixIntent(this.requestId, payload);
        } else {
          const requestId = `REQ-${crypto.randomUUID()}`;
          await createPixIntent({ requestId, ...payload });
          this.requestId = requestId;
        }

        return true;
      } catch (error) {
        this.errorMessage =
          error instanceof ApiError
            ? error.problem.detail || error.problem.title
            : 'Não foi possível continuar. Tente novamente.';
        return false;
      } finally {
        this.submitting = false;
      }
    },

    /**
     * Confirma a intenção com a senha transacional (T03 — DEV-032).
     *
     * RP-04: envia a operação uma única vez; a guarda em `this.confirming`
     * impede que um clique duplo (ou uma chamada concorrente) dispare uma
     * segunda confirmação enquanto a primeira ainda está em andamento.
     * Isso é diferente de idempotência entre tentativas: um novo clique
     * em "Confirmar" *depois* de uma falha/timeout chama a API de novo,
     * como o baseline espera (F05 — não implementar retry-safety aqui).
     *
     * A senha nunca é atribuída ao estado do store — só trafega como
     * parâmetro local desta função.
     */
    async confirm(
      transactionPassword: string,
    ): Promise<PixConfirmationResponse | null> {
      if (this.confirming || !this.requestId) return null;

      this.confirmError = null;
      this.confirmOutcome = null;
      this.confirming = true;
      try {
        const result = await confirmPixIntent(this.requestId, {
          transactionPassword,
        });
        this.lastConfirmation = result;
        return result;
      } catch (error) {
        if (error instanceof ApiError) {
          // Resposta estruturada do backend: a UI pode mostrar a causa e
          // deixar o usuário corrigir sem sair de T03 (ex.: senha errada).
          this.confirmOutcome = 'known-error';
          this.confirmError = error.problem.detail || error.problem.title;
        } else {
          // Sem resposta estruturada (timeout do cliente ou falha de
          // rede): o resultado é desconhecido, não uma rejeição.
          this.confirmOutcome = 'unknown-result';
          this.confirmError =
            error instanceof RequestTimeoutError
              ? error.message
              : 'Não foi possível confirmar a transação. Tente novamente.';
        }
        return null;
      } finally {
        this.confirming = false;
      }
    },

    /**
     * Consulta o resultado do `requestId` atual antes de um retry a partir
     * de T05 (DEV-102, RP-07 — dev/04-fluxos.md F05). Só leitura: nunca
     * confirma nem cria nada. Se a consulta falhar (rede/timeout), devolve
     * `null` e quem chamou decide seguir com o retry de qualquer forma —
     * a reconciliação não pode travar o cliente.
     */
    async reconcile(): Promise<PixRequestStatusResponse | null> {
      if (!this.requestId) return null;
      this.reconciling = true;
      try {
        return await getPixRequestStatus(this.requestId);
      } catch {
        return null;
      } finally {
        this.reconciling = false;
      }
    },
  },
});
