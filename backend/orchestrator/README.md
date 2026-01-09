## Factory Orchestrator (V1)

This is the **orchestrator API** for the Factory platform. In V1 it provides:

- Project CRUD (minimal)
- Build lifecycle (preview/deploy) with status + artifact pointers

### Local dev

From repo root:

```bash
cd backend/orchestrator
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then run the frontend with:

- `ORCHESTRATOR_API_URL=http://localhost:8000` (server-side env)







