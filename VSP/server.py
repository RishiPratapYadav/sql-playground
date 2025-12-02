# NOTE: RFP routes moved below after `app = FastAPI(...)` so `app` is defined before decorators are applied.

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
import json
import random
import numpy as np
import asyncio
try:
    import openai
except Exception:
    openai = None
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
DATA_DIR = os.path.join(BASE_DIR, 'data')
DATA_FILE = os.path.join(DATA_DIR, 'requests.json')

VENDORS_FILE = os.path.join(DATA_DIR, 'vendors.json')
VENDORS_CATALOG_FILE = os.path.join(DATA_DIR, 'vendors_catalog.json')
VENDORS_EMBED_FILE = os.path.join(DATA_DIR, 'vendors_embeddings.json')
VENDOR_AUDIT_FILE = os.path.join(DATA_DIR, 'selection_audit.json')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f)

# Create a default vendors.json if not present
if not os.path.exists(VENDORS_FILE):
    with open(VENDORS_FILE, 'w', encoding='utf-8') as f:
        json.dump([
            "Acme Biologics",
            "BioGenix Solutions",
            "PharmaPro Partners",
            "SterilePack Inc.",
            "GlobalTest Labs",
            "MedPack Services",
            "NextGen Pharma",
            "Vaxel Manufacturing",
            "EuroPharm Logistics",
            "Precision Analytics"
        ], f)

# ensure an audit log file exists
if not os.path.exists(VENDOR_AUDIT_FILE):
    with open(VENDOR_AUDIT_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f)

app = FastAPI(title='VSP Step1 - Python')

# allow the tiny demo to be used from any origin
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

# mount static files (frontend) under /static to avoid shadowing /api routes
# we'll still serve index.html at root with an explicit handler
app.mount('/static', StaticFiles(directory=os.path.join(BASE_DIR, 'public')), name='static')
app.mount('/formSchemas', StaticFiles(directory=os.path.join(BASE_DIR, 'public', 'formSchemas')), name='formSchemas')
app.mount('/uploads', StaticFiles(directory=UPLOAD_DIR), name='uploads')


def read_all_requests():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        # if file is missing/corrupt, return empty list rather than crashing
        return []


def read_vendor_catalog():
    try:
        with open(VENDORS_CATALOG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        # fallback to simple vendor names list
        try:
            with open(VENDORS_FILE, 'r', encoding='utf-8') as f:
                names = json.load(f)
                return [{'name': n, 'description': n, 'services': [], 'countries': []} for n in names]
        except Exception:
            return []


def write_vendor_embeddings(mapping):
    tmp = VENDORS_EMBED_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(mapping, f)
    os.replace(tmp, VENDORS_EMBED_FILE)


def read_vendor_embeddings():
    try:
        with open(VENDORS_EMBED_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

 
def write_audit(record):
    a = []
    try:
        with open(VENDOR_AUDIT_FILE, 'r', encoding='utf-8') as f:
            a = json.load(f)
    except Exception:
        a = []
    a.append(record)
    tmp = VENDOR_AUDIT_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(a, f, indent=2, default=str)
    os.replace(tmp, VENDOR_AUDIT_FILE)


async def get_embedding(text: str):
    """Return embedding vector for text using OpenAI if configured, otherwise None."""
    if not openai or not os.getenv('OPENAI_API_KEY'):
        return None
    model = os.getenv('OPENAI_EMBED_MODEL', 'text-embedding-3-small')
    try:
        # OpenAI Embeddings API is blocking; call via thread
        resp = await asyncio.to_thread(openai.Embeddings.create, model=model, input=text)
        vec = resp['data'][0]['embedding']
        return vec
    except Exception as e:
        print('Embedding failed:', str(e))
        return None


def vector_cosine(a, b):
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)
    if a.size == 0 or b.size == 0:
        return 0.0
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


async def ensure_vendor_embeddings(force_refresh: bool = False):
    """Ensure embeddings exist for vendor catalog; build them if missing and OpenAI present."""
    emb = read_vendor_embeddings()
    if emb and not force_refresh:
        return emb

    # Only attempt to build embeddings when OpenAI is available
    if not openai or not os.getenv('OPENAI_API_KEY'):
        return None

    catalog = read_vendor_catalog()
    mapping = {}
    for v in catalog:
        name = v.get('name')
        # build a short text blob describing the vendor
        blob = f"{name}. Services: {', '.join(v.get('services', []))}. Countries: {', '.join(v.get('countries', []))}. Description: {v.get('description', '')}"
        vec = await get_embedding(blob)
        if vec:
            mapping[name] = vec
    if mapping:
        write_vendor_embeddings(mapping)
        return mapping
    return None


def write_all_requests(data):
    # write to a temp file then atomically replace to avoid partial writes
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        # use default=str to avoid issues if some non-serializable types sneak in during demo
        json.dump(data, f, indent=2, default=str)
    os.replace(tmp, DATA_FILE)


# --- AGENTIC VENDOR SELECTION ENDPOINT ---
@app.post('/api/select_vendors')
async def select_vendors(request: Request):
    """
    Accepts a completed request (JSON body) and returns 7-9 best vendors (placeholder AI logic).
    """
    try:
        req_data = await request.json()
    except Exception:
        return JSONResponse({'error': 'Invalid JSON'}, status_code=400)

    # Load vendor list
    try:
        with open(VENDORS_FILE, 'r', encoding='utf-8') as f:
            vendors = json.load(f)
    except Exception:
        vendors = []

    # --- RAG retrieval + re-rank pipeline ---
    catalog = read_vendor_catalog()

    # deterministic pre-filtering: services and target markets
    def matches_service(v, service_needed):
        if not service_needed:
            return True
        sv = v.get('services', [])
        # support matching case-insensitive variants
        return any(service_needed.lower() in s.lower() or s.lower() in service_needed.lower() for s in sv)

    def matches_market(v, target_markets):
        if not target_markets:
            return True
        v_markets = [c.lower() for c in v.get('countries', [])]
        for tm in (target_markets if isinstance(target_markets, list) else [target_markets]):
            if any(tm.lower() in vm or vm in tm.lower() for vm in v_markets):
                return True
        return False

    requested_service = req_data.get('services_needed') or req_data.get('service')
    requested_markets = req_data.get('target_markets') or req_data.get('targetMarkets') or req_data.get('markets')

    # candidate pool after filters (if any vendor must match service, otherwise all)
    cand = []
    for v in catalog:
        if requested_service and not matches_service(v, requested_service):
            continue
        if requested_markets and not matches_market(v, requested_markets):
            # allow vendors that don't match markets but keep them lower-ranked
            pass
        cand.append(v)

    if not cand:
        # fallback to all catalog if no candidate matches
        cand = catalog.copy()

    # Build a short query text from the request to retrieve via embeddings
    parts = []
    for k in ['projectName', 'description', 'additional_info', 'keyCriteria', 'services_needed', 'request_type']:
        v = req_data.get(k) or req_data.get(k.lower())
        if v:
            if isinstance(v, list):
                parts.append(' '.join(map(str, v)))
            else:
                parts.append(str(v))
    query_text = '\n'.join(parts) or json.dumps(req_data)

    # ensure vendor embeddings exist if OpenAI available
    embeddings_map = await ensure_vendor_embeddings()

    candidates = []
    if embeddings_map:
        # compute query embedding
        qvec = await get_embedding(query_text)
        if qvec:
            for v in cand:
                name = v.get('name')
                vec = embeddings_map.get(name)
                if not vec:
                    continue
                sim = vector_cosine(qvec, vec)
                candidates.append({'vendor': v, 'score': float(sim)})
            # sort desc
            candidates.sort(key=lambda x: x['score'], reverse=True)
    else:
        # naive keyword scoring when embeddings unavailable
        qlower = query_text.lower()
        for v in cand:
            score = 0
            # service match
            svs = [s.lower() for s in v.get('services', [])]
            if requested_service and any(requested_service.lower() in s or s in requested_service.lower() for s in svs):
                score += 40
            # market match
            vm = ' '.join(v.get('countries', [])).lower()
            if requested_markets:
                if isinstance(requested_markets, list):
                    found = any(tm.lower() in vm for tm in requested_markets)
                else:
                    found = requested_markets.lower() in vm
                if found:
                    score += 25
            # keyword match in description
            desc = v.get('description', '').lower()
            if any(word in qlower for word in desc.split()[:6]):
                score += 15
            # normalize capacity into a small boost
            cap = v.get('capacity_per_month') or 0
            if cap > 0:
                score += min(20, (cap / 1000000) * 20)
            candidates.append({'vendor': v, 'score': float(score)})
        candidates.sort(key=lambda x: x['score'], reverse=True)

    # keep top N as retrieval candidate set for re-ranking
    retrieval_top = [c for c in candidates[:20]] if candidates else []

    # Next: re-rank candidates with LLM (if available) using a concise candidates list to avoid token bloat
    final_list = []
    used_llm = False
    api_key = os.getenv('OPENAI_API_KEY')
    model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
    if api_key and openai and retrieval_top:
        try:
            openai.api_key = api_key
            # build a concise candidate summary to include in the prompt
            cand_summaries = []
            for c in retrieval_top:
                v = c['vendor']
                cand_summaries.append({
                    'name': v.get('name'),
                    'services': v.get('services'),
                    'countries': v.get('countries'),
                    'short_description': v.get('description')[:300]
                })

            system = (
                "You are a careful procurement assistant. Given a user request and a short list of candidate vendor profiles, produce a ranked top-7 to top-9 list. "
                "Each returned item must be JSON object with: name (string), score (0-100 integer), reason (1-2 sentences). Return a single JSON object with key 'top_k'."
            )

            user_obj = {
                'request_summary': query_text,
                'candidates': cand_summaries,
                'requirements_notes': 'Prioritize exact service match, regulatory coverage for target markets, capacity and track record. Keep output concise and factual.'
            }

            messages = [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': json.dumps(user_obj, indent=2, default=str)}
            ]

            resp = await asyncio.to_thread(openai.ChatCompletion.create, model=model, messages=messages, temperature=0.0, max_tokens=900)
            txt = resp.choices[0].message.content

            # parse JSON
            parsed = None
            try:
                parsed = json.loads(txt)
            except Exception:
                # try to extract JSON substring
                start = txt.find('{')
                if start >= 0:
                    parsed = json.loads(txt[start:])

            if parsed:
                top = parsed.get('top_k') or parsed.get('vendors') or parsed.get('results')
                if isinstance(top, list) and top:
                    used_llm = True
                    for v in top[:9]:
                        if isinstance(v, str):
                            final_list.append({'name': v})
                        else:
                            final_list.append({'name': v.get('name'), 'score': v.get('score'), 'reason': v.get('reason')})

        except Exception as e:
            print('Re-rank LLM call failed:', str(e))

    # If LLM didn't produce a final list, fallback to the retrieval order + simple local reasons
    if not final_list:
        for i, c in enumerate(retrieval_top[:9]):
            v = c['vendor']
            score = int(min(100, c['score'] * 100 if embeddings_map else c['score']))
            reason = 'Matched requested services and markets' if matches_service(v, requested_service) else 'Partial match - review details'
            final_list.append({'name': v.get('name'), 'score': score, 'reason': reason})

    # Write an audit record for traceability
    audit = {
        'createdAt': datetime.utcnow().isoformat() + 'Z',
        'request': req_data,
        'retrieval_candidates': [ {'name': c['vendor'].get('name'), 'score': c['score']} for c in retrieval_top ],
        'final_selection': final_list,
        'method': 'rag_retrieval' + (':llm_rerank' if used_llm else ':local_rerank')
    }
    write_audit(audit)

    return {'vendors': final_list, 'audit': {'id': audit['createdAt'], 'method': audit['method']}}


@app.get('/api/schemas')
def list_schemas():
    schemas_dir = os.path.join(BASE_DIR, 'public', 'formSchemas')
    try:
        files = [f for f in os.listdir(schemas_dir) if f.endswith('.json')]
        return [{'id': os.path.splitext(f)[0], 'file': f'/formSchemas/{f}'} for f in files]
    except Exception:
        return []


@app.post('/api/rebuild_embeddings')
async def rebuild_embeddings():
    """Force rebuild embeddings for vendor catalog (requires OPENAI_API_KEY)."""
    if not openai or not os.getenv('OPENAI_API_KEY'):
        return JSONResponse({'error': 'OpenAI not configured'}, status_code=400)
    emb = await ensure_vendor_embeddings(force_refresh=True)
    if emb:
        return {'success': True, 'count': len(emb)}
    return JSONResponse({'error': 'failed to build embeddings'}, status_code=500)


@app.get('/api/requests')
def get_requests():
    return read_all_requests()


@app.post('/api/requests')
async def create_request(request: Request):
    # Read form data generically; starlette's FormData exposes files as UploadFile objects
    form = await request.form()
    body = {}
    # collect form values and files (handle single or multiple file parts)
    saved_files = []
    for key, value in form.multi_items():
        # if this is a file field (has filename & file), save it
        if getattr(value, 'filename', None):
            f = value
            safe_name = ''.join([c if c.isalnum() or c in '._-' else '_' for c in f.filename])
            dest_name = f"{int(datetime.utcnow().timestamp()*1000)}_{safe_name}"
            dest_path = os.path.join(UPLOAD_DIR, dest_name)
            contents = await f.read()
            with open(dest_path, 'wb') as out:
                out.write(contents)
            saved_files.append({'originalname': f.filename, 'path': f'/uploads/{dest_name}', 'size': os.path.getsize(dest_path)})
        else:
            # non-file form values (if multiple entries for same key we keep last value)
            body[key] = value

    data = read_all_requests()

    # If originalId provided, update existing request instead of creating a new one
    original_id = body.pop('originalId', None) or body.pop('original_id', None)
    status = body.pop('status', None)
    if original_id:
        # find entry
        for e in data:
            if e.get('id') == original_id:
                # merge body (existing keys overwritten)
                e_body = e.setdefault('body', {})
                e_body.update(body)
                # append any new files
                if saved_files:
                    e.setdefault('files', []).extend(saved_files)
                # update status if provided
                if status:
                    e['status'] = status
                e['updatedAt'] = datetime.utcnow().isoformat() + 'Z'
                write_all_requests(data)
                return {'success': True, 'id': e['id'], 'entry': e}
        # not found
        return JSONResponse({'error': 'originalId not found'}, status_code=404)

    new_id = f"REQ-{int(datetime.utcnow().timestamp()*1000)}"
    entry = {'id': new_id, 'createdAt': datetime.utcnow().isoformat() + 'Z', 'body': body, 'files': saved_files}
    if status:
        entry['status'] = status
    # debug log for demo: show what we're saving
    print('create_request -> body keys:', list(body.keys()), 'files count:', len(saved_files))
    data.append(entry)
    write_all_requests(data)
    return {'success': True, 'id': new_id, 'entry': entry}


# --- RFP DOCUMENT GENERATION ENDPOINT ---
@app.post('/api/generate_rfp/{request_id}')
def generate_rfp(request_id: str):
    """Generate a simple RFP document (txt) from request data and return download link."""
    data = read_all_requests()
    req = next((r for r in data if r.get('id') == request_id), None)
    if not req:
        return JSONResponse({'error': 'Request not found'}, status_code=404)
    body = req.get('body', {})
    # Compose RFP text
    lines = [
        f"Request for Proposal (RFP)",
        f"Request ID: {request_id}",
        f"Project Name: {body.get('projectName','')}",
        f"Description: {body.get('description','')}",
        f"Company: {body.get('company_name','')}",
        f"Primary Contact: {body.get('primary_contact','')}",
        f"Email: {body.get('email','')}",
        f"Request Type: {body.get('request_type','')}",
        f"Services Needed: {body.get('services_needed','')}",
        f"Target Markets: {body.get('target_markets','')}",
        f"Budget: {body.get('budget','')}",
        f"Decision Deadline: {body.get('decisionDeadline','')}",
        f"Additional Info: {body.get('additional_info','')}",
        f"Key Criteria: {body.get('keyCriteria','')}",
        '',
        'Thank you for considering this RFP.'
    ]
    rfp_text = '\n'.join(lines)
    # Save to file
    rfp_dir = os.path.join(DATA_DIR, 'rfps')
    os.makedirs(rfp_dir, exist_ok=True)
    rfp_path = os.path.join(rfp_dir, f"{request_id}_rfp.txt")
    with open(rfp_path, 'w', encoding='utf-8') as f:
        f.write(rfp_text)
    # Return download link (match frontend expected key)
    return {'success': True, 'download_url': f"/data/rfps/{request_id}_rfp.txt"}


@app.get('/data/rfps/{filename}')
def get_rfp_file(filename: str):
    rfp_dir = os.path.join(DATA_DIR, 'rfps')
    rfp_path = os.path.join(rfp_dir, filename)
    if os.path.exists(rfp_path):
        return FileResponse(rfp_path, media_type='text/plain', filename=filename)
    return JSONResponse({'error': 'not found'}, status_code=404)


@app.get('/uploads/{filename}')
def get_upload(filename: str):
    path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse({'error': 'not found'}, status_code=404)
 
  
@app.get('/')
def index():
    index_file = os.path.join(BASE_DIR, 'public', 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type='text/html')
    return HTMLResponse('<html><body><h1>VSP Step34</h1></body></html>')

