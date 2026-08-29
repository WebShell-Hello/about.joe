#!/bin/bash
set -u
cd "$(dirname "$0")"

PORT="${PORT:-8080}"

listener_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$1" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' || true
  fi
}

port_in_use() {
  [ -n "$(listener_pids "$1")" ]
}

# Prevent "new frontend + old Python process" after replacing/upgrading the folder.
PIDS="$(listener_pids "$PORT")"
if [ -n "$PIDS" ]; then
  CAN_REUSE=1
  for PID in $PIDS; do
    CMD="$(ps -p "$PID" -o command= 2>/dev/null || true)"
    case "$CMD" in
      *python*server.py*|*Python*server.py*)
        echo "Stopping previous Joe Scene server on port $PORT (PID $PID)..."
        kill "$PID" 2>/dev/null || true
        ;;
      *)
        CAN_REUSE=0
        ;;
    esac
  done

  if [ "$CAN_REUSE" -eq 1 ]; then
    # Give the previous listener a moment to release the port.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      port_in_use "$PORT" || break
      sleep 0.1
    done
  fi

  if port_in_use "$PORT"; then
    echo "Port $PORT is used by another application. Finding a free port..."
    while port_in_use "$PORT"; do
      PORT=$((PORT + 1))
    done
  fi
fi

export PORT
python3 -u server.py &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM EXIT
sleep 0.5

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Server failed to start."
  wait "$SERVER_PID"
  exit $?
fi

URL="http://localhost:$PORT/"
echo "Opening $URL"
if command -v open >/dev/null 2>&1; then
  open "$URL"
fi

wait "$SERVER_PID"
STATUS=$?
trap - INT TERM EXIT
exit $STATUS
