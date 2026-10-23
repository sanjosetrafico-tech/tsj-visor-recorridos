'use strict';
const $ = id => document.getElementById(id);
const INTERVAL = 30 * 60 * 1000;
let map, routes, snapshot, selected = new Set(), sense = 'todos', showStops = false, initialized = false, busy = false;
let hiddenBranches = new Set(), branchGroups = new Map();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message) { $('notice').hidden = !message; $('notice').textContent = message; }
function timestamp(value) { return new Date(value).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function visibleDirections(values) {
  return [...new Set(values)].filter(v=>v&&v!=='sin identificar');
}
function directionLabel(value) {
  return value==='sin identificar' ? '' : value;
}

function status() {
  if (!snapshot) return;
  const stale = Date.now() - Date.parse(snapshot.updatedAt) > INTERVAL * 2;
  $('sync-status').textContent = `${stale ? 'Datos pendientes de actualización' : 'KML verificados'} · ${timestamp(snapshot.updatedAt)} (Argentina)`;
  if (stale) notify('La última sincronización tiene más de una hora. Se muestran los últimos recorridos verificados.');
}
function saveSelection() { try { localStorage.setItem('tsj-lines',JSON.stringify([...selected])); localStorage.setItem('tsj-hidden-branches',JSON.stringify([...hiddenBranches])); } catch {} }
function indexBranches() {
  branchGroups = new Map(snapshot.sources.map(s=>[s.id,new Map()]));
  snapshot.features.filter(f=>f.geometry.type==='LineString').forEach(f=>{
    const p=f.properties, key=TSJBranches.key(p), group=branchGroups.get(p.sourceId);
    if(!group.has(key)) group.set(key,{key,name:TSJBranches.branch(p),directions:new Set()});
    group.get(key).directions.add(p.direction);
  });
}
function renderList() {
  const scroll = $('lines').scrollTop;
  $('total').textContent = String(snapshot.sources.length);
  $('lines').innerHTML = snapshot.sources.map(s => {
    const f = snapshot.features.filter(f => f.properties.sourceId === s.id && f.geometry.type === 'LineString');
    const directions = visibleDirections(f.map(f => f.properties.direction)).join(' · ');
    const branches=[...branchGroups.get(s.id).values()];
    const controls=branches.length>1 ? `<div class="branch-list" role="group" aria-label="Ramales de ${esc(s.name)}">${branches.map(b=>`<label class="branch-option"><input type="checkbox" data-branch="${esc(b.key)}" data-line="${esc(s.id)}" ${selected.has(s.id)&&!hiddenBranches.has(b.key)?'checked':''}><span>${esc(b.name)}<small>${esc(visibleDirections([...b.directions]).join(' · '))}</small></span></label>`).join('')}</div>` : '';
    return `<div class="line-group" data-source="${esc(s.id)}" data-search="${esc(s.name+' '+branches.map(b=>b.name).join(' '))}" style="--line-color:${esc(s.color)}"><div class="line-row"><label><input type="checkbox" data-parent="${esc(s.id)}" value="${esc(s.id)}" ${selected.has(s.id)?'checked':''}><span class="swatch"></span><span class="line-name">${esc(s.name)}<small>${branches.length>1?branches.length+' ramales':esc(directions)}</small></span></label><a class="source-link" href="https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(s.id)}" target="_blank" rel="noopener" aria-label="Abrir mapa original de ${esc(s.name)}">↗</a></div>${controls}</div>`;
  }).join('');
  $('lines').querySelectorAll('[data-parent]').forEach(input => {
    const keys=[...branchGroups.get(input.value).keys()];
    const active=keys.filter(k=>selected.has(input.value)&&!hiddenBranches.has(k)).length;
    input.indeterminate=active>0&&active<keys.length;
    input.addEventListener('change', () => {
    input.checked ? selected.add(input.value) : selected.delete(input.value);
    if(input.checked) keys.forEach(k=>hiddenBranches.delete(k));
    saveSelection(); renderList(); draw();
    $('lines').querySelector(`[data-parent="${input.value}"]`).focus({preventScroll:true});
    });
  });
  $('lines').querySelectorAll('[data-branch]').forEach(input=>input.addEventListener('change',()=>{
    const id=input.dataset.line, key=input.dataset.branch;
    if(input.checked) {
      if(!selected.has(id)) branchGroups.get(id).forEach(b=>hiddenBranches.add(b.key));
      selected.add(id); hiddenBranches.delete(key);
    } else {
      hiddenBranches.add(key);
      if([...branchGroups.get(id).keys()].every(k=>hiddenBranches.has(k))) selected.delete(id);
    }
    saveSelection(); renderList(); draw();
    $('lines').querySelector(`[data-branch="${key}"]`).focus({preventScroll:true});
  }));
  filterList();
  $('lines').scrollTop=scroll;
}
function filterList() {
  const q = $('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/linea\s*/g,'').trim();
  $('lines').querySelectorAll('.line-group').forEach(row => { row.hidden = !row.dataset.search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/linea\s*/g,'').includes(q); });
}
function draw() {
  if (!snapshot || !map) return;
  routes.clearLayers();
  const sources = new Map(snapshot.sources.map(s => [s.id,s]));
  const features = snapshot.features.filter(f => selected.has(f.properties.sourceId) && !hiddenBranches.has(TSJBranches.key(f.properties)) && (sense === 'todos' || f.properties.direction === sense || f.properties.direction === 'ambos') && (showStops || f.geometry.type !== 'Point'));
  L.geoJSON(features, {
    style: f => ({color:sources.get(f.properties.sourceId).color, weight:f.properties.direction === 'vuelta'?4:5, opacity:.86, dashArray:f.properties.direction === 'vuelta'?'10 9':null, lineCap:'round'}),
    pointToLayer: (f,latlng) => L.circleMarker(latlng,{radius:4,color:sources.get(f.properties.sourceId).color,weight:2,fillColor:'#fff',fillOpacity:1}),
    onEachFeature: (f,layer) => {
      const p=f.properties;
      const directionText=directionLabel(p.direction);
      layer.bindPopup(`<div class="popup-title">${esc(p.line)}</div><strong>${esc(p.name)}</strong>${directionText?`<br>Sentido: ${esc(directionText)}`:''}<br>${esc(p.folder)}<br><a href="https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(p.sourceId)}" target="_blank" rel="noopener">Ver mapa original ↗</a>`);
      if (f.geometry.type==='LineString') {
        const tooltip=[p.line,TSJBranches.branch(p),directionText].filter(Boolean).join(' · ');
        layer.bindTooltip(tooltip,{sticky:true});
      }
    }
  }).addTo(routes);
  const count = new Set(features.filter(f=>f.geometry.type==='LineString').map(f=>f.properties.sourceId)).size;
  $('visible-count').textContent = `${count} de ${snapshot.sources.length} mapas visibles`;
  const segmentCount=features.filter(f=>f.geometry.type==='LineString').length;
  $('segment-count').textContent = `${segmentCount} ${segmentCount===1?'tramo':'tramos'}`;
  if (!features.length) notify(selected.size ? 'No hay recorridos para este sentido. Probá con Ida y vuelta.' : 'Seleccioná una o más líneas para ver sus recorridos.');
  else { notify(''); status(); }
}
function fit() { if(routes && routes.getBounds().isValid()) map.fitBounds(routes.getBounds(),{paddingTopLeft:[25,100],paddingBottomRight:[25,45],maxZoom:15}); }
async function refresh() {
  if (busy) return;
  busy=true; $('refresh').disabled=true;
  try {
    const response = await fetch(`data/routes.json?t=${Date.now()}`, {cache:'no-store',signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (next.type!=='FeatureCollection' || !Array.isArray(next.sources) || !next.sources.length || !next.features?.length || !Number.isFinite(Date.parse(next.updatedAt))) throw Error('Datos incompletos');
    snapshot=next;
    indexBranches();
    if (!initialized) {
      selected=new Set(snapshot.sources.map(s=>s.id));
      try { const saved=JSON.parse(localStorage.getItem('tsj-lines')); if(Array.isArray(saved)) selected=new Set(saved.filter(id=>snapshot.sources.some(s=>s.id===id))); } catch {}
      try { const saved=JSON.parse(localStorage.getItem('tsj-hidden-branches')); if(Array.isArray(saved)) hiddenBranches=new Set(saved.filter(k=>typeof k==='string')); } catch {}
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
  $('all').addEventListener('click',()=>{if(!snapshot)return;selected=new Set(snapshot.sources.map(s=>s.id));hiddenBranches.clear();saveSelection();renderList();draw();});
  $('none').addEventListener('click',()=>{if(!snapshot)return;selected.clear();saveSelection();renderList();draw();});
  $('stops').addEventListener('change',e=>{showStops=e.target.checked;draw();});
  $('fit').addEventListener('click',fit);
  $('refresh').addEventListener('click',refresh);
  document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>{
    sense=button.dataset.direction;
    document.querySelectorAll('[data-direction]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});draw();
  }));
  setInterval(refresh,INTERVAL);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('message',event=>{
    if(event.origin!==window.location.origin)return;
    if(event.data?.type==='tsj-recorridos-refresh')refresh();
  });
  refresh();
}
