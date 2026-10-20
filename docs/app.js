'use strict';
const $ = id => document.getElementById(id);
const INTERVAL = 30 * 60 * 1000;
let map, routes, snapshot, selected = new Set(), sense = 'todos', showStops = false, initialized = false, busy = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message) { $('notice').hidden = !message; $('notice').textContent = message; }
function timestamp(value) { return new Date(value).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function status() {
  if (!snapshot) return;
  const stale = Date.now() - Date.parse(snapshot.updatedAt) > INTERVAL * 2;
  $('sync-status').textContent = `${stale ? 'Datos pendientes de actualización' : 'KML verificados'} · ${timestamp(snapshot.updatedAt)} (Argentina)`;
  if (stale) notify('La última sincronización tiene más de una hora. Se muestran los últimos recorridos verificados.');
}
function saveSelection() { try { localStorage.setItem('tsj-lines',JSON.stringify([...selected])); } catch {} }
function renderList() {
  $('lines').innerHTML = snapshot.sources.map(s => {
    const f = snapshot.features.filter(f => f.properties.sourceId === s.id && f.geometry.type === 'LineString');
    const directions = [...new Set(f.map(f => f.properties.direction))].join(' · ');
    return `<div class="line-row" style="--line-color:${esc(s.color)}" data-source="${esc(s.id)}"><label><input type="checkbox" value="${esc(s.id)}" ${selected.has(s.id)?'checked':''}><span class="swatch"></span><span class="line-name">${esc(s.name)}<small>${esc(directions)}</small></span></label><a class="source-link" href="https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(s.id)}" target="_blank" rel="noopener" aria-label="Abrir mapa original de ${esc(s.name)}">↗</a></div>`;
  }).join('');
  $('lines').querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    input.checked ? selected.add(input.value) : selected.delete(input.value);
    saveSelection(); draw();
  }));
  filterList();
}
function filterList() {
  const q = $('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/linea\s*/g,'').trim();
  $('lines').querySelectorAll('.line-row').forEach(row => { row.hidden = !row.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/linea\s*/g,'').includes(q); });
}
function draw() {
  if (!snapshot || !map) return;
  routes.clearLayers();
  const sources = new Map(snapshot.sources.map(s => [s.id,s]));
  const features = snapshot.features.filter(f => selected.has(f.properties.sourceId) && (sense === 'todos' || f.properties.direction === sense || f.properties.direction === 'ambos') && (showStops || f.geometry.type !== 'Point'));
  L.geoJSON(features, {
    style: f => ({color:sources.get(f.properties.sourceId).color, weight:f.properties.direction === 'vuelta'?4:5, opacity:.86, dashArray:f.properties.direction === 'vuelta'?'10 9':f.properties.direction === 'sin identificar'?'2 8':null, lineCap:'round'}),
    pointToLayer: (f,latlng) => L.circleMarker(latlng,{radius:4,color:sources.get(f.properties.sourceId).color,weight:2,fillColor:'#fff',fillOpacity:1}),
    onEachFeature: (f,layer) => {
      const p=f.properties;
      layer.bindPopup(`<div class="popup-title">${esc(p.line)}</div><strong>${esc(p.name)}</strong><br>Sentido: ${esc(p.direction)}<br>${esc(p.folder)}<br><a href="https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(p.sourceId)}" target="_blank" rel="noopener">Ver mapa original ↗</a>`);
      if (f.geometry.type==='LineString') layer.bindTooltip(`${p.line} · ${p.direction}`,{sticky:true});
    }
  }).addTo(routes);
  const count = new Set(features.filter(f=>f.geometry.type==='LineString').map(f=>f.properties.sourceId)).size;
  $('visible-count').textContent = `${count} de ${snapshot.sources.length} mapas visibles`;
  $('segment-count').textContent = `${features.filter(f=>f.geometry.type==='LineString').length} tramos`;
  if (!features.length) notify(selected.size ? 'No hay recorridos para este sentido. Probá con Ida y vuelta o Sin identificar.' : 'Seleccioná una o más líneas para ver sus recorridos.');
  else { notify(''); status(); }
}
function fit() { if(routes && routes.getBounds().isValid()) map.fitBounds(routes.getBounds(),{paddingTopLeft:[35,145],paddingBottomRight:[35,90],maxZoom:15}); }
async function refresh() {
  if (busy) return;
  busy=true; $('refresh').disabled=true;
  try {
    const response = await fetch(`data/routes.json?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (next.type!=='FeatureCollection' || next.sources?.length!==13 || !next.features?.length || !Number.isFinite(Date.parse(next.updatedAt))) throw Error('Datos incompletos');
    snapshot=next;
    if (!initialized) {
      selected=new Set(snapshot.sources.map(s=>s.id));
      try { const saved=JSON.parse(localStorage.getItem('tsj-lines')); if(Array.isArray(saved)) selected=new Set(saved.filter(id=>snapshot.sources.some(s=>s.id===id))); } catch {}
    }
    renderList(); draw(); status();
    if (!initialized) { fit(); initialized=true; }
  } catch (error) {
    notify(snapshot ? 'No se pudo consultar la actualización. Se conservan los recorridos cargados; podés reintentar con Actualizar.' : 'No se pudieron cargar los recorridos. Revisá tu conexión y pulsá Actualizar.');
    $('sync-status').textContent=snapshot ? `Última versión: ${timestamp(snapshot.updatedAt)} (Argentina)` : 'Sin conexión a los datos';
    if(!snapshot) $('lines').innerHTML='<p class="loading">Los recorridos estarán disponibles al recuperar la conexión.</p>';
  } finally { busy=false; $('refresh').disabled=false; }
}
if (typeof L === 'undefined') {
  notify('No se pudo iniciar el mapa. Recargá la página para reintentar.');
  $('sync-status').textContent='El mapa no está disponible';
} else {
  map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([-31.744,-60.518],12);
  L.control.zoom({position:'topright'}).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
  routes=L.featureGroup().addTo(map);
  $('search').addEventListener('input',filterList);
  $('all').addEventListener('click',()=>{if(!snapshot)return;selected=new Set(snapshot.sources.map(s=>s.id));saveSelection();renderList();draw();});
  $('none').addEventListener('click',()=>{selected.clear();saveSelection();renderList();draw();});
  $('stops').addEventListener('change',e=>{showStops=e.target.checked;draw();});
  $('fit').addEventListener('click',fit);
  $('refresh').addEventListener('click',refresh);
  document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>{
    sense=button.dataset.direction;
    document.querySelectorAll('[data-direction]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});draw();
  }));
  setInterval(refresh,INTERVAL);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  refresh();
}
