# VSP — Step 1: Start new request (JSON-driven UI)

This is a tiny demo for the first step of an agentic vendor-selection app: creating a new request/session with a JSON-driven UI and file uploads (human-in-loop).

Features in this step:
- Static JSON-driven form schema under `public/formSchemas/`
- Static frontend that reads schema and renders a form (`public/index.html`, `public/app.js`)
- Express backend (`server.js`) that accepts form and file upload and stores metadata in `data/requests.json` and files in `uploads/`

Run locally (Node version):

```bash
cd VSP
npm install        # install dependencies
npm start          # starts Node server on :3000

# open http://localhost:3000 in your browser
```

Run locally (Python / FastAPI version):

```bash
cd VSP
python -m venv .venv    # optionally create venv
source .venv/bin/activate
pip install -r requirements.txt
# start server on :8000 (default uvicorn port)
uvicorn server:app --reload --host 0.0.0.0 --port 8000

# open http://localhost:8000 in your browser
```

Quick demo using curl (submits a small request plus a file):

```bash
# from the VSP folder, once server is running on port 3000 (Node) or 8000 (Python)
curl -X POST -F "projectName=My Demo Project" -F "description=quick test" -F "procurementType=Services" -F "files=@./scripts/example-file.txt" http://localhost:3000/api/requests

# or if running FastAPI (uvicorn on port 8000):
curl -X POST -F "projectName=My Demo Project" -F "description=quick test" -F "procurementType=Services" -F "files=@./scripts/example-file.txt" http://localhost:8000/api/requests
```

AI-driven vendor ranking (OpenAI prototype)
-----------------------------------------

This project includes a small prototype endpoint `/api/select_vendors` that will re-rank vendors using OpenAI if you provide an API key.

1. Install Python requirements (ensure `openai` is installed):

```bash
pip install -r requirements.txt
```

2. Set your OpenAI API key and optionally model name (default: `gpt-4o-mini`):

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-4o-mini"
```

3. Run the server and test the endpoint with the included helper script:

```bash
uvicorn server:app --reload --port 8000
python3 scripts/test_select_vendors.py
```

If you don't set `OPENAI_API_KEY`, the server will fall back to a simple randomized selection so the endpoint stays usable for testing.

Retrieval-Augmented (RAG) prototype
-----------------------------------

This repo also includes a prototype RAG pipeline that will:
- Use OpenAI embeddings to vectorize vendor profiles (`data/vendors_catalog.json`).
- Store embeddings in `data/vendors_embeddings.json` and perform cosine-similarity retrieval.
- Re-rank the top candidates using the OpenAI LLM for a final, explainable top-7..9 recommendations.

How to build embeddings (optional, faster on-demand than waiting for the server):

```bash
# ensure OPENAI_API_KEY is set
export OPENAI_API_KEY="sk-..."
python3 scripts/build_vendor_embeddings.py
```

If you build embeddings ahead of time the server will load them and respond faster. Otherwise the server will create embeddings on demand (if `OPENAI_API_KEY` is available).

For automated testing, there's an example script: `scripts/demo_submit.sh` (make sure server is running)
```

What to try next:
- Add more form schemas and controls in `public/formSchemas`
 - Add per-combination subforms: place JSON files named `RequestType_ServiceNeeded.json` under `public/formSchemas` (e.g. `Clinical_Manufacturing.json`) to automatically show additional fields when the user selects those combinations.

Multi-step flow
----------------
This demo supports a two-step request flow where `New Request` is the starting point:

1. Start with `new_request.json` — fill the main request fields and click **Next — save & continue**. The demo will save a draft request and return a request id.
2. The UI will automatically load the combination-specific subform if a matching `{RequestType}_{ServicesNeeded}.json` file exists (e.g., `Clinical_Manufacturing.json`). Fill the additional fields and click Submit to finalize. The server will update the same request id (status changed to `submitted`).

Use cases: this allows the user to create an initial request, then present different follow-up forms dynamically depending on selected types/services.
- Implement edit / resume drafting for requests
- Add user accounts and role-based workflows for human-in-loop approvals
