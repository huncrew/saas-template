#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/FACTORY_ENV.local"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "Missing ${ENV_FILE} (continuing without it)."
  echo "Tip: cp \"${ROOT_DIR}/FACTORY_ENV.example\" \"${ENV_FILE}\""
fi

cd "${ROOT_DIR}"
exec npm run dev:raw




