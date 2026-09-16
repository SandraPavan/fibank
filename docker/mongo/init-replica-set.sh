#!/bin/sh
set -eu

max_attempts="${MONGO_INIT_MAX_ATTEMPTS:-60}"
mongo_timeout=5
attempt=1

log() {
  printf '%s\n' "mongo-init: $*"
}

run_mongosh() {
  timeout "$mongo_timeout" mongosh --quiet --host mongo:27017 "$@"
}

case "$max_attempts" in
  ''|*[!0-9]*)
    log "falha: MONGO_INIT_MAX_ATTEMPTS deve ser um inteiro positivo; recebido: $max_attempts"
    exit 1
    ;;
esac

if [ "$max_attempts" -eq 0 ]; then
  log "falha: MONGO_INIT_MAX_ATTEMPTS deve ser um inteiro positivo; recebido: $max_attempts"
  exit 1
fi

while [ "$attempt" -le "$max_attempts" ]; do
  if run_mongosh --eval 'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)'; then
    break
  fi

  log "MongoDB ainda não responde ao ping (tentativa $attempt/$max_attempts)."
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$attempt" -gt "$max_attempts" ]; then
  log "falha: MongoDB não respondeu ao ping após $max_attempts tentativas."
  exit 1
fi

state="$(run_mongosh --eval 'try { print(rs.status().myState) } catch (error) { print(error.code === 94 || error.codeName === "NotYetInitialized" ? "NOT_INITIALIZED" : "ERROR:" + error.message) }')"

case "$state" in
  1)
    log "replica set já está PRIMARY."
    exit 0
    ;;
  NOT_INITIALIZED)
    log "iniciando replica set rs0."
    if ! run_mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]})'; then
      log "rs.initiate não concluiu; verificando convergência pelo estado observado."
    fi
    ;;
  0|2|3|5|6|7|9|10)
    log "replica set já iniciado; aguardando eleição (estado $state)."
    ;;
  *)
    log "falha: não foi possível determinar o estado do replica set: $state"
    exit 1
    ;;
esac

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  state="$(run_mongosh --eval 'try { print(rs.status().myState) } catch (error) { print("ERROR:" + error.message) }')"
  if [ "$state" = "1" ]; then
    log "replica set rs0 está PRIMARY."
    exit 0
  fi

  log "aguardando PRIMARY; estado atual: $state (tentativa $attempt/$max_attempts)."
  attempt=$((attempt + 1))
  sleep 1
done

log "falha: replica set não elegeu PRIMARY após $max_attempts tentativas."
exit 1
