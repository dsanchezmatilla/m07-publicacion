#!/bin/bash
# Lanza la batería de pruebas contra el servidor.
# Uso: ./run-tests.sh [URL]     (por defecto el servidor del Proxmox)

cd "$(dirname "$0")"
export SERVER_URL="${1:-${SERVER_URL:-wss://dsanchezmatilla.ieti.site}}"

echo "Validando servidor: $SERVER_URL"
[ -d node_modules ] || npm install --silent

# ipv4first: algunas redes (p. ej. WSL) no tienen IPv6 y la conexión se quedaría colgada
node --dns-result-order=ipv4first --test test_servidor.mjs
