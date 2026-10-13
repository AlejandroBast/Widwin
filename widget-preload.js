// Se ejecuta dentro de cada widget. Dibuja la capa de "modo edición"
// (mover arrastrando, redimensionar desde la esquina, botón Listo).
const { ipcRenderer } = require('electron');

let state = { locked: true, name: '' };
let overlay = null;

ipcRenderer.on('widget:state', (_e, s) => {
  state = s;
  render();
});
document.addEventListener('DOMContentLoaded', render);

function el(css, text) {
  const d = document.createElement('div');
  d.style.cssText = css;
  if (text) d.textContent = text;
  return d;
}

function render() {
  if (!document.documentElement) return;
  if (state.locked) {
    if (overlay) overlay.remove();
    overlay = null;
    return;
  }
  if (overlay && overlay.isConnected) {
    overlay.firstChild.firstChild.textContent = state.name + ' · arrastra para mover';
    return;
  }

  overlay = el(
    'position:fixed;inset:0;z-index:2147483647;background:rgba(230,0,199,.2);' +
      'outline:2px dashed #fd29c5;outline-offset:-2px;-webkit-app-region:drag;cursor:move;' +
      'font:12px "Segoe UI",system-ui,sans-serif;color:#fff;user-select:none'
  );

  const bar = el('position:absolute;top:6px;left:6px;right:6px;display:flex;gap:8px;align-items:center');
  const label = el('flex:1;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  label.textContent = state.name + ' · arrastra para mover';
  const done = el(
    'background:#e600c7;padding:4px 10px;border-radius:8px;cursor:pointer;font-weight:600;-webkit-app-region:no-drag',
    'Listo'
  );
  done.addEventListener('click', () => ipcRenderer.send('widget:done'));
  bar.append(label, done);

  const grip = el(
    'position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;-webkit-app-region:no-drag;' +
      'background:linear-gradient(135deg,transparent 50%,#fd29c5 50%);border-bottom-right-radius:6px'
  );
  grip.addEventListener('pointerdown', (e) => {
    grip.setPointerCapture(e.pointerId);
    const sx = e.screenX, sy = e.screenY;
    const sw = window.innerWidth, sh = window.innerHeight;
    const move = (m) => ipcRenderer.send('widget:resize', sw + (m.screenX - sx), sh + (m.screenY - sy));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      ipcRenderer.send('widget:resize-end');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });

  overlay.append(bar, grip);
  // En documentElement para sobrevivir si el widget reescribe el <body>.
  document.documentElement.appendChild(overlay);
}
