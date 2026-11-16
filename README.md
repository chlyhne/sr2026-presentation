# Sjælland Rundt 2026 — præsentation

Selvstændig webapp med kort, bådspor, vind, radar og events fra Sjælland Rundt.
Beretning, magasin og LaTeX/PDF-dokumenter ligger i det separate projekt `../SR 2026/`.

Udviklingsprincip: Én nominel implementering pr. funktion, ingen skjulte
fallbacks. Fejl skal vises tydeligt. Se [projektprincipperne](AGENTS.md).
Vi arbejder i korte iterationer og samler bevidst udskudt hærdning, oprydning og
dybere validering i [teknisk gæld](TEKNISK_GAELD.md). Listen opdateres løbende;
et samlet catch-up udføres, når brugeren beder om det.

Test har to niveauer:

- **Hurtig standardkontrol:** `node scripts/test.cjs` — syntaks, lille testdatasæt
  og servervalidering, uden browser, serverstart eller beregning af hele feltet.
  Køres ved hver ændring; normalt omkring ét sekund.
- **Udvidet fejlsøgning:** `node scripts/test.cjs --extended gates zoom` — kører
  standardkontrollen og de angivne Firefox-tests. Køres kun ved en fejlmelding
  eller udtrykkelig anmodning, og kun for det berørte område. Testnavnene svarer
  til filerne `scripts/test_viewer_<navn>.cjs`. Kræver en kørende lokal server
  (`SR_VIEWER_URL`, som standard `http://127.0.0.1:8097/`) og Playwright med Firefox.
  `PLAYWRIGHT_MODULE` kan angive en eksisterende Playwright-installation.

Browser- og GPU-dækning hører til det udvidede niveau; standardkontrollen er
bevidst lille. Alle browsertests skal køre skjult.
Ved et bestilt catch-up kan `node scripts/test.cjs --extended catch_up` køre den
samlede spor-/GPU-/gate-kontrol i headless Firefox. `SR_TEST_KEEP_GOING=1` samler
fejl fra flere delkontroller i én kørsel. Se [dækning og målinger](scripts/track-validation.md).
Denne kontrol køres ikke ved almindelige iterationer.

## Lokalt preview og redigering

Kør fra denne projektmappe:

```sh
python3 scripts/serve_viewer.py
```

Node.js 24 og Python 3 skal være installeret. Serveren forbereder den
komprimerede kildepakke før opstart og genbruger den, når kildefingeraftrykket
ikke er ændret. Sammenligningsprofiler beregnes på GPU'en ved indlæsning.

Genererede filer i `viewer/track-profiles/` ignoreres af Git og forberedes med
`node scripts/prepare_track_profiles.cjs --if-stale`. Pages-buildet udfører samme
kontrol. GitHub Actions cacher kildepakken under generatorens SHA-256-fingeraftryk.
Ændringer af events eller renderingskode kræver ingen ny komprimering.

Kort- og vejrmetadata hentes som `data.json.gz` og pakkes ud i browseren, ligesom spordata. Det sikrer gzip ved både lokal visning og statisk hosting.

Manifestversion 11 hentes med `cache: 'no-store'` og angiver metadata (`dataFile`),
kildepakken (`replayFile`), kildefingeraftryk og hver båds ID, originale punktantal
og `sourceOffset`. Filnavne indeholder fingeraftrykket. Browseren kontrollerer
format, offset, filstørrelse, ID'er, tidsrækkefølge og segmentgrænser, før data frigives.

De 730.370 originale observationer overføres som to int32-koordinater i 10⁻⁷ grad,
uint64 millisekunder og int16 SOG i 0,1 km/t (-32768 betyder manglende SOG).
Hver kanal XOR-kodes mod forrige native heltal og opdeles i byteplaner inden gzip
niveau 9. [Kildekodningen](viewer/track-source-codec.js) deles mellem build og klient;
generatoren verificerer hvert enkelt kildepunkt efter kodning og afkodning.
Kildepakken fylder cirka 2,62 MB. Stationsprofiler hentes i en separat fællespakke.
Metadata og kildepakke hentes parallelt; gzip afkodes med `DecompressionStream`.
Den oprindelige `data.js` bruges kun offline og publiceres ikke med Pages.

Buildet beregner de tunge ruteprojektioner og stationsprofiler med
[fælles matematik](viewer/track-preparation-math.js). Hver båds fart- og tidsprofil
gemmes én gang pr. bane. Der bygges ingen filer for par af både.
Browseren beregner PCHIP-hældninger, tidsindeks, geometri og fartbuffer én gang ved
opstart med [lokal klargøring](viewer/track-local-data.js). Hældninger beregnes i
Float64 før geometrien pakkes til Float32. De native kildeheltal bevares tabsfrit.

WebGL 2 tegner kort og spor og beregner fart-, handicap- og tidsforskel ved opslag
i den valgte references stationsprofil. Begge baners grundlag og alle bådes
geometri uploades før betjening. Reference- og sportypeskift ændrer teksturvalg
og uniforms; de henter ingen nye filer og genberegner ingen profiler.
Build, filer og CPU-/GPU-lager vokser lineært med antal både ved fast sporlængde
og antal baner. Desktop viser kurver; iPhone viser enkle streger.

`python3 scripts/build_pages.py` klargør profilerne automatisk ved deploy;
`python3 scripts/serve_viewer.py` gør det samme før lokal serverstart.
`node scripts/prepare_track_profiles.cjs --if-stale` genbruger et færdigt build,
indtil kildedata, matematik, rhumbline eller handicapdata ændres. Manglende eller
ugyldige profiler giver en synlig fejl uden alternativ beregningsvej.

Frisk lokal Firefox-opstart på PC henter ca. 65,37 MB mod tidligere 93,65 MB.
Heraf er stationsprofiler 61,46 MB, kildepakken 2,62 MB og kort/metadata 0,82 MB.
De tre datapakker fylder samlet 64,90 MB; resten er manifest, kode og øvrige
ressourcer. Filerne har fingerprintede URL'er og kan caches. Der bruges ingen
worker eller IndexedDB. Bådvalg, kamera og afspilning genbruger faste GPU-data.

Tidsprofiler summerer frem- og tilbagepassager efter dækket længde pr. station.
Manglende værdier markeres med `-1e20`, og uendeligt tidsforbrug repræsenteres af
en fælles Float32-overflowmarkør. Uendelighed minus uendelighed er udefineret.
Fejl i indlæsning eller GPU-tegning vises tydeligt uden alternativ beregningsvej.
Genstart den lokale server efter ændringer af kildedata eller generatoren.

Åbn <http://127.0.0.1:8097/>. Brug samme browser og adresse som før flytningen;
browserens eksisterende noter følger adressen, ikke mappens placering.
Lokalt uploadede billeder ligger i `data/event-images/`.
Den permanente rhumbline tegnes én gang på det separate lokale kort
`/rhumbline.html`, fx <http://127.0.0.1:8097/rhumbline.html>. **Gem permanent
rhumbline** skriver punkterne til `viewer/rhumbline.json`. Rutedefinitionen
indgår ikke i præsentationsdata og kan ikke overskrives fra tegnekortet.
Bøgestrømmens separate rhumbline tegnes på
<http://127.0.0.1:8097/rhumbline.html?course=boegestroemmen> og gemmes i
`viewer/rhumbline-boegestroemmen.json`. Referencebådens bane bestemmer
sammenligningsruten; bådvælgeren filtrerer på bane og TracTrac-løb.
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
