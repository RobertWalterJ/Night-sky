// Space feed: APOD, ISS live, launches, agency news
import { $, $$, esc, state, cachedJSON, fmtTime, haversine } from './util.js';

let filter = 'all', issTimer = null;
const ago = d => { const m = (Date.now() - new Date(d)) / 60000; return m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function initFeed() {
  $$('#feedFilter button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('#feedFilter button').forEach(x => x.classList.toggle('on', x === b)); renderNews(); });
}
export async function renderFeed() {
  renderApod(); renderLaunches(); renderNews(); startIss();
}
export function stopFeed() { clearInterval(issTimer); issTimer = null; }

async function renderApod() {
  try {
    const key = state.nasaKey || 'DEMO_KEY';
    const a = await cachedJSON(`https://api.nasa.gov/planetary/apod?api_key=${key}&thumbs=true`, 180);
    const media = a.media_type === 'video' ? (a.thumbnail_url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.thumbnail_url)}" alt=""></a>` : `<iframe src="${esc(a.url)}" allowfullscreen></iframe>`) : `<a href="${esc(a.hdurl || a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.title)}"></a>`;
    $('#apodCard').innerHTML = `${media}<p class="eyebrow">NASA Astronomy Picture of the Day · ${esc(a.date)}</p><h2>${esc(a.title)}</h2><p class="small muted" style="line-height:1.5">${esc(a.explanation.slice(0, 420))}${a.explanation.length > 420 ? '…' : ''}</p>${a.copyright ? `<p class="small muted">© ${esc(a.copyright.trim())}</p>` : ''}`;
  } catch { $('#apodCard').innerHTML = '<p class="eyebrow">NASA Astronomy Picture of the Day</p><p class="muted">NASA\'s picture service did not respond. The shared DEMO_KEY is rate limited, so a free personal key (api.nasa.gov) in Settings makes this reliable.</p><p><a class="btn ghost sm" href="https://apod.nasa.gov/apod/astropix.html" target="_blank" rel="noopener">Open today\'s picture ↗</a></p>'; }
}

function startIss() {
  const tick = async () => {
    try {
      const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544'); const p = await r.json();
      const dist = haversine(state.lat, state.lon, p.latitude, p.longitude);
      let over = 'open ocean';
      try { const g = await cachedJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.latitude.toFixed(1)}&longitude=${p.longitude.toFixed(1)}&localityLanguage=en`, 10); over = g.countryName || g.localityInfo?.informative?.[0]?.name || over; } catch { }
      $('#issNowBody').innerHTML = [['Over', over], ['Position', `${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`], ['Altitude', `${p.altitude.toFixed(0)} km`], ['Speed', `${Math.round(p.velocity).toLocaleString()} km/h`], ['Lighting', p.visibility === 'daylight' ? 'In sunlight' : "In Earth's shadow"], ['Distance from you', `${Math.round(dist).toLocaleString()} km`]]
        .map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join('');
    } catch { $('#issNowBody').innerHTML = '<p class="muted">Live ISS position unavailable.</p>'; }
  };
  if (!issTimer) { tick(); issTimer = setInterval(tick, 10000); }
}

async function renderLaunches() {
  try {
    const d = await cachedJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=8&mode=normal', 45);
    $('#launchList').innerHTML = d.results.map(l => `<a class="row-item" href="https://spacelaunchnow.me/launch/${esc(l.slug || l.id)}" target="_blank" rel="noopener" onclick="return true">
      <span class="ic">▲</span><span class="t"><b>${esc(l.name)}</b><span>${esc(l.launch_service_provider?.name || '')} · ${esc(l.pad?.location?.name || '')}</span></span>
      <span class="r">${new Date(l.net).toLocaleDateString([], { month: 'short', day: 'numeric' })}<br>${fmtTime(new Date(l.net))} · ${esc(l.status?.abbrev || '')}</span></a>`).join('');
  } catch { $('#launchList').innerHTML = '<p class="muted">Launch schedule unavailable (the free API allows 15 requests an hour).</p>'; }
}

async function renderNews() {
  const box = $('#newsList');
  $('#launchList').closest('.card').style.display = filter === 'all' || filter === 'launch' ? '' : 'none';
  if (filter === 'launch') { box.closest('.card').style.display = 'none'; return; }
  box.closest('.card').style.display = '';
  const q = { all: '', NASA: '&news_site=NASA', ESA: '&news_site=ESA', CSA: '&search=Canadian%20Space%20Agency' }[filter];
  box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const d = await cachedJSON(`https://api.spaceflightnewsapi.net/v4/articles/?limit=18${q}`, 20);
    let items = d.results;
    if (filter === 'CSA' && items.length < 3) { const e = await cachedJSON('https://api.spaceflightnewsapi.net/v4/articles/?limit=12&search=Canada', 20); items = [...items, ...e.results]; }
    box.innerHTML = items.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(a.image_url)}" alt="" onerror="this.style.display='none'"><div class="nb"><span class="tag">${esc(a.news_site)}</span><b>${esc(a.title)}</b><span class="small muted">${ago(a.published_at)}</span></div></a>`).join('')
      + (filter === 'CSA' ? `<a href="https://www.asc-csa.gc.ca/eng/news/" target="_blank" rel="noopener"><div class="nb"><span class="tag">CSA</span><b>Canadian Space Agency newsroom ↗</b><span class="small muted">Official releases</span></div></a>` : '');
  } catch { box.innerHTML = '<p class="muted">News unavailable offline.</p>'; }
}
