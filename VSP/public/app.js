async function fetchJSON(url) { const r = await fetch(url); return r.json(); }

async function loadSchemas() {
  const schemas = await fetchJSON('/api/schemas');
  const container = document.getElementById('schemas');
  container.innerHTML = '';
  if (!schemas.length) {
    container.innerText = 'No schemas found in /public/formSchemas/*.json';
    return;
  }
  schemas.forEach(s => {
    const b = document.createElement('button');
    b.innerText = s.id;
    b.onclick = () => loadSchema(s.file);
    container.appendChild(b);
  });
}

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

  // upload area
  const fileArea = document.getElementById('file-area');
  fileArea.innerHTML = '';
  if (schema.controls && schema.controls.allowUpload) {
    const lbl = document.createElement('label'); lbl.innerText = 'Attach documents (multiple)';
    const inp = document.createElement('input'); inp.type='file'; inp.name='files'; inp.multiple=true;
    fileArea.appendChild(lbl); fileArea.appendChild(inp);
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

    const resp = await fetch('/api/requests', { method: 'POST', body: fd });
    const json = await resp.json();
    document.getElementById('result-area').hidden = false;
    document.getElementById('result').innerText = JSON.stringify(json, null, 2);
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
    const meta = document.createElement('pre'); meta.innerText = JSON.stringify(r, null, 2);
    div.appendChild(meta);
    node.appendChild(div);
  });
}

(async function init() {
  await loadSchemas();
  await loadRequests();
})();
