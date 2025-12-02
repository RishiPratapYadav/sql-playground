import os
import json
import asyncio

VSP_ROOT = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(VSP_ROOT, 'data')
VENDORS_CATALOG = os.path.join(DATA_DIR, 'vendors_catalog.json')
VENDORS_EMBED = os.path.join(DATA_DIR, 'vendors_embeddings.json')

try:
    import openai  # type: ignore
except Exception:
    openai = None

async def get_embedding(text):
    if not openai or not os.getenv('OPENAI_API_KEY'):
        raise RuntimeError('OPENAI_API_KEY not set or openai package missing')
    openai.api_key = os.getenv('OPENAI_API_KEY')
    model = os.getenv('OPENAI_EMBED_MODEL', 'text-embedding-3-small')
    resp = await asyncio.to_thread(openai.Embeddings.create, model=model, input=text)
    return resp['data'][0]['embedding']

async def build():
    if not os.path.exists(VENDORS_CATALOG):
        raise RuntimeError('vendors_catalog.json not found')
    with open(VENDORS_CATALOG, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    out = {}
    for v in catalog:
        name = v.get('name')
        blob = f"{name}. Services: {', '.join(v.get('services', []))}. Countries: {', '.join(v.get('countries', []))}. Description: {v.get('description', '')}"
        print('Embedding', name)
        vec = await get_embedding(blob)
        out[name] = vec

    tmp = VENDORS_EMBED + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f)
    os.replace(tmp, VENDORS_EMBED)
    print('Saved embeddings to', VENDORS_EMBED)

if __name__ == '__main__':
    asyncio.run(build())
