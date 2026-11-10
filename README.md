# Sjælland Rundt 2026 — præsentation

Selvstændig webapp med kort, bådspor, vind, radar og events fra Sjælland Rundt.
Beretning, magasin og LaTeX/PDF-dokumenter ligger i det separate projekt `../SR 2026/`.

Udviklingsprincip: Én nominel implementering pr. funktion, ingen skjulte
fallbacks. Fejl skal vises tydeligt. Se [projektprincipperne](AGENTS.md).
Løbende test begrænses til relevant lokal Firefox-test på PC.

## Lokalt preview og redigering

Kør fra denne projektmappe:

```sh
python3 scripts/serve_viewer.py
```

Node.js 24 skal være installeret sammen med Python. Serveren kontrollerer ved
opstart fingeraftrykket af data, sporberegninger, rhumbline og profilgenerator.
Ændrede kilder udløser forberedelse af alle bådes referenceprofiler og egne
projekterede prøver, før serveren starter. Beregningen bruger de samme nominelle
funktioner i [navigation-math.js](viewer/navigation-math.js) som vieweren.
Manglende Node.js eller fejl i forberedelsen stopper opstarten med en fejl.

Genererede filer i `viewer/track-profiles/` ignoreres af Git. De kan forberedes
direkte med `node scripts/prepare_track_profiles.cjs --if-stale`.
Pages-buildet udfører samme kontrol og medtager kun de aktuelle binære aktiver.
Genstart den lokale server efter ændringer af beregningskilder eller rhumbline.

Manifestet `track-profiles/manifest.json` skal hentes med `cache: 'no-store'`.
Det indeholder formatversion, kildefingeraftryk, SHA-256 af `JSON.stringify(DATA)`, SHA-256 af
`JSON.stringify(rhumbline)` og bådenes ID, punktantal, stationsantal og filnavne.
Browseren validerer rhumblinens digest, bådenes ID og punktantal samt binærformatet.
Det fulde datafingeraftryk beregnes kun offline; browseren serialiserer ikke DATA.
Filnavnene indeholder kildefingeraftrykket og er relative til viewerens rod.
Begge binære formater bruger little-endian Float32. `sampleFile` indeholder
`pointCount + 1` tripler `[progressHigh, progressLow, vmg]`; den sidste er en
kopi af den sidste kildeprøve. `profileFile` indeholder `stationCount` rækker af
otte ord `[atHigh, pointVMG, pointTimeOffset, atLow, afterVMGAtAt,
afterVMGSlope, afterTimeAtAtOffset, afterTimeSlope]`. Tider er sekunder fra
manifestets `start`; manglende VMG er `-1e20`. Progression er sømil opdelt med
`high = Math.fround(progress)` og `low = Math.fround(progress - high)`.
Grænser sammenlignes leksikografisk som `(high, low)`, også ved CPU-opslag.
Et præcist match bruger punktværdien; ellers bruges intervallet efter stationen.
Generatoren afviser stationsgrænser, som ikke kan holdes adskilt i formatet.

Åbn <http://127.0.0.1:8097/>. Brug samme browser og adresse som før flytningen;
browserens eksisterende noter følger adressen, ikke mappens placering.
Lokalt uploadede billeder ligger i `data/event-images/`.
Den permanente rhumbline tegnes én gang på det separate lokale kort
`/rhumbline.html`, fx <http://127.0.0.1:8097/rhumbline.html>. **Gem permanent
rhumbline** skriver punkterne til `viewer/rhumbline.json`. Rutedefinitionen
indgår ikke i præsentationsdata og kan ikke overskrives fra tegnekortet.
Se [viewerens vejledning](viewer/README.md) for kortets betjening og datakilder.

## Mapper

| Mappe | Indhold |
|---|---|
| `viewer/` | HTML, CSS, JavaScript og færdige kort-/vejraktiver |
| `data/` | Kildedata, cache og eksisterende lokale eventbilleder |
| `scripts/` | Lokal server, dataforberedelse, test og Pages-build |
| `research/` | Kildenoter til kort og præsentation |
| `presentation/` | Den fælles udgivne præsentations JSON-fil, når den er oprettet |
| `backend/` | GitHub-login, rettighedskontrol og API til gemning/upload |
| `docs/` | Drift og flytning af eksisterende noter |
| `dist/` | Genereret offentlig hjemmeside; ignoreres af Git |

## Online

GitHub Pages viser den udgivne præsentation. Redaktøren åbnes på backendens
`/admin/`, hvor login og API ligger på samme origin. Brugere med skriverettighed
til dette repository kan redigere og udgive. Andre kan se den offentlige visning.
Backenden kontrollerer rettigheder ved gemning og upload.

[Opsæt GitHub Pages](docs/hosting.md), følg [backendens opsætning](backend/README.md),
og [flyt dine lokale noter med](docs/migration.md).

Byg de offentlige filer uden npm eller Python-pakker:

```sh
python3 scripts/build_pages.py
```

Angiv eventuelt backendens HTTPS-origin med `SR_API_URL`. Hemmeligheder hører
kun til backendens secret-konfiguration. Workflowet læser den offentlige adresse
fra repository-variablen `SR_API_URL`.
