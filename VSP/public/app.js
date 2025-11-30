async function fetchJSON(url, noCache = true) {
  // By default add a cache-busting timestamp and instruct fetch to ignore caches
  if (noCache) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}_=${Date.now()}`;
  }
  const r = await fetch(url, { cache: 'no-store' });
  return r.json();
}

async function loadSchemas() {
  const schemas = await fetchJSON('/api/schemas');
  const container = document.getElementById('schemas');
  container.innerHTML = '';
  if (!schemas.length) {
    container.innerText = 'No schemas found in /public/formSchemas/*.json';
    return;
  }
  // render schema cards
  schemas.forEach(s => {
    const card = document.createElement('div');
    card.className = 'schema-card';
    const h = document.createElement('div'); h.innerText = s.id; h.style.fontWeight = '700';
    card.appendChild(h);
    const loadBtn = document.createElement('button');
    loadBtn.innerText = 'Use this form';
    loadBtn.onclick = () => loadSchema(s.file);
    card.appendChild(loadBtn);
    container.appendChild(card);
  });
}

// refresh handler added to UI (refresh button will be wired in init)

async function loadSchema(filePath) {
  const schema = await fetchJSON(filePath);
  document.getElementById('form-area').hidden = false;
  document.getElementById('form-title').innerText = schema.title || 'Form';
  document.getElementById('form-desc').innerText = schema.description || '';

  const fieldsNode = document.getElementById('form-fields');
  fieldsNode.innerHTML = '';

  schema.fields = schema.fields || [];
  schema.fields.forEach(f => {
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    label.innerText = f.label || f.name;
    wrapper.appendChild(label);

    let input;
    switch (f.type) {
      case 'textarea': input = document.createElement('textarea'); break;
      case 'select': input = document.createElement('select'); (f.options||[]).forEach(opt => { const o = document.createElement('option'); o.value = opt; o.innerText = opt; input.appendChild(o);}); break;
      case 'checkbox':
        input = document.createElement('div');
        (f.options || []).forEach(opt => {
          const id = `${f.name}_${opt}`;
          const cb = document.createElement('input'); cb.type='checkbox'; cb.id=id; cb.name=f.name; cb.value=opt;
          const lb = document.createElement('label'); lb.htmlFor=id; lb.style.marginLeft='6px'; lb.innerText = opt;
          const block = document.createElement('div'); block.appendChild(cb); block.appendChild(lb);
          input.appendChild(block);
        });
        break;
      default:
        input = document.createElement('input'); input.type = f.type || 'text';
    }

    if (f.placeholder) input.placeholder = f.placeholder;
    if (f.required && input.tagName !== 'DIV') input.required = true;

    if (input.tagName !== 'DIV') input.name = f.name;
    wrapper.appendChild(input);
    fieldsNode.appendChild(wrapper);
  });

  // upload area & hidden originalId (for resume/edit)
  const fileArea = document.getElementById('file-area');
  fileArea.innerHTML = '';
  if (schema.controls && schema.controls.allowUpload) {
    const lbl = document.createElement('label'); lbl.innerText = 'Attach documents (multiple)';
    const inp = document.createElement('input'); inp.type='file'; inp.name='files'; inp.multiple=true;
    inp.onchange = () => showFilePreview(inp.files);
    fileArea.appendChild(lbl); fileArea.appendChild(inp);
  }

  // hidden field to track original request id if user loads an existing request
  let existingId = document.getElementById('originalRequestId');
  if (!existingId) {
    existingId = document.createElement('input'); existingId.type='hidden'; existingId.id='originalRequestId'; existingId.name='originalId';
    form.appendChild(existingId);
  } else {
    existingId.value = '';
  }

  // submit handler
  const form = document.getElementById('dynamic-form');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData();
    // collect inputs
    schema.fields.forEach(f => {
      if (f.type === 'checkbox') {
        const vals = Array.from(document.getElementsByName(f.name)).filter(i=>i.checked).map(i=>i.value);
        fd.append(f.name, JSON.stringify(vals));
      } else {
        const el = form.elements[f.name]; if (!el) return;
        fd.append(f.name, el.value);
      }
    });

    // files
    const fileInput = form.querySelector('input[type=file]');
    if (fileInput && fileInput.files.length) {
      for (let i=0;i<fileInput.files.length;i++) fd.append('files', fileInput.files[i]);
    }

    // if editing/resuming, include original id so server can see the intention
    const orig = document.getElementById('originalRequestId');
    if (orig && orig.value) fd.append('originalId', orig.value);

    const resp = await fetch('/api/requests', { method: 'POST', body: fd });
    const json = await resp.json();
    showToast('Request submitted ✓', 3000);
    document.getElementById('result-area').hidden = false;
    document.getElementById('result').innerText = JSON.stringify(json, null, 2);
    // if this was a resumed form clear the originalId (we created a new request)
    if (orig) orig.value = '';
    await loadRequests();
  };

  document.getElementById('reset').onclick = () => form.reset();
}

async function loadRequests() {
  const list = await fetchJSON('/api/requests');
  const node = document.getElementById('requests-list');
  if (!list.length) { node.innerText = '(no requests yet)'; return; }
  node.innerHTML = '';
  list.slice().reverse().forEach(r => {
    const div = document.createElement('div'); div.className = 'small';
    const title = r.body && r.body.projectName ? r.body.projectName : r.id;
    div.innerHTML = `<strong>${title}</strong> <span class='muted'>(${r.id} — ${new Date(r.createdAt).toLocaleString()})</span>`;

    // actions: load into form & download files
    const actions = document.createElement('div'); actions.className='request-actions';
    const loadBtn = document.createElement('button'); loadBtn.innerText = 'Load into form';
    loadBtn.onclick = () => loadRequestIntoForm(r);
    actions.appendChild(loadBtn);

    if (r.files && r.files.length) {
      const filesBlock = document.createElement('div'); filesBlock.className='file-list';
      r.files.forEach(f => { const a = document.createElement('a'); a.href = f.path; a.target='_blank'; a.innerText = f.originalname; filesBlock.appendChild(a); filesBlock.appendChild(document.createTextNode(' '));});
      actions.appendChild(filesBlock);
    }
    div.appendChild(actions);

    const meta = document.createElement('pre'); meta.innerText = JSON.stringify(r, null, 2);
    div.appendChild(meta);
    node.appendChild(div);
  });
}

function showToast(msg, timeout = 2500) {
  const t = document.getElementById('toast');
  t.innerText = msg; t.hidden = false; t.style.opacity = 1;
  setTimeout(() => { t.style.transition = 'opacity 300ms'; t.style.opacity = 0; setTimeout(()=>t.hidden=true, 300); }, timeout);
}

function showFilePreview(files) {
  const preview = document.getElementById('file-preview');
  if (!preview) {
    const node = document.createElement('div'); node.id='file-preview'; document.getElementById('file-area').appendChild(node);
  }
  const p = document.getElementById('file-preview'); p.innerHTML = '';
  if (!files || !files.length) { p.innerText = ''; return; }
  const ul = document.createElement('ul');
  for (let i=0;i<files.length;i++) {
    const li = document.createElement('li'); li.innerText = `${files[i].name} (${Math.round(files[i].size/1024)}KB)`; ul.appendChild(li);
  }
  p.appendChild(ul);
}

async function loadRequestIntoForm(requestObj) {
  // ensure we have the schema loaded
  const schemaKey = document.getElementById('form-title').innerText;
  // if no schema loaded yet, try to load default schema
  if (!schemaKey || schemaKey === 'Form') {
    // try to load any schema
    const schemas = await fetchJSON('/api/schemas');
    if (schemas.length) await loadSchema(schemas[0].file);
  }

  // Wait a short while for DOM inputs to exist
  setTimeout(()=>{
    const form = document.getElementById('dynamic-form');
    Object.keys(requestObj.body || {}).forEach(k => {
      const val = requestObj.body[k];
      const el = form.elements[k];
      if (!el) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        // skip: checkboxes are represented as several inputs — we'll attempt to mark matching ones
        const els = document.getElementsByName(k);
        if (Array.isArray(val)) {
          Array.from(els).forEach(ch => { ch.checked = val.includes(ch.value); });
        } else {
          Array.from(els).forEach(ch => { ch.checked = (ch.value === val); });
        }
      } else {
        // try to parse JSON strings saved by previous versions
        try { el.value = typeof val === 'string' && (val.startsWith('[') || val.startsWith('{')) ? JSON.parse(val) : val; } catch(e) { el.value = val; }
      }
    });
    // show uploaded files list in file-area and set originalRequestId
    const existingId = document.getElementById('originalRequestId'); if (existingId) existingId.value = requestObj.id;
    const fileArea = document.getElementById('file-area');
    const prev = document.createElement('div'); prev.className='small muted';
    prev.innerHTML = 'Previously uploaded: ' + (requestObj.files && requestObj.files.length ? requestObj.files.map(f => `<a href="${f.path}" target="_blank">${f.originalname}</a>`).join(', ') : 'none');
    fileArea.appendChild(prev);
    showToast('Loaded request into form — edit and submit to create a new request', 3000);
  }, 100);
}

(async function init() {
  await loadSchemas();
  await loadRequests();

  const rb = document.getElementById('refresh-schemas');
  if (rb) rb.onclick = async () => { showToast('Refreshing schemas…', 1000); await loadSchemas(); };

})();
