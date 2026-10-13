const $ = (s) => document.querySelector(s);
let widgets = [];
let sel = null;

const cur = () => widgets.find((w) => w.id === sel);

async function refresh() {
  widgets = await api.list();
  if (sel && !cur()) sel = null;
  if (!sel && widgets.length) await select(widgets[0].id);
  render();
}

function render() {
  const ul = $('#list');
  ul.textContent = '';
  for (const w of widgets) {
    const li = document.createElement('li');
    li.className = w.id === sel ? 'sel' : '';
    const dot = document.createElement('span');
    dot.className = 'dot' + (w.locked ? '' : ' edit');
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = w.name;
    li.append(dot, nm);
    li.onclick = () => select(w.id);
    ul.appendChild(li);
  }

  const w = cur();
  $('#empty').hidden = !!w;
  $('#panel').hidden = !w;
  if (!w) return;

  const active = document.activeElement;
  const set = (id, v) => { const e = $('#f-' + id); if (e !== active) e.value = v; };
  set('name', w.name);
  for (const k of ['x', 'y', 'width', 'height']) set(k, Math.round(w[k]));
  set('opacity', w.opacity);
  $('#f-alwaysOnTop').checked = w.alwaysOnTop;
  $('#f-clickThrough').checked = w.clickThrough;
  $('#btn-edit').classList.toggle('on', !w.locked);
  $('#btn-edit').textContent = w.locked ? 'Mover / redimensionar' : 'Terminar edición';
}

async function select(id) {
  sel = id;
  $('#code').value = await api.getHtml(id);
  $('#status').textContent = '';
  render();
}

function patch(p) {
  if (sel) api.update(sel, p);
}

// ---- controles del widget ----
$('#f-name').onchange = (e) => patch({ name: e.target.value.trim() || 'Widget' });
for (const k of ['x', 'y', 'width', 'height']) {
  $('#f-' + k).onchange = (e) => patch({ [k]: Number(e.target.value) });
}
$('#f-opacity').oninput = (e) => patch({ opacity: Number(e.target.value) });
$('#f-alwaysOnTop').onchange = (e) => patch({ alwaysOnTop: e.target.checked });
$('#f-clickThrough').onchange = (e) => patch({ clickThrough: e.target.checked });
$('#btn-edit').onclick = () => api.edit(sel, cur().locked);
$('#btn-reload').onclick = () => api.reload(sel);
$('#btn-folder').onclick = () => api.openFolder(sel);
$('#btn-delete').onclick = async () => {
  if (!confirm('¿Eliminar el widget "' + cur().name + '" para siempre?')) return;
  const id = sel;
  sel = null;
  await api.remove(id);
  await refresh();
};

// ---- editor ----
async function save() {
  await api.saveHtml(sel, $('#code').value);
  $('#status').textContent = 'Aplicado ✓';
  setTimeout(() => ($('#status').textContent = ''), 1500);
}
$('#btn-save').onclick = save;
$('#code').addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const t = e.target, s = t.selectionStart;
    t.setRangeText('  ', s, t.selectionEnd, 'end');
  }
});

// ---- nuevo / importar ----
$('#btn-new').onclick = async () => {
  const sel2 = $('#n-tpl');
  if (!sel2.children.length) {
    for (const t of await api.templates()) {
      const o = document.createElement('option');
      o.value = t.key;
      o.textContent = t.label;
      sel2.appendChild(o);
    }
  }
  $('#modal').hidden = false;
  $('#n-name').select();
};
$('#n-cancel').onclick = () => ($('#modal').hidden = true);
$('#n-ok').onclick = async () => {
  const cfg = await api.create($('#n-name').value.trim() || 'Widget', $('#n-tpl').value);
  $('#modal').hidden = true;
  await refresh();
  await select(cfg.id);
};
$('#btn-import').onclick = async () => {
  const cfg = await api.importHtml();
  if (cfg) { await refresh(); await select(cfg.id); }
};

// ---- inicio con Windows ----
api.getAutostart().then((v) => ($('#autostart').checked = v));
$('#autostart').onchange = (e) => api.setAutostart(e.target.checked);

api.onChanged(async () => {
  widgets = await api.list();
  if (sel && !cur()) sel = null;
  render();
});
refresh();
