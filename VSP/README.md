# VSP — Step 1: Start new request (JSON-driven UI)

This is a tiny demo for the first step of an agentic vendor-selection app: creating a new request/session with a JSON-driven UI and file uploads (human-in-loop).

Features in this step:
- Static JSON-driven form schema under `public/formSchemas/`
- Static frontend that reads schema and renders a form (`public/index.html`, `public/app.js`)
- Express backend (`server.js`) that accepts form and file upload and stores metadata in `data/requests.json` and files in `uploads/`

Run locally:

```bash
cd VSP
npm install        # install dependencies
npm start          # starts server on :3000

# open http://localhost:3000 in your browser
Quick demo using curl (submits a small request plus a file):

```
# from the VSP folder, once server is running on port 3000
curl -X POST -F "projectName=My Demo Project" -F "description=quick test" -F "procurementType=Services" -F "files=@./example-file.txt" http://localhost:3000/api/requests
```

For automated testing, there's an example script: `scripts/demo_submit.sh` (make sure server is running)
```

What to try next:
- Add more form schemas and controls in `public/formSchemas`
- Implement edit / resume drafting for requests
- Add user accounts and role-based workflows for human-in-loop approvals
