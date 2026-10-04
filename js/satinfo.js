// Satellite profiles: curated facts for well-known spacecraft, CelesTrak SATCAT for everything,
// SatNOGS frequencies (bundled), a 3D model chosen by real appearance, and human-scale size comparisons.
import { cachedJSON } from './util.js';

// Curated facts. len = largest dimension in metres. end = expected end of life / status, as published.
export const KNOWN = [
  { re: /^ISS|ZARYA/, norad: 25544, name: 'International Space Station', model: 'iss', operator: 'NASA, Roscosmos, ESA, JAXA, CSA', len: 109, dims: '109 m × 73 m (truss × arrays)', mass: '≈ 420,000 kg', mission: 'Crewed orbital laboratory, continuously occupied since November 2000', end: 'Operations planned through 2030, then a controlled deorbit by the SpaceX-built US Deorbit Vehicle', fun: 'Its solar arrays cover about the area of eight tennis courts.' },
  { re: /CSS|TIANHE/, norad: 48274, name: 'Tiangong space station', model: 'tiangong', operator: 'China Manned Space Agency', len: 55.6, dims: '≈ 55.6 m × 39 m', mass: '≈ 100,000 kg', mission: 'Chinese crewed station: Tianhe core module plus Wentian and Mengtian labs', end: 'Designed for 10 years from 2022, extendable to 15', fun: 'Assembled in 18 months, from the Tianhe launch in April 2021 to completion in November 2022.' },
  { re: /^HST$/, norad: 20580, name: 'Hubble Space Telescope', model: 'hubble', operator: 'NASA / ESA', len: 13.2, dims: '13.2 m long, 4.2 m wide', mass: '11,110 kg', mission: 'Optical, ultraviolet and near-infrared space telescope', end: 'NASA plans science operations into the mid-2030s; working on one gyroscope since 2024', fun: 'It has circled Earth more than 190,000 times since 1990.' },
  { re: /STARLINK/, name: 'Starlink', model: 'starlink', operator: 'SpaceX', len: 30, dims: 'V2 Mini: flat 4.1 × 2.7 m chassis, ≈ 30 m solar wingspan', mass: '≈ 800 kg (V2 Mini)', mission: 'Broadband internet constellation, thousands of satellites in low orbit', end: 'Each satellite is retired and deorbited after about 5 years', fun: 'Fresh launches look like a "train" of dots crossing the sky in a line.' },
  { re: /ONEWEB/, name: 'OneWeb', model: 'oneweb', operator: 'Eutelsat OneWeb', len: 3.5, dims: '≈ 1 m bus, ≈ 3.5 m across panels', mass: '≈ 150 kg', mission: 'Broadband constellation at about 1,200 km', end: 'Design life about 5 years' },
  { re: /IRIDIUM/, name: 'Iridium NEXT', model: 'iridium', operator: 'Iridium Communications', len: 9.4, dims: '3.1 m bus, ≈ 9.4 m wingspan', mass: '860 kg', mission: 'Global satellite phone and data network (66 active satellites)', end: 'Design life 12.5 years from 2017 to 2019 launches', fun: 'The first-generation Iridiums made famous "Iridium flares"; the NEXT models do not flare.' },
  { re: /NAVSTAR|GPS/, name: 'GPS', model: 'gps', operator: 'U.S. Space Force', len: 17, dims: '≈ 2.5 × 1.9 × 3.4 m bus, ≈ 17 m across arrays', mass: '≈ 2,200 to 3,900 kg', mission: 'Global Positioning System navigation, about 20,200 km up', end: 'GPS III design life 15 years', fun: 'Your phone listens to at least four of these to find you.' },
  { re: /GALILEO|GSAT0/, name: 'Galileo', model: 'gps', operator: 'European Union / ESA', len: 14.7, dims: '2.7 × 1.2 × 1.1 m bus, 14.7 m across arrays', mass: '≈ 730 kg', mission: 'European satellite navigation', end: 'Design life 12 years' },
  { re: /BEIDOU/, name: 'BeiDou', model: 'gps', operator: 'China', len: 15, dims: '≈ 15 m across arrays', mass: '≈ 1,000 to 4,600 kg', mission: 'Chinese satellite navigation', end: 'Design life 10 to 12 years' },
  { re: /GOES/, name: 'GOES weather satellite', model: 'goes', operator: 'NOAA / NASA', len: 13, dims: '6.1 × 5.6 × 3.9 m body, single large solar array', mass: '5,192 kg at launch', mission: 'Geostationary weather imaging of the Americas, a new full-disc image every 10 minutes', end: '15-year design life (10 operational + 5 standby)', fun: 'It sits about 35,786 km up, so it appears fixed in the sky.' },
  { re: /NOAA 2[01]|JPSS|SUOMI|NPP/, name: 'JPSS polar weather satellite', model: 'eosat', operator: 'NOAA / NASA', len: 8, dims: '≈ 8 m long with array', mass: '≈ 2,500 kg', mission: 'Polar-orbiting weather and climate observations', end: 'Design life 7 years, typically extended' },
  { re: /METEOR-M/, name: 'Meteor-M', model: 'eosat', operator: 'Roscosmos', len: 14, mass: '≈ 2,700 kg', mission: 'Russian polar weather satellite; broadcasts LRPT images near 137.9 MHz that hobbyists can receive', end: 'Design life 5 years' },
  { re: /METOP/, name: 'MetOp', model: 'eosat', operator: 'EUMETSAT / ESA', len: 17.6, dims: '17.6 m long with array', mass: '≈ 4,100 kg', mission: 'European polar weather satellites', end: 'MetOp-SG series is taking over' },
  { re: /LANDSAT/, name: 'Landsat', model: 'eosat', operator: 'NASA / USGS', len: 9, dims: '≈ 3 × 3 × 4.3 m body, single array', mass: '≈ 2,700 kg', mission: 'Land imaging since 1972, the longest continuous record of Earth from space', end: 'Landsat 9 design life 5 years, fuel for 10+' },
  { re: /SENTINEL/, name: 'Copernicus Sentinel', model: 'eosat', operator: 'European Union / ESA', len: 12, mass: '≈ 1,100 to 2,300 kg', mission: 'Europe\'s Copernicus Earth-observation fleet (radar, optical, atmosphere, oceans)', end: 'Design life about 7 years' },
  { re: /^TERRA$/, norad: 25994, name: 'Terra', model: 'eosat', operator: 'NASA', len: 6.8, dims: '6.8 × 3.5 m body', mass: '5,190 kg', mission: 'Flagship Earth-observation satellite (MODIS, ASTER, MISR)', end: 'Launched 1999 and drifting to later crossing times; NASA has sought partners to extend its life' },
  { re: /^AQUA$/, norad: 27424, name: 'Aqua', model: 'eosat', operator: 'NASA', len: 16.7, mass: '2,850 kg', mission: 'Earth\'s water cycle: clouds, ice, oceans', end: 'Launched 2002; nearing end of life' },
  { re: /^AURA$/, norad: 28376, name: 'Aura', model: 'eosat', operator: 'NASA', len: 16, mass: '1,765 kg', mission: 'Ozone layer and air quality', end: 'Launched 2004; nearing end of life' },
  { re: /RCM-|RADARSAT/, name: 'RADARSAT', model: 'radarsat', operator: 'Canadian Space Agency', len: 6.75, dims: 'RCM: 3.6 m bus, 6.75 m radar antenna', mass: '≈ 1,400 kg (RCM)', mission: 'Canadian radar imaging: sea ice, ships, floods and crops, day or night through cloud', end: 'RCM launched June 2019 with a 7-year design life' },
  { re: /SCISAT/, name: 'SCISAT-1', model: 'eosat', operator: 'Canadian Space Agency', len: 1.5, mass: '150 kg', mission: 'Measures the chemistry of Earth\'s ozone layer', end: 'Launched 2003 on a 2-year mission and still working, one of Canada\'s great overachievers' },
  { re: /NEOSSAT/, name: 'NEOSSat', model: 'cubesat', operator: 'Canadian Space Agency', len: 1.4, mass: '74 kg', mission: 'Suitcase-sized space telescope hunting asteroids and tracking satellites', end: 'Launched 2013, still operating' },
  { re: /ENVISAT/, norad: 27386, name: 'Envisat', model: 'eosat', operator: 'ESA (inactive)', len: 26, dims: '26 × 10 × 5 m', mass: '8,211 kg', mission: 'Was Europe\'s largest Earth-observation satellite', end: 'Contact lost in 2012; now one of the largest pieces of space debris, expected to stay up for about 150 years' },
  { re: /TESS/, name: 'TESS', model: 'eosat', operator: 'NASA', len: 3.7, mass: '362 kg', mission: 'Planet hunter surveying nearby bright stars', end: 'Extended mission' },
  { re: /SWIFT/, name: 'Swift', model: 'eosat', operator: 'NASA', len: 5.6, mass: '1,470 kg', mission: 'Gamma-ray burst observatory' },
  { re: /FERMI|GLAST/, name: 'Fermi', model: 'eosat', operator: 'NASA', len: 2.8, mass: '4,300 kg', mission: 'Gamma-ray space telescope' },
  { re: /CHANDRA|CXO/, name: 'Chandra X-ray Observatory', model: 'hubble', operator: 'NASA', len: 13.8, mass: '4,790 kg', mission: 'X-ray telescope on a high, elongated orbit' },
  { re: /BLUEWALKER|BLUEBIRD/, name: 'AST SpaceMobile', model: 'starlink', operator: 'AST SpaceMobile', len: 20, dims: 'Phased array up to ≈ 223 m² (BlueBird Block 2)', mass: '≈ 6,000 kg (Block 2)', mission: 'Direct-to-phone broadband', end: '', fun: 'Among the brightest satellites in the night sky, a concern for astronomers.' },
  { re: /KUIPER/, name: 'Amazon Kuiper', model: 'starlink', operator: 'Amazon', len: 10, mission: 'Broadband constellation', end: 'About 5 years each' },
  { re: /R\/B|ROCKET|CZ-|SL-\d|FALCON|DELTA|ATLAS|ARIANE|H-2A|PSLV|VEGA|ELECTRON|CENTAUR|FREGAT|BREEZE/, name: 'Rocket body', model: 'rocketbody', operator: '', len: 12, mission: 'A spent upper stage left in orbit after delivering its payload', end: 'Drifts until atmospheric drag brings it down; large ones are often bright and tumble, flashing as they turn' },
  { re: /DEB/, name: 'Debris', model: 'debris', operator: '', len: .3, mission: 'A fragment from a break-up, collision or anti-satellite test', end: 'Uncontrolled; reenters when drag catches up' },
];

// Human-scale comparisons, largest dimension in metres
const SCALE = [[0.1, 'a Rubik\'s cube'], [0.35, 'a loaf of bread'], [0.6, 'a microwave'], [1.2, 'a washing machine'], [2.5, 'a car (end to end, roughly)'], [4.5, 'a car'], [8, 'a delivery van'], [12, 'a school bus'], [24, 'a tennis court'], [40, 'a blue whale'], [70, 'a Boeing 747'], [110, 'an American football field']];
export function relativeSize(len) {
  if (!len) return '';
  let best = SCALE[0];
  for (const s of SCALE) if (Math.abs(Math.log(len / s[0])) < Math.abs(Math.log(len / best[0]))) best = s;
  const r = len / best[0];
  return r > 1.35 ? `about ${r.toFixed(r < 3 ? 1 : 0)} × ${best[1]}` : r < .75 ? `smaller than ${best[1]}` : `about the size of ${best[1]}`;
}

export function profile(sat) {
  const name = sat.full || sat.name || '';
  return KNOWN.find(k => (k.norad && k.norad === sat.norad) || k.re.test(name)) || null;
}

// model choice by real appearance
export function modelFor(sat, satcat) {
  const p = profile(sat); if (p) return p.model;
  const t = satcat?.OBJECT_TYPE;
  if (t === 'R/B') return 'rocketbody';
  if (t === 'DEB') return 'debris';
  if (satcat?.RCS_SIZE === 'SMALL' || /CUBE|SAT-?\d?U\b/i.test(sat.full || '')) return 'cubesat';
  return 'satellite';
}

const OWNERS = { US: 'United States', PRC: 'China', CIS: 'Russia / former USSR', ESA: 'European Space Agency', CA: 'Canada', JPN: 'Japan', IND: 'India', FR: 'France', UK: 'United Kingdom', GER: 'Germany', IT: 'Italy', ISS: 'ISS partners', SES: 'SES', EUTE: 'Eutelsat', O3B: 'O3b', GLOB: 'Globalstar', ORB: 'Orbcomm', ITSO: 'Intelsat', AB: 'Arab Satellite Communications Organization', KOR: 'South Korea', ISRA: 'Israel', BRAZ: 'Brazil', SPN: 'Spain', AUS: 'Australia', NZ: 'New Zealand', TURK: 'Türkiye', UAE: 'United Arab Emirates', EUME: 'EUMETSAT', SAFR: 'South Africa', ARGN: 'Argentina', TBD: 'Unknown' };
export async function satcat(norad) {
  try { const r = await cachedJSON(`https://celestrak.org/satcat/records.php?CATNR=${norad}&FORMAT=JSON`, 60 * 24 * 7); return Array.isArray(r) ? r[0] : null; } catch { return null; }
}
export const ownerName = c => OWNERS[c] || c || '';
export const launchYearFromIntl = id => { const y = +String(id).slice(0, 2); return isNaN(y) ? null : y < 57 ? 2000 + y : 1900 + y; };

let txP = null;
export async function transmitters(norad) {
  txP ||= fetch('data/transmitters.json').then(r => r.json()).catch(() => ({}));
  return (await txP)[norad] || [];
}
