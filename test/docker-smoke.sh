#!/bin/sh
set -eu

mkdir -p reports/docker

suffix="$$"
project="finbank-smoke-$suffix"
network="${project}_backend"
volume="${project}_mongo_data"
config_volume="${project}_mongo_config"

compose() {
  PIX_REVIEW_AMOUNT_CENTS=500000 \
    COMPOSE_PROJECT_NAME="$project" \
    FINBANK_NETWORK_NAME="$network" \
    FINBANK_MONGO_VOLUME_NAME="$volume" \
    FINBANK_MONGO_CONFIG_VOLUME_NAME="$config_volume" \
    docker compose -p "$project" -f compose.yaml -f test/docker-smoke.override.yaml "$@"
}

fail() {
  printf '%s\n' "falha: $*" >&2
  exit 1
}

assert_healthy() {
  service="$1"
  container="$(compose ps -q "$service")"
  [ -n "$container" ] || fail "serviço $service não possui container em execução."
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  [ "$status" = "healthy" ] || fail "serviço $service não está healthy; estado: $status"
}

assert_init_succeeded() {
  container="$(compose ps -a -q mongo-init)"
  [ -n "$container" ] || fail "mongo-init não possui container."
  status="$(docker inspect --format '{{.State.Status}}' "$container")"
  exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container")"
  [ "$status" = "exited" ] && [ "$exit_code" = "0" ] ||
    fail "mongo-init não concluiu com sucesso; estado: $status, código: $exit_code"
}

assert_mongo_named_volumes() {
  container="$(compose ps -q mongo)"
  [ -n "$container" ] || fail "serviço mongo não possui container em execução."
  mounts="$(docker inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name .Destination}}{{end}}{{end}}' "$container" | awk 'NF' | sort)"
  expected="$(printf '%s\n' "$config_volume /data/configdb" "$volume /data/db" | sort)"
  [ "$mounts" = "$expected" ] ||
    fail "mounts persistentes inesperados no Mongo: $mounts"
}

wait_for_web_unhealthy() {
  container="$(compose ps -q web)"
  attempt=1
  while [ "$attempt" -le 15 ]; do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
    [ "$status" = "unhealthy" ] && return 0
    attempt=$((attempt + 1))
    sleep 1
  done
  fail "gateway não ficou unhealthy após a indisponibilidade da API."
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker image rm "$project-integration" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker compose -f compose.yaml config >/dev/null
resolved="$(compose config)"
printf '%s\n' "$resolved" | grep -Eq '(^|:)latest([[:space:]]|$)' &&
  fail "modelo Compose resolvido contém tag latest."

if ! compose up --build --wait; then
  compose logs api
  fail "stack não inicializou."
fi

primary="$(compose exec -T mongo mongosh --quiet --eval 'print(rs.status().myState)')"
[ "$primary" = "1" ] || fail "replica set não está PRIMARY; estado: $primary"

compose ps -a
assert_healthy mongo
assert_healthy api
assert_healthy web
assert_init_succeeded
assert_mongo_named_volumes

compose exec -T mongo mongosh --quiet --eval \
  'const data = db.getSiblingDB("finbank_test"); const account = data.Account.findOne({accountId: "ACC-1001"}); if (!account || Number(account.balanceCents) !== 14525000 || data.LocalProfile.countDocuments({profileId: "PRO-1001"}) !== 1 || data.Recipient.countDocuments() !== 2 || data.Transaction.countDocuments({accountId: "ACC-1001"}) !== 5) { print("Fixtures iniciais ausentes ou divergentes."); quit(1); } data.Account.updateOne({accountId: "ACC-1001"}, {$set: {balanceCents: NumberInt(12345)}});'

published="$(compose port web 8080)"
case "$published" in
  127.0.0.1:*) port="${published##*:}" ;;
  *) fail "publicação inesperada da web: $published" ;;
esac

published_count="$(compose ps --format '{{range .Publishers}}{{println .PublishedPort}}{{end}}' | awk '$1 > 0 { count++ } END { print count + 0 }')"
[ "$published_count" -eq 1 ] ||
  fail "esperado somente um mapeamento publicado; encontrado: $published_count"

compose run --rm --no-deps api \
  node -e "Promise.all([fetch('http://host.docker.internal:$port/',{signal:AbortSignal.timeout(5000)}),fetch('http://host.docker.internal:$port/api/health',{signal:AbortSignal.timeout(5000)})]).then(async ([web,health])=>{const html=await web.text();if(!web.ok||!html.includes('<title>FinBank PIX Seguro</title>')||!health.ok||JSON.stringify(await health.json())!=='{\"status\":\"ok\"}')process.exit(1)}).catch(()=>process.exit(1))"

compose exec -T mongo mongosh --quiet --eval \
  'db.getSiblingDB("dev002_smoke").sentinel.updateOne({_id: "preserved"}, {$set: {value: "ok"}}, {upsert: true})' >/dev/null

compose restart
compose up --wait
assert_healthy mongo
assert_healthy api
assert_healthy web
assert_init_succeeded
assert_mongo_named_volumes

sentinel="$(compose exec -T mongo mongosh --quiet --eval 'print(db.getSiblingDB("dev002_smoke").sentinel.countDocuments({_id: "preserved", value: "ok"}))')"
[ "$sentinel" = "1" ] || fail "documento sentinela não sobreviveu ao reinício."

compose exec -T mongo mongosh --quiet --eval \
  'const data = db.getSiblingDB("finbank_test"); const account = data.Account.findOne({accountId: "ACC-1001"}); if (!account || Number(account.balanceCents) !== 12345 || data.Transaction.countDocuments({accountId: "ACC-1001"}) !== 5) { print("Dados de domínio alterados no reinício."); quit(1); }'

published="$(compose port web 8080)"
case "$published" in
  127.0.0.1:*) port="${published##*:}" ;;
  *) fail "publicação inesperada da web após reinício: $published" ;;
esac

compose run --rm --no-deps api \
  node -e "fetch('http://host.docker.internal:$port/api/health',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

compose run --rm --no-deps -T \
  -e FINBANK_SMOKE_URL="http://host.docker.internal:$port" api \
  node --input-type=module < test/api-gateway-smoke.mjs

if compose logs --no-color api web | grep -Eq 'marina(@|%40)example\.test|invalid-private-key|012345|654321|riskScore|PIX_REVIEW_AMOUNT_CENTS'; then
  fail "logs da API/gateway contêm entrada sensível da verificação funcional."
fi

compose exec -T mongo mongosh --quiet --eval \
  'const data = db.getSiblingDB("finbank_test"); const tx = data.Transaction.findOne({requestId: "REQ-GATEWAY-012"}); if (!tx || tx.status !== "APPROVED" || Number(tx.amountCents) !== 6000 || Number(tx.riskScore) !== 40 || tx.recipientSnapshot.recipientId !== "REC-1001" || data.Transaction.countDocuments({requestId: "REQ-GATEWAY-012"}) !== 1) { print("Confirmação não corresponde à transação persistida."); quit(1); }'

compose exec -T mongo mongosh --quiet --eval \
  'const data = db.getSiblingDB("finbank_test"); const tx = data.Transaction.findOne({requestId: "REQ-GATEWAY-021"}); const intent = data.PixIntent.findOne({requestId: "REQ-GATEWAY-021"}); const account = tx && data.Account.findOne({accountId: tx.accountId}); if (!tx || tx.status !== "REVIEW" || Number(tx.riskScore) !== 80 || Number(tx.amountCents) !== 500000 || tx.reasonCodes.join(",") !== "AMOUNT_REQUIRES_REVIEW" || !tx.processedAt || !intent || intent.state !== "REVIEW" || !account || Number(account.balanceCents) !== 14519000 || data.Transaction.countDocuments({requestId: "REQ-GATEWAY-021"}) !== 1) { print("Revisão ou saldo persistidos divergentes."); quit(1); }'

docker build --target build -f apps/api/Dockerfile -t "$project-integration" .
docker run --rm --network "$network" \
  --mount "type=bind,source=$PWD/reports,target=/app/reports" \
  -e DATABASE_URL=mongodb://mongo:27017/finbank_test?replicaSet=rs0 \
  -e WORKSHOP_MODE=true \
  -e WORKSPACE_SESSION_KEY=local-workshop-key \
  -e FACILITATOR_ACCESS_CODE=local-facilitator-code \
  "$project-integration" npm run test:integration --workspace @finbank/api

compose stop api
wait_for_web_unhealthy
compose start api
compose up --wait
assert_healthy api
assert_healthy web

compose stop mongo
if mongo_failure="$(compose run --rm --no-deps -e MONGO_INIT_MAX_ATTEMPTS=2 mongo-init 2>&1)"; then
  fail "mongo-init concluiu mesmo com Mongo indisponível."
fi
printf '%s\n' "$mongo_failure" | grep -q 'MongoDB não respondeu ao ping após' ||
  fail "mongo-init falhou sem diagnóstico acionável: $mongo_failure"

printf '%s\n' 'smoke Docker concluído com sucesso.'
