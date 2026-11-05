#!/bin/bash
# Lanza la batería de pruebas contra el servidor.
# Uso: ./run-tests.sh [URL]     (por defecto ws://localhost:8080)

cd "$(dirname "$0")"
export SERVER_URL="${1:-${SERVER_URL:-ws://localhost:8080}}"

echo "Validando servidor: $SERVER_URL"
[ -d node_modules ] || npm install --silent

node --test test_servidor.mjs
