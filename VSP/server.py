from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
import json
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
DATA_DIR = os.path.join(BASE_DIR, 'data')
DATA_FILE = os.path.join(DATA_DIR, 'requests.json')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
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


def write_all_requests(data):
    # write to a temp file then atomically replace to avoid partial writes
    tmp = DATA_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        # use default=str to avoid issues if some non-serializable types sneak in during demo
        json.dump(data, f, indent=2, default=str)
    os.replace(tmp, DATA_FILE)


@app.get('/api/schemas')
def list_schemas():
    schemas_dir = os.path.join(BASE_DIR, 'public', 'formSchemas')
    try:
        files = [f for f in os.listdir(schemas_dir) if f.endswith('.json')]
        return [{'id': os.path.splitext(f)[0], 'file': f'/formSchemas/{f}'} for f in files]
    except Exception:
        return []


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
    new_id = f"REQ-{int(datetime.utcnow().timestamp()*1000)}"
    entry = {'id': new_id, 'createdAt': datetime.utcnow().isoformat() + 'Z', 'body': body, 'files': saved_files}
    # debug log for demo: show what we're saving
    print('create_request -> body keys:', list(body.keys()), 'files count:', len(saved_files))
    data.append(entry)
    write_all_requests(data)
    return {'success': True, 'id': new_id, 'entry': entry}


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
    return HTMLResponse('<html><body><h1>VSP Step1</h1></body></html>')

