# Expor o finbank publicamente com ngrok

Procedimento local, opcional, para demonstração/acesso remoto ao app durante o workshop. Não faz parte do stack (`compose.yaml`) nem do launcher (`scripts/workshop.mjs`) — o ngrok roda fora do repositório, na máquina de quem está demonstrando.

> A DEV-003 preserva explicitamente "nenhum túnel público obrigatório e nenhuma dependência de internet no caminho local" (`dev/09-backlog.md`). Este documento é só um runbook operacional; não altera o comportamento padrão do app.

## Pré-requisitos

- `ngrok` instalado e no `PATH` (`ngrok version` deve responder).
- Conta ngrok com authtoken configurado uma vez (`ngrok config check` deve dizer "Valid configuration file").

Se ainda não tiver isso, veja [ngrok.com/download](https://ngrok.com/download) e [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).

## Subir o app

```bash
cd finbank
npm run workshop:start
```

Aguarda os healthchecks e confirma a aplicação em `http://localhost:8080/`.

## Abrir o túnel

Em outro terminal, apontando para a porta 8080 (gateway único):

```bash
ngrok http 8080
```

O terminal do ngrok mostra a URL pública (algo como `https://xxxx.ngrok-free.app`) e um dashboard local em `http://127.0.0.1:4040` para inspecionar as requisições.

No plano gratuito, essa URL muda a cada vez que o túnel é reiniciado.

## Verificar

- `https://xxxx.ngrok-free.app/` deve carregar o app normalmente.
- `https://xxxx.ngrok-free.app/api/health` deve responder `{"status":"ok"}`.
- `https://xxxx.ngrok-free.app/facilitator` e `/api/v1/facilitator/*` devem retornar **403**.

O 403 é esperado: o `nginx.conf` do gateway (`apps/web/nginx.conf`) distingue `Host` local de externo e bloqueia rotas administrativas do facilitador para qualquer acesso que não venha de `localhost`/`127.0.0.1` (ver `dev/02-arquitetura.md`: "MongoDB, porta 3000 e endpoints administrativos nunca devem ser publicados"). Isso não deve ser contornado.

## Encerrar

```bash
# parar o túnel
pkill ngrok

# derrubar o stack, se necessário
npm run workshop:stop
```
