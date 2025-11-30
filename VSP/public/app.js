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
  // render schema cards; label new_request special
  schemas.forEach(s => {
    const card = document.createElement('div');
    card.className = 'schema-card';
    const h = document.createElement('div'); h.innerText = s.id; h.style.fontWeight = '700';
    card.appendChild(h);
    const loadBtn = document.createElement('button');
    if (s.id === 'new_request') {
      loadBtn.innerText = 'Open Start Form';
      loadBtn.className = 'primary';
      loadBtn.onclick = () => loadSchema(s.file);
    } else {
      loadBtn.innerText = 'Use this form';
      loadBtn.onclick = () => loadSchema(s.file);
    }
    card.appendChild(loadBtn);
    container.appendChild(card);
  });
  return schemas;
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

  // ensure we have a form reference for handlers
  const form = document.getElementById('dynamic-form');

  // attach handlers to possibly trigger subform loading when request_type or services_needed change
  const rt = form.elements['request_type'];
  const sd = form.elements['services_needed'];
  if (rt) rt.onchange = () => loadSubformIfReady(rt.value, sd ? sd.value : null);
  if (sd) sd.onchange = () => loadSubformIfReady(rt ? rt.value : null, sd.value);

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
  // `form` already defined above
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

    // include subform fields into submit data if present
    if (currentSubformSchema) {
      currentSubformSchema.fields.forEach(f => {
        if (f.type === 'checkbox') {
          const vals = Array.from(document.getElementsByName(f.name)).filter(i=>i.checked).map(i=>i.value);
          fd.append(f.name, JSON.stringify(vals));
        } else {
          const el = form.elements[f.name]; if (!el) return;
          fd.append(f.name, el.value);
        }
      });
    }

    // if editing/resuming, include original id so server can see the intention
    const orig = document.getElementById('originalRequestId');
    if (orig && orig.value) {
      fd.append('originalId', orig.value);
      // if we're finalizing an existing draft, mark submitted
      fd.append('status', 'submitted');
    }
    const resp = await fetch('/api/requests', { method: 'POST', body: fd });
    const json = await resp.json();
    showToast('Request submitted ✓', 3000);
    document.getElementById('result-area').hidden = false;
    document.getElementById('result').innerText = JSON.stringify(json, null, 2);
    // if this was a resumed form clear the originalId (we created a new request)
    if (orig) orig.value = '';
    await loadRequests();
  };

    // include subform fields into submit data if present
    

  document.getElementById('reset').onclick = () => form.reset();

  // If this is the 'new_request' schema, show a Next button to save draft and continue
  const toolbar = document.querySelector('#form-area .form-actions') || form.querySelector('.form-actions');
  // add next button if not present
  let nextBtn = document.getElementById('nextBtn');
  if (schema.id === 'new_request') {
    if (!nextBtn) {
      nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.id='nextBtn'; nextBtn.innerText = 'Next — save & continue';
      nextBtn.style.marginLeft = '8px';
      // insert next button before reset
      const resetBtn = document.getElementById('reset');
      resetBtn.parentNode.insertBefore(nextBtn, resetBtn);
    }
    nextBtn.onclick = async () => {
      // create a draft with main schema fields - include files if present
      const fd = new FormData();
      schema.fields.forEach(f => {
        if (f.type === 'checkbox') {
          const vals = Array.from(document.getElementsByName(f.name)).filter(i=>i.checked).map(i=>i.value);
          fd.append(f.name, JSON.stringify(vals));
        } else {
          const el = form.elements[f.name]; if (!el) return; fd.append(f.name, el.value);
        }
      });
      // files
      const fileInput = form.querySelector('input[type=file]');
      if (fileInput && fileInput.files.length) {
        for (let i=0;i<fileInput.files.length;i++) fd.append('files', fileInput.files[i]);
      }
      // mark as draft
      fd.append('status', 'draft');

      const resp = await fetch('/api/requests', { method: 'POST', body: fd });
      const json = await resp.json();
      if (json && json.success) {
        // set original request id so subsequent submits update the same entry
        let orig = document.getElementById('originalRequestId');
        if (!orig) { orig = document.createElement('input'); orig.type='hidden'; orig.id='originalRequestId'; orig.name='originalId'; form.appendChild(orig); }
        orig.value = json.id;
        showToast('Draft saved — proceed to additional details', 2500);
        // if type + service selections are present, try loading the subform
        const rtVal = form.elements['request_type'] ? form.elements['request_type'].value : null;
        const sdVal = form.elements['services_needed'] ? form.elements['services_needed'].value : null;
        if (rtVal && sdVal) await loadSubformIfReady(rtVal, sdVal);
      } else {
        showToast('Failed saving draft — try again', 3000);
      }
    };
  } else {
    if (nextBtn) nextBtn.remove();
  }
}

// keep currently loaded subform schema in memory
let currentSubformSchema = null;

function sanitizeForFilename(s) {
  if (!s) return '';
  return String(s).trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-]/g, '');
}

async function loadSubformIfReady(requestType, serviceNeeded) {
  // both values required to look-up a combination schema
  if (!requestType || !serviceNeeded) {
    document.getElementById('subform-area').hidden = true;
    currentSubformSchema = null;
    document.getElementById('subform-fields').innerHTML = '';
    return;
  }

  const file = `/formSchemas/${sanitizeForFilename(requestType)}_${sanitizeForFilename(serviceNeeded)}.json`;
  try {
    const schema = await fetchJSON(file);
    // render into subform-fields area
    currentSubformSchema = schema;
    const area = document.getElementById('subform-area');
    area.hidden = false;
    document.getElementById('subform-title').innerText = schema.title || 'Additional details';
    const fieldsNode = document.getElementById('subform-fields');
    fieldsNode.innerHTML = '';
    (schema.fields || []).forEach(f => {
      const wrapper = document.createElement('div');
      const label = document.createElement('label'); label.innerText = f.label || f.name; wrapper.appendChild(label);
      let input;
      switch (f.type) {
        case 'textarea': input = document.createElement('textarea'); break;
        case 'select': input = document.createElement('select'); (f.options||[]).forEach(opt=>{ const o=document.createElement('option'); o.value=opt; o.innerText=opt; input.appendChild(o);}); break;
        case 'checkbox':
          input = document.createElement('div');
          (f.options || []).forEach(opt => { const id=`${f.name}_${opt}`; const cb=document.createElement('input'); cb.type='checkbox'; cb.id=id; cb.name=f.name; cb.value=opt; const lb=document.createElement('label'); lb.htmlFor=id; lb.style.marginLeft='6px'; lb.innerText = opt; const block=document.createElement('div'); block.appendChild(cb); block.appendChild(lb); input.appendChild(block); });
          break;
        default: input = document.createElement('input'); input.type = f.type || 'text';
      }
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.required && input.tagName !== 'DIV') input.required = true;
      if (input.tagName !== 'DIV') input.name = f.name;
      wrapper.appendChild(input);
      fieldsNode.appendChild(wrapper);
    });
  } catch (err) {
    // no subform for this combination
    currentSubformSchema = null;
    document.getElementById('subform-area').hidden = true;
    document.getElementById('subform-fields').innerHTML = '';
  }
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

  // Wait a short while for DOM inputs to exist so onchange handlers and subform wiring are present
  setTimeout(async ()=>{
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
    // if request includes request_type and services_needed try to load the matching subform
    const rt = requestObj.body && requestObj.body.request_type ? requestObj.body.request_type : null;
    const sd = requestObj.body && requestObj.body.services_needed ? requestObj.body.services_needed : null;
    if (rt && sd) {
      await loadSubformIfReady(rt, sd);
      // populate subform values after it's rendered
      (currentSubformSchema && currentSubformSchema.fields || []).forEach(f => {
        const val = requestObj.body[f.name];
        if (val === undefined) return;
        if (f.type === 'checkbox') {
          const els = document.getElementsByName(f.name);
          try {
            const arr = Array.isArray(val) ? val : (typeof val === 'string' ? JSON.parse(val) : [val]);
            Array.from(els).forEach(ch => { ch.checked = arr.includes(ch.value); });
          } catch(e) {
            // fallback
          }
        } else {
          const el = document.getElementById('dynamic-form').elements[f.name]; if (!el) return; el.value = val;
        }
      });
    }
    showToast('Loaded request into form — edit and submit to create a new request', 3000);
  }, 100);
}

(async function init() {
  const schemas = await loadSchemas();
  // Auto-start with 'new_request' if present
  const startBtn = document.getElementById('start-new');
  if (startBtn) startBtn.onclick = async () => {
    const nr = schemas.find(s => s.id === 'new_request');
    if (nr) {
      await loadSchema(nr.file);
      showToast('Started new request', 1200);
    } else {
      showToast('new_request schema not found', 2000);
    }
  };
  // auto-open new_request so the workflow starts there
  const nr = schemas.find(s => s.id === 'new_request');
  if (nr) { await loadSchema(nr.file); }
  await loadRequests();

  const rb = document.getElementById('refresh-schemas');
  if (rb) rb.onclick = async () => { showToast('Refreshing schemas…', 1000); await loadSchemas(); };

})();
