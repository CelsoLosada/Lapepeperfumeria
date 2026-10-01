// ── CONEXIÓN CON GOOGLE SHEETS ─────────────────────────────────────
// 1. En el Google Sheet: Archivo → Compartir → Publicar en la web.
// 2. Elige la HOJA (pestaña) donde están los productos, formato "Valores separados
//    por comas (.csv)", y Publicar. Deja marcada "Volver a publicar automáticamente".
// 3. Pega aquí la URL que te da Google (termina en /pub?output=csv).
//
// Columnas en la fila 1 del Sheet (no importan mayúsculas ni tildes):
// ref | nombre | tipo | familia | notas | precio | disponible | imagen
//   - tipo: "original" o "inspirado"
//   - familia: "floral", "amaderado", "citrico" o "dulce"
//   - disponible: TRUE/FALSE (casilla de verificación) — vacío cuenta como disponible
//   - imagen (opcional): ruta o URL de la foto, ej. "img/n12.jpg"
//
// Para diagnosticar problemas abre la página con  ?debug  al final de la URL
// (ej. index.html?debug). Para ver los datos de ejemplo usa  ?demo
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQDxEfO7eUiDJj-Iia6CUfeWLtdz3w3UOOVg43QsqHSVVEz-IzcuRh9yPkgg6bXl0JeHlIqQON11-VE/pub?gid=0&single=true&output=csv';

// true: los productos agotados se muestran con la etiqueta "Agotado".
// false: se ocultan por completo.
const MOSTRAR_AGOTADOS = true;

const DEMO_DATA = [
  {ref:'Nº01', nombre:'Flor blanca intensa', tipo:'original', familia:'floral', notas:'Jazmín, almizcle, vainilla', precio:'25 USD', disponible:true, imagen:''},
  {ref:'Nº02', nombre:'Bosque de cedro', tipo:'original', familia:'amaderado', notas:'Cedro, pachulí, ámbar', precio:'28 USD', disponible:true, imagen:''},
  {ref:'Nº03', nombre:'Cítrico de tarde', tipo:'original', familia:'citrico', notas:'Bergamota, pomelo, almizcle', precio:'22 USD', disponible:true, imagen:''},
  {ref:'Nº04', nombre:'Vainilla y ámbar', tipo:'original', familia:'dulce', notas:'Vainilla, haba tonka, ámbar', precio:'26 USD', disponible:false, imagen:''},
  {ref:'Nº05', nombre:'Rosa de invierno', tipo:'original', familia:'floral', notas:'Rosa, incienso, madera', precio:'27 USD', disponible:true, imagen:''},
  {ref:'Nº06', nombre:'Vetiver salvaje', tipo:'original', familia:'amaderado', notas:'Vetiver, pimienta, cuero', precio:'29 USD', disponible:true, imagen:''},
  {ref:'Nº12', nombre:'Notas amaderadas suaves', tipo:'inspirado', familia:'amaderado', notas:'Sándalo, vainilla, almizcle', precio:'12 USD', disponible:true, imagen:''},
  {ref:'Nº17', nombre:'Floral fresco de día', tipo:'inspirado', familia:'floral', notas:'Peonía, pera, cedro blanco', precio:'10 USD', disponible:true, imagen:''},
  {ref:'Nº23', nombre:'Cítrico deportivo', tipo:'inspirado', familia:'citrico', notas:'Limón, jengibre, vetiver', precio:'11 USD', disponible:true, imagen:''},
  {ref:'Nº29', nombre:'Dulce oriental', tipo:'inspirado', familia:'dulce', notas:'Caramelo, canela, madera', precio:'13 USD', disponible:true, imagen:''},
  {ref:'Nº31', nombre:'Cítrico de noche', tipo:'inspirado', familia:'citrico', notas:'Mandarina, jazmín, almizcle', precio:'12 USD', disponible:true, imagen:''},
  {ref:'Nº34', nombre:'Dulce vainillado', tipo:'inspirado', familia:'dulce', notas:'Vainilla, praliné, sándalo', precio:'14 USD', disponible:true, imagen:''},
  {ref:'Nº38', nombre:'Amaderado especiado', tipo:'inspirado', familia:'amaderado', notas:'Canela, cedro, ámbar', precio:'13 USD', disponible:true, imagen:''},
  {ref:'Nº41', nombre:'Floral en polvo', tipo:'inspirado', familia:'floral', notas:'Violeta, iris, almizcle', precio:'11 USD', disponible:true, imagen:''},
];

const PAGE_SIZE = 12;
let visibleCount = PAGE_SIZE;
let productos = [];

const grid = document.getElementById('grid');
const loadMoreWrap = document.getElementById('load-more-wrap');
const resultCount = document.getElementById('result-count');
const searchInput = document.getElementById('search');
const demoBanner = document.getElementById('demo-banner');

let activeTab = 'todos';
let activeFamily = 'todas';
let searchTerm = '';

// ── UTILIDADES ──────────────────────────────────────────────────────
// Minúsculas, sin tildes y sin espacios sobrantes: "Cítrico " → "citrico"
function limpiar(texto){
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

// Evita que texto del Sheet se interprete como HTML
function esc(texto){
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Solo acepta rutas relativas o URLs http(s); descarta cualquier otra cosa
function imagenSegura(valor){
  const v = String(valor ?? '').trim();
  if(!v) return '';
  if(/^(https?:\/\/|[\w./-]+$)/i.test(v) && !/^javascript:/i.test(v)) return v;
  return '';
}

function mostrarBanner(mensaje){
  demoBanner.innerHTML = `<div class="demo-banner">${esc(mensaje)}</div>`;
}

// ── CARGA DE DATOS ──────────────────────────────────────────────────
function normalizarFila(row){
  const disp = limpiar(row.disponible);
  return {
    ref: String(row.ref ?? '').trim(),
    nombre: String(row.nombre ?? '').trim(),
    tipo: limpiar(row.tipo),
    familia: limpiar(row.familia),
    notas: String(row.notas ?? '').trim(),
    precio: String(row.precio ?? '').trim(),
    // Solo cuenta como agotado si dice explícitamente false / no / 0 / agotado
    disponible: !['false', 'no', '0', 'agotado'].includes(disp),
    imagen: imagenSegura(row.imagen),
  };
}

async function cargarProductos(){
  const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
  if(!res.ok) throw new Error(`Google respondió con error ${res.status}. ¿Está publicada la hoja en la web?`);

  const csvText = await res.text();
  // Si la hoja no está publicada como CSV, Google devuelve una página HTML
  if(csvText.trimStart().startsWith('<')) {
    throw new Error('La URL no devolvió un CSV (devolvió HTML). Revisa que esté publicada como "Valores separados por comas (.csv)" y no como página web.');
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: limpiar, // "Nombre", "NOMBRE " y "nómbre" pasan a "nombre"
  });

  const columnas = parsed.meta.fields || [];
  const faltantes = ['ref', 'nombre'].filter(c => !columnas.includes(c));
  if(faltantes.length){
    throw new Error(`Faltan columnas obligatorias: ${faltantes.join(', ')}. Encabezados encontrados en la hoja publicada: ${columnas.join(', ') || '(ninguno)'}.`);
  }

  const todas = parsed.data.map(normalizarFila);
  const filas = todas.filter(p => p.ref && p.nombre);
  if(filas.length === 0){
    throw new Error(`La hoja publicada trae ${todas.length} filas pero ninguna tiene "ref" y "nombre" a la vez. ¿Estás publicando la pestaña correcta?`);
  }
  return { filas, columnas, descartadas: todas.length - filas.length };
}

// ── FILTRADO Y RENDER ────────────────────────────────────────────────
function getFiltered(){
  const term = limpiar(searchTerm);
  return productos.filter(p =>
    (MOSTRAR_AGOTADOS || p.disponible) &&
    (activeTab === 'todos' || p.tipo === activeTab) &&
    (activeFamily === 'todas' || p.familia === activeFamily) &&
    (term === '' ||
      limpiar(p.nombre).includes(term) ||
      limpiar(p.ref).includes(term) ||
      limpiar(p.notas).includes(term))
  );
}

function cardHtml(p){
  const mensaje = `Hola, quiero consultar disponibilidad de ${p.ref}`;
  const media = p.imagen
    ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">`
    : '';
  return `
    <div class="card${p.disponible ? '' : ' agotado'}">
      <div class="card-media">
        ${media}
        <span class="card-badge">${p.tipo === 'original' ? 'Original' : 'Inspirado'}</span>
        ${p.disponible ? '' : '<span class="badge-agotado">Agotado</span>'}
      </div>
      <div class="card-body">
        <div class="card-ref">${esc(p.ref)}</div>
        <h3 class="card-name">${esc(p.nombre)}</h3>
        <div class="card-mid">
          <div class="card-notes">${esc(p.notas)}</div>
        </div>
        <div class="card-footer">
          <span class="price">${esc(p.precio)}</span>
          <a class="consult-btn" href="https://wa.me/584120000000?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">Consultar</a>
        </div>
      </div>
    </div>
  `;
}

function render(){
  const items = getFiltered();
  const shown = items.slice(0, visibleCount);

  resultCount.textContent = items.length === productos.length
    ? `${items.length} referencias`
    : `${items.length} resultado${items.length === 1 ? '' : 's'}`;

  grid.innerHTML = shown.length
    ? shown.map(cardHtml).join('')
    : `<div class="empty-state">No encontramos nada con ese término. Prueba con otra palabra o consulta por WhatsApp.</div>`;

  // Si una foto no carga, se quita y queda el degradado de fondo
  grid.querySelectorAll('.card-media img').forEach(img => {
    img.addEventListener('error', () => img.remove());
  });

  loadMoreWrap.innerHTML = visibleCount < items.length
    ? `<button class="load-more" id="load-more-btn">Ver más (${items.length - visibleCount} restantes)</button>`
    : '';

  const btn = document.getElementById('load-more-btn');
  if(btn) btn.addEventListener('click', () => { visibleCount += PAGE_SIZE; render(); });
}

function activar(selector, btn){
  document.querySelectorAll(selector).forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activar('.tab', btn);
    activeTab = btn.dataset.tab;
    visibleCount = PAGE_SIZE;
    render();
  });
});

document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    activar('.chip', btn);
    activeFamily = btn.dataset.family;
    visibleCount = PAGE_SIZE;
    render();
  });
});

let debounce;
searchInput.addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    searchTerm = e.target.value;
    visibleCount = PAGE_SIZE;
    render();
  }, 150);
});

// ── INICIO ────────────────────────────────────────────────────────
async function iniciar(){
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');

  // Modo demo: solo si no hay URL configurada o se pide con ?demo
  if(!SHEET_CSV_URL || params.has('demo')){
    mostrarBanner('Mostrando datos de ejemplo.');
    productos = DEMO_DATA;
    render();
    return;
  }

  grid.innerHTML = `<div class="empty-state">Cargando catálogo…</div>`;
  try{
    const { filas, columnas, descartadas } = await cargarProductos();
    productos = filas;
    render();
    if(debug){
      mostrarBanner(`DEBUG · ${filas.length} productos cargados (${descartadas} filas descartadas por no tener ref/nombre). Columnas detectadas: ${columnas.join(', ')}.`);
    }
  }catch(err){
    console.error('No se pudo cargar el Google Sheet:', err);
    resultCount.textContent = '';
    loadMoreWrap.innerHTML = '';
    // Al cliente nunca se le muestran productos falsos: solo un aviso con salida a WhatsApp
    grid.innerHTML = `<div class="error-state">No pudimos cargar el catálogo en este momento. Escríbenos por WhatsApp y te ayudamos directamente.</div>`;
    if(debug) mostrarBanner(`DEBUG · ${err.message}`);
  }
}

iniciar();
