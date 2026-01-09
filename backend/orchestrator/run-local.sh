#!/bin/bash
set -a
source .env
set +a

echo "Starting orchestrator with:"
echo "  BACKEND_API_URL=$BACKEND_API_URL"
echo "  CODEBUILD_PREVIEW_PROJECT=$CODEBUILD_PREVIEW_PROJECT"
echo "  FACTORY_ARTIFACTS_BUCKET=$FACTORY_ARTIFACTS_BUCKET"
echo "  USE_AGENT_CHAT=$USE_AGENT_CHAT"

uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
