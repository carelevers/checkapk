# Architectuur

CheckAPK is een statische webapp: HTML, CSS en JavaScript-modules, zonder build-stap en zonder
backend. De browser haalt alle gegevens rechtstreeks op bij de
[RDW Open Data API](https://opendata.rdw.nl) (Socrata). Voorbeeldfoto's komen van
[Wikimedia Commons](https://commons.wikimedia.org) (`src/api/commons.js`), met naamsvermelding per foto. Optioneel praat "Vraag het" met een lokale AI
via [Ollama](https://ollama.com).

## Mappen

```
index.html            Pagina-skelet: menu, <main id="app">, laadt config.js en src/main.js
config.js             Instellingen voor gebruikers (app token, lokale AI) — gewoon script, geen module
server.js             Optionele statische webserver (node server.js)
css/
  tokens.css          Kleuren, lettertypes, afronding (licht + donker thema)
  base.css            Reset, typografie, header/menu, layout, print
  components.css      Herbruikbare onderdelen (knoppen, kaarten, tabellen, grafieken, …)
  pages.css           Paginaspecifieke stijlen
src/
  main.js             Startpunt: thema + router
  router.js           Hash-routes (#/k/…, #/vraag, …) → render-functies
  config.js           Instellingen met standaardwaarden (leest /config.js)
  lib/                Algemene hulpjes zonder kennis van auto's (opmaak, opslag, CSV)
  api/                Externe bronnen: RDW API (client, datasets, één kenteken) en Wikimedia Commons (foto's)
  domain/             Pure logica over auto's: kentekens, gebreken, generaties, rapportcijfer
  services/           Combineert api + domain: modelstatistieken, vergelijkgroep, rapport
  ui/                 Herbruikbare HTML-bouwstenen en grafieken
  pages/              Eén module per scherm; vehicle/ is de kentekenpagina met tabbladen
  assistant/          "Vraag het": vraagherkenning, onderwerpen, lokale AI, samenvatting
docs/                 Deze documentatie
```

## Lagen en afhankelijkheden

```
pages/  ──►  services/  ──►  api/
  │              │            │
  │              ▼            ▼
  ├────────►  domain/  ──►  lib/
  ▼
 ui/  ──►  domain/, lib/
assistant/ ──► api/, domain/, services/, ui/, lib/
```

Regels:

- **`lib/`** kent geen auto's en importeert niets uit de app.
- **`domain/`** is puur: geen `fetch`, geen DOM, geen HTML. Alles is met gewone data te testen.
  Het rapportcijfer (`domain/report-score.js`) staat hier, met de gewichten bovenaan het bestand.
- **`api/`** is de enige plek die met de RDW praat (via `rdw-client.js`). Identieke verzoeken worden
  in het geheugen gecachet; bij een tijdelijke serverfout (500/502/503/504) wordt één keer opnieuw geprobeerd.
  Vermijd zware query's over het hele register (groeperen zonder filter, bijv. alle merken): die duren
  tientallen seconden of geven een 500-fout. Filter altijd op merk/model, of bewaar de uitkomst met
  `cacheGet`/`cacheSet` (`lib/storage.js`) in de browser.
- **`services/`** combineert API-verzoeken met domeinlogica (bijv. vergelijkgroep kiezen → statistieken
  ophalen → rapport berekenen). Resultaten per voertuig worden met een `WeakMap` gecachet.
- **`ui/`** maakt HTML-strings. Alle data uit de API gaat door `esc()`. De kentekenplaat (`ui/plate.js`) is
  één onderdeel in vier maten (`xs`, `sm`, `md`, `lg`).
- **`pages/`** tekent schermen en koppelt events. Een pagina exporteert `render…(el, params)`.

Er zijn geen globale variabelen; alles gaat via `import`/`export`. Event-handlers worden in JavaScript
gekoppeld (geen `onclick` in HTML), meestal via `data-…`-attributen.

## Belangrijke stromen

### Kentekenpagina (`#/k/KENTEKEN/tab`)

1. `api/vehicle.js → fetchVehicle()` haalt 11 datasets per kenteken op, plus gebrekomschrijvingen
   en terugroepdetails. Een fout in één dataset breekt de rest niet.
2. `domain/vehicle-summary.js → summarizeVehicle()` maakt er een samenvatting van (leeftijd, pk,
   APK-tijdlijn, mankementen per keuring, …).
3. `pages/vehicle/index.js` toont de kop en de tabbladen (lijst `TABS`).
4. Het rapport: `services/report.js → getReport()`
   1. `resolvePeerFilter()` kiest de vergelijkgroep: zelfde generatie (typegoedkeuring) + bouwjaar ±2,
      anders hele generatie, anders bouwjaar ±1, anders het hele model (minimaal 30 auto's).
   2. `computeModelStats()` haalt statistieken van die groep op (APK via een steekproef).
   3. `domain/report-score.js → scoreVehicle()` berekent cijfer, punten en tips.

### "Vraag het" (`#/vraag?q=…`)

1. `assistant/understand.js → understand()`
   - eerst regels (`parser.js`): merken/modellen (`model-index.js`: eerst de merkenlijst, dan per gevonden merk
     de modellen; modellen zonder merk via alleen de woorden uit de vraag), bouwjaren, onderwerpen;
   - alleen als dat onvolledig is én Ollama draait: de AI zet de vraag om naar JSON (vast schema).
2. `assistant/topics.js → buildJobs()` maakt per onderwerp × model een opdracht; elke opdracht
   geeft één of meer secties (titel, grafiek, CSV-gegevens).
3. `pages/ask.js` toont elke grafiek zodra die binnen is en laat daarna de AI een samenvatting
   schrijven (`summary.js`). De AI krijgt alleen de cijfers uit de grafieken.

## Gegevens en beperkingen

- Gebruikte datasets staan in `src/api/datasets.js`.
- Modelstatistieken over APK-gebreken zijn gebaseerd op een **steekproef** (zie `DEFECT_SAMPLE_SIZE` in
  `src/config.js`); aantallen en kleuren zijn compleet.
- Open data bevat geen eigenaren en geen kilometerstanden per keuring. APK-gebreken beginnen rond 2018.
