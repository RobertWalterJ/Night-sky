# Night Sky

A stargazing app that installs on your phone straight from GitHub Pages. No app store and no build step.

## What it does

**Overhead**
- A zenith-centred dome of everything up right now, including the Milky Way and moving satellites. Lie back with the phone held above you and it follows your compass.
- A live readout:
  - roughly how many stars you can see
  - the faintest star your sky allows
  - the planets up
  - the satellites passing this minute
  - what is straight overhead
  - a list of what is coming up, with countdowns to each event

**Tonight**
- A live sky dome ringed by a 0 to 100 stargazing score, with a best viewing window.
- Countdown chips for darkness, moonrise, station passes, the Milky Way core and the next meteor shower.
- A night planner: a sunset-to-sunrise ribbon chart with one row each for the Moon, the planets, the Milky Way core and the showpiece objects. Shading shows how high each object is, so you can see when each is at its best.
- **Light pollution, measured for your spot:** zenith sky brightness (mag/arcsec²), light pollution zone and artificial-to-natural ratio, read from David Lorenz's Light Pollution Atlas 2025. The atlas uses VIIRS satellite data and is free and open. The app sets your sky darkness automatically from it, and you can override it.
- **Darker skies near you:** the nearest naturally dark patch of land within 400 km, with directions, plus the closest certified dark-sky places (184 DarkSky International designations), each with its own measured sky brightness.
- A sky darkness card on the Bortle scale. Set it from city to dark-sky site to preview how many stars and how much Milky Way you'll see.
- An hour-by-hour chart of cloud, darkness and Moon.
- Sun and Moon times and twilight.
- Planets worth looking at tonight.
- Visible passes of the ISS, Tiangong and Hubble.
- Deep-sky targets suited to tonight's Moon.
- Aurora odds from NOAA's Kp forecast.

**Sky**
- A live chart of more than 5,000 stars, all 88 constellations and the 110 Messier objects, plus the planets, Moon and satellites.
- A Milky Way glow drawn from real galactic outline data.
- A deeper catalogue of about 40,000 stars to magnitude 8, which loads at dark sites or when you zoom in.
- **Realistic** mode shows only what your eyes could see given your sky darkness, the Moon and twilight.
- **Below the horizon** stays visible, dimmed and banded by how many hours until each part of the sky rises. Dashed lines show where the horizon will be each hour for the next six: "rises by 2 AM" in the east, "sets by 3 AM" in the west.
- **▶ Time-lapse** spins the sky through the night.
- **Point** uses the phone's compass and gyroscope, so the chart follows wherever you aim it.
- **Camera** lays the chart over the live camera view.
- **Align** corrects compass error: aim at the Moon, a planet or a bright star, then tap.
- Tap anything for details, a Wikipedia summary and, for planets, the Moon and spacecraft, a 3D model you can spin.
- The time slider scrubs 12 hours either way.

**3D models (Blender)**
- The Sun, Moon, all eight planets (Saturn has rings), the ISS, Hubble and a generic satellite.
- They appear on the sky chart lit from the real direction of the Sun, so the Moon shows its true phase.
- Nebula, galaxy and cluster sprites appear when you zoom in.

**Earth (3D)**
- A live globe with a day and night terminator, city lights at night, clouds and atmosphere.
- Satellites tracked by group: stations, brightest, Starlink, OneWeb, navigation, geostationary, weather, Earth observation, science, amateur radio and CubeSats.
- Yellow halos mark the low-orbit satellites above your horizon now or rising within 5 minutes. The dashed ring shows where low-orbit satellites appear at least 10° up from you.
- Tap any satellite for its orbit and ground track, then switch to:
  - **Ride along**: the camera flies behind the 3D model.
  - **Satellite's view**: looks straight down.
  - **Above me**: a top-down view of your patch of sky.
- Time controls run at 1×, 10×, 60× and 600×.

**Satellite profiles**
- Operator, status, launch date and site, expected end of life, mission, size, mass and orbit.
- A human-scale size comparison ("about the size of a school bus").
- Published radio frequencies (SatNOGS).
- A 3D model chosen by the satellite's real appearance:
  - ISS, Tiangong and Hubble
  - Starlink, OneWeb and Iridium
  - GPS and other navigation satellites
  - GOES, RADARSAT and Earth-observation platforms
  - CubeSats, rocket bodies and debris

**Events**
- A two-year sky calendar worked out for your location. It covers:
  - meteor showers, with expected rates for your sky, the best hour and where to look
  - lunar and solar eclipses, with whether you can see them and the best places on Earth
  - comets, using JPL ephemerides
  - planet oppositions, elongations and close pairings
  - supermoons, equinoxes and solstices
- "Show in sky" jumps the chart to the moment, and "Add to calendar" downloads an .ics file.

**Feed**
- NASA Astronomy Picture of the Day.
- Live ISS position.
- Upcoming launches worldwide.
- Space news, filterable by NASA, ESA or CSA.

**Radio**
- **Deep Space Network, live:** which NASA dishes in California, Spain and Australia are talking to which spacecraft right now, with the data rate and the light travel time each way.
- **Listen to the ISS yourself:** the station's amateur radio frequencies, plus the next good pass over you.
- **Space agencies live:** links to NASA+, ESA, CSA, JAXA and ISRO streams.
- SomaFM space channels, including Mission Control, which mixes NASA mission audio with ambient music.
- Local stations near your location.
- Air traffic control feeds for the nearest airports (these open LiveATC).
- Links to NASA+ live, shortwave receivers (SDR) around the world, and Radio Garden.

**Lab (desktop)**
- *What just passed overhead?* runs every catalogued satellite backwards through the time and direction you give, and ranks the matches.
- Agency imagery search, including DSCOVR's daily view of the whole Earth (EPIC).
- Plate-solving of your own sky photos through Astrometry.net.

**Display modes:** Airy (white and light green), Cosmos (true-colour stars on deep indigo), Stargazer (red and orange on black, to protect night vision) and Terminal (1980s green phosphor). Stargazer can switch on automatically after dusk.

## Put it on GitHub Pages

1. On github.com, create a new **public** repository, for example `night-sky`.
2. Choose **Add file → Upload files**. GitHub accepts up to 100 files per upload, so do it in two batches, keeping the folder structure: first everything except the `blender` folder, commit, then upload the `blender` folder and commit again. The `blender` folder is optional; the app runs without it.
3. Open **Settings → Pages**. Set **Source** to *Deploy from a branch*, choose the branch `main` and the `/ (root)` folder, and save.
4. After a minute or so the site is live at `https://YOUR-USERNAME.github.io/night-sky/`.

## Install on your phone

- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**. When you first tap **Point**, iOS asks for motion access; allow it.
- **Android (Chrome):** open the link, tap the ⋮ menu, then **Install app**.

After the first visit, the sky chart, catalogue and 3D models all work offline at a dark site. Weather, satellites and news refresh whenever you have signal.

## Tips

- Phone compasses are usually off by 5 to 15°. Use **Align** once per session for an accurate overlay.
- Most free APIs need no key. NASA's shared `DEMO_KEY` is rate limited, so a free personal key from api.nasa.gov (pasted into Settings) makes the picture of the day reliable.
- CelesTrak asks apps not to re-download orbits too often. The app caches them for 4 hours.

## Rebuilding the models

The `blender/` folder holds:
- the generator scripts
- the `.blend` source files
- the textures
- `model-lineup.png`, a render of every model

To regenerate the models with Blender 4.2 or later (or `pip install bpy`):

```
python3 blender/gen_textures.py   # procedural planet/nebula textures
python3 blender/build_models.py   # builds and exports models/*.glb
```

Copy `blender/glb/*.glb` into `models/` when you're done.

## Credits

**Code libraries:** Astronomy Engine (MIT), satellite.js (MIT), three.js (MIT), d3-celestial star, constellation and Milky Way data (BSD).

**Data:**
- Light pollution: David Lorenz, Light Pollution Atlas 2025 (VIIRS data from the Earth Observation Group, Colorado School of Mines)
- Dark-sky places: DarkSky International designations, as listed on Wikipedia (CC BY-SA)
- Deep Space Network: NASA DSN Now
- Comet ephemerides: JPL Horizons and SBDB
- Satellite catalogue: CelesTrak SATCAT
- Satellite frequencies: SatNOGS DB
- ISS radio: ARISS
- Weather: Open-Meteo
- Satellite orbits: CelesTrak
- Space weather: NOAA SWPC
- Launches: The Space Devs
- News: Spaceflight News API
- Imagery: NASA APOD, EPIC and the NASA Image Library
- Object summaries: Wikipedia
- Local stations: Radio Browser
- Space channels: SomaFM
- Airports: OurAirports

**Textures:**
- Moon: NASA LRO, public domain.
- Jupiter: NASA/JPL Cassini, public domain.
- Earth: NASA Blue Marble, via three.js.
- Saturn: Solar System Scope, CC BY 4.0.
- Sun, Mercury, Venus, Mars, Uranus and Neptune: procedurally generated.
