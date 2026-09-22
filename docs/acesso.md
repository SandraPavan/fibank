# Acesso ao finbank: usuários, cadastro e facilitador

Com a stack no ar (`npm run workshop:start`):

- App: http://localhost:8080/
- API: http://localhost:8080/api/v1
- Painel do facilitador: http://localhost:8080/facilitator (somente local — ver seção abaixo)

## Usuário padrão (fixture)

O seed (`apps/api/src/database/fixtures.ts`, `apps/api/src/database/seed.ts`) cria sempre este perfil base em cada workspace:

| Campo | Valor |
|---|---|
| `profileId` | `PRO-1001` |
| `accountId` | `ACC-1001` |
| Nome | Alex Exemplo |
| Saldo | `14525000` centavos (R$ 145.250,00) |
| Limite diário | `10000000` centavos (R$ 100.000,00) |
| Senha transacional | `123456` (armazenada só como hash scrypt) |

Destinatários fictícios disponíveis: `marina@example.test` (Marina Exemplo) e `oficina@example.test` (Oficina Modelo).

## Login

A tela `/login` (`apps/web/src/views/LoginView.vue`) é **fictícia**: o formulário de email/senha não chama nenhuma API — o envio só navega para a primeira tela do fluxo PIX. Não existe `POST /auth/login` no backend.

A identificação real de qual conta usar é feita por requisição, via header `X-Local-Profile-Id`. Sem esse header, a API usa sempre o perfil base `PRO-1001`. Isso não é login nem garante privacidade entre pessoas com acesso à mesma instalação — é assim por design do baseline (DEV-011).

## Cadastrar um novo perfil/conta

Cada cadastro cria um perfil + conta próprios (mesmo saldo/limite iniciais da baseline, histórico vazio). Não há e-mail — só nome e uma senha transacional de 6 dígitos:

```bash
curl -s http://localhost:8080/api/v1/profiles \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Pessoa Exemplo","transactionPassword":"012345"}'
```

Retorna `201` com `{profileId, displayName, accountId}`. Guarde o `profileId` retornado (prefixo `PRO-`) e use-o no header `X-Local-Profile-Id` nas chamadas seguintes (consulta de conta, intenção PIX, confirmação, histórico):

```bash
curl -s http://localhost:8080/api/v1/accounts/me \
  -H 'X-Local-Profile-Id: PRO-ID-RETORNADO'
```

Listar todos os perfis já cadastrados:

```bash
curl -s http://localhost:8080/api/v1/profiles
```

Não existe tela para isso ainda — é só via API (o formulário de login não cadastra nem seleciona perfil).

## Grupos isolados (workspaces)

Cada grupo tem seus próprios dados (contas, transações), isolados dos demais (DEV-004). Só o facilitador cria um grupo; a criação é só por API — o painel web não tem esse botão.

**1. Facilitador cria o grupo:**

```bash
curl -s http://localhost:8080/api/v1/facilitator/workspaces \
  -H 'Content-Type: application/json' \
  -H 'X-Facilitator-Secret: SEU_SEGREDO' \
  -d '{"groupSlug":"turma-a"}'
```

Retorna `{workspaceId, groupSlug, createdAt, code}`. O `code` só aparece nessa resposta — guarde-o para montar o link do grupo.

**2. Compartilhe o link com o grupo:**

```
http://localhost:8080/join/turma-a?code=CODIGO_RETORNADO
```

Ao abrir, o participante autentica a sessão do grupo (cookie), e o app redireciona para `/login` já sem o código na URL.

**3. Outras ações do facilitador sobre grupos** (todas exigem o header `X-Facilitator-Secret`):

```bash
# listar grupos
curl -s http://localhost:8080/api/v1/facilitator/workspaces \
  -H 'X-Facilitator-Secret: SEU_SEGREDO'

# métricas de um grupo
curl -s http://localhost:8080/api/v1/facilitator/workspaces/turma-a/metrics \
  -H 'X-Facilitator-Secret: SEU_SEGREDO'

# resetar um grupo (restaura a baseline)
curl -s -X POST http://localhost:8080/api/v1/facilitator/workspaces/turma-a/reset \
  -H 'X-Facilitator-Secret: SEU_SEGREDO'

# resetar todos os grupos, incluindo o workspace padrão
curl -s -X POST http://localhost:8080/api/v1/facilitator/workspaces/reset-all \
  -H 'X-Facilitator-Secret: SEU_SEGREDO'
```

`default` é o slug reservado do workspace padrão (o mesmo usado quando ninguém passou por um `/join/...`).

## Grupos e participantes já cadastrados (workshop atual)

Os 5 grupos abaixo já foram criados via `POST /api/v1/facilitator/workspaces` e cada um recebeu 5 perfis extras via `POST /api/v1/profiles` (script único, não fica salvo no repositório). Senha transacional de todos os perfis: `123456`.

> **Limite importante:** o app web (`localhost:8080`) não tem seletor de perfil — ele sempre atua como o perfil base (`PRO-1001`) do workspace atual (`apps/web/src/api/http.ts` nunca envia `X-Local-Profile-Id`). Ou seja, as 5 pessoas de um grupo, navegando pelo navegador, **compartilham a mesma conta** (a base do grupo). Os 5 perfis extras abaixo só são utilizáveis via API/curl, passando `X-Local-Profile-Id` manualmente — não há hoje uma tela para cada participante logar com o seu próprio perfil.

### grupo-1

- Link de entrada (navegador, usa a conta base do grupo): `http://localhost:8080/join/grupo-1?code=FNWHS4`
- Código do grupo: `FNWHS4`

| # | displayName | profileId | accountId | senha transacional |
|---|---|---|---|---|
| 1 | Participante 1 | `PRO-cfadfd68-9b36-4d85-9c55-2aef77bf510a` | `ACC-bf1fdaed-85f8-4605-a59d-1b690af31b5c` | `123456` |
| 2 | Participante 2 | `PRO-3bf59e3c-fde7-496a-90db-6a2777c02f6a` | `ACC-4b89536a-e804-4106-8de7-0e76a27b28d2` | `123456` |
| 3 | Participante 3 | `PRO-8e725ec5-ba22-4a93-90eb-c4fb5f7c8316` | `ACC-6205624e-9ffe-41ec-9061-e00c82495b4d` | `123456` |
| 4 | Participante 4 | `PRO-dbdee942-958e-49f6-b115-182a190da7ae` | `ACC-9c122d30-b9d5-49ca-876a-1c7ea41aa67f` | `123456` |
| 5 | Participante 5 | `PRO-1d653395-2580-4a1d-93f1-9f8b74f89026` | `ACC-d416a454-4a2f-442b-a532-9c47e34431fb` | `123456` |

### grupo-2

- Link de entrada (navegador, usa a conta base do grupo): `http://localhost:8080/join/grupo-2?code=CBWBF9`
- Código do grupo: `CBWBF9`

| # | displayName | profileId | accountId | senha transacional |
|---|---|---|---|---|
| 1 | Participante 1 | `PRO-f5a37420-9c35-4d91-89ee-023a7416a0e7` | `ACC-0e12665f-6bfd-4336-a74f-b9717796d8f6` | `123456` |
| 2 | Participante 2 | `PRO-7a80abeb-9646-46d2-9d53-e8d87ab35e10` | `ACC-0e5a68af-5b3a-44e1-969a-0b10035e4a30` | `123456` |
| 3 | Participante 3 | `PRO-60475fc9-1ce4-478d-9a29-be9da9ef604e` | `ACC-45559c6c-22ce-42b8-a318-1308e659fdef` | `123456` |
| 4 | Participante 4 | `PRO-4c1c6c08-d0d2-4e5d-bbf9-1915680695c2` | `ACC-4245647e-af39-40f7-9476-e1052507b424` | `123456` |
| 5 | Participante 5 | `PRO-af8309b0-84c7-44d2-92d6-7d1e5e7d1bd7` | `ACC-f5b82d73-ebd5-4282-8150-91617b65ef1b` | `123456` |

### grupo-3

- Link de entrada (navegador, usa a conta base do grupo): `http://localhost:8080/join/grupo-3?code=X36MQN`
- Código do grupo: `X36MQN`

| # | displayName | profileId | accountId | senha transacional |
|---|---|---|---|---|
| 1 | Participante 1 | `PRO-0668ca39-4b7a-487a-9fd3-f104266ffe54` | `ACC-b796a9d2-58bd-45f6-9fea-03cca7b944ae` | `123456` |
| 2 | Participante 2 | `PRO-d5523b72-6726-4a49-aae9-5424d4dd25b6` | `ACC-5f4ad75d-f25f-43ab-a644-bb4a1b0aa8c3` | `123456` |
| 3 | Participante 3 | `PRO-6f4b0f67-f6dc-424d-b5eb-c8d59110eb22` | `ACC-a06b411e-a1f7-44b3-9ccd-0e145883bea3` | `123456` |
| 4 | Participante 4 | `PRO-fa3bdaa6-ac03-4770-8db8-513bd862d77b` | `ACC-46acb2e7-5e9e-4b22-b53b-5708f0eb5fc0` | `123456` |
| 5 | Participante 5 | `PRO-c73c6f2e-d9fe-40a4-a7cf-5e350b8bc1fe` | `ACC-b6b100d9-c34c-4121-adce-00776e54641e` | `123456` |

### grupo-4

- Link de entrada (navegador, usa a conta base do grupo): `http://localhost:8080/join/grupo-4?code=9TWRLF`
- Código do grupo: `9TWRLF`

| # | displayName | profileId | accountId | senha transacional |
|---|---|---|---|---|
| 1 | Participante 1 | `PRO-8658fe85-bdac-4561-a476-f4ec987e0b0b` | `ACC-110b6100-ef6b-48a9-b55f-ed39866d9be6` | `123456` |
| 2 | Participante 2 | `PRO-4565654a-72d0-4f5b-a6f8-61011940a7e3` | `ACC-f9d9854b-019d-45ea-bcae-0bdb5bb5b471` | `123456` |
| 3 | Participante 3 | `PRO-3abfa469-1fe1-4110-93f6-c3c1d166a1ce` | `ACC-ea63876e-affb-4b6a-9389-c761855511f4` | `123456` |
| 4 | Participante 4 | `PRO-36c41d71-b5dc-49ce-a61f-2c9284914cd2` | `ACC-aedf22a9-0093-47da-8109-d50dc0316a36` | `123456` |
| 5 | Participante 5 | `PRO-ab453d15-f9cd-4d51-ac85-92e0b671e831` | `ACC-35b434c2-1143-4eeb-8ed2-8cc27dbb15dc` | `123456` |

### grupo-5

- Link de entrada (navegador, usa a conta base do grupo): `http://localhost:8080/join/grupo-5?code=RTFTZQ`
- Código do grupo: `RTFTZQ`

| # | displayName | profileId | accountId | senha transacional |
|---|---|---|---|---|
| 1 | Participante 1 | `PRO-2c788651-3494-460b-954e-4ef2df2e1274` | `ACC-c66dafb6-d63e-4975-a4a0-60405961a3b7` | `123456` |
| 2 | Participante 2 | `PRO-8e9410a3-fe3f-4c10-a10e-6446189da686` | `ACC-05b4df4d-7a02-47ec-b3e0-d9772f978b35` | `123456` |
| 3 | Participante 3 | `PRO-3aecd69d-add0-43d0-beea-b379f1bf8e82` | `ACC-6e350ae5-47bb-4349-9d66-a0d17345d464` | `123456` |
| 4 | Participante 4 | `PRO-5eb49258-2a85-4b0a-944c-cdbad334f4ba` | `ACC-30077b64-148f-4ed6-99d4-0deb3ef414b7` | `123456` |
| 5 | Participante 5 | `PRO-8878763d-c88f-4a2f-b406-78be958dbe9a` | `ACC-9ff0b97e-b05a-4f56-8d7d-1779a18fb43e` | `123456` |

Esses perfis extras existem apenas no volume Mongo atual: se a stack rodar `workshop:reset` (ou `reset-all`/`reset` pelo facilitador), eles somem e só a baseline volta. Para recriar, repita `POST /api/v1/facilitator/workspaces` (seção anterior) e depois `POST /api/v1/profiles` autenticado com o cookie de sessão de cada grupo (`POST /api/v1/sessions/join`).

## Acessar o painel do facilitador

1. Abra http://localhost:8080/facilitator.
2. Informe o "Segredo do facilitador" no formulário.

O segredo é a variável de ambiente `FACILITATOR_ACCESS_CODE` (`finbank/.env.example`), com o valor padrão `local-facilitator-code` quando não configurada. Para trocar, defina `FACILITATOR_ACCESS_CODE` no `.env` antes de subir a stack.

O painel é **somente leitura**: mostra a lista de grupos e métricas agregadas (aprovadas, em análise, em análise há mais de 24h, rejeitadas, falhas) por grupo. Criar/resetar grupo continua exclusivo da API (seção anterior) — o painel não executa comandos.

> **Importante:** `/facilitator` e todas as rotas `/api/v1/facilitator/*` só respondem quando o `Host` da requisição é `localhost` ou `127.0.0.1` (bloqueio no `nginx.conf` do gateway). Mesmo com o app exposto via ngrok ([docs/ngrok.md](./ngrok.md)), o painel do facilitador continua acessível só localmente — isso é intencional e não deve ser contornado.
