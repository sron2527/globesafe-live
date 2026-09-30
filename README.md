# GlobeSafe Live — Version 3

Public global situational-awareness web app prototype.

## Version 3 additions
- Replaced the OpenStreetMap raster tile usage that could trigger `403 Access blocked` with MapLibre GL JS + OpenFreeMap vector styles.
- Live rotating 3D globe on the home page using MapLibre globe projection.
- Hazard points on the globe use live mapped event coordinates. Point colors represent GlobeSafe visual severity: cyan = active, yellow = moderate, orange = high, red = critical. Earthquake severity uses magnitude / USGS alert data where available; other feeds remain conservative when a comparable severity value is unavailable.
- Multilingual UI selector: English, Thai, Spanish, Indonesian and Portuguese.
- Daily Brief summary generated from current live feeds.
- PWA manifest, install prompt and offline app-shell service worker.
- Version 2 watchlist, browser alerts and World FM favorites are retained.

## Run locally
For the best result, do not double-click `index.html`. Run a local server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

The main map and 3D globe need internet access for OpenFreeMap vector map data. Live hazard and radio feeds also require internet access. PWA installation and service workers require `http://localhost` or HTTPS.

## AdSense
The Google AdSense site script placeholder remains in `<head>`. Add the real script only after the deployed public site is accepted and you have your publisher code.

## Safety
GlobeSafe Live is an informational dashboard, not an official warning or evacuation service. Conflict reports are intentionally separated from official emergency warnings.
