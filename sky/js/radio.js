// Radio: SomaFM space channels, local stations (Radio Browser), nearby ATC (LiveATC links)
import { $, $$, esc, state, cachedJSON, haversine, toast } from './util.js';

const SPACE = [
  { id: 'missioncontrol', title: 'Mission Control', desc: 'Ambient music mixed with live and archival NASA mission audio' },
  { id: 'deepspaceone', title: 'Deep Space One', desc: 'Deep ambient electronic and space music' },
  { id: 'spacestation', title: 'Space Station Soma', desc: 'Spaced-out ambient and mid-tempo electronica' },
  { id: 'darkzone', title: 'The Dark Zone', desc: 'The darker side of deep ambient' },
  { id: 'dronezone', title: 'Drone Zone', desc: 'Atmospheric textures, minimal beats' },
  { id: 'u80s', title: 'Underground 80s', desc: 'Early 80s synthpop. Pairs with Terminal mode' },
];
let airports = null, current = null;
const audio = () => $('#audio');

export function initRadio() {
  const a = audio();
  $('#playPause').onclick = () => { if (!current) return play(SPACE[0].id, SPACE[0].title, 'SomaFM', `https://ice2.somafm.com/${SPACE[0].id}-128-mp3`); a.paused ? a.play() : a.pause(); };
  $('#volume').oninput = e => a.volume = +e.target.value;
  a.onplay = () => { $('#player').classList.add('playing'); $('#playPause').textContent = '❚❚'; };
  a.onpause = () => { $('#player').classList.remove('playing'); $('#playPause').textContent = '▶'; };
  a.onerror = () => toast('That stream would not play. Try another.');
  $('#spaceChannels').innerHTML = SPACE.map(c => `<button class="station" data-soma="${c.id}"><img src="https://api.somafm.com/logos/120/${c.id}120.${c.id === 'deepspaceone' ? 'gif' : c.id === 'u80s' ? 'png' : 'jpg'}" alt="" onerror="this.style.visibility='hidden'"><span class="t"><b>${esc(c.title)}</b><span>${esc(c.desc)}</span></span></button>`).join('');
  $$('[data-soma]').forEach(b => b.onclick = () => { const c = SPACE.find(x => x.id === b.dataset.soma); play(c.id, c.title, 'SomaFM · listener supported', `https://ice2.somafm.com/${c.id}-128-mp3`, b); });
  $('#radioLinks').innerHTML = [
    ['NASA+ live', 'Launches, spacewalks and ISS live views', 'https://plus.nasa.gov/'],
    ['ISS live Earth view', 'Cameras on the station, streamed by NASA', 'https://www.youtube.com/@NASA/streams'],
    ['ARISS contacts', 'Schedule of school radio contacts with ISS crews', 'https://www.ariss.org/upcoming-contacts.html'],
    ['KiwiSDR world map', 'Tune real shortwave receivers around the globe', 'http://rx.linkfanel.net/'],
    ['WebSDR', 'More public software-defined radios', 'http://websdr.org/'],
    ['Radio Garden', 'Spin the globe to hear local radio anywhere', 'https://radio.garden/'],
  ].map(([t, s, u]) => `<a class="row-item" href="${u}" target="_blank" rel="noopener"><span class="ic">↗</span><span class="t"><b>${t}</b><span>${s}</span></span></a>`).join('');
}

function play(id, title, sub, url, btn) {
  const a = audio();
  current = id; a.src = url; a.play().catch(() => toast('Tap play to start audio'));
  $('#nowTitle').textContent = title; $('#nowSub').textContent = sub;
  $$('.station').forEach(s => s.classList.toggle('on', s === btn));
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title, artist: sub, album: 'Night Sky' });
}

export async function renderRadio() {
  // nearest airports -> LiveATC (they do not permit embedding their streams, so we link out)
  try {
    airports ||= await (await fetch('data/airports.json')).json();
    const near = airports.map(a => ({ a, d: haversine(state.lat, state.lon, a[2], a[3]) })).sort((x, y) => x.d - y.d).slice(0, 6);
    $('#atcList').innerHTML = near.map(({ a, d }) => `<a class="row-item" href="https://www.liveatc.net/search/?icao=${a[0]}" target="_blank" rel="noopener"><span class="ic">${a[6] ? '✈' : '·'}</span><span class="t"><b>${esc(a[0])} · ${esc(a[1])}</b><span>${esc(a[4])}, ${esc(a[5])}</span></span><span class="r">${Math.round(d)} km</span></a>`).join('')
      + `<p class="small muted">Not every airport has a volunteer feed. <a href="https://www.flightradar24.com/${state.lat.toFixed(2)},${state.lon.toFixed(2)}/9" target="_blank" rel="noopener">See live flights overhead ↗</a></p>`;
  } catch { }
  // local stations
  try {
    const url = `https://de1.api.radio-browser.info/json/stations/search?geo_lat=${state.lat.toFixed(3)}&geo_long=${state.lon.toFixed(3)}&geo_distance=120000&order=clickcount&reverse=true&limit=40&hidebroken=true`;
    let list = (await cachedJSON(url, 360)).filter(s => /^https:/.test(s.url_resolved));
    $('#localWhere').textContent = `Within 120 km · Radio Browser`;
    if (list.length < 4) {
      const cc = (await cachedJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${state.lat}&longitude=${state.lon}&localityLanguage=en`, 1440)).countryCode;
      list = (await cachedJSON(`https://de1.api.radio-browser.info/json/stations/search?countrycode=${cc}&order=clickcount&reverse=true&limit=30&hidebroken=true`, 360)).filter(s => /^https:/.test(s.url_resolved));
      $('#localWhere').textContent = `Popular in ${cc} · Radio Browser`;
    }
    list = list.slice(0, 18);
    $('#localStations').innerHTML = list.map((s, i) => `<button class="station" data-local="${i}"><img src="${esc(s.favicon)}" alt="" onerror="this.style.visibility='hidden'"><span class="t"><b>${esc(s.name.trim())}</b><span>${esc([s.state, s.tags?.split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · '))}</span></span></button>`).join('') || '<p class="muted">No local streams found.</p>';
    $$('[data-local]').forEach(b => b.onclick = () => { const s = list[+b.dataset.local]; play('l' + s.stationuuid, s.name.trim(), [s.state, s.country].filter(Boolean).join(', '), s.url_resolved, b); });
  } catch { $('#localStations').innerHTML = '<p class="muted">Local radio unavailable offline.</p>'; }
}
