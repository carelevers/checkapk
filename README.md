# CheckAPK – eigen kentekencheck

Een eigen "CarScanner": zoek elk Nederlands kenteken op en zie alles wat de
[RDW Open Data API](https://opendata.rdw.nl) erover weet.

## Functies

- **Rapportcijfer (1–10)**: elk kenteken krijgt automatisch een rapport met een eindcijfer, deelcijfers (APK-keuringen, kilometerstand, papieren & veiligheid, betrouwbaarheid van het model, leeftijd & eigenaar, milieu), plus- en minpunten in gewone taal, koopadvies en een print/PDF-knop. Het cijfer vergelijkt de auto met dezelfde **generatie** van hetzelfde model (herkend aan de Europese typegoedkeuring) en bouwjaar ±2; is die groep te klein, dan de hele generatie, en pas daarna bouwjaar ±1.
- **Kentekencheck**: merk/model, kleur, leeftijd, vermogen (kW/pk), catalogusprijs, BPM, gewichten, energielabel, WAM-status, export-, taxi- en tellerstandindicatoren.
- **APK-historie**: tijdlijn van alle keuringsmeldingen (met nieuwe vervaldatum) en alle geconstateerde gebreken in leesbare tekst, plus gebreken per jaar en de meest voorkomende gebreken.
- **Terugroepacties**: status per actie, met omschrijving, risico en oplossing.
- **Milieu & brandstof / Techniek**: brandstof, verbruik, CO₂, euroklasse, actieradius (EV), carrosserie, assen, voertuigklasse, subcategorie en bijzonderheden.
- **Zelfde type vergelijken**: hoe scoort deze auto ten opzichte van hetzelfde merk/model en bouwjaar? Aantallen op kenteken, gemiddelde catalogusprijs, gebreken per keuring, top-gebreken van het model, kleuren, brandstof, varianten en een lijst met vergelijkbare auto's.
- **Kentekens naast elkaar**: tot vier auto's in één tabel; de beste waarde wordt groen.
- **Generaties per model**: overzicht van alle generaties/uitvoeringen van een model met de jaren waarin ze vooral gebouwd zijn; klik er één aan om alleen die te analyseren.
- **Modelanalyse**: dezelfde analyse, maar dan voor elk merk/model/bouwjaar zonder dat je een kenteken nodig hebt.
- **Datasets**: vrije SoQL-querytool op alle gebruikte RDW-datasets.
- Licht en donker thema, werkt op mobiel, onthoudt recent gezochte kentekens.

## Draaien op localhost

De site is volledig statisch (HTML/CSS/JS). De browser roept de RDW API rechtstreeks aan, dus er is geen backend of database nodig.

### Optie A: Apache / XAMPP / Laragon / IIS (`C:\var\www\checkapk`)

```bat
cd C:\var\www
git clone <repo-url> checkapk
cd checkapk
git checkout claude/rdw-license-plate-checker-44aatj
```

Open daarna `http://localhost/checkapk/` (of de vhost die naar `C:\var\www\checkapk` wijst).
Bijwerken gaat met `git pull`.

### Optie B: meegeleverde Node-server (Node 18+, geen `npm install` nodig)

```bat
cd C:\var\www\checkapk
node server.js
```

Open daarna http://localhost:3000. Een andere poort kies je met `set PORT=8080` en dan `node server.js`.

## Optioneel: app token

Zonder token geldt de rate limit van de RDW API. Met een gratis Socrata app token
(via een account op opendata.rdw.nl) zet je die in `config.js`:

```js
window.RDW_APP_TOKEN = 'jouw-token';
```

## Gebruikte RDW-datasets

| Dataset | ID |
|---|---|
| Gekentekende voertuigen | `m9d7-ebf2` |
| Brandstof | `8ys7-d773` |
| Carrosserie / specificatie | `vezc-m2t6` / `jhie-znh9` |
| Voertuigklasse | `kmfi-hrps` |
| Assen | `3huj-srit` |
| Subcategorie voertuig | `2ba7-embk` |
| Bijzonderheden | `7ug8-2dtt` |
| Meldingen keuringsinstantie (APK) | `sgfe-77wx` |
| Geconstateerde gebreken | `a34c-vvps` |
| Gebreken (omschrijvingen) | `hx2c-gt7k` |
| Terugroepactie status / actie / risico / informeren eigenaar | `t49b-isb7` / `af5r-44mf` / `9ihi-jgpf` / `223d-3w9w` |

Let op: kilometerstanden per keuring en eigenaarsgegevens zijn **niet** openbaar.
De APK-gebreken in open data beginnen rond 2018.
