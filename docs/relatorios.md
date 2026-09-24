# Relatórios de testes públicos (`/reports`)

Implementa o critério de aceite da DEV-003 ("aplicação, `/api`, `/reports` e
`/workshop` funcionam na porta 8080", "relatórios são servidos somente para
leitura") e da DEV-004 ("relatórios públicos são idênticos para os grupos e
somente leitura"), conforme especificado em
[`dev/02-arquitetura.md`](../../dev/02-arquitetura.md) ("Relatórios de testes
locais").

## Gerar os relatórios

Com a stack no ar (`npm run workshop:start` — necessário para as pernas de
integração e E2E, que sobem contra `http://localhost:8080`):

```bash
cd finbank
npm run reports:build
```

Isso roda, em sequência, e grava em `artifacts/test-reports/`:

| Pasta              | Suíte                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit-backend/`    | testes unitários do `@finbank/api` (Vitest)                                                                                                         |
| `unit-frontend/`   | testes unitários do `@finbank/web` (Vitest)                                                                                                         |
| `integration-api/` | testes de integração da API (`test:docker`, sobe uma stack Mongo isolada própria e descarta ao final — não depende do `workshop:start` estar no ar) |
| `e2e-system/`      | Cypress (E2E do sistema), via Docker (ver nota abaixo)                                                                                              |

`e2e-system` roda o Cypress dentro do container `cypress/included` (Chrome +
dependências de sistema já embutidas), em vez do binário instalado pelo npm
— evita depender do cache local do Cypress, que pode estar quebrado ou
desatualizado na máquina de quem está gerando o relatório. Ele compartilha a
network namespace do próprio container `web` (`--network
container:finbank-web-1`) e acessa `http://localhost:8080`: isso é
necessário porque `crypto.randomUUID()` (usado para gerar o `requestId` do
PIX) só existe em contexto seguro do navegador, e `localhost` é a única
forma de ter isso em HTTP puro sem certificado — apontar para `web:8080` ou
`host.docker.internal:8080` faz esses testes falharem com um erro genérico.
Só precisa do Docker instalado; não precisa de Cypress nenhum na máquina.

...e gera `artifacts/test-reports/index.html` a partir do `summary.json` de
cada pasta. Também dá para rodar cada etapa isoladamente:
`npm run test:unit:backend`, `test:unit:frontend`,
`test:integration:report`, `test:e2e:report`, `reports:index`.

Esse pipeline é **separado** do `reports/` que já existe (usado pelo
`ci.yml`) — não altera nada do que já funciona na CI.

## Acesso

- **Web**: `http://localhost:8080/reports/` — índice com suíte, horário de
  início e resultado (aprovado/falhou/não executado) de cada uma.
- **"API"** (arquivos estáticos, sem endpoint dedicado no backend): o
  `summary.json` de cada suíte é consultável diretamente, ex.:

  ```bash
  curl http://localhost:8080/reports/unit-backend/summary.json
  curl http://localhost:8080/reports/integration-api/summary.json
  ```

  Formato de cada `summary.json`: `{ startedAt, status, results: [{ name,
exitCode }] }`. Os `.xml` (JUnit) e `.log` de cada etapa também ficam
  disponíveis na mesma pasta, para quem quiser o detalhe bruto.

O gateway (`nginx`) serve `artifacts/test-reports/` montada como volume
somente leitura em `/usr/share/nginx/html/reports` — não precisou de nenhuma
mudança no `nginx.conf`: como o arquivo existe de verdade no docroot, ele é
servido diretamente, sem passar pelo fallback de SPA do Vue Router (que nem
tem rota `/reports`).

**Sem bloqueio de rede**: ao contrário de `/facilitator`, `/reports` não fica
restrito a `Host` local — é intencionalmente alcançável em modo de rede (e
via ngrok, [docs/ngrok.md](./ngrok.md)), já que são resultados públicos,
iguais para todos os grupos.

## O que nunca aparece aqui

O índice e as suítes acima nunca leem `facilitator/tests`
(`characterization`/`target`, RISK-01–06) — isso é conteúdo reservado do
facilitador (`test:workshop-risks`, `test:workshop-risks:target`) e não deve
vazar em relatório público, conforme `dev/12-definition-of-done.md` e
`dev/13-rastreabilidade.md`.
