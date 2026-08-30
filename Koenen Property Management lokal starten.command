#!/bin/zsh

set -e

APP_DIR="${0:A:h}"
LOCAL_URL="http://127.0.0.1:5173/"

cd "$APP_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm wurde nicht gefunden. Bitte zuerst Node.js installieren."
  read -r "?Zum Schließen Enter drücken."
  exit 1
fi

if curl --silent --fail --max-time 2 "$LOCAL_URL" >/dev/null 2>&1; then
  open "$LOCAL_URL"
  exit 0
fi

if [[ ! -d node_modules ]]; then
  echo "Abhängigkeiten werden einmalig installiert …"
  npm install
fi

(
  until curl --silent --fail --max-time 2 "$LOCAL_URL" >/dev/null 2>&1; do
    sleep 0.25
  done
  open "$LOCAL_URL"
) &

echo "Koenen Property Management wird lokal gestartet …"
echo "Dieses Fenster während der Nutzung geöffnet lassen."
echo "Zum Beenden Ctrl + C drücken."

exec npm run dev:local
