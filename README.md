# Sjælland Rundt 2026 — præsentation

## Broer

[Brogeometrien](viewer/bridges.geojson) er et fælles OSM-udtræk med 17 sektioner
og 133 uforenklede kildepunkter samt 12 kortlagte pille-/pylonomrids og 62 rekonstruerede omrids på Vestbroen. `mapLayers.bridges` i
[konfigurationen](viewer/events/catalog.json) angiver fil og brogrupper pr. stævne.
Storebælts øst-/vestbro vises på alle stævner. Silverrudder viser også de to
Lillebæltsbroer og Svendborgsundbroen. Sjælland Rundt viser begge Storstrømsbroer,
Masnedsundbroen, de to Farøbroer, Guldborgbroen og Frederik IX’s Bro.

Udtrækket følger OSM's broafsnit frem for tilkørselsveje og tunneler. En kørebane
repræsenterer dobbelte vejbaner; den gamle Storstrømsbro bruger jernbaneaksen,
og Guldborgbroen bruger det kortlagte brodæks omrids. Alle kildekoordinater og
links til OSM-objekterne ligger i filen. Data er hentet fra OpenStreetMap API 0.6
og er omfattet af ODbL og tilskrivning til OpenStreetMap contributors.

Geometrien uploades én gang til baggrundens WebGL 2-renderer og tegnes under
spor og bådikoner med en mørk kant og et lyst dæk. Piller/pyloner tegnes som
mørke, udfyldte polygoner i deres geografiske størrelse, også via WebGL.
OSM har omrids ved Østbroen (4), gamle Lillebæltsbro (4), nye Lillebæltsbro (2)
og Farøs Sydbro (2); dækningen er ufuldstændig. Vestbroens 62 piller er efter aftale
rekonstrueret med brugerens mål: 6 m langs broen og 42 m på tværs.
Dækkene tegnes som udfyldte geografiske polygoner: 40 m på Vestbroen og 25 m
på Østbroen. Begge Lillebæltsbroers dæk bruger gennemsnittet af den længste
side på hver af deres sekskantede piller; pilleomridsene bevares.
Den nye Lillebæltsbros lige dæk roteres/forskydes samlet gennem begge
pyloners arealmidtpunkter med lige lange endestrækninger uden at ændre længde
eller bredde. Denne tilpasning har en direkte geometrisk løsning.
De forberedes sammen med pillerne og skalerer med kortet;
en fast skærmbredde bruges kun til kanten.
[Generatoren](scripts/prepare_bridge_supports.py) bruger brugerens 62 satellitpunkter
fra [målefilen](data/geography/vestbroen-piers.json), ordnet fra Sprogø mod Fyn.
Hvert punkt fastholdes midt på syd/sydøst-endefladen; pillen går 42 m mod
nord/nordvest, vinkelret på det nærmeste segment af broens OSM-akse. De 6 m
langs broen fordeles med 3 m på hver side af punktet. Vestbroens dæk tilpasses derefter samlet med én rotation (maks. ±2°)
og forskydning (maks. ±20 m øst/nord), der minimerer summen af kvadrerede
afstande fra pillernes midtpunkter til dækkets centerlinje. Bredde og form
bevares; pillerne flyttes ikke. Offlinegeneratoren kræver
[NumPy/SciPy](scripts/requirements-bridges.txt). Resultat og residualer gemmes
i dækkets GeoJSON-egenskaber. Omridsene er fortsat tilnærmede; punkternes præcision
følger den manuelle satellitaflæsning.
Filen hentes først efter
stævnevalg; forsiden henter ingen kortgeometri. Brovalg er adskilt fra de
beregningstunge sporinputs, så en broændring ikke genberegner bådprofiler.

## GPS-outliers

Profilbygget fitter en todimensional Kalman-model med konstant hastighedsvektor
pr. båd. Robuste lokale residualer estimerer GPS-støj og processtøj inden for de
fysiske grænser i stævnets `trackFilter`-konfiguration. Frem- og baglæns filtrering
skal begge afvise en måling, før den fjernes: innovationen skal overstige både
80 meter og en kvadreret Mahalanobis-afstand på 100. Processtøj tillader normale
fart-/kursændringer; tidsintervaller bruges eksplicit, også i de sparsomme spor.
Modellen nulstilles ved huller over 300 sekunder. Segmenter med færre end fem
punkter bevares, fordi evidensen er utilstrækkelig.

Rå native snapshots ændres aldrig. Gyldige koordinater, tider og kildefart bevares
uændret; der indsættes ingen Kalman-udglattede koordinater. Filtreringen sker før
komprimering, interpolation og profilberegning, så positioner, spor og gates bruger
samme punkter. Der er ingen ekstra beregning under afspilning. Manifestets
`filtering` angiver optællingen. En lokal `filter-report.json` ved hver genereret
profilpakke indeholder modelparametre og de afviste målinger og publiceres ikke.

Modellen udpeger store afvigelser fra bevægelsesforløbet; den er ikke en
land-/bilklassifikator. Sammenhængende forkerte forløb kan ikke sikkert afgøres
ud fra positioner alene. Den nuværende indstilling afviser 53/37/114/48 punkter
for hhv. Sjælland Rundt 2026 og Silverrudder 2025/2024/2026.

Modelgrundlag: [konstant-hastighedsmodellen og innovation](https://www.mathworks.com/help/fusion/ug/linear-kalman-filters.html).

## Flere stævner

Forsiden er en let stævnevælger og henter ingen spor eller GPU-data. Hvert stævne
har et symmetrisk direkte link: `/events/sjaelland-rundt-2026/` og
`/events/silverrudder-2025/`. Links virker også under et Pages-repository-præfiks.
Admin bruger samme struktur under `/admin/events/<id>/`. Et stævneskift genindlæser
siden og frigiver det tidligere stævnes GPU-data. Gamle `?event=<id>`-links
omdirigeres eksplicit til det nye link.

[Kataloget](viewer/events/catalog.json) er den eneste stævnekonfiguration.
Hver post indeholder titel, beskrivelse, tidsrum, baner/rhumblines, referencebåd,
mærker, kortudsnit, datakilder og præsentationsdokument. `nameDisplay` styrer
importens startnummer-/modelnavneformat; `boatStyle` samler farver, fremhævede både,
navneplacering og kildebelagte/manuelle ikonmål. `routeEditor.allowReplace` styrer
om en gemt rhumbline kan erstattes med versionskontrol. `features` og `layers`
beskriver tilgængelige funktioner/lag, og `storage` angiver eksplicit migrering.
Det fælles [tracker-layout](viewer/tracker.html) får et lille, genereret HTML-indgangspunkt
pr. stævne ved build; der er ingen separat trackerimplementering pr. stævne.

Spor, bådmetadata og baggrund ligger som separate native inputs under
[data/events](data/events). Buildet publicerer hver pakke under
`events/<stævne>/track-profiles/`; præsentationen ligger under
`events/<stævne>/presentation.json` i det publicerede site.

Silverrudder 2025 samler alle syv offentlige TracTrac-løb med 411 trackere og
1.402.271 observationer på én fælles tidslinje. De deler Fyn-banen og kan vælges
enkeltvis i løbsfilteret eller vises sammen. Originale UTC-tider og kildeidentiteter
bevares; løbene forskydes ikke for at gøre starterne samtidige. Navnet rettes
udtrykkeligt til 2025, fordi TracTracs interne eventmetadata fejlagtigt siger 2026.
Mærker og foreløbig rhumbline kommer fra TracTracs kontrolpunkter. Handicap og vejr
er utilgængelige for dette stævne, da der ikke er importeret et gyldigt grundlag.
Kun brugerens polygon ved Storebæltsbroen er overført fra Sjælland Rundt.

Silverrudder 2024 og 2026 ligger på `/events/silverrudder-2024/` og
`/events/silverrudder-2026/`. De genbruger 2025-kortet, rhumblinen, mærkerne og
start-/mållinjen. 2024 samler syv løb (420 spor); 2026 importerer ét samlet løb
med syv klasser og klassernes egne UTC-starter (428 spor). Præsentationer og
spor er adskilt pr. årgang. `boatStyle.featuredModelPattern` udvælger Seascape 27
og First 27 SE ved import, også kildens kombinerede modelnavne; First 27.7 er ikke med.
2024/2026-kilden har enkelte fartsopdateringer til samme koordinat og tidsstempel.
Den eksplicitte `duplicateSpeedPolicy: latest` beholder den sidst leverede fart;
forskellige koordinater med samme tidsstempel afvises fortsat.

Genimport af den konfigurerede Silverrudder-kilde:

```sh
python scripts/import_tractrac_event.py --event silverrudder-2025
# Brug silverrudder-2024 eller silverrudder-2026 for de andre årgange.
# --refresh henter JSON-metadata og de lagrede GPS-filer igen.
python scripts/prepare_adaptive_map.py --event silverrudder-2025 --angle-degrees 0.2
node scripts/prepare_track_profiles.cjs --if-stale
```

Importen ændrer ikke manuelle stævneindstillinger, mærker eller rhumbline.
Kortbygget bruger samme detaljerede Danmarkskilde og samme algoritme som Sjælland
Rundt, men måler afstand til Silverrudders spor og skriver kun Silverrudders kort.
Ændres sporgrundlaget eller kortets tolerance, køres kortbygget før profilbygget.
`--event ID` på profilbygget begrænser det til ét stævne; standarden bygger kataloget.

Noter, gates, favoritter, visningsvalg og kladder holdes adskilt pr. stævne.
Eksisterende Sjælland Rundt-browserdata kopieres én gang til det nye namespace;
de oprindelige nøgler bevares. De udgivne Sjælland Rundt-events ligger fortsat i
[presentation.json](presentation/presentation.json); Silverrudder har sin egen
[præsentation](presentation/silverrudder-2025.json). Backendens læsning og udgivelse
vælger dokument med `?event=<id>` og afviser ukendte stævner.



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

## Vejr til Silverrudder

Silverrudder 2024, 2025 og 2026 har timevind fra DMI HARMONIE via Open-Meteo,
med samme sampling som Sjælland Rundt. Nedbørslaget viser observeret
radarreflektivitet ved 10-minutters trin. OPERA leverer radarbillederne for 2024 og
2025, og DMI leverer dem for 2026. Kilden vises i lagmenuen.

Vind kommer fra [Open-Meteos DMI-prognosearkiv](https://open-meteo.com/en/docs/historical-forecast-api).
Radarkompositterne kommer fra [EUMETNET OPERA](https://www.eumetnet.eu/data-access/data-policy/)
(CC BY 4.0) og [DMI Frie Data](https://www.dmi.dk/friedata/dokumentation/radar-data).
Billederne er beskåret, reprojiceret og farvelagt til kortet.

Klargjorte data og radarbilleder ligger i `viewer/weather/` pr. årgang.
Trackeren indlæser dem som separate filer, så en ændring af vejrlaget kan
publiceres uafhængigt af sporprofilerne. Til ny dataforberedelse bruges
pakkerne i `scripts/requirements-radar.txt` samt `requests` og følgende kommando.

```sh
.venv/bin/python scripts/prepare_silverrudder_weather.py --event silverrudder-2026
```

Klargøring kræver adgang til kildernes arkiver. DMI’s åbne radararkiv har en
rullende periode på 180 dage. Build og afspilning bruger de klargjorte filer.

## Lokalt preview og redigering

Kør fra denne projektmappe:

```sh
python3 scripts/serve_viewer.py
```

Åbn en sejlads og klik på bogikonet for at åbne eventfanen. Vælg et event for at
redigere teksten direkte eller tilføje et billede eller en tegning. Ændringer af
eventindholdet gemmes i browserens kladde. Med **Nyt event her** oprettes et event
ved kortets aktuelle tidspunkt. **Slet event** fjerner det åbne event fra kladden.

Sprogknappen i kortets værktøjslinje og på stævneoversigten skifter mellem dansk,
engelsk, tysk og fransk på den åbne side. Valget gemmes i browseren. Direkte links
kan også bruge `?lang=da`, `?lang=en`, `?lang=de` eller `?lang=fr`.

Brug kortet, lagene og bådlisten til at afprøve eventets visning. Eventfanen viser,
hvilke dele af visningen der afviger. **Brug i eventet** gemmer visningen i kladden.
**Gendan kortvisning** henter eventets gemte opsætning, og **Fortryd** kan rulle den
seneste lagring af kortvisningen tilbage. Online gør **Udgiv** under
**Præsentation** kladden offentlig.

Node.js 24 og Python 3 skal være installeret. Serveren forbereder den
komprimerede kildepakke før opstart og genbruger den, når kildefingeraftrykket
ikke er ændret. Sammenligningsprofiler beregnes på GPU'en ved indlæsning.

Genererede filer i `viewer/track-profiles/` ignoreres af Git og forberedes med
`node scripts/prepare_track_profiles.cjs --if-stale`. Pages-buildet udfører samme
kontrol. GitHub Actions cacher kildepakken under generatorens SHA-256-fingeraftryk.
Ændringer af events eller renderingskode kræver ingen ny komprimering.

Kort- og vejrmetadata hentes som `data.json.gz` og pakkes ud i browseren, ligesom spordata. Det sikrer gzip ved både lokal visning og statisk hosting.

Manifestversion 13 hentes med `cache: 'no-store'` og angiver metadata (`dataFile`),
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
Den oprindelige `data.js` er et ældre offline-eksportformat og publiceres ikke.
Det nominelle build læser nu det valgte stævnes native- og baggrundssnapshots.

Buildet beregner de tunge ruteprojektioner og stationsprofiler med
[fælles matematik](viewer/track-preparation-math.js). Hver båds fart- og tidsprofil
gemmes én gang pr. bane. Der bygges ingen filer for par af både. Profilfilen
XOR-koder på hinanden følgende ord pr. kanal, opdeler i byteplaner og gzip-komprimerer.
Kodningen bevarer de lagrede Float32-bytes tabsfrit, inklusive overflowmarkører.
Sample-opslagets tidsforbrug og stationsnummer sendes ikke dobbelt: klienten
gendanner dem fra VMG som `3600/(1852*abs(VMG))` med eksplicit nul/manglende-håndtering.
Det gendannede tidsforbrug kan afvige med Float32-afrunding. Stationsprofilernes
summerede tidsforbrug over flere passager bevares som selvstændige data.
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

Frisk lokal Firefox-opstart på PC henter ca. 42,49 MB mod 65,37 MB før XOR/byteplaner
og gendannelse af tidsopslag (oprindeligt 93,65 MB før lokal geometri og GPU-sammenligning).
Heraf er stationsprofiler og sampleopslag 38,58 MB, kildepakken 2,62 MB og kort/metadata
0,82 MB; resten er manifest, kode og øvrige ressourcer. Filerne har fingerprintede URL'er
og kan caches. Der bruges ingen worker eller IndexedDB. Bådvalg, kamera og afspilning
genbruger faste GPU-data.

Forsøget med tidsopslag fjernet gav 56,55 MB med almindelig gzip, 41,28 MB med
byteplaner og 38,58 MB med XOR + byteplaner. XOR-udpakning tog ca. 0,18 sekund i Node
på lokal PC. Alle 636 overførte arrays blev kontrolleret bytepræcist mod de tidligere
profiler. Gendannede tidsopslag blev kontrolleret på hele feltet med højst 1,20e-7
relativ afvigelse og uændrede stationer, manglende værdier og overflowmarkører.

Tidsprofiler summerer frem- og tilbagepassager efter dækket længde pr. station.
Manglende værdier markeres med `-1e20`, og uendeligt tidsforbrug repræsenteres af
en fælles Float32-overflowmarkør. Uendelighed minus uendelighed er udefineret.
Fejl i indlæsning eller GPU-tegning vises tydeligt uden alternativ beregningsvej.
Genstart den lokale server efter ændringer af kildedata eller generatoren.

Åbn <http://127.0.0.1:8097/>. Brug samme browser og adresse som før flytningen;
browserens eksisterende noter følger adressen, ikke mappens placering.
Lokalt uploadede billeder ligger i `data/event-images/`.
Rhumbline tegnes på stævnets lokale direkte link med `?editRoute=1&course=<bane>`,
fx <http://127.0.0.1:8097/events/sjaelland-rundt-2026/?editRoute=1&course=boegestroemmen>
eller <http://127.0.0.1:8097/events/silverrudder-2025/?editRoute=1&course=fyn>.
**Gem permanent rhumbline** opdaterer den valgte banes punkter i
[kataloget](viewer/events/catalog.json) og klargør sporfilerne.
Referencebådens bane bestemmer
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
til dette repository kan redigere og udgive fra eventfanen i den fælles tracker.
Andre kan se den offentlige visning.
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
