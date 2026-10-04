// Live space comms: NASA Deep Space Network "DSN Now" feed, ISS amateur radio, agency live streams
import { $, esc, now, fmtTime, compass, toast } from './util.js';
import { sats, predictPasses, loadGroup } from './sats.js';

let names = null, timer = null;
const C = 299792.458;
async function dsnNames() {
  if (names) return names;
  try {
    const x = new DOMParser().parseFromString(await (await fetch('https://eyes.nasa.gov/dsn/config.xml')).text(), 'text/xml');
    names = {}; x.querySelectorAll('spacecraft').forEach(s => names[s.getAttribute('name').toLowerCase()] = s.getAttribute('friendlyName'));
    names.sites = {}; x.querySelectorAll('site').forEach(s => s.querySelectorAll('dish').forEach(d => names.sites[d.getAttribute('name')] = s.getAttribute('friendlyName')));
  } catch { names = { sites: {} }; }
  return names;
}
const rate = r => r >= 1e6 ? `${(r / 1e6).toFixed(1)} Mb/s` : r >= 1e3 ? `${(r / 1e3).toFixed(1)} kb/s` : r > 0 ? `${Math.round(r)} b/s` : '';
function range(km) {
  if (!(km > 0)) return '';
  const lt = km / C;
  const d = km > 1.496e8 * .5 ? `${(km / 1.496e8).toFixed(km > 1.496e9 ? 0 : 2)} AU` : `${Math.round(km).toLocaleString()} km`;
  return `${d} · light ${lt < 60 ? lt.toFixed(1) + ' s' : lt < 3600 ? (lt / 60).toFixed(1) + ' min' : (lt / 3600).toFixed(1) + ' h'} each way`;
}

async function dsn() {
  try {
    const nm = await dsnNames();
    const x = new DOMParser().parseFromString(await (await fetch('https://eyes.nasa.gov/dsn/data/dsn.xml?r=' + Date.now())).text(), 'text/xml');
    const rows = [];
    x.querySelectorAll('dish').forEach(d => {
      const tg = d.querySelector('target'), sc = tg?.getAttribute('name');
      if (!sc || ['DSN', 'DSS', 'DSSR', 'TEST', 'RFC', 'GBRA'].includes(sc.toUpperCase())) return;
      const down = [...d.querySelectorAll('downSignal')].find(s => s.getAttribute('active') === 'true'), upS = [...d.querySelectorAll('upSignal')].find(s => s.getAttribute('active') === 'true');
      if (!down && !upS) return;
      const km = +tg.getAttribute('downlegRange') || +tg.getAttribute('uplegRange');
      rows.push({ sc: nm[sc.toLowerCase()] || sc, dish: d.getAttribute('name'), site: nm.sites[d.getAttribute('name')] || '', down, up: upS, km, el: d.getAttribute('elevationAngle') });
    });
    rows.sort((a, b) => b.km - a.km);
    $('#dsnList').innerHTML = rows.map(r => `<div class="dsn-row"><span><span class="wave"></span><b>${esc(r.sc)}</b><br><span class="sig">${esc(r.site)} ${esc(r.dish.replace('DSS', 'DSS-'))} · ${r.down ? `receiving ${esc(r.down.getAttribute('band'))}-band${rate(+r.down.getAttribute('dataRate')) ? ' at ' + rate(+r.down.getAttribute('dataRate')) : ''}` : ''}${r.up && r.down ? ' · ' : ''}${r.up ? `sending ${esc(r.up.getAttribute('band'))}-band` : ''}</span></span><span class="r">${esc(range(r.km))}</span></div>`).join('')
      || '<p class="muted">No spacecraft links active this minute.</p>';
    $('#dsnTime').innerHTML = `Updated ${fmtTime(new Date())} · <a href="https://eyes.nasa.gov/apps/dsn-now/dsn.html" target="_blank" rel="noopener">DSN Now ↗</a>`;
  } catch { $('#dsnList').innerHTML = '<p class="muted">DSN feed unavailable right now.</p>'; }
}

async function issRadio() {
  let next = '';
  try {
    await loadGroup('stations');
    const iss = sats.list.find(s => s.norad === 25544);
    const p = iss && predictPasses(iss, now(), 24, 5).find(x => x.max.alt > 15);
    if (p) next = `Next good ISS pass over you: <b>${fmtTime(p.start, true)}</b>, ${compass(p.startAz)} to ${compass(p.endAz)}, up to ${Math.round(p.max.alt)}° (radio works day or night).`;
  } catch { }
  $('#issRadio').innerHTML = `
    <p class="small muted" style="margin-top:-4px">NASA's own voice links to the crew are encrypted, but the station carries amateur radios anyone can hear with a scanner or a cheap software-defined radio and a simple antenna.</p>
    <div class="freq">
      <b>145.800 MHz</b><span>FM voice downlink: crew talking with schools during ARISS contacts, and SSTV picture events</span>
      <b>437.800 MHz</b><span>FM voice repeater downlink (licensed hams transmit on 145.990 MHz, 67 Hz tone)</span>
      <b>437.550 MHz</b><span>Slow-scan TV images, Robot 36, during announced SSTV events (Series 33: 2 to 6 October 2026)</span>
      <b>437.825 MHz</b><span>APRS packet digipeater (under test)</span>
      <b>2395 MHz</b><span>Ham TV video from Columbus (test transmissions)</span>
    </div>
    <p class="small" style="margin-top:10px">${next}</p>
    <p class="small muted">Status as published by ARISS on 25 September 2026; radios are switched off around spacewalks and dockings. <a href="https://www.ariss.org/current-status-of-iss-stations.html" target="_blank" rel="noopener">Current status ↗</a> · <a href="https://www.ariss.org/upcoming-contacts.html" target="_blank" rel="noopener">Upcoming school contacts ↗</a> · <a href="https://network.satnogs.org/observations/?norad=25544&future=0&bad=0&unknown=0&failed=0" target="_blank" rel="noopener">Recordings from SatNOGS ground stations ↗</a></p>
    <p class="small muted">Weather satellites too: NOAA's analogue APT satellites were retired in 2025, but Russia's Meteor-M satellites still send LRPT pictures near 137.9 MHz. Tap any satellite on the 3D Earth to see its published frequencies.</p>`;
}

const AGENCIES = [
  ['NASA+', 'Launches, spacewalks, briefings and mission coverage', 'https://plus.nasa.gov/'],
  ['Space station live views', 'NASA\'s live video from the ISS (YouTube)', 'https://www.youtube.com/playlist?list=PL2aBZuCeDwlQMf6xMgQAUAY_nbHAgW5jz'],
  ['ESA Web TV', 'European Space Agency live events and launches', 'https://www.esa.int/ESA_Multimedia/ESA_Web_TV'],
  ['Canadian Space Agency', 'Videos and live events with Canadian astronauts', 'https://www.asc-csa.gc.ca/eng/multimedia/'],
  ['JAXA', 'Japanese launches from Tanegashima (YouTube)', 'https://www.youtube.com/channel/UCfMIdADo6FQayQCOkLYGhrQ'],
  ['ISRO', 'Indian launches from Sriharikota (YouTube)', 'https://www.youtube.com/channel/UCw5hEVOTfz_AfzsNFWyNlNg'],
  ['ESO observatory webcams', 'Live views of telescopes in Chile', 'https://www.eso.org/public/outreach/webcams/'],
  ['SpaceX', 'Falcon and Starship launch webcasts', 'https://www.spacex.com/launches/'],
];

export function renderSpaceComms() {
  dsn(); issRadio();
  $('#agencyLive').innerHTML = AGENCIES.map(([t, s, u]) => `<a class="row-item" href="${u}" target="_blank" rel="noopener"><span class="ic">▶</span><span class="t"><b>${t}</b><span>${s}</span></span></a>`).join('');
  clearInterval(timer); timer = setInterval(dsn, 10000);
}
export function stopSpaceComms() { clearInterval(timer); timer = null; }
