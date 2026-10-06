# Bijdragen en onderhoud

## Lokaal draaien

De app heeft een webserver nodig (ES-modules werken niet via `file://`).

- **Apache/XAMPP**: zet de map in je webroot en open `http://localhost/checkapk/`.
- **Node**: `npm start` (of `node server.js`) en open http://localhost:3000.

Er is geen build-stap: wijzig een bestand en ververs de browser.

## Controleren

```bash
npm run check     # typecontrole van alle JSDoc-types met TypeScript (downloadt TypeScript eenmalig)
```

Open daarnaast de belangrijkste schermen en kijk in de browserconsole (F12) of er fouten zijn:
startpagina, een kenteken (alle tabbladen), "Auto's vergelijken", "Model bekijken" en "Vraag het".

## Codestijl

- Moderne JavaScript-modules (`import`/`export`), geen globale variabelen.
- Twee spaties inspringen, enkele aanhalingstekens, puntkomma's (zie `.editorconfig`).
- Code en commentaar in het Nederlands waar het over het domein gaat (kenteken, keuring, mankement);
  RDW-veldnamen blijven zoals de RDW ze schrijft (`datum_eerste_toelating`).
- Publieke functies krijgen een JSDoc-commentaar met types; `npm run check` controleert die.
- Escape **alle** data uit de API met `esc()` voordat het in HTML komt.
- Houd de lagen gescheiden (zie [ARCHITECTURE.md](ARCHITECTURE.md)): geen `fetch` in `domain/`,
  geen HTML in `domain/` of `services/`.
- CSS: kleuren alleen via de variabelen in `css/tokens.css`; nieuwe herbruikbare onderdelen in
  `components.css`, paginaspecifieke stijl in `pages.css`.

## Veelvoorkomende wijzigingen

### Een RDW-dataset toevoegen

1. Zoek het Socrata-id op opendata.rdw.nl (bijv. `abcd-1234`).
2. Voeg hem toe aan `DATASETS` in `src/api/datasets.js`.
3. Heeft hij een veld `kenteken`? Zet de sleutel in `PER_KENTEKEN`; hij verschijnt dan automatisch
   onder "Alle gegevens" op de kentekenpagina.
4. Wil je hem ergens anders tonen, lees hem dan uit `data.<sleutel>.rows` in de betreffende tab.

### Een tabblad op de kentekenpagina toevoegen

1. Schrijf in `src/pages/vehicle/tabs.js` een functie `(ctx) => html` (ctx bevat `s` en `data`).
2. Voeg een regel toe aan `TABS` in `src/pages/vehicle/index.js`:
   `{ id: 'mijntab', label: 'Mijn tab', render: html(mijnTab) }`.
   De URL wordt dan `#/k/KENTEKEN/mijntab`. Links met `data-goto="mijntab"` springen ernaartoe.

### Het rapportcijfer aanpassen

Alles staat in `src/domain/report-score.js`:

- `WEIGHTS` bepaalt hoe zwaar elk deelcijfer meetelt;
- elke categorie is een blok in `scoreVehicle()` met zijn eigen drempels en teksten;
- `RECURRING_DEFECT_TIPS` bevat de tips bij terugkerende mankementen.

Omdat dit bestand puur is (geen netwerk/DOM), kun je het in de browserconsole testen:
`const m = await import('/src/domain/report-score.js')`.

### Een onderwerp toevoegen aan "Vraag het"

1. `src/assistant/parser.js`: voeg een regel toe aan `TOPIC_PATTERNS` (sleutel + herkenningswoorden)
   en een label aan `TOPIC_LABELS`.
2. `src/assistant/topics.js`: voeg een handler toe aan `TOPIC_HANDLERS`
   (`async (subject, plan) => section(titel, toelichting, grafiekHtml, csvRijen)`).
   Gebruik `whereFor(s, p)` voor de SoQL-voorwaarde en `barChart`/`columnChart` voor de grafiek.
3. Het onderwerp komt automatisch in het JSON-schema van de AI (`understand.js`).

### Een merk-alias toevoegen ("vw" → VOLKSWAGEN)

Voeg hem toe aan `MERK_ALIASES` in `src/assistant/model-index.js`.

### Een nieuwe pagina toevoegen

1. Maak `src/pages/mijnpagina.js` met `export function renderMijnPagina(el, params) { … }`.
2. Voeg een route toe aan `ROUTES` in `src/router.js`.
3. Voeg eventueel een menu-item toe in `index.html` met `data-nav="…"`.

## Git

- Werk op een eigen branch en maak kleine, duidelijke commits.
- Controleer vóór het pushen: `npm run check` en een rondje door de schermen.
