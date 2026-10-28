# FinBank — visão geral do projeto

O FinBank é um simulador bancário **fictício** de PIX, criado para o workshop
TDC 2026 _"Estamos construindo qualidade ou apenas automatizando evidências?"_.
Ele é pequeno o bastante para ser lido em uma sessão e realista o bastante para
discutir decisões de produto, regras de negócio e estratégia de testes.

Este documento é a porta de entrada: explica o que o projeto faz, como ele
funciona, onde encontrar cada parte e como ele é testado. Comandos detalhados,
contratos HTTP e códigos de erro ficam na [referência técnica](docs/referencia-tecnica.md).

> Todos os dados são fictícios (nomes, documentos, chaves PIX, senhas). O
> projeto roda localmente e offline; nenhum serviço externo é necessário.

## Sumário

- [Primeiros passos](#primeiros-passos)
- [Como funciona](#como-funciona)
- [Regras de negócio](#regras-de-negócio)
- [Telas](#telas)
- [Mapa do projeto](#mapa-do-projeto)
- [Estratégia de testes](#estratégia-de-testes)
- [Relatórios de testes](#relatórios-de-testes)
- [Ferramentas e versões](#ferramentas-e-versões)
- [Outros guias desta pasta](#outros-guias-desta-pasta)

## Primeiros passos

Pré-requisitos: Node.js 24.15.0, npm 11.9.0 e Docker com Compose.

```bash
cd finbank
nvm use
npm ci
npm run workshop:start
```

Abra `http://localhost:8080/`. Para parar sem perder dados, use
`npm run workshop:stop`; para voltar ao estado inicial, `npm run workshop:reset`.
Credenciais e cadastro de novos perfis estão em [acesso.md](docs/acesso.md).

## Como funciona

O FinBank é um monorepo npm com três workspaces, executado por Docker Compose
atrás de um único gateway na porta 8080:

```text
Navegador
  └─ Gateway :8080 (única porta exposta)
       ├─ /            → SPA Vue 3 (apps/web)
       ├─ /api/*       → API NestJS (apps/api)
       ├─ /reports/*   → relatórios de testes (somente leitura)
       └─ /facilitator → painel do facilitador (somente acesso local)
                │
                ▼
          API NestJS (rede interna)
                │  Prisma
                ▼
          MongoDB 8 — replica set de nó único "rs0" (rede interna)
```

| Workspace            | Papel                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| `apps/api`           | Monólito modular NestJS: perfis, conta, destinatários, PIX, risco, histórico.  |
| `apps/web`           | SPA Vue 3 (Composition API, Pinia, Vue Router) com o fluxo PIX e o histórico.  |
| `packages/contracts` | Tipos TypeScript compartilhados entre API e web (DTOs), sem lógica de domínio. |

Decisões de arquitetura que vale conhecer:

- **Monólito modular**, não microserviços — o foco é o domínio, não a
  infraestrutura.
- **REST/JSON** para facilitar a inspeção pelo navegador ou `curl`.
- **MongoDB em replica set** para permitir as transações atômicas usadas pelo
  Prisma (débito + registro da transação acontecem juntos ou não acontecem).
- **API e MongoDB não publicam portas no host**: tudo passa pelo gateway.
- **Workspaces de grupo**: no workshop, cada grupo entra por um link
  `/join/<grupo>` e trabalha com dados isolados dos demais.

A visão completa está em [`dev/02-arquitetura.md`](../dev/02-arquitetura.md).

## Regras de negócio

### Perfil e conta

- O seed cria o perfil base `PRO-1001` / conta `ACC-1001` (Alex Exemplo),
  com saldo de **R$ 145.250,00**, limite diário de **R$ 100.000,00** e senha
  transacional `123456`.
- Novos perfis podem ser cadastrados com nome (1–80 caracteres) e senha de seis
  dígitos; cada um recebe uma conta própria com os mesmos saldo e limite
  iniciais e histórico vazio.
- A tela de login é **fictícia**: não há autenticação de usuário. A conta usada
  em cada requisição é indicada pelo header `X-Local-Profile-Id`; sem ele, vale
  o perfil base.
- Senhas são guardadas apenas como hash (scrypt com salt); chaves PIX e
  documentos aparecem sempre mascarados.

### Fluxo de um PIX

```text
Intenção (DRAFT) ──► revisão/edição ──► confirmação com senha ──► decisão de risco
   não debita           não debita        revalida tudo            APPROVED ou REVIEW
```

1. **Intenção**: prepara o pagamento (destinatário, valor, descrição,
   dispositivo). Nasce em `DRAFT`, vale por **cinco minutos** e **não** debita,
   reserva saldo nem consome limite.
2. **Revisão**: a intenção pode ser editada enquanto estiver válida e ainda não
   processada.
3. **Confirmação**: exige a senha transacional da conta. Validade, estado,
   destinatário, saldo e limite são verificados de novo nesse momento.
4. **Decisão de risco**: compara o valor da transação com o limiar
   `PIX_REVIEW_AMOUNT_CENTS` (padrão **R$ 5.000,00**):
   - abaixo do limiar → `APPROVED`, com débito imediato do valor;
   - no limiar ou acima → `REVIEW` (em análise), sem débito.

### Validações

- Valores são sempre **inteiros em centavos** e precisam ser positivos.
- **Saldo**: o valor não pode ultrapassar o saldo da conta.
- **Limite diário**: soma das transações `APPROVED` do dia civil em
  `America/Sao_Paulo` + valor atual pode chegar exatamente ao limite, nunca
  passar dele. Transações em `REVIEW` não consomem limite.
- Senha incorreta não altera a intenção nem os dados financeiros.

### Histórico

- Lista só as transações da conta selecionada, mais recentes primeiro, com
  paginação (`page`, `pageSize` até 100).
- Filtros por período (`from`/`to`), status e busca textual por identificador
  ou nome do destinatário.
- Status possíveis: `APPROVED`, `REVIEW`, `REJECTED` e `FAILED`.

### Erros

Todos os erros da API seguem o formato `application/problem+json`, com `code`,
`detail`, `requestId` e `traceId`. Falhas inesperadas retornam
`500 PROCESSING_ERROR` sem expor detalhes internos. O catálogo completo de
códigos está na [referência técnica](docs/referencia-tecnica.md).

Especificações de domínio e fluxos:
[`dev/03-dominio-e-api.md`](../dev/03-dominio-e-api.md),
[`dev/04-fluxos.md`](../dev/04-fluxos.md) e as features em
[`features/`](features/).

## Telas

| ID  | Rota                   | Tela                                                  | Arquivo                                                         |
| --- | ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| —   | `/login`               | Login fictício                                        | [`LoginView.vue`](apps/web/src/views/LoginView.vue)             |
| T01 | `/app/transferir`      | Destinatário, valor e descrição; contatos frequentes  | [`TransferirView.vue`](apps/web/src/views/TransferirView.vue)   |
| T02 | `/app/revisar`         | Revisão e edição antes de confirmar                   | [`RevisarView.vue`](apps/web/src/views/RevisarView.vue)         |
| T03 | `/app/senha`           | Senha transacional de seis dígitos (teclado numérico) | [`SenhaView.vue`](apps/web/src/views/SenhaView.vue)             |
| T04 | `/app/comprovante/:id` | Comprovante (aprovado ou em análise)                  | [`ComprovanteView.vue`](apps/web/src/views/ComprovanteView.vue) |
| T05 | `/app/erro`            | Erro                                                  | [`ErroView.vue`](apps/web/src/views/ErroView.vue)               |
| T06 | `/app/historico`       | Histórico com filtros e busca                         | [`HistoricoView.vue`](apps/web/src/views/HistoricoView.vue)     |
| —   | `/app/relatorios`      | Relatórios de testes publicados                       | [`RelatoriosView.vue`](apps/web/src/views/RelatoriosView.vue)   |

## Mapa do projeto

Onde olhar para entender cada parte:

| Quero entender…                      | Olhe em                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Criação e edição de intenções PIX    | [`apps/api/src/pix/pix-intent.domain.ts`](apps/api/src/pix/pix-intent.domain.ts), `pix-intent.service.ts`                    |
| Confirmação, senha e débito          | [`apps/api/src/pix/pix-confirmation.service.ts`](apps/api/src/pix/pix-confirmation.service.ts)                               |
| Regra de risco e limiar de análise   | [`apps/api/src/pix/pix-risk.domain.ts`](apps/api/src/pix/pix-risk.domain.ts), `pix-risk.config.ts`                           |
| Histórico, filtros e paginação       | [`apps/api/src/transactions/`](apps/api/src/transactions/)                                                                   |
| Perfis, conta e destinatários        | [`apps/api/src/http/local-banking.service.ts`](apps/api/src/http/local-banking.service.ts)                                   |
| Formato padrão de erros              | [`apps/api/src/http/problem.ts`](apps/api/src/http/problem.ts)                                                               |
| Acesso a dados                       | [`apps/api/src/repositories/`](apps/api/src/repositories/), [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) |
| Dados iniciais (seed)                | [`apps/api/src/database/fixtures.ts`](apps/api/src/database/fixtures.ts), `seed.ts`                                          |
| Reset do ambiente usado pelos testes | [`apps/api/src/simulation/`](apps/api/src/simulation/)                                                                       |
| Estado do fluxo PIX no frontend      | [`apps/web/src/stores/pixTransfer.ts`](apps/web/src/stores/pixTransfer.ts)                                                   |
| Chamadas HTTP do frontend            | [`apps/web/src/api/`](apps/web/src/api/)                                                                                     |
| Componentes visuais (design system)  | [`apps/web/src/components/`](apps/web/src/components/)                                                                       |
| Formatação de moeda                  | [`apps/web/src/lib/currency.ts`](apps/web/src/lib/currency.ts)                                                               |
| Rotas                                | [`apps/web/src/router.ts`](apps/web/src/router.ts)                                                                           |
| Tipos compartilhados (DTOs)          | [`packages/contracts/src/index.ts`](packages/contracts/src/index.ts)                                                         |
| Serviços Docker                      | [`compose.yaml`](compose.yaml)                                                                                               |
| Launcher `workshop:*`                | [`scripts/workshop.mjs`](scripts/workshop.mjs)                                                                               |
| Geração de relatórios                | [`scripts/test-reports.mjs`](scripts/test-reports.mjs), [`scripts/reports-index.mjs`](scripts/reports-index.mjs)             |
| Escopo, princípios e backlog         | [`dev/`](../dev/) — em especial `01-escopo-e-principios.md` e `09-backlog.md`                                                |

## Estratégia de testes

### A pergunta do workshop

O projeto tem testes em todas as camadas, e a suíte pública fica verde. A
proposta é justamente olhar para isso com olhar crítico: **cobertura e testes
passando são evidências, não garantia de qualidade**. Ao ler os relatórios,
pergunte-se:

- Que comportamento este teste realmente prova?
- Que cenário de uso real ele não exercita?
- Se esse teste continuar verde, que tipo de problema ainda poderia chegar ao
  cliente?

Compare o que os relatórios dizem com o que você observa usando a aplicação.

### Pirâmide de testes

| Nível                     | Ferramentas                     | O que cobre                                                                                                     | Onde fica                                          | Como rodar                                   |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Unitário backend          | Vitest                          | Regras de domínio e serviços isolados, com repositories substituídos por dublês. Sem Nest, Prisma ou Mongo.     | [`apps/api/test/*.test.ts`](apps/api/test/)        | `npm run test:unit:backend` (ou `npm test`)  |
| Integração / API          | PactumJS + Vitest               | Endpoints HTTP reais da API NestJS com MongoDB de teste (`finbank_test`): contratos, persistência, atomicidade. | [`apps/api/test/*.integration.ts`](apps/api/test/) | `npm run test:docker`                        |
| Unitário / componente web | Vitest + Vue Test Utils + jsdom | Componentes, telas, store Pinia, formatação de moeda e mapeamento de estados.                                   | [`apps/web/test/`](apps/web/test/)                 | `npm run test:unit:frontend` (ou `npm test`) |
| E2E do sistema            | Cypress                         | Fluxos completos no navegador, atravessando Vue, NestJS e MongoDB.                                              | [`apps/web/cypress/e2e/`](apps/web/cypress/e2e/)   | `npm run test:e2e` (stack no ar)             |
| Fundação e smoke Docker   | `node:test`, shell              | Launcher, estrutura do monorepo, subida e reinício da stack em ambiente isolado.                                | [`test/`](test/)                                   | `npm test` / `npm run test:docker`           |

Os quatro cenários E2E públicos são:

1. login → PIX aprovado → comprovante → histórico;
2. valor inválido não avança;
3. valor alto entra em análise;
4. senha incorreta não processa.

### Por que cada ferramenta

- **Vitest** é usado nos testes unitários de backend e frontend: rápido, nativo
  para TypeScript/ESM e com a mesma API nas duas pontas. Testes unitários
  respondem "a regra está certa?" sem depender de banco ou rede.
- **Vue Test Utils + jsdom** montam componentes Vue fora do navegador para
  verificar renderização, eventos e estados de tela.
- **PactumJS** faz requisições HTTP reais contra a API rodando com MongoDB de
  teste. Responde "o contrato HTTP e a persistência funcionam juntos?". Cada
  suíte restaura o banco antes de rodar, então os testes são independentes.
- **Cypress** é o único nível E2E e valida a experiência como o cliente a vê.
  Não existe uma suíte E2E só do backend: a API termina nos testes de
  integração.

> Nota: [`dev/06-estrategia-de-testes.md`](../dev/06-estrategia-de-testes.md)
> menciona Jest para os testes unitários do backend. Na implementação atual,
> todos os testes JavaScript/TypeScript usam Vitest.

### Convenções úteis

- **Seletores E2E**: elementos usados pela automação têm `data-testid` no
  formato `<tela>-<elemento>[-<tipo>]`; no Cypress, use
  `cy.getByTestId('<id>')`. Guia completo em
  [seletores-e2e.md](docs/seletores-e2e.md).
- **Estado limpo**: cada teste E2E chama `cy.resetWorkshop()`, que restaura as
  fixtures base pela API de simulação; a ordem dos testes não importa.
- **Qualidade estática**: além dos testes, `npm run format:check` (Prettier),
  `npm run lint` (ESLint) e `npm run typecheck` (`tsc`/`vue-tsc`) fazem parte
  da validação.
- **Suíte reservada**: existe uma suíte do facilitador, executada por comando
  próprio e fora de `npm test` e da CI pública.

Estratégia completa:
[`dev/06-estrategia-de-testes.md`](../dev/06-estrategia-de-testes.md).

## Relatórios de testes

Há dois conjuntos de relatórios, ambos fora do Git:

- **`reports/`** — gerado por `npm test` e `npm run test:docker`: resumo em
  Markdown/JSON, logs e JUnit XML por suíte.
- **`artifacts/test-reports/`** — gerado por `npm run reports:build` (unitário
  backend, unitário frontend, integração API e E2E) e publicado em
  `http://localhost:8080/reports/`, somente leitura.

Os relatórios registram resultados de execução; cobertura de código é medida
separadamente e, de novo, deve ser lida como evidência e não como veredito.
Detalhes em [relatorios.md](docs/relatorios.md).

## Ferramentas e versões

As versões são fixadas nos `package.json` e em `.nvmrc`.

| Área           | Ferramenta               | Versão                 |
| -------------- | ------------------------ | ---------------------- |
| Runtime        | Node.js / npm            | 24.15.0 / 11.9.0       |
| Linguagem      | TypeScript               | 5.9.2                  |
| Backend        | NestJS                   | 11.2.3                 |
| Persistência   | Prisma / MongoDB         | 6.19.0 / 8.0.16        |
| Frontend       | Vue / Pinia / Vue Router | 3.5.21 / 3.0.3 / 4.5.1 |
| Build frontend | Vite                     | 7.3.6                  |
| Testes         | Vitest                   | 3.2.7                  |
| Testes         | Vue Test Utils / jsdom   | 2.5.0 / 29.0.0         |
| Testes         | PactumJS                 | 3.8.0                  |
| Testes         | Cypress                  | 16.1.0                 |
| Qualidade      | ESLint / Prettier        | 10.9.1 / 3.6.2         |
| Execução local | Docker Compose           | —                      |

## Outros guias desta pasta

| Guia                                                | Assunto                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| [referencia-tecnica.md](docs/referencia-tecnica.md) | Comandos, contratos HTTP, códigos de erro e detalhes de cada DEV. |
| [acesso.md](docs/acesso.md)                         | Usuário padrão, cadastro de perfis e acesso ao painel.            |
| [relatorios.md](docs/relatorios.md)                 | Como gerar e publicar os relatórios de testes.                    |
| [seletores-e2e.md](docs/seletores-e2e.md)           | Convenção e catálogo de `data-testid`.                            |
| [ngrok.md](docs/ngrok.md)                           | Expor o app temporariamente para acesso remoto (opcional).        |
