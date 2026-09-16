# FinBank

Fundação local do monorepo FinBank, composta por uma API NestJS, uma aplicação Vue 3 e contratos TypeScript compartilhados.

## Pré-requisitos

- Para desenvolvimento e execução dos gates npm: Node.js exatamente na versão
  24.15.0 e npm 11.9.0.
- Para executar a stack pelos comandos `workshop:*`: Node.js/npm nas versões acima,
  Docker Engine e Docker Compose. Os containers não exigem CLIs de framework nem
  MongoDB instalados no host.

Não é necessário instalar NestJS CLI, Vue CLI ou qualquer outra ferramenta globalmente.

## Instalação

```bash
nvm use
npm ci
```

## Validação

Execute na raiz de `finbank/`:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm ls
npm explain eslint
npm explain glob
npm explain whatwg-encoding
npm audit
```

Os comandos usam somente as dependências fixadas no monorepo. `npm explain whatwg-encoding` deve informar que nenhuma dependência correspondente foi encontrada.

`.env.example` registra somente valores locais fictícios. A execução direta da API usa
`127.0.0.1` por padrão; no Compose, `API_HOST=0.0.0.0` permite o acesso somente pela
rede interna dos containers. `API_PORT` e `MONGO_INIT_MAX_ATTEMPTS` também são
consumidos pelo Compose e possuem defaults seguros; o número de tentativas deve ser um
inteiro positivo.

## Stack Docker local

O launcher local executa sempre o arquivo `compose.yaml` desta instalação com o Compose
project fixo `finbank`, mesmo quando o script é iniciado a partir de outro diretório.
Ele valida Docker, Compose, daemon, configuração e conflito da porta antes de alterar a
stack.

Em `workshop:start` e `workshop:reset`, um conflito externo na porta bloqueia a
operação. Em `workshop:stop`, essa verificação é apenas consultiva: uma falha ou conflito
gera aviso, mas o encerramento seguro do project `finbank` continua.

Inicie ou reconvirja todos os serviços e aguarde os healthchecks:

```bash
npm run workshop:start
```

A aplicação fica disponível em `http://localhost:8080/` e a saúde técnica da API em
`http://localhost:8080/api/health`. As URLs são mostradas pelo launcher somente quando
MongoDB, API e web estão saudáveis e `mongo-init` concluiu com código zero. API e
MongoDB não publicam portas no host.

Consulte os estados sem alterar containers, redes ou volumes:

```bash
npm run workshop:status
```

O status classifica cada serviço como saudável, concluído, parado, ausente ou falho e
retorna código diferente de zero enquanto a stack não estiver pronta.

Encerre somente o project `finbank`, preservando os volumes
`finbank_mongo_data` e `finbank_mongo_config`:

```bash
npm run workshop:stop
```

Para descartar os dados locais do workshop, remover somente os recursos e volumes do
project `finbank` e recriar uma stack saudável:

```bash
npm run workshop:reset
```

O reset é destrutivo para `finbank_mongo_data` e `finbank_mongo_config`: ambos são
removidos e recriados pelo Compose. Ele não usa operações globais do Docker e não
alcança recursos de outros Compose projects.

## Smoke test Docker

O smoke integrado usa apenas Docker, cria projeto, rede, dois volumes e porta
temporários, valida a primeira subida e o reinício e remove somente esses recursos ao
terminar. Ele não faz parte de `npm test` e nunca usa nem remove
`finbank_mongo_data` ou `finbank_mongo_config`:

```bash
npm run test:docker
```

## Persistência local (DEV-010)

A stack prepara o replica set `rs0`, aplica `prisma db push` e inicializa a
baseline somente quando o perfil base ainda não existe. Reiniciar preserva os
saldos e os cadastros locais. Prisma e client usam a versão exata `6.19.0`;
não há migrações. O Mongo permanece acessível somente na rede Docker.

Com a stack iniciada:

```sh
docker compose exec api npm run db:push --workspace @finbank/api
docker compose exec api npm run db:seed --workspace @finbank/api
docker compose exec -e WORKSHOP_MODE=true api npm run db:reset --workspace @finbank/api
```

`db:seed` restaura as fixtures base e preserva perfis adicionais, suas contas,
intenções e transações. `db:reset` remove os dados dos cinco modelos e restaura a
baseline, em transação; exige `WORKSHOP_MODE=true` e a conexão efetiva com database
exatamente `finbank` ou `finbank_test`. Não apaga outras coleções nem databases.
O launcher `workshop:reset` mantém seu comportamento de recriar somente os volumes
próprios; a próxima inicialização restaura a baseline.

A baseline usa `PRO-1001` / `ACC-1001`, nome fictício Alex Exemplo, saldo
`14525000` e limite diário `10000000` centavos. A senha fictícia é `123456`,
persistida somente como hash scrypt com salt aleatório. São dois destinatários
fictícios (`marina@example.test` e `oficina@example.test`, somente hashes e máscaras
no banco) e cinco transações com referência em 18/08/2026, America/Sao_Paulo.
Hashes válidos existentes são preservados na reaplicação do seed.

O cadastro interno aceita nome após trim de 1 a 80 caracteres e senha de seis
dígitos; nomes podem se repetir. Cada perfil recebe uma conta exclusiva com os
mesmos saldo e limite iniciais e histórico vazio. Cadastro/seleção, intenções e confirmação estão descritos nas seções DEV-011/012/020/021 abaixo. `requestId` não tem índice único.

Para desenvolvimento, com Node/npm nas versões do projeto:

```sh
npm ci
npm run prisma:generate --workspace @finbank/api
npm run build
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:docker
```

`test:docker` cria uma stack isolada com volumes próprios, testa o runtime com
client/engines gerados, executa integração real de repositories, seed/reset em
`finbank_test` e remove os volumes de teste ao terminar. Não publica Mongo no host.
O teste de health HTTP usa PactumJS; os testes unitários independem de Mongo.

## API de perfis, conta e destinatários (DEV-011)

Com `npm run workshop:start`, use `http://localhost:8080/api/v1`.
O cadastro local cria uma conta fictícia própria. A seleção identifica a conta
por requisição; não é login nem garante privacidade entre pessoas com acesso à
mesma instalação.

```sh
curl -s http://localhost:8080/api/v1/profiles
curl -s http://localhost:8080/api/v1/profiles \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Pessoa Exemplo","transactionPassword":"012345"}'
```

POST retorna 201 e `{profileId, displayName, accountId}`; GET retorna um array
ordenado por `profileId`. O nome é normalizado com trim, aceita 1–80 caracteres
e pode se repetir. A senha é uma string de seis dígitos. Campos adicionais,
inclusive `workspaceId`, são rejeitados com 400 (`INVALID_PROFILE_INPUT`).

Copie o `profileId` retornado para selecionar a conta:

```sh
curl -s http://localhost:8080/api/v1/accounts/me \
  -H 'X-Local-Profile-Id: PRO-ID-RETORNADO'
curl -s http://localhost:8080/api/v1/accounts/me
```

Sem header, usa o perfil base `PRO-1001`. Header vazio, repetido ou malformado
retorna 400 (`INVALID_LOCAL_PROFILE`); ID válido inexistente retorna 404
(`LOCAL_PROFILE_NOT_FOUND`). IDs seguem `PRO-` e caracteres alfanuméricos/hífens.
A conta retorna somente `accountId`, `profileId`, `ownerName`, `documentMasked`,
`balanceCents` e `dailyLimitCents`; valores monetários são inteiros em centavos.

```sh
curl -sG http://localhost:8080/api/v1/recipients/resolve \
  --data-urlencode 'key=marina@example.test'
curl -s http://localhost:8080/api/v1/recipients/frequent
```

As fixtures usam chaves de email fictícias. Chave ausente, repetida ou malformada
retorna 400 (`INVALID_PIX_KEY`); email válido sem cadastro retorna 404
(`RECIPIENT_NOT_FOUND`). Destinatários retornam somente `recipientId`, `name`,
`pixKeyMasked`, `documentMasked` e `institution`. A listagem de perfis e contatos
é local e não exige seleção de conta.

Erros usam `application/problem+json`, com `type`, `title`, `status`, `code`,
`detail`, `requestId` e `traceId`. Falhas inesperadas retornam 500
(`PROCESSING_ERROR`), sem detalhes internos. O parser da API retorna 413
(`PAYLOAD_TOO_LARGE`) para JSON acima de 100 KiB e 415
(`UNSUPPORTED_MEDIA_TYPE`) para charset ou codificação incompatível, usando
o mesmo envelope seguro. Senhas, hashes, chaves completas e
IDs físicos do Mongo não integram os DTOs. O gateway não registra URLs da API,
que podem conter chaves nas consultas.

`npm run test:docker` verifica cadastro, seleção, conta e destinatários pelo
gateway e executa PactumJS com MongoDB real em `finbank_test`. Arquivos de teste
que restauram esse banco executam sequencialmente. Intenções, confirmação PIX e
histórico HTTP estão descritos abaixo. Telas funcionais pertencem ao G3.

## Intenções PIX (DEV-012)

A intenção prepara um pagamento e permite revisão antes da autenticação.
Criar ou editar não debita nem reserva saldo, não consome limite e não cria
transação. Selecione o perfil com o mesmo header da consulta de conta:

```sh
curl -s http://localhost:8080/api/v1/pix/intents \
  -H 'Content-Type: application/json' \
  -H 'X-Local-Profile-Id: PRO-ID-RETORNADO' \
  -d '{"requestId":"REQ-EXEMPLO-1","recipientId":"REC-1001","amountCents":5000,"deviceId":"DEV-EXEMPLO","description":"Pagamento fictício"}'
curl -s http://localhost:8080/api/v1/pix/intents/REQ-EXEMPLO-1 \
  -H 'X-Local-Profile-Id: PRO-ID-RETORNADO'
curl -s -X PATCH http://localhost:8080/api/v1/pix/intents/REQ-EXEMPLO-1 \
  -H 'Content-Type: application/json' \
  -H 'X-Local-Profile-Id: PRO-ID-RETORNADO' \
  -d '{"amountCents":6000,"description":"Descrição revisada"}'
```

POST retorna 201; GET/PATCH retornam 200. O DTO contém `requestId`, `accountId`,
`recipientId`, `amountCents`, `description`, `deviceId`, `state`, `createdAt` e
`expiresAt`. Datas são ISO; a intenção nasce em `DRAFT`, com validade de cinco
minutos. A consulta continua disponível após expirar, mas a edição exige
validade e estado anterior ao processamento (`DRAFT` ou `AUTH_PENDING`).

O valor é um inteiro positivo em centavos, limitado ao Int32 do armazenamento.
`requestId`, `recipientId` e `deviceId` usam prefixos `REQ-`, `REC-` e `DEV-`,
respectivamente, com caracteres alfanuméricos/hífens e até 100 caracteres.
Descrição é opcional no cadastro (padrão vazio), string com até 140 caracteres.
PATCH aceita um ou mais entre `recipientId`, `amountCents`, `description` e
`deviceId`; preserva identificador, conta, datas e estado.

A soma de transações `APPROVED` da conta no dia civil de America/Sao_Paulo,
mais o valor da intenção, pode ser igual ao limite diário. O dia da transação
usa `processedAt`, com `createdAt` quando aquela data está ausente. Outros
estados, dias e contas não entram na soma. Saldo também é validado em cada
criação/edição; nenhuma dessas consultas garante saldo para confirmação futura.

Erros funcionais seguem `application/problem+json`:

- 400 `INVALID_PIX_INTENT`: campos ou valores inválidos.
- 422 `INSUFFICIENT_BALANCE` ou `DAILY_LIMIT_EXCEEDED`.
- 404 `RECIPIENT_NOT_FOUND` ou `PIX_INTENT_NOT_FOUND`; intenção de outra conta
  recebe o mesmo erro de uma intenção ausente.
- 410 `PIX_INTENT_EXPIRED`; 409 `PIX_INTENT_NOT_EDITABLE`.

Autenticação, confirmação, débito e avaliação de risco estão descritos abaixo. O smoke Docker cobre criação, leitura e edição pelo gateway; a
integração com Mongo real cobre limites inclusivos e ausência de efeitos.

## Confirmação PIX e risco (DEV-020/021)

Após revisar uma intenção válida, confirme com a senha transacional do perfil:

```sh
curl -s http://localhost:8080/api/v1/pix/intents/REQ-EXEMPLO-1/confirm \
  -H 'Content-Type: application/json' \
  -H 'X-Local-Profile-Id: PRO-ID-RETORNADO' \
  -d '{"transactionPassword":"012345"}'
```

O corpo aceita somente `transactionPassword`; valor, conta e destinatário são
relidos da intenção. A senha é verificada contra o hash da conta selecionada.
Senha ausente, malformada ou incorreta retorna 422
`INVALID_TRANSACTION_PASSWORD`, sem alterar intenção ou dados financeiros.
Corpo inválido ou campos extras retornam 400 `INVALID_PIX_CONFIRMATION`.

A confirmação revalida validade, estado, destinatário, saldo e limite diário.
Intenção de outra conta retorna 404 `PIX_INTENT_NOT_FOUND`; expirada retorna 410
`PIX_INTENT_EXPIRED`; estado que não admite confirmação retorna 409
`PIX_INTENT_NOT_CONFIRMABLE`. Saldo/limite insuficientes retornam os mesmos erros
422 da preparação. Erros seguem o envelope seguro `application/problem+json`.

Após as validações, o avaliador obrigatório usa somente o valor atual e a
configuração `PIX_REVIEW_AMOUNT_CENTS`. Configure em `.env` um inteiro positivo
seguro em centavos; ausência usa `500000` (R$ 5.000,00). Valor presente vazio,
fracionário, negativo ou inválido impede inicialização. O Compose encaminha a
configuração para a API, inclusive valores vazios para validação.

- Abaixo do limiar: HTTP 200, `APPROVED`, `[WITHIN_CURRENT_RULES]` e débito exato.
- No limiar ou acima: HTTP 202, `REVIEW`, `[AMOUNT_REQUIRES_REVIEW]`, sem débito
  nem reserva de saldo; não consome limite diário.

A resposta contém somente `requestId`, `transactionId`, `status`, `reasonCodes`
e `processedAt` ISO. Em REVIEW, esse instante registra a decisão, não liquidação.
Transação, snapshot mascarado, estado final e eventual débito são persistidos
atomicamente no MongoDB. Falha do avaliador ou entre gravações desfaz a operação
inteira e retorna `500 PROCESSING_ERROR`. O score interno não é exposto em
respostas ou logs. Histórico está disponível por porta injetável sem alterar o
risco; aprovações do dia de São Paulo continuam compondo o limite diário.

Não há resolução de REVIEW, análise comportamental ou idempotência robusta.
O smoke Docker verifica aprovação e revisão pelo gateway com saldo e
persistência reais; integração Mongo cobre igualdade, adjacências e rollback.

### Histórico e detalhe de transações

`GET /api/v1/transactions` consulta somente a conta selecionada por
`X-Local-Profile-Id` (ausente: perfil base). A resposta contém `items`, `page`,
`pageSize`, `totalItems` e `totalPages`. Ordenação: `createdAt` decrescente,
desempate por `transactionId` crescente. Contagens consideram todos os filtros;
página além do fim retorna lista vazia, mantendo as contagens reais.

- `page`: inteiro positivo, padrão 1; `pageSize`: 1 a 100, padrão 20.
- `from` e `to`: datas de calendário `YYYY-MM-DD`, inclusivas em
  `America/Sao_Paulo`, sobre `createdAt`. Cada limite pode ser usado sozinho.
- `status`: `APPROVED`, `REVIEW`, `REJECTED` ou `FAILED`; `type`: somente `PIX`.
- `search`: substring literal sem distinção de maiúsculas em `transactionId`,
  `requestId` e nome do snapshot do destinatário; trim e máximo 100 caracteres.

Filtros opcionais vazios equivalem à ausência; `page`/`pageSize` vazios,
parâmetros desconhecidos, repetidos, estruturados e offsets inseguros retornam
`400 INVALID_TRANSACTION_QUERY`. Exemplo:
`http://localhost:8080/api/v1/transactions?from=2026-08-18&status=APPROVED&pageSize=2`.

`GET /api/v1/transactions/:transactionId` retorna a mesma projeção dos itens:
identificadores da transação e requisição, tipo PIX, snapshot mascarado,
valor em centavos, descrição, status, reasonCodes e datas ISO. `processedAt`
preserva `null`. A consulta mantém o snapshot e a decisão persistidos.
Transação inexistente ou de outra conta retorna `404 TRANSACTION_NOT_FOUND`.
Falhas de banco usam `500 PROCESSING_ERROR`, sem detalhes internos.

### Relatórios dos testes

Os comandos existentes agora preservam resultados em `reports/`:

- `npm test`: `reports/unit/summary.md`, `summary.json`, logs e JUnit XML de
  API (`api.xml`), web (`web.xml`), contratos (`contracts.xml`) e fundação/launcher
  (`foundation.xml`).
- `npm run test:docker`: `reports/docker/summary.md`, `summary.json`, `smoke.log`
  e `api-integration.xml` com os resultados Pactum/Vitest no Mongo real.

Os logs continuam aparecendo no terminal. Cada comando substitui somente seus
próprios relatórios anteriores e preserva código de saída de falha; suítes não
executadas não deixam XML antigo parecendo resultado novo. Se o Docker falhar
antes da integração, o resumo e o log registram a falha sem inventar um XML.
O relatório de integração é gravado no host por bind mount antes da remoção do
container. Execuções simultâneas do mesmo comando devem usar checkouts separados.

JUnit é compatível com leitores de resultados de CI. Estes relatórios registram
execução de testes; não incluem medição de cobertura de código. `reports/` fica
fora do Git, da formatação e do contexto de build Docker.

## Testes E2E (DEV-041)

A suíte pública Cypress (`apps/web/cypress/e2e`) cobre os quatro cenários de
`dev/06-estrategia-de-testes.md`: login → PIX aprovado → comprovante →
histórico; valor inválido não avança; valor alto entra em análise; senha
incorreta não processa. Unitário e integração/API continuam nas seções
"Validação" e "Smoke test Docker" acima; esta seção cobre só o E2E, novo
nesta história.

A suíte roda contra a aplicação servida via HTTP de verdade (não em memória),
então exige a stack Docker de pé:

```sh
npm run workshop:start
npm run test:e2e --workspace apps/web
npm run workshop:stop
```

`test:e2e` aponta por padrão para `http://localhost:8080` (mesma URL do
launcher). Para rodar contra outro ambiente (ex.: `npm run dev` local nas duas
apps), sobrescreva com a variável de ambiente nativa do Cypress:

```sh
CYPRESS_BASE_URL=http://localhost:5173 npm run test:e2e --workspace apps/web
```

Para depurar interativamente com a interface do Cypress:

```sh
npx cypress open --project apps/web
```

Cada teste chama `cy.resetWorkshop()` (`POST /api/v1/simulation/reset`, do
`SimulationModule` da DEV-040) antes de rodar, restaurando as fixtures base —
a ordem de execução não importa e reexecuções não acumulam estado.

`cypress run` precisa de um navegador real. Em ambientes sem GUI utilizável
o binário padrão (Electron embutido) pode falhar ao iniciar; nesse caso tente
`npx cypress run --browser chrome --project apps/web` com o Google Chrome
instalado, ou rode em uma máquina/CI com navegador disponível.

## Testes reservados do facilitador (DEV-042)

A suíte reservada (`facilitator/tests/{characterization,target}`) prova cada
um dos seis riscos didáticos RISK-01–RISK-06
(`dev/05-controle-didatico.md`, `dev/06-estrategia-de-testes.md`) contra a
API real. Nunca roda dentro de `npm test` nem é required check da CI
pública (`dev/08-docker-e-pipeline.md`).

- `characterization/`: prova o incidente como ele existe hoje no baseline —
  deve ficar verde.
- `target/`: descreve a correção pós-G5 (DEV-100–103) — falha por desenho
  até essas histórias serem implementadas.

Como `test:integration`, exige MongoDB com replica set real; API e MongoDB
não publicam portas no host, então a suíte roda dentro de um container Linux
na mesma rede do Compose (`finbank_backend`, nome fixo — não muda com
`COMPOSE_PROJECT_NAME`):

```sh
npm run workshop:start
docker build --target build -f apps/api/Dockerfile -t finbank-facilitator .
docker run --rm \
  --network finbank_backend \
  -v "$PWD/facilitator:/app/facilitator" \
  -e DATABASE_URL="mongodb://mongo:27017/finbank_test?replicaSet=rs0" \
  -e WORKSHOP_MODE=true \
  finbank-facilitator \
  npm run test:workshop-risks
docker image rm finbank-facilitator
npm run workshop:stop
```

Troque o último comando por `npm run test:workshop-risks:target` para rodar
a pasta `target` — as falhas são esperadas; cada mensagem de asserção
documenta a lacuna e a DEV-alvo (ex.: `expected 409 to be 200` no RISK-02,
alvo DEV-100).
