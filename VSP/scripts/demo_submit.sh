#!/usr/bin/env bash
# Demo script: submit a sample request to the server

set -euo pipefail

URL=${1:-http://localhost:3000/api/requests}

echo "Submitting demo request to ${URL}"
curl -s -X POST \
  -F "projectName=Demo via script" \
  -F "description=This is a demo submission created by scripts/demo_submit.sh" \
  -F "procurementType=Consulting" \
  -F "files=@./example-file.txt" \
  "$URL" | jq .

echo "Done"
