#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/FACTORY_ENV.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo ""
  echo "Create it from the template:"
  echo "  cp \"${ROOT_DIR}/FACTORY_ENV.example\" \"${ENV_FILE}\""
  echo ""
  echo "Then fill in at least:"
  echo "  ORCHESTRATOR_API_URL=..."
  echo "  BACKEND_API_URL=..."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

cd "${ROOT_DIR}"
exec npm run dev




