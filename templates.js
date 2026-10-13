// Plantillas HTML para nuevos widgets. El fondo del <body> es transparente:
// la ventana del widget también lo es, así que lo que dibujes es lo que se ve.

const base = `
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;
    font-family:"Segoe UI",system-ui,sans-serif;color:#fff;user-select:none}
  .card{height:100%;border-radius:20px;padding:16px;
    background:rgba(20,22,30,.72);backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 30px rgba(0,0,0,.35)}
`;

module.exports = {
  blank: {
    label: 'En blanco',
    width: 280,
    height: 160,
    html: `<!doctype html>
<html><head><meta charset="utf-8"><style>${base}
  .card{display:flex;align-items:center;justify-content:center;font-size:18px}
</style></head>
<body><div class="card">Hola, widget 👋</div></body></html>
`,
  },

  clock: {
    label: 'Reloj y fecha',
    width: 300,
    height: 150,
    html: `<!doctype html>
<html><head><meta charset="utf-8"><style>${base}
  .card{display:flex;flex-direction:column;align-items:center;justify-content:center}
  #t{font-size:54px;font-weight:300;letter-spacing:1px}
  #d{font-size:15px;opacity:.7;text-transform:capitalize;margin-top:2px}
</style></head>
<body><div class="card"><div id="t"></div><div id="d"></div></div>
<script>
  function tick(){
    var n = new Date();
    document.getElementById('t').textContent =
      n.toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'});
    document.getElementById('d').textContent =
      n.toLocaleDateString('es', {weekday:'long', day:'numeric', month:'long'});
  }
  tick(); setInterval(tick, 1000);
</script></body></html>
`,
  },

  notes: {
    label: 'Notas (se guardan solas)',
    width: 300,
    height: 260,
    html: `<!doctype html>
<html><head><meta charset="utf-8"><style>${base}
  .card{padding:12px;display:flex}
  textarea{flex:1;width:100%;resize:none;border:0;outline:0;background:transparent;
    color:#fff;font:15px/1.5 "Segoe UI",system-ui,sans-serif;user-select:text}
  textarea::placeholder{color:rgba(255,255,255,.4)}
</style></head>
<body><div class="card"><textarea id="n" placeholder="Escribe aquí…"></textarea></div>
<script>
  // localStorage es propio de cada widget y sobrevive a reinicios.
  var n = document.getElementById('n');
  n.value = localStorage.getItem('nota') || '';
  n.addEventListener('input', function(){ localStorage.setItem('nota', n.value); });
</script></body></html>
`,
  },
};
