# Licenze e crediti

## Codice
Il codice del simulatore (cartelle `js/` tranne `js/vendor/`, `css/`, `test/`, `index.html`, `serve.py`) è stato scritto per la scuola Sportaction.

- `js/vendor/three.module.min.js` è three.js, © 2010-2023 three.js authors, licenza MIT.

## Dati geografici (cartella `data/`)
I file in `data/` sono ricavati da queste fonti:

- **Contorno del lago ed edifici:** © OpenStreetMap contributors, licenza **ODbL 1.0** (https://www.openstreetmap.org/copyright).
  I file derivati sono rilasciati anch'essi con licenza **ODbL 1.0**, come la licenza richiede:
  - `lake.bin` (contorno);
  - `houses.bin` (edifici);
  - `terrain.bin` (fondale ricavato dal contorno).
- **Immagini satellitari** (`sat_outer.jpg`, `sat_inner.jpg`):
  - fonte: Sentinel-2 cloudless 2016 di EOX IT Services GmbH, https://s2maps.eu;
  - licenza **CC BY 4.0**;
  - contengono dati Copernicus Sentinel modificati, 2016.
- **Quote del terreno** (`terrain.bin`): Terrarium, Mapzen/AWS Open Data Terrain Tiles (SRTM e altre fonti pubbliche).
- **Alberi** (`trees.bin`): posizioni ricavate dalle immagini satellitari qui sopra.

I crediti compaiono anche in basso a destra nella pagina del simulatore.

## Marchi
"Sportaction", il logo sulla randa (`img/logo-randa.png`) e i loghi e nomi presenti sulle barche ("target", "pegaso") appartengono ai rispettivi titolari e sono usati per rappresentare le barche della scuola.
