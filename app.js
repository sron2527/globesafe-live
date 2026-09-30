const STORAGE = {
  areas:'globesafe.watchAreas.v2', countries:'globesafe.favoriteCountries.v2', stations:'globesafe.favoriteStations.v2', seen:'globesafe.seenEvents.v2', theme:'globesafe.theme.v2', lang:'globesafe.language.v3'
};
const state = {
  events: [], conflictReports: [], map: null, mapReady:false, mapMarkers:[], watchMarkers:[], heroGlobe:null, heroGlobeReady:false, globePaused:false, currentFilter: 'all', selectedEvent: null, stations: [],
  watchAreas: loadLocal(STORAGE.areas, []), favoriteCountries: loadLocal(STORAGE.countries, []), favoriteStations: loadLocal(STORAGE.stations, []),
  favoritesOnly:false, hasLoadedEvents:false
};

const typeMeta = {
  earthquake:{label:'Earthquake',icon:'⌁',class:'earthquake'}, storm:{label:'Storm',icon:'◉',class:'storm'},
  flood:{label:'Flood',icon:'≋',class:'flood'}, wildfire:{label:'Wildfire',icon:'♨',class:'wildfire'},
  volcano:{label:'Volcano',icon:'▲',class:'volcano'}, other:{label:'Natural event',icon:'•',class:'storm'}
};
const $ = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>[...el.querySelectorAll(s)];
const escapeHtml = v => String(v ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
function loadLocal(key, fallback){try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}}
function saveLocal(key, value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
const ago = ts => { const d=Math.max(0,Date.now()-new Date(ts).getTime()),m=Math.floor(d/60000); if(m<1)return'just now';if(m<60)return`${m} min ago`;const h=Math.floor(m/60);if(h<24)return`${h} hr ago`;return`${Math.floor(h/24)} d ago`; };
const fmtDate = ts => new Date(ts).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
function haversine(lat1,lon1,lat2,lon2){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}

function showView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('#mobileMenu').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'});
  if(name==='map')setTimeout(()=>{initMap();renderMap();renderWatchAreasOnMap();state.map?.resize();},80);
  if(name==='radio'&&!state.stations.length)loadRadio();
  if(name==='cameras')renderCameras();
  if(name==='watchlist')renderWatchlist();
}
document.addEventListener('click',e=>{const viewBtn=e.target.closest('[data-view]');if(viewBtn){const filter=viewBtn.dataset.filter;if(filter)state.currentFilter=filter;showView(viewBtn.dataset.view);if(viewBtn.dataset.view==='map')setTimeout(()=>setFilter(state.currentFilter),80);}});
$('#menuBtn').onclick=()=>$('#mobileMenu').classList.toggle('open');
if(localStorage.getItem(STORAGE.theme)==='light')document.body.classList.add('light');
$('#themeToggle').textContent=document.body.classList.contains('light')?'☀':'☾';
$('#themeToggle').onclick=()=>{document.body.classList.toggle('light');const light=document.body.classList.contains('light');$('#themeToggle').textContent=light?'☀':'☾';localStorage.setItem(STORAGE.theme,light?'light':'dark');};
$('#year').textContent=new Date().getFullYear();

function normalizeEonet(f){
  const p=f.properties||{},cats=p.categories||[],ids=cats.map(c=>String(c.id||'').toLowerCase());let type='other';
  if(ids.some(x=>x.includes('severestorm')))type='storm';else if(ids.some(x=>x.includes('flood')))type='flood';else if(ids.some(x=>x.includes('wildfire')))type='wildfire';else if(ids.some(x=>x.includes('volcano')))type='volcano';
  const geom=f.geometry||{};let coords=null;if(geom.type==='Point')coords=geom.coordinates;else if(geom.type==='LineString'&&geom.coordinates?.length)coords=geom.coordinates[geom.coordinates.length-1];else if(geom.type==='Polygon'&&geom.coordinates?.[0]?.length)coords=geom.coordinates[0][0];
  return{id:`eonet-${p.id||Math.random()}`,type,title:p.title||'Natural event',time:p.date||new Date().toISOString(),lon:coords?.[0],lat:coords?.[1],source:'NASA EONET',sourceUrl:(p.sources||[])[0]?.url||p.link||'https://eonet.gsfc.nasa.gov/',description:p.description||'',magnitude:p.magnitudeValue?`${p.magnitudeValue} ${p.magnitudeUnit||''}`.trim():'—'};
}
function normalizeQuake(f){const p=f.properties||{},c=f.geometry?.coordinates||[];return{id:`usgs-${f.id}`,type:'earthquake',title:`M${p.mag??'?'} — ${p.place||'Earthquake'}`,time:new Date(p.time).toISOString(),lon:c[0],lat:c[1],depth:c[2],source:'USGS',sourceUrl:p.url,description:p.title||'',magnitude:p.mag??'—',alert:p.alert||'—'};}
async function fetchJson(url,timeout=10000){const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw new Error(r.status);return await r.json()}finally{clearTimeout(t)}}

function fetchUsgsJsonp(timeout=12000){
  return new Promise((resolve,reject)=>{
    const old=window.eqfeed_callback;
    const script=document.createElement('script');
    let done=false;
    const finish=(ok,value)=>{if(done)return;done=true;clearTimeout(timer);script.remove();if(old)window.eqfeed_callback=old;else try{delete window.eqfeed_callback}catch{};ok?resolve(value):reject(value);};
    window.eqfeed_callback=data=>finish(true,data);
    script.src='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojsonp?ts='+Date.now();
    script.async=true;script.onerror=()=>finish(false,new Error('USGS JSONP failed'));
    const timer=setTimeout(()=>finish(false,new Error('USGS JSONP timeout')),timeout);
    document.head.appendChild(script);
  });
}
async function loadEvents(){
  $('#lastUpdated').textContent='Updating…';
  let quakes=[],natural=[],sourceBits=[];
  const [q,e]=await Promise.allSettled([
    fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',12000),
    fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=30&limit=160',12000)
  ]);
  if(q.status==='fulfilled'){quakes=(q.value.features||[]).map(normalizeQuake);sourceBits.push('USGS');}
  else{
    try{const jq=await fetchUsgsJsonp();quakes=(jq.features||[]).map(normalizeQuake);sourceBits.push('USGS JSONP');}catch{}
  }
  if(e.status==='fulfilled'){natural=(e.value.features||[]).map(normalizeEonet).filter(x=>['storm','flood','wildfire','volcano'].includes(x.type));sourceBits.push('NASA EONET');}
  const incoming=[...quakes,...natural].filter(x=>Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon))).sort((a,b)=>new Date(b.time)-new Date(a.time));
  if(incoming.length){
    state.events=incoming;
    try{localStorage.setItem('globesafe.lastGoodEvents.v3',JSON.stringify({time:Date.now(),events:state.events.slice(0,700)}));}catch{}
  }else{
    try{const cached=JSON.parse(localStorage.getItem('globesafe.lastGoodEvents.v3')||'null');if(cached?.events?.length){state.events=cached.events;sourceBits.push('cached');}}catch{}
  }
  try{
    renderCounts();renderHomeEvents();renderWatchMatches();renderDailyBrief();updateHeroGlobeEvents();
    if(state.map){renderMap();renderWatchAreasOnMap();}
  }catch(err){console.error('GlobeSafe render error',err);}
  if(state.hasLoadedEvents)checkTrackedAlerts();else initializeSeenEvents();
  state.hasLoadedEvents=true;
  const time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  $('#lastUpdated').textContent=state.events.length?time:'Feed unavailable';
  $('#mapUpdated').textContent=state.events.length?`Updated ${time}`:'Live feeds unavailable';
  document.body.dataset.liveSources=sourceBits.join(',');
}
function renderCounts(){const counts={earthquake:0,storm:0,flood:0,wildfire:0,volcano:0};state.events.forEach(e=>counts[e.type]=(counts[e.type]||0)+1);Object.keys(counts).forEach(k=>{const el=$(`#count-${k}`);if(el)el.textContent=counts[k];});$('#statEvents').textContent=state.events.length;$('#statQuakes').textContent=counts.earthquake;$('#count-conflict').textContent=state.conflictReports.length||'LIVE';renderPreferenceCounts();}
function eventRow(e){const m=typeMeta[e.type]||typeMeta.other;return`<button class="event-row" data-event-id="${escapeHtml(e.id)}"><span class="event-badge ${m.class}">${m.icon}</span><span class="event-main"><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(m.label)} · ${ago(e.time)} · ${escapeHtml(e.source)}</small></span><span class="severity">${e.type==='earthquake'&&Number(e.magnitude)>=5?'SIGNIFICANT':'ACTIVE'}</span></button>`;}
function renderHomeEvents(){const el=$('#homeEventList'),list=state.events.slice(0,8);el.innerHTML=list.length?list.map(eventRow).join(''):'<div class="empty-state">Live feeds could not be reached. Check your internet connection and refresh.</div>';$$('[data-event-id]',el).forEach(b=>b.onclick=()=>openEvent(b.dataset.eventId));}

function initMap(){
  if(state.map)return;
  if(typeof maplibregl==='undefined'){
    $('#map').innerHTML='<div class="map-error">Map engine could not load. Check your internet connection.</div>';
    return;
  }
  state.map=new maplibregl.Map({
    container:'map',
    style:'https://tiles.openfreemap.org/styles/liberty',
    center:[15,18],zoom:1.55,minZoom:1,maxZoom:16,
    attributionControl:false,renderWorldCopies:true
  });
  state.map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');
  state.map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'OpenFreeMap · © OpenStreetMap contributors'}),'bottom-right');
  state.map.on('load',()=>{state.mapReady=true;renderMap();renderWatchAreasOnMap();});
  state.map.on('error',e=>{if(e?.error)console.warn('GlobeSafe map:',e.error.message||e.error);});
  $$('#mapFilters .filter-chip').forEach(btn=>btn.onclick=()=>setFilter(btn.dataset.filter));
}
function markerElement(type, severity='active'){
  const el=document.createElement('button');
  el.className=`map-marker map-marker-${type} severity-${severity}`;
  el.type='button';el.setAttribute('aria-label',type);
  el.innerHTML='<span></span>';
  return el;
}
function setFilter(filter){state.currentFilter=filter;$$('#mapFilters .filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderMap();}
function renderMap(){
  if(!state.map||!state.mapReady)return;
  state.mapMarkers.forEach(m=>m.remove());state.mapMarkers=[];
  const list=state.currentFilter==='all'?state.events:state.currentFilter==='conflict'?[]:state.events.filter(e=>e.type===state.currentFilter);
  list.slice(0,350).forEach(e=>{
    const el=markerElement(e.type,eventSeverity(e));
    const popup=new maplibregl.Popup({offset:16,closeButton:true}).setHTML(`<b>${escapeHtml(e.title)}</b><br>${escapeHtml(e.source)} · ${ago(e.time)}<br><button class="popup-detail" onclick="window.openGlobeEvent('${escapeHtml(e.id)}')">Details</button>`);
    const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([e.lon,e.lat]).setPopup(popup).addTo(state.map);
    state.mapMarkers.push(marker);
  });
  $('#mapEventCount').textContent=state.currentFilter==='conflict'?`${state.conflictReports.length} reports`:list.length;
  $('#filterTitle').textContent=state.currentFilter==='all'?'Latest events':state.currentFilter==='conflict'?'War & conflict reports':(typeMeta[state.currentFilter]?.label||'Events');
  const side=$('#mapEventList');
  if(state.currentFilter==='conflict'){
    side.innerHTML=state.conflictReports.length?state.conflictReports.map(r=>`<a class="map-event-card" href="${escapeHtml(r.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(r.title)}</strong><small>Media report · ${escapeHtml(r.domain||r.sourcecountry||'GDELT')}</small></a>`).join(''):'<div class="empty-state">Conflict media feed is unavailable. This layer never fabricates map locations when verified coordinates are missing.</div>';
  }else{
    side.innerHTML=list.length?list.slice(0,70).map(e=>`<button class="map-event-card" data-event-id="${escapeHtml(e.id)}"><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.source)} · ${ago(e.time)}</small></button>`).join(''):'<div class="empty-state">No events in this filter right now.</div>';
    $$('[data-event-id]',side).forEach(b=>b.onclick=()=>openEvent(b.dataset.eventId));
  }
}
function circlePolygon(lat,lon,radiusKm,steps=72){
  const R=6371,lat1=lat*Math.PI/180,lon1=lon*Math.PI/180,d=radiusKm/R,coords=[];
  for(let i=0;i<=steps;i++){const br=2*Math.PI*i/steps;const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(br));const lon2=lon1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));coords.push([lon2*180/Math.PI,lat2*180/Math.PI]);}
  return coords;
}
function renderWatchAreasOnMap(){
  if(!state.map||!state.mapReady)return;
  state.watchMarkers.forEach(m=>m.remove());state.watchMarkers=[];
  const fc={type:'FeatureCollection',features:state.watchAreas.map(a=>({type:'Feature',properties:{name:a.name,radius:a.radius},geometry:{type:'Polygon',coordinates:[circlePolygon(a.lat,a.lon,a.radius)]}}))};
  if(state.map.getSource('watch-areas'))state.map.getSource('watch-areas').setData(fc);else{
    state.map.addSource('watch-areas',{type:'geojson',data:fc});
    state.map.addLayer({id:'watch-fill',type:'fill',source:'watch-areas',paint:{'fill-color':'#39d9ff','fill-opacity':0.055}});
    state.map.addLayer({id:'watch-line',type:'line',source:'watch-areas',paint:{'line-color':'#39d9ff','line-opacity':0.7,'line-width':1.2,'line-dasharray':[3,3]}});
  }
  state.watchAreas.forEach(a=>{const el=document.createElement('div');el.className='watch-center-marker';el.title=`${a.name} · ${a.radius} km`;state.watchMarkers.push(new maplibregl.Marker({element:el}).setLngLat([a.lon,a.lat]).addTo(state.map));});
}
window.openGlobeEvent=openEvent;
function openEvent(id){const e=state.events.find(x=>x.id===id);if(!e)return;state.selectedEvent=e;const m=typeMeta[e.type]||typeMeta.other;const nearby=nearestWatchArea(e);$('#eventDetail').innerHTML=`<article class="detail-card"><div class="detail-hero"><p class="kicker">${escapeHtml(m.label.toUpperCase())}</p><h1>${escapeHtml(e.title)}</h1><div class="detail-meta"><span>${fmtDate(e.time)}</span><span>Source: ${escapeHtml(e.source)}</span><span>${Number(e.lat).toFixed(3)}, ${Number(e.lon).toFixed(3)}</span>${nearby?`<span>Nearest watch: ${escapeHtml(nearby.area.name)} · ${nearby.distance.toFixed(0)} km</span>`:''}</div></div><div class="detail-grid"><div><small>Magnitude / intensity</small><b>${escapeHtml(e.magnitude??'—')}</b></div><div><small>Depth</small><b>${e.depth!=null?`${escapeHtml(e.depth)} km`:'—'}</b></div><div><small>Status</small><b>Public feed</b></div></div><div class="detail-body"><p>${escapeHtml(e.description||'No additional description is available from this feed.')}</p><p>This page is for situational awareness. Confirm urgent safety instructions with local authorities.</p><a class="source-link" href="${escapeHtml(e.sourceUrl)}" target="_blank" rel="noopener">Open original source →</a></div></article>`;showView('event');}

async function loadConflict(){const url='https://api.gdeltproject.org/api/v2/doc/doc?query=(%22armed%20conflict%22%20OR%20airstrike%20OR%20shelling%20OR%20%22missile%20attack%22)&mode=artlist&maxrecords=18&timespan=24h&sort=datedesc&format=json';try{const d=await fetchJson(url,12000);state.conflictReports=(d.articles||[]).slice(0,18).map(x=>({title:x.title||'Conflict report',url:x.url||'#',domain:x.domain||'',sourcecountry:x.sourcecountry||'',seen:x.seendate||''}));}catch{state.conflictReports=[];}renderConflict();renderCounts();if(state.map&&state.currentFilter==='conflict')renderMap();}
function renderConflict(){const el=$('#conflictList'),list=state.conflictReports.slice(0,6);el.innerHTML=list.length?list.map(r=>`<div class="conflict-item"><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a><small>${escapeHtml(r.domain||r.sourcecountry||'GDELT')} · media report</small></div>`).join(''):'<div class="empty-state">The media index could not be reached. No conflict claim is generated locally.</div>';}

const PUBLIC_CAMERAS=[
  {id:'v1',name:'USGS Kīlauea V1cam',region:'Hawaiʻi, USA',desc:'West Halemaʻumaʻu crater — public USGS near-real-time snapshot.',image:'https://volcanoes.usgs.gov/observatories/hvo/cams/V1cam/images/M.jpg',url:'https://www.usgs.gov/volcanoes/kilauea/v1cam-kilauea-volcano-hawaii-west-halemaumau-crater'},
  {id:'v2',name:'USGS Kīlauea V2cam',region:'Hawaiʻi, USA',desc:'East Halemaʻumaʻu crater — public USGS near-real-time snapshot.',image:'https://volcanoes.usgs.gov/observatories/hvo/cams/V2cam/images/M.jpg',url:'https://www.usgs.gov/media/webcams/v2-kilauea-volcano-hawaii-east-halemaumau-crater'},
  {id:'directory',name:'USGS Volcano Webcam Directory',region:'United States',desc:'Official USGS public volcano webcam directory.',image:'',url:'https://www.usgs.gov/programs/VHP/volcano-webcams'}
];
let selectedCameraIndex=0;
function cameraImageWithBust(url){return url?url+(url.includes('?')?'&':'?')+'t='+Date.now():'';}
function selectCamera(i){
  const c=PUBLIC_CAMERAS[i];if(!c||!c.image)return;selectedCameraIndex=i;
  const img=$('#cameraFeatureImage'),title=$('#cameraFeatureTitle'),meta=$('#cameraFeatureMeta'),link=$('#cameraFeatureLink');
  if(img){img.src=cameraImageWithBust(c.image);img.onerror=()=>{img.alt=t('cameraUnavailable');};}
  if(title)title.textContent=c.name;if(meta)meta.textContent='USGS · '+c.region;if(link){link.href=c.url;link.textContent=t('openOfficialCamera')+' →';}
  $('#cameraList .camera-card').forEach((el,n)=>el.classList.toggle('active',n===i));
}
function renderCameras(){
  const list=$('#cameraList');if(!list)return;
  list.innerHTML=PUBLIC_CAMERAS.map((c,i)=>`<div class="camera-card ${c.image?'selectable':''} ${i===selectedCameraIndex?'active':''}" data-camera-index="${i}">${c.image?`<img class="camera-thumb" src="${escapeHtml(cameraImageWithBust(c.image))}" alt="">`:''}<small>${escapeHtml(c.region)}</small><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.desc)}</p><a class="source-link" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${c.image?t('openOfficialCamera'):t('openCameraDirectory')} →</a></div>`).join('');
  $('[data-camera-index]',list).forEach(el=>{el.onclick=e=>{if(e.target.closest('a'))return;selectCamera(Number(el.dataset.cameraIndex));};});
  selectCamera(selectedCameraIndex);
}

async function loadRadio(){
  const grid=$('#stationGrid');grid.innerHTML='<div class="skeleton-grid"></div>';
  if(state.favoritesOnly){state.stations=[...state.favoriteStations];renderStations();return;}
  const country=$('#countrySelect').value,name=$('#radioSearch').value.trim(),tag=$('#genreSearch').value.trim();
  const qs=new URLSearchParams({countrycode:country,hidebroken:'true',order:'clickcount',reverse:'true',limit:'50'});if(name)qs.set('name',name);if(tag)qs.set('tag',tag);
  try{const data=await fetchJson(`https://de1.api.radio-browser.info/json/stations/search?${qs.toString()}`,12000);state.stations=(data||[]).filter(s=>s.url_resolved||s.url).slice(0,36);renderStations();}catch{grid.innerHTML='<div class="empty-state">Radio directory is temporarily unavailable. Try another country or refresh later.</div>';}
}
function stationKey(s){return s.stationuuid||`${s.name}|${s.url_resolved||s.url}`;}
function isFavoriteStation(s){return state.favoriteStations.some(x=>stationKey(x)===stationKey(s));}
function renderStations(){const grid=$('#stationGrid');if(!state.stations.length){grid.innerHTML='<div class="empty-state">No playable stations found for this search.</div>';return;}grid.innerHTML=state.stations.map((s,i)=>`<article class="station-card"><div class="station-top"><img class="station-logo" src="${escapeHtml(s.favicon||'')}" alt="" onerror="this.style.display='none'"><div><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(s.country||'')} · ${escapeHtml((s.tags||'radio').split(',').slice(0,2).join(', '))}</small></div></div><div class="station-actions"><button class="play-btn" data-station="${i}">▶ Play station</button><button class="favorite-star ${isFavoriteStation(s)?'saved':''}" data-fav-station="${i}" aria-label="Save favorite">${isFavoriteStation(s)?'★':'☆'}</button></div></article>`).join('');$$('[data-station]',grid).forEach(b=>b.onclick=()=>playStation(Number(b.dataset.station)));$$('[data-fav-station]',grid).forEach(b=>b.onclick=()=>toggleFavoriteStation(Number(b.dataset.favStation)));}
function playStation(i){const s=state.stations[i];if(!s)return;const audio=$('#audioPlayer');audio.src=s.url_resolved||s.url;audio.play().catch(()=>{});$('#nowPlaying').querySelector('small').textContent='NOW PLAYING';$('#nowPlaying').querySelector('strong').textContent=s.name;$('#nowPlaying').querySelector('span').textContent=`${s.country||''}${s.language?' · '+s.language:''}`;}
function toggleFavoriteStation(i){const s=state.stations[i];if(!s)return;const key=stationKey(s),idx=state.favoriteStations.findIndex(x=>stationKey(x)===key);if(idx>=0)state.favoriteStations.splice(idx,1);else state.favoriteStations.unshift({stationuuid:s.stationuuid||'',name:s.name,country:s.country||'',countrycode:s.countrycode||'',tags:s.tags||'',language:s.language||'',favicon:s.favicon||'',url:s.url||'',url_resolved:s.url_resolved||s.url});saveLocal(STORAGE.stations,state.favoriteStations);if(state.favoritesOnly)state.stations=[...state.favoriteStations];renderStations();renderPreferenceCounts();}
$('#countrySelect').onchange=()=>{state.favoritesOnly=false;syncFavoriteRadioButton();loadRadio();};$('#radioSearchBtn').onclick=()=>{state.favoritesOnly=false;syncFavoriteRadioButton();loadRadio();};$('#radioSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){state.favoritesOnly=false;syncFavoriteRadioButton();loadRadio();}});$('#genreSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){state.favoritesOnly=false;syncFavoriteRadioButton();loadRadio();}});
$('#favoriteStationsBtn').onclick=()=>{state.favoritesOnly=!state.favoritesOnly;syncFavoriteRadioButton();loadRadio();};
function syncFavoriteRadioButton(){$('#favoriteStationsBtn').textContent=state.favoritesOnly?'★ Showing favorites':'♡ Favorites';}

/* V2 watchlist */
function renderPreferenceCounts(){const a=state.watchAreas.length,c=state.favoriteCountries.length,s=state.favoriteStations.length;if($('#homeWatchAreaCount'))$('#homeWatchAreaCount').textContent=a;if($('#homeFavCountryCount'))$('#homeFavCountryCount').textContent=c;if($('#homeFavStationCount'))$('#homeFavStationCount').textContent=s;if($('#favCountryCount'))$('#favCountryCount').textContent=`${c} saved`;if($('#watchAreaCount'))$('#watchAreaCount').textContent=`${a} area${a===1?'':'s'}`;}
function renderWatchlist(){renderPreferenceCounts();renderFavoriteCountries();renderWatchAreas();renderWatchMatches();renderNotificationState();}
function renderFavoriteCountries(){const el=$('#favoriteCountryList');if(!el)return;el.innerHTML=state.favoriteCountries.length?state.favoriteCountries.map((c,i)=>`<button class="saved-country-chip" data-open-country="${escapeHtml(c.code)}">${escapeHtml(c.name)} <span class="remove-x" data-remove-country="${i}">×</span></button>`).join(''):'<div class="empty-state">No favorite countries yet.</div>';$$('[data-open-country]',el).forEach(b=>b.onclick=e=>{if(e.target.dataset.removeCountry!=null)return;$('#countrySelect').value=b.dataset.openCountry;state.favoritesOnly=false;showView('radio');setTimeout(loadRadio,80);});$$('[data-remove-country]',el).forEach(x=>x.onclick=e=>{e.stopPropagation();state.favoriteCountries.splice(Number(x.dataset.removeCountry),1);saveLocal(STORAGE.countries,state.favoriteCountries);renderWatchlist();});}
$('#addFavoriteCountry').onclick=()=>{const [code,name]=$('#favoriteCountrySelect').value.split('|');if(!state.favoriteCountries.some(c=>c.code===code)){state.favoriteCountries.push({code,name});saveLocal(STORAGE.countries,state.favoriteCountries);}renderWatchlist();};
function renderWatchAreas(){const el=$('#watchAreaList');if(!el)return;el.innerHTML=state.watchAreas.length?state.watchAreas.map((a,i)=>`<article class="watch-area-card"><strong>${escapeHtml(a.name)}</strong><small>${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}<br>Alert radius: ${a.radius} km</small><div class="watch-area-actions"><button class="tiny-btn" data-map-area="${i}">View map</button><button class="tiny-btn danger" data-remove-area="${i}">Remove</button></div></article>`).join(''):'<div class="empty-state">No tracked areas yet. Add one above or use your browser location.</div>';$$('[data-remove-area]',el).forEach(b=>b.onclick=()=>{state.watchAreas.splice(Number(b.dataset.removeArea),1);saveLocal(STORAGE.areas,state.watchAreas);renderWatchlist();renderPreferenceCounts();if(state.map)renderWatchAreasOnMap();});$$('[data-map-area]',el).forEach(b=>b.onclick=()=>{const a=state.watchAreas[Number(b.dataset.mapArea)];showView('map');setTimeout(()=>{state.map?.flyTo({center:[a.lon,a.lat],zoom:Math.max(4,a.radius<=50?8:a.radius<=100?7:6),essential:true});},120);});}
function setAreaMessage(msg,type=''){$('#areaMessage').textContent=msg;$('#areaMessage').className=`area-message ${type}`;}
$('#addWatchArea').onclick=()=>{const name=$('#areaName').value.trim()||'Tracked area',lat=Number($('#areaLat').value),lon=Number($('#areaLon').value),radius=Number($('#areaRadius').value);if(!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lon)||lon<-180||lon>180){setAreaMessage('Enter a valid latitude and longitude.','error');return;}if(state.watchAreas.length>=10){setAreaMessage('You can track up to 10 areas in this version.','error');return;}state.watchAreas.push({id:`area-${Date.now()}`,name,lat,lon,radius});saveLocal(STORAGE.areas,state.watchAreas);setAreaMessage(`${name} is now being tracked. Alerts compare against a ${radius} km radius.`,'ok');$('#areaName').value='';$('#areaLat').value='';$('#areaLon').value='';renderWatchlist();if(state.map)renderWatchAreasOnMap();};
$('#useMyLocation').onclick=()=>{if(!navigator.geolocation){setAreaMessage('Geolocation is not supported by this browser.','error');return;}setAreaMessage('Requesting browser location…');navigator.geolocation.getCurrentPosition(pos=>{$('#areaLat').value=pos.coords.latitude.toFixed(6);$('#areaLon').value=pos.coords.longitude.toFixed(6);if(!$('#areaName').value)$('#areaName').value='My location';setAreaMessage('Location filled in. Review the radius and press Track area.','ok');},err=>setAreaMessage(`Location was not available: ${err.message}`,'error'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});};
function matchesForArea(area){return state.events.map(e=>({event:e,distance:haversine(area.lat,area.lon,e.lat,e.lon)})).filter(x=>x.distance<=area.radius).sort((a,b)=>new Date(b.event.time)-new Date(a.event.time));}
function nearestWatchArea(e){let best=null;state.watchAreas.forEach(a=>{const d=haversine(a.lat,a.lon,e.lat,e.lon);if(!best||d<best.distance)best={area:a,distance:d};});return best;}
function renderWatchMatches(){const el=$('#watchMatchList');if(!el)return;if(!state.watchAreas.length){el.innerHTML='<div class="empty-state">Add a tracked area to see matching events.</div>';return;}const rows=[];state.watchAreas.forEach(a=>matchesForArea(a).slice(0,6).forEach(x=>rows.push({...x,area:a})));rows.sort((a,b)=>new Date(b.event.time)-new Date(a.event.time));el.innerHTML=rows.length?rows.slice(0,18).map(x=>{const m=typeMeta[x.event.type]||typeMeta.other;return`<button class="match-card" data-event-id="${escapeHtml(x.event.id)}"><span class="event-badge ${m.class}">${m.icon}</span><span><strong>${escapeHtml(x.event.title)}</strong><small>Inside ${escapeHtml(x.area.name)} · ${ago(x.event.time)}</small></span><span class="distance-pill">${x.distance.toFixed(0)} km away</span></button>`;}).join(''):'<div class="empty-state">No current feed events fall inside your tracked radii.</div>';$$('[data-event-id]',el).forEach(b=>b.onclick=()=>openEvent(b.dataset.eventId));}
function renderNotificationState(){const el=$('#notificationState');if(!el)return;if(!('Notification'in window)){el.textContent='Unsupported';el.className='notify-state blocked';return;}const p=Notification.permission;el.textContent=p==='granted'?'Enabled':p==='denied'?'Blocked by browser':'Not enabled';el.className=`notify-state ${p==='granted'?'on':p==='denied'?'blocked':''}`;}
$('#enableNotifications').onclick=async()=>{if(!('Notification'in window)){renderNotificationState();return;}try{const p=await Notification.requestPermission();if(p==='granted')initializeSeenEvents();renderNotificationState();}catch{renderNotificationState();}};
$('#testNotification').onclick=()=>{if('Notification'in window&&Notification.permission==='granted')new Notification('GlobeSafe Live',{body:'Test alert: browser notifications are working while the site is open.'});else setAreaMessage('Enable notifications first.','error');};
function initializeSeenEvents(){saveLocal(STORAGE.seen,state.events.map(e=>e.id).slice(0,800));}
function checkTrackedAlerts(){if(!state.watchAreas.length)return;let seen=new Set(loadLocal(STORAGE.seen,[]));const fresh=[];for(const e of state.events){if(seen.has(e.id))continue;for(const a of state.watchAreas){const d=haversine(a.lat,a.lon,e.lat,e.lon);if(d<=a.radius){fresh.push({e,a,d});break;}}}state.events.slice(0,800).forEach(e=>seen.add(e.id));saveLocal(STORAGE.seen,[...seen].slice(-1500));if('Notification'in window&&Notification.permission==='granted')fresh.slice(0,3).forEach(({e,a,d})=>{const m=typeMeta[e.type]||typeMeta.other;new Notification(`GlobeSafe Live · ${m.label}`,{body:`${e.title} · ${d.toFixed(0)} km from ${a.name}`});});}


/* Version 3 — 3D live globe, multilingual UI, daily brief and PWA */
function eventSeverity(e){
  if(e.type==='earthquake'){
    const mag=Number(e.magnitude);if(e.alert==='red'||mag>=6.5)return'critical';if(e.alert==='orange'||mag>=5.5)return'high';if(e.alert==='yellow'||mag>=4.5)return'moderate';return'active';
  }
  const mv=Number(e.magnitude);if(Number.isFinite(mv)){if(mv>=8)return'critical';if(mv>=5)return'high';if(mv>=2)return'moderate';}
  return'active';
}
function severityColor(s){return({critical:'#ff334f',high:'#ff8a3d',moderate:'#ffd34d',active:'#39d9ff'})[s]||'#39d9ff';}
function initHeroGlobe(){
  const el=$('#heroGlobe');if(!el||state.heroGlobe||typeof maplibregl==='undefined')return;
  state.heroGlobe=new maplibregl.Map({container:el,style:{version:8,sources:{'nasa-blue-marble':{type:'raster',tiles:['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],tileSize:256,maxzoom:8,attribution:'NASA EOSDIS / GIBS'}},layers:[{id:'nasa-blue-marble',type:'raster',source:'nasa-blue-marble',paint:{'raster-fade-duration':0,'raster-saturation':-.05,'raster-contrast':.08}}]},center:[15,8],zoom:1.02,attributionControl:false,interactive:true,renderWorldCopies:false,canvasContextAttributes:{antialias:true}});
  const g=state.heroGlobe;
  g.scrollZoom.disable();g.boxZoom.disable();g.doubleClickZoom.disable();g.keyboard.disable();g.touchZoomRotate.disableRotation();
  g.on('style.load',()=>{
    g.setProjection({type:'globe'});
    (g.getStyle().layers||[]).forEach(layer=>{if(layer.type==='symbol'){try{g.setLayoutProperty(layer.id,'visibility','none')}catch{}}});
  });
  g.on('load',()=>{
    state.heroGlobeReady=true;
    g.addSource('hero-events',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    g.addLayer({id:'hero-event-glow',type:'circle',source:'hero-events',paint:{'circle-color':['get','color'],'circle-radius':['match',['get','severity'],'critical',22,'high',17,'moderate',13,10],'circle-blur':0.85,'circle-opacity':0.42}});
    g.addLayer({id:'hero-event-core',type:'circle',source:'hero-events',paint:{'circle-color':['get','color'],'circle-radius':['match',['get','severity'],'critical',7,'high',6,'moderate',5,4],'circle-stroke-width':1.5,'circle-stroke-color':'rgba(255,255,255,.9)','circle-opacity':0.95}});
    updateHeroGlobeEvents();animateHeroGlobe();
    g.on('mouseenter','hero-event-core',()=>{state.globePaused=true;g.getCanvas().style.cursor='pointer';});
    g.on('mouseleave','hero-event-core',()=>{state.globePaused=false;g.getCanvas().style.cursor='grab';});
    g.on('click','hero-event-core',ev=>{const id=ev.features?.[0]?.properties?.id;if(id)openEvent(id);});
  });
  $('#globeVisual')?.addEventListener('mouseenter',()=>state.globePaused=true);
  $('#globeVisual')?.addEventListener('mouseleave',()=>state.globePaused=false);
}
function updateHeroGlobeEvents(){
  if(!state.heroGlobeReady||!state.heroGlobe?.getSource('hero-events'))return;
  const features=state.events.slice(0,180).map(e=>{const sev=eventSeverity(e);return{type:'Feature',properties:{id:e.id,title:e.title,severity:sev,color:severityColor(sev),type:e.type},geometry:{type:'Point',coordinates:[e.lon,e.lat]}};});
  state.heroGlobe.getSource('hero-events').setData({type:'FeatureCollection',features});
}
let globeLast=0,globeLng=15;
function animateHeroGlobe(now=performance.now()){
  if(!state.heroGlobeReady)return;
  const dt=Math.min(80,now-(globeLast||now));globeLast=now;
  if(!state.globePaused){globeLng=((globeLng+dt*0.0018+540)%360)-180;state.heroGlobe.jumpTo({center:[globeLng,8]});}
  const pulse=(Math.sin(now/390)+1)/2;
  if(state.heroGlobe.getLayer('hero-event-glow'))state.heroGlobe.setPaintProperty('hero-event-glow','circle-opacity',0.18+pulse*0.48);
  requestAnimationFrame(animateHeroGlobe);
}
function renderDailyBrief(){
  const el=$('#dailyBriefGrid');if(!el)return;
  const dayAgo=Date.now()-24*60*60*1000,recent=state.events.filter(e=>new Date(e.time).getTime()>=dayAgo);
  const q=recent.filter(e=>e.type==='earthquake'),sig=q.filter(e=>Number(e.magnitude)>=5),natural=recent.filter(e=>e.type!=='earthquake');
  const top=[...recent].sort((a,b)=>severityRank(eventSeverity(b))-severityRank(eventSeverity(a))||new Date(b.time)-new Date(a.time)).slice(0,4);
  $('#dailyBriefTime').textContent=new Date().toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  el.innerHTML=`<article class="brief-card"><small>${t('brief24h')}</small><strong>${recent.length}</strong><span>${t('mappedEvents')}</span></article><article class="brief-card"><small>${t('earthquakes')}</small><strong>${q.length}</strong><span>${sig.length} ${t('mag5plus')}</span></article><article class="brief-card"><small>${t('naturalHazards')}</small><strong>${natural.length}</strong><span>${t('openFeedActivity')}</span></article><article class="brief-card wide"><small>${t('priorityEvents')}</small>${top.length?top.map(e=>`<button data-event-id="${escapeHtml(e.id)}"><i style="background:${severityColor(eventSeverity(e))}"></i><span>${escapeHtml(e.title)}</span><em>${ago(e.time)}</em></button>`).join(''):`<span>${t('noRecentEvents')}</span>`}</article>`;
  $$('[data-event-id]',el).forEach(b=>b.onclick=()=>openEvent(b.dataset.eventId));
}
function severityRank(s){return({active:1,moderate:2,high:3,critical:4})[s]||1;}

const I18N={
  en:{overview:'Overview',liveMap:'Live Map',myWatchlist:'My Watchlist',cameras:'Cameras',worldFM:'World FM',about:'About',aboutPolicies:'About / Policies',liveData:'LIVE DATA',installApp:'Install App',situational:'Global situational awareness',heroTitle:'Know what is happening<br><span>around the world.</span>',heroDesc:'One public dashboard for natural hazards, conflict reports, nearby public cameras and live radio — designed to help people stay informed.',openLiveMap:'Open Live Map',listenFM:'Listen to World FM',globeCaption:'live event intensity',sevActive:'Active',sevModerate:'Moderate',sevHigh:'High',sevCritical:'Critical',dailyBriefKicker:'DAILY BRIEF',dailyBriefTitle:'Global situation summary',hazardsEvents:'Hazards & events',yourPlaces:'Your places, your alerts.',cameraDirectory:'Nearby camera directory',radioWorldTitle:'Radio from around the world',aboutTitle:'Public information, clearly sourced.',brief24h:'LAST 24 HOURS',mappedEvents:'mapped feed events',earthquakes:'Earthquakes',mag5plus:'M5+ significant',naturalHazards:'Natural hazards',openFeedActivity:'recent/open feed activity',priorityEvents:'PRIORITY EVENTS',noRecentEvents:'No recent mapped events.'},
  th:{overview:'ภาพรวม',liveMap:'แผนที่สด',myWatchlist:'พื้นที่ติดตาม',cameras:'กล้องสาธารณะ',worldFM:'วิทยุทั่วโลก',about:'เกี่ยวกับ',aboutPolicies:'เกี่ยวกับ / นโยบาย',liveData:'ข้อมูลสด',installApp:'ติดตั้งแอป',situational:'ติดตามสถานการณ์ทั่วโลก',heroTitle:'รู้ทันสิ่งที่กำลังเกิดขึ้น<br><span>ทั่วโลก</span>',heroDesc:'แดชบอร์ดสาธารณะสำหรับภัยธรรมชาติ รายงานความขัดแย้ง กล้องสาธารณะใกล้เหตุการณ์ และวิทยุสด เพื่อช่วยให้ทุกคนรับรู้สถานการณ์ได้ง่ายขึ้น',openLiveMap:'เปิดแผนที่สด',listenFM:'ฟังวิทยุทั่วโลก',globeCaption:'ความรุนแรงของเหตุการณ์สด',sevActive:'กำลังเกิด',sevModerate:'ปานกลาง',sevHigh:'รุนแรง',sevCritical:'วิกฤต',dailyBriefKicker:'สรุปรายวัน',dailyBriefTitle:'สรุปสถานการณ์ทั่วโลก',hazardsEvents:'ภัยและเหตุการณ์',yourPlaces:'พื้นที่ของคุณ การแจ้งเตือนของคุณ',cameraDirectory:'กล้องสาธารณะใกล้เหตุการณ์',radioWorldTitle:'วิทยุจากทั่วโลก',aboutTitle:'ข้อมูลสาธารณะ พร้อมแหล่งอ้างอิงชัดเจน',brief24h:'24 ชั่วโมงล่าสุด',mappedEvents:'เหตุการณ์บนแผนที่',earthquakes:'แผ่นดินไหว',mag5plus:'เหตุ M5+ สำคัญ',naturalHazards:'ภัยธรรมชาติ',openFeedActivity:'กิจกรรมล่าสุดจากแหล่งข้อมูล',priorityEvents:'เหตุการณ์สำคัญ',noRecentEvents:'ไม่พบเหตุการณ์ล่าสุดบนแผนที่'},
  es:{overview:'Resumen',liveMap:'Mapa en vivo',myWatchlist:'Mi seguimiento',cameras:'Cámaras',worldFM:'Radio mundial',about:'Acerca de',aboutPolicies:'Acerca de / Políticas',liveData:'DATOS EN VIVO',installApp:'Instalar app',situational:'Conciencia situacional global',heroTitle:'Sepa qué está ocurriendo<br><span>en todo el mundo.</span>',heroDesc:'Un panel público para peligros naturales, informes de conflictos, cámaras públicas cercanas y radio en vivo.',openLiveMap:'Abrir mapa en vivo',listenFM:'Escuchar radio mundial',globeCaption:'intensidad de eventos en vivo',sevActive:'Activo',sevModerate:'Moderado',sevHigh:'Alto',sevCritical:'Crítico',dailyBriefKicker:'RESUMEN DIARIO',dailyBriefTitle:'Resumen de la situación mundial',hazardsEvents:'Peligros y eventos',yourPlaces:'Tus lugares, tus alertas.',cameraDirectory:'Directorio de cámaras cercanas',radioWorldTitle:'Radio de todo el mundo',aboutTitle:'Información pública con fuentes claras.',brief24h:'ÚLTIMAS 24 HORAS',mappedEvents:'eventos mapeados',earthquakes:'Terremotos',mag5plus:'M5+ significativos',naturalHazards:'Peligros naturales',openFeedActivity:'actividad reciente/abierta',priorityEvents:'EVENTOS PRIORITARIOS',noRecentEvents:'Sin eventos recientes.'},
  id:{overview:'Ringkasan',liveMap:'Peta Langsung',myWatchlist:'Pantauan Saya',cameras:'Kamera',worldFM:'Radio Dunia',about:'Tentang',aboutPolicies:'Tentang / Kebijakan',liveData:'DATA LANGSUNG',installApp:'Pasang Aplikasi',situational:'Kesadaran situasi global',heroTitle:'Ketahui apa yang terjadi<br><span>di seluruh dunia.</span>',heroDesc:'Satu dasbor publik untuk bencana alam, laporan konflik, kamera publik terdekat, dan radio langsung.',openLiveMap:'Buka Peta Langsung',listenFM:'Dengarkan Radio Dunia',globeCaption:'intensitas kejadian langsung',sevActive:'Aktif',sevModerate:'Sedang',sevHigh:'Tinggi',sevCritical:'Kritis',dailyBriefKicker:'RINGKASAN HARIAN',dailyBriefTitle:'Ringkasan situasi global',hazardsEvents:'Bahaya & kejadian',yourPlaces:'Lokasi Anda, peringatan Anda.',cameraDirectory:'Direktori kamera terdekat',radioWorldTitle:'Radio dari seluruh dunia',aboutTitle:'Informasi publik dengan sumber yang jelas.',brief24h:'24 JAM TERAKHIR',mappedEvents:'kejadian terpetakan',earthquakes:'Gempa bumi',mag5plus:'M5+ signifikan',naturalHazards:'Bencana alam',openFeedActivity:'aktivitas feed terbaru/aktif',priorityEvents:'KEJADIAN PRIORITAS',noRecentEvents:'Tidak ada kejadian terbaru.'},
  pt:{overview:'Visão geral',liveMap:'Mapa ao vivo',myWatchlist:'Minha lista',cameras:'Câmeras',worldFM:'Rádio mundial',about:'Sobre',aboutPolicies:'Sobre / Políticas',liveData:'DADOS AO VIVO',installApp:'Instalar app',situational:'Consciência situacional global',heroTitle:'Saiba o que está acontecendo<br><span>ao redor do mundo.</span>',heroDesc:'Um painel público para riscos naturais, relatos de conflitos, câmeras públicas próximas e rádio ao vivo.',openLiveMap:'Abrir mapa ao vivo',listenFM:'Ouvir rádio mundial',globeCaption:'intensidade dos eventos ao vivo',sevActive:'Ativo',sevModerate:'Moderado',sevHigh:'Alto',sevCritical:'Crítico',dailyBriefKicker:'RESUMO DIÁRIO',dailyBriefTitle:'Resumo da situação global',hazardsEvents:'Riscos e eventos',yourPlaces:'Seus lugares, seus alertas.',cameraDirectory:'Diretório de câmeras próximas',radioWorldTitle:'Rádio do mundo inteiro',aboutTitle:'Informação pública com fontes claras.',brief24h:'ÚLTIMAS 24 HORAS',mappedEvents:'eventos mapeados',earthquakes:'Terremotos',mag5plus:'M5+ significativos',naturalHazards:'Riscos naturais',openFeedActivity:'atividade recente/aberta',priorityEvents:'EVENTOS PRIORITÁRIOS',noRecentEvents:'Nenhum evento recente.'}
};

const EXTRA_I18N={
en:{
activeRecentEvents:'active/recent events',quakes24h:'earthquakes / 24h',lastRefresh:'last refresh',publicDataSources:'Public data sources',liveStatus:'LIVE STATUS',globalHazardOverview:'Global hazard overview',viewFullMap:'View full map',usgsLiveFeed:'USGS live feed',storms:'Storms',floods:'Floods',wildfires:'Wildfires',volcanoes:'Volcanoes',warConflict:'War & Conflict',mediaReportedWatch:'Media-reported watch',personalWatchlist:'VERSION 3 · PERSONAL WATCHLIST',followPlaces:'Follow the places that matter to you.',saveTrackDesc:'Save favorite countries, track areas by radius and opt in to browser notifications — no account required.',trackedAreas:'tracked areas',favoriteCountries:'favorite countries',favoriteStations:'favorite stations',openWatchlist:'Open My Watchlist',advertisement:'ADVERTISEMENT',adsensePlaceholder:'Google AdSense placement — add code after site approval',latestEvents:'LATEST EVENTS',whatsHappening:'What’s happening now',refresh:'Refresh',conflictWatch:'CONFLICT WATCH',warReports:'War & armed-conflict reports',warReportsDesc:'Recent media reports are shown for situational awareness. They are <b>not official evacuation alerts</b>.',acledNote:'Future verified event mapping can connect to ACLED through a secure server-side API token.',stayConnected:'STAY CONNECTED',radioMonitorTitle:'Listen to radio while monitoring the world.',radioMonitorDesc:'Explore public internet radio stations by country. Playback starts only when you press play.',exploreWorldFM:'Explore World FM',globalLiveMap:'GLOBAL LIVE MAP',mapDesc:'Natural-hazard markers use public scientific feeds. Conflict reports are separated from official emergency warnings.',all:'All',earthquake:'Earthquake',storm:'Storm',flood:'Flood',wildfire:'Wildfire',volcano:'Volcano',latestEventsTitle:'Latest events',conflictDisclaimer:'<b>War & Conflict:</b> recent media-reported conflict coverage is displayed separately. Always follow official government, civil-defense, embassy or humanitarian security instructions.',backToMap:'Back to map',prefsBrowser:'Preferences stay in this browser. GlobeSafe Live does not require an account.',browserAlerts:'BROWSER ALERTS',notifications:'Notifications',notificationsDesc:'When this page is open, GlobeSafe Live can notify you if a newly detected mapped hazard appears inside a tracked area. Browser permission is always optional.',enableNotifications:'Enable notifications',sendTest:'Send test',notificationFinePrint:'Notifications normally require HTTPS. PWA support is included; background delivery still depends on a future push-notification server.',favoriteCountriesUpper:'FAVORITE COUNTRIES',quickCountryAccess:'Quick country access',favoriteCountriesDesc:'Save countries for quick radio access and future country-level monitoring.',addCountry:'Add country',trackArea:'TRACK AN AREA',radiusMonitoring:'Radius monitoring',radiusMonitoringDesc:'Add a location and radius. New mapped hazards are compared against these areas whenever live feeds refresh.',useMyLocation:'Use my location',trackAreaButton:'Track area',recentMatches:'RECENT MATCHES',hazardsNearTracked:'Hazards near tracked areas',addTrackedAreaHint:'Add a tracked area to see matching events.',publicCameras:'PUBLIC CAMERAS',cameraPrivacyDesc:'GlobeSafe Live only displays public/authorized cameras. Private or access-controlled cameras are never included.',cameraInfoBanner:'<b>LIVE PUBLIC FEEDS:</b> Verified public cameras are shown here. Availability depends on the camera owner and network.',radioPageDesc:'Choose a country or genre, save favorite stations and listen while keeping GlobeSafe Live open.',search:'Search',favorites:'Favorites',notPlaying:'NOT PLAYING',chooseStation:'Choose a station below',playbackClick:'Playback requires your click.',aboutGlobeSafe:'ABOUT GLOBESAFE LIVE',aboutDesc:'GlobeSafe Live is a public-access situational-awareness tool. No account is required.',aboutCardDesc:'We combine public hazard feeds, public media indexes, authorized camera feeds and public internet radio into a global dashboard.',dataSources:'Data Sources',dataSourcesDesc:'Earthquakes: USGS. Natural events: NASA EONET. Conflict watch: GDELT media index. Radio: Radio Browser. Base map: OpenFreeMap using OpenStreetMap data.',privacy:'Privacy',privacyDesc:'No account is required. Watch areas, favorite countries and favorite radio stations are stored in your browser local storage.',disclaimer:'Disclaimer',disclaimerDesc:'This service is informational and may be delayed, incomplete, duplicated or inaccurate. Always follow official local authorities and emergency services.',adEditorial:'Advertising & editorial separation',adEditorialDesc:'Advertising areas are visually separated from alerts, map controls, emergency information and radio controls.',conflictInfo:'Conflict information',conflictInfoDesc:'War and conflict reporting can be incomplete, disputed or rapidly changing. Media-derived reports are not military intelligence or evacuation orders.',globalAwareness:'Global awareness for everyone.',publicDashboard:'Public information dashboard.',openOfficialCamera:'Open official camera',openCameraDirectory:'Open camera directory',cameraUnavailable:'Camera image is temporarily unavailable.',areaNamePlaceholder:'Area name, e.g. Home / Tokyo',latitude:'Latitude',longitude:'Longitude',searchStationPlaceholder:'Search station name…',genrePlaceholder:'Genre / tag, e.g. jazz, news'},
th:{
activeRecentEvents:'เหตุการณ์ล่าสุด/กำลังเกิด',quakes24h:'แผ่นดินไหว / 24 ชม.',lastRefresh:'อัปเดตล่าสุด',publicDataSources:'แหล่งข้อมูลสาธารณะ',liveStatus:'สถานะสด',globalHazardOverview:'ภาพรวมภัยทั่วโลก',viewFullMap:'ดูแผนที่เต็ม',usgsLiveFeed:'ข้อมูลสดจาก USGS',storms:'พายุ',floods:'น้ำท่วม',wildfires:'ไฟป่า',volcanoes:'ภูเขาไฟ',warConflict:'สงครามและความขัดแย้ง',mediaReportedWatch:'ติดตามจากรายงานสื่อ',personalWatchlist:'เวอร์ชัน 3 · พื้นที่ติดตามส่วนตัว',followPlaces:'ติดตามพื้นที่ที่สำคัญสำหรับคุณ',saveTrackDesc:'บันทึกประเทศโปรด ติดตามพื้นที่ตามรัศมี และเปิดการแจ้งเตือนผ่านเบราว์เซอร์ได้โดยไม่ต้องสมัครสมาชิก',trackedAreas:'พื้นที่ติดตาม',favoriteCountries:'ประเทศโปรด',favoriteStations:'สถานีโปรด',openWatchlist:'เปิดพื้นที่ติดตาม',advertisement:'โฆษณา',adsensePlaceholder:'พื้นที่ Google AdSense — ใส่โค้ดหลังเว็บไซต์ได้รับอนุมัติ',latestEvents:'เหตุการณ์ล่าสุด',whatsHappening:'ตอนนี้ทั่วโลกเกิดอะไรขึ้น',refresh:'รีเฟรช',conflictWatch:'เฝ้าระวังความขัดแย้ง',warReports:'รายงานสงครามและความขัดแย้งติดอาวุธ',warReportsDesc:'แสดงรายงานจากสื่อเพื่อการรับรู้สถานการณ์ โดย <b>ไม่ใช่คำสั่งอพยพอย่างเป็นทางการ</b>',acledNote:'ในอนาคตสามารถเชื่อมข้อมูลเหตุการณ์ที่ตรวจสอบแล้วจาก ACLED ผ่าน API ฝั่งเซิร์ฟเวอร์',stayConnected:'ติดตามโลกได้ต่อเนื่อง',radioMonitorTitle:'ฟังวิทยุไปพร้อมกับติดตามสถานการณ์ทั่วโลก',radioMonitorDesc:'เลือกฟังสถานีวิทยุอินเทอร์เน็ตตามประเทศ การเล่นเสียงจะเริ่มเมื่อคุณกดเล่นเท่านั้น',exploreWorldFM:'เปิดวิทยุทั่วโลก',globalLiveMap:'แผนที่สดทั่วโลก',mapDesc:'จุดภัยธรรมชาติใช้ข้อมูลสาธารณะทางวิทยาศาสตร์ ส่วนรายงานความขัดแย้งจะแยกจากคำเตือนฉุกเฉินอย่างเป็นทางการ',all:'ทั้งหมด',earthquake:'แผ่นดินไหว',storm:'พายุ',flood:'น้ำท่วม',wildfire:'ไฟป่า',volcano:'ภูเขาไฟ',latestEventsTitle:'เหตุการณ์ล่าสุด',conflictDisclaimer:'<b>สงครามและความขัดแย้ง:</b> รายงานจากสื่อจะแสดงแยกต่างหาก โปรดปฏิบัติตามคำแนะนำของรัฐบาล หน่วยป้องกันภัย สถานทูต หรือองค์กรด้านมนุษยธรรมอย่างเป็นทางการ',backToMap:'กลับไปแผนที่',prefsBrowser:'การตั้งค่าจะเก็บไว้ในเบราว์เซอร์นี้ GlobeSafe Live ไม่ต้องสมัครบัญชี',browserAlerts:'การแจ้งเตือนเบราว์เซอร์',notifications:'การแจ้งเตือน',notificationsDesc:'เมื่อเปิดหน้านี้ GlobeSafe Live สามารถแจ้งเมื่อพบภัยใหม่ในพื้นที่ที่คุณติดตาม โดยการอนุญาตแจ้งเตือนเป็นทางเลือกเสมอ',enableNotifications:'เปิดการแจ้งเตือน',sendTest:'ทดสอบแจ้งเตือน',notificationFinePrint:'การแจ้งเตือนต้องใช้ HTTPS โดยทั่วไป ระบบรองรับ PWA แล้ว ส่วนการแจ้งเตือนเมื่อปิดเว็บยังต้องใช้เซิร์ฟเวอร์ Push ในอนาคต',favoriteCountriesUpper:'ประเทศโปรด',quickCountryAccess:'เข้าถึงประเทศอย่างรวดเร็ว',favoriteCountriesDesc:'บันทึกประเทศเพื่อเปิดสถานีวิทยุได้เร็ว และรองรับระบบติดตามรายประเทศในอนาคต',addCountry:'เพิ่มประเทศ',trackArea:'ติดตามพื้นที่',radiusMonitoring:'ติดตามตามรัศมี',radiusMonitoringDesc:'เพิ่มตำแหน่งและรัศมี ระบบจะเปรียบเทียบภัยที่อัปเดตใหม่กับพื้นที่เหล่านี้ทุกครั้งที่โหลดข้อมูลสด',useMyLocation:'ใช้ตำแหน่งของฉัน',trackAreaButton:'ติดตามพื้นที่',recentMatches:'เหตุการณ์ใกล้พื้นที่ล่าสุด',hazardsNearTracked:'ภัยใกล้พื้นที่ที่ติดตาม',addTrackedAreaHint:'เพิ่มพื้นที่ติดตามเพื่อดูเหตุการณ์ที่ตรงกัน',publicCameras:'กล้องสาธารณะ',cameraPrivacyDesc:'GlobeSafe Live แสดงเฉพาะกล้องสาธารณะหรือกล้องที่ได้รับอนุญาต ไม่รวมกล้องส่วนตัวหรือกล้องที่ต้องใช้สิทธิ์เข้าถึง',cameraInfoBanner:'<b>กล้องสาธารณะสด:</b> แสดงกล้องสาธารณะที่ตรวจสอบแหล่งที่มาแล้ว ความพร้อมใช้งานขึ้นอยู่กับเจ้าของกล้องและเครือข่าย',radioPageDesc:'เลือกประเทศหรือแนวเพลง บันทึกสถานีโปรด และฟังเพลงขณะเปิด GlobeSafe Live',search:'ค้นหา',favorites:'รายการโปรด',notPlaying:'ยังไม่ได้เล่น',chooseStation:'เลือกสถานีด้านล่าง',playbackClick:'ต้องกดเล่นด้วยตัวคุณเอง',aboutGlobeSafe:'เกี่ยวกับ GLOBESAFE LIVE',aboutDesc:'GlobeSafe Live เป็นเครื่องมือสาธารณะสำหรับติดตามสถานการณ์ ไม่ต้องสมัครบัญชี',aboutCardDesc:'เรารวมข้อมูลภัยสาธารณะ ดัชนีข่าว กล้องสาธารณะที่ได้รับอนุญาต และวิทยุอินเทอร์เน็ตไว้ในแดชบอร์ดเดียว',dataSources:'แหล่งข้อมูล',dataSourcesDesc:'แผ่นดินไหว: USGS ภัยธรรมชาติ: NASA EONET ความขัดแย้ง: GDELT วิทยุ: Radio Browser แผนที่ฐาน: OpenFreeMap/OSM',privacy:'ความเป็นส่วนตัว',privacyDesc:'ไม่ต้องสมัครบัญชี พื้นที่ติดตาม ประเทศโปรด และสถานีวิทยุโปรดจะเก็บใน local storage ของเบราว์เซอร์',disclaimer:'ข้อจำกัดความรับผิดชอบ',disclaimerDesc:'บริการนี้มีไว้เพื่อข้อมูลและอาจล่าช้า ไม่ครบ ซ้ำ หรือคลาดเคลื่อนได้ โปรดปฏิบัติตามหน่วยงานท้องถิ่นและบริการฉุกเฉินอย่างเป็นทางการ',adEditorial:'การแยกโฆษณาออกจากเนื้อหา',adEditorialDesc:'พื้นที่โฆษณาจะแยกจากคำเตือน ปุ่มแผนที่ ข้อมูลฉุกเฉิน และปุ่มวิทยุอย่างชัดเจน',conflictInfo:'ข้อมูลสงครามและความขัดแย้ง',conflictInfoDesc:'รายงานสงครามอาจไม่ครบ มีข้อโต้แย้ง หรือเปลี่ยนแปลงอย่างรวดเร็ว รายงานจากสื่อไม่ถือเป็นข่าวกรองทางทหารหรือคำสั่งอพยพ',globalAwareness:'ติดตามสถานการณ์โลกสำหรับทุกคน',publicDashboard:'แดชบอร์ดข้อมูลสาธารณะ',openOfficialCamera:'เปิดกล้องจากแหล่งทางการ',openCameraDirectory:'เปิดรายชื่อกล้อง',cameraUnavailable:'ภาพกล้องไม่พร้อมใช้งานชั่วคราว',areaNamePlaceholder:'ชื่อพื้นที่ เช่น บ้าน / โตเกียว',latitude:'ละติจูด',longitude:'ลองจิจูด',searchStationPlaceholder:'ค้นหาชื่อสถานี…',genrePlaceholder:'แนวเพลง / แท็ก เช่น jazz, news'},
es:{activeRecentEvents:'eventos activos/recientes',quakes24h:'terremotos / 24 h',lastRefresh:'última actualización',publicDataSources:'Fuentes públicas',liveStatus:'ESTADO EN VIVO',globalHazardOverview:'Resumen global de riesgos',viewFullMap:'Ver mapa completo',storms:'Tormentas',floods:'Inundaciones',wildfires:'Incendios forestales',volcanoes:'Volcanes',warConflict:'Guerra y conflicto',latestEvents:'EVENTOS RECIENTES',whatsHappening:'Qué está ocurriendo ahora',refresh:'Actualizar',all:'Todos',earthquake:'Terremoto',storm:'Tormenta',flood:'Inundación',wildfire:'Incendio',volcano:'Volcán',backToMap:'Volver al mapa',publicCameras:'CÁMARAS PÚBLICAS',search:'Buscar',favorites:'Favoritos',privacy:'Privacidad',disclaimer:'Aviso',dataSources:'Fuentes de datos',globalAwareness:'Conciencia global para todos.',openOfficialCamera:'Abrir cámara oficial',openCameraDirectory:'Abrir directorio de cámaras'},
id:{activeRecentEvents:'kejadian aktif/terbaru',quakes24h:'gempa / 24 jam',lastRefresh:'pembaruan terakhir',publicDataSources:'Sumber data publik',liveStatus:'STATUS LANGSUNG',globalHazardOverview:'Ringkasan bahaya global',viewFullMap:'Lihat peta penuh',storms:'Badai',floods:'Banjir',wildfires:'Kebakaran hutan',volcanoes:'Gunung berapi',warConflict:'Perang & konflik',latestEvents:'KEJADIAN TERBARU',whatsHappening:'Yang sedang terjadi',refresh:'Segarkan',all:'Semua',earthquake:'Gempa',storm:'Badai',flood:'Banjir',wildfire:'Kebakaran hutan',volcano:'Gunung berapi',backToMap:'Kembali ke peta',publicCameras:'KAMERA PUBLIK',search:'Cari',favorites:'Favorit',privacy:'Privasi',disclaimer:'Penafian',dataSources:'Sumber data',globalAwareness:'Kesadaran global untuk semua.',openOfficialCamera:'Buka kamera resmi',openCameraDirectory:'Buka direktori kamera'},
pt:{activeRecentEvents:'eventos ativos/recentes',quakes24h:'terremotos / 24 h',lastRefresh:'última atualização',publicDataSources:'Fontes públicas',liveStatus:'STATUS AO VIVO',globalHazardOverview:'Visão geral global de riscos',viewFullMap:'Ver mapa completo',storms:'Tempestades',floods:'Inundações',wildfires:'Incêndios florestais',volcanoes:'Vulcões',warConflict:'Guerra e conflito',latestEvents:'EVENTOS RECENTES',whatsHappening:'O que está acontecendo agora',refresh:'Atualizar',all:'Todos',earthquake:'Terremoto',storm:'Tempestade',flood:'Inundação',wildfire:'Incêndio',volcano:'Vulcão',backToMap:'Voltar ao mapa',publicCameras:'CÂMERAS PÚBLICAS',search:'Pesquisar',favorites:'Favoritos',privacy:'Privacidade',disclaimer:'Aviso',dataSources:'Fontes de dados',globalAwareness:'Consciência global para todos.',openOfficialCamera:'Abrir câmera oficial',openCameraDirectory:'Abrir diretório de câmeras'}
};
Object.keys(EXTRA_I18N).forEach(lang=>Object.assign(I18N[lang],EXTRA_I18N[lang]));

let currentLang=loadLocal(STORAGE.lang,null)||((navigator.language||'en').toLowerCase().startsWith('th')?'th':'en');
function t(key){return I18N[currentLang]?.[key]||I18N.en[key]||key;}
function applyLanguage(lang){currentLang=I18N[lang]?lang:'en';saveLocal(STORAGE.lang,currentLang);document.documentElement.lang=currentLang;$('#languageSelect').value=currentLang;$('[data-i18n]').forEach(el=>{const v=t(el.dataset.i18n);if(v!=null)el.textContent=v;});$('[data-i18n-html]').forEach(el=>{const v=t(el.dataset.i18nHtml);if(v!=null)el.innerHTML=v;});$('[data-i18n-placeholder]').forEach(el=>{const v=t(el.dataset.i18nPlaceholder);if(v!=null)el.placeholder=v;});renderDailyBrief();renderCameras();}
$('#languageSelect').onchange=e=>applyLanguage(e.target.value);

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installBtn').hidden=false;});
$('#installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installBtn').hidden=true;};
window.addEventListener('appinstalled',()=>{$('#installBtn').hidden=true;});
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});

$('#refreshEvents').onclick=()=>{loadEvents();loadConflict();};
renderCameras();renderPreferenceCounts();renderNotificationState();applyLanguage(currentLang);initHeroGlobe();loadEvents();loadConflict();setInterval(loadEvents,5*60*1000);setInterval(loadConflict,15*60*1000);

setInterval(()=>{if($('#view-cameras')?.classList.contains('active'))selectCamera(selectedCameraIndex);},60000);
