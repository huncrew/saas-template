#!/usr/bin/env bash
# Run both the local orchestrator and frontend for development
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Oasify development environment...${NC}"

# Check if required env vars are set
if [[ ! -f "${ROOT_DIR}/frontend/FACTORY_ENV.local" ]]; then
    echo -e "${RED}Missing frontend/FACTORY_ENV.local${NC}"
    exit 1
fi

# Source the env file to get BACKEND_API_URL
set -a
source "${ROOT_DIR}/frontend/FACTORY_ENV.local"
set +a

if [[ -z "${BACKEND_API_URL:-}" ]]; then
    echo -e "${RED}BACKEND_API_URL not set in FACTORY_ENV.local${NC}"
    exit 1
fi

echo -e "${YELLOW}Using BACKEND_API_URL: ${BACKEND_API_URL}${NC}"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill 0 2>/dev/null || true
}
trap cleanup EXIT

# Start orchestrator in background
echo -e "${GREEN}Starting orchestrator on port 8080...${NC}"
cd "${ROOT_DIR}/backend/orchestrator"

# Install dependencies if needed
if [[ ! -d ".venv" ]]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

# Run orchestrator
BACKEND_API_URL="${BACKEND_API_URL}" \
USE_AGENT_CHAT=1 \
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" \
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload &

ORCH_PID=$!
echo -e "${GREEN}Orchestrator started (PID: ${ORCH_PID})${NC}"

# Wait for orchestrator to be ready
echo -e "${YELLOW}Waiting for orchestrator to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "${GREEN}Orchestrator is ready!${NC}"
        break
    fi
    sleep 1
done

# Start frontend
echo -e "${GREEN}Starting frontend on port 3000...${NC}"
cd "${ROOT_DIR}/frontend"
npm run dev:factory &

FRONTEND_PID=$!
echo -e "${GREEN}Frontend started (PID: ${FRONTEND_PID})${NC}"

echo -e "\n${GREEN}==================================${NC}"
echo -e "${GREEN}Development environment running:${NC}"
echo -e "  Frontend:     http://localhost:3000"
echo -e "  Orchestrator: http://localhost:8080"
echo -e "  Health check: http://localhost:8080/health"
echo -e "${GREEN}==================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Wait for both processes
wait
