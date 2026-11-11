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
GitHub Actions genbruger de forberedte profiler fra en cache med generatorens
præcise kildefingeraftryk som nøgle. Ændringer af events kræver dermed ikke en ny
sporberegning; ændrede grunddata, rhumbline eller beregningskilder giver en ny nøgle.
Ved nyberegning kører den fælles matematik i Node 24 uden contextified globale
proxyopslag. Den ordnede gennemgang genbruger intervalindeks og PCHIP-evalueringer,
og præcis ruteprogression beregnes kun for det nærmeste ruteben ved hvert punkt.
Genstart den lokale server efter ændringer af beregningskilder eller rhumbline.

Manifestet `track-profiles/manifest.json` skal hentes med `cache: 'no-store'`.
Det indeholder formatversion, kildefingeraftryk, SHA-256 af `JSON.stringify(DATA)`, SHA-256 af
`JSON.stringify(rhumbline)` og bådenes ID, punktantal, stationsantal og filnavne.
Browseren validerer rhumblinens digest, bådenes ID og punktantal samt binærformatet.
Det fulde datafingeraftryk beregnes kun offline; browseren serialiserer ikke DATA.
Filnavnene indeholder kildefingeraftrykket og er relative til viewerens rod.
Manifestversion 7 indeholder både replaydata på et fælles 10-sekunders gitter
og sammenligningsprofiler på et fælles gitter med 10 meters afstand langs rhumblinen.
Buildet resampler position og målt SOG med den nominelle kubiske PCHIP-interpolation.
Præcise første/sidste tidspunkter og kanterne ved datahuller bevares som ekstra
knuder; huller over fem minutter udfyldes ikke. Renderingen bruger fortsat kubisk
interpolation mellem de nye knuder, også ved afspilning mellem hele sekunder.
Browseren henter metadata fra manifestets `dataFile` og alle både i én `bundleFile`.
Den oprindelige `data.js` bruges kun offline og publiceres ikke med Pages.
Hver båds `replayOffset` peger på `pointCount` little-endian Float32-tripler
`[longitude - replayOrigin[0], latitude - replayOrigin[1], measuredSog]`.
NaN i SOG-feltet betyder manglende måling. Tidsstempler genskabes fra
`sampleSeconds`, `start` og bådens `trackSegments`; de downloades ikke pr. punkt.
Et fast 10-sekunders opslagsindeks forberedes for hver båd, så almindelige
tidsopslag bruger direkte indeksering i stedet for binær søgning. Alle faste
indeks, kubiske modeller og sammenligningsdata genbruges ved bådvalg og visningsskift.
Manifestets `sampleOffset` og
`timeSampleOffset`, `profileOffset` og `timeProfileOffset` angiver hvert dataområde,
og `bundleBytes` angiver filstørrelsen.
Kildeområdet indeholder `pointCount + 1` prøver: først alle little-endian
Float32-par `[signedStationIndex, progressNm]` à otte bytes, derefter pakkede
10-bit-fartkoder. Fire fartkoder fylder fem bytes, mindst betydende bits først;
kun sidste bytes ubrugte høje bits nuludfyldes. Den sidste prøve gentager sidste kildeprøve.
Indekset er forberedt før Float32-konvertering, så CPU og GPU vælger samme station.
Negativ VMG gemmes med indeks `-stationIndex-2`; `-1` og fartkode 1023 betyder
manglende kildeprøve. Browseren afkoder dette til Float32-tripler
`[stationIndex, progressNm, vmg]` én gang før betjening.
Profilområdet indeholder pakkede 10-bit-koder pr. station: koderne 0–1022 repræsenterer
0–25 knob (`knob = kode * 25 / 1022`), og 1023 betyder manglende passage.
Hastigheder klippes til intervallet før afrunding til nærmeste kode. Kildeprøvernes
fartstørrelse bruger samme bitformat, men bevarer negativ fremdrift via indekset.
Afstanden bestemmes af indekset; positioner og tider gentages ikke i profilen.
Browseren pakker profilerne ud til Uint16-koder én gang og afkoder kun den valgte til en
genbrugt Float32-tekstur på GPU'en. Ældre profilformater afvises tydeligt.

Alle farvegrundlag pakkes med 10 bit pr. værdi. Tidsforbruget kvantiseres først
efter projektion og summering af passager. Tidsfarver bruger blokke på højst 256
værdier med én positiv little-endian Float32-skala pr. blok, efterfulgt af alle
pakkede 10-bit-koder (fire værdier i fem bytes). Koderne 0–1021 afkodes som
`kode * skala`; 1022 er positiv uendelighed og 1023 er manglende data.
Skalaen er blokkens største endelige værdi divideret med 1021, afrundet til Float32;
blokke uden positive endelige værdier bruger skala 1. Afrundingsfejlen er højst
cirka en halv skalaenhed, altså 0,049 % af blokkens maksimum. Store endelige
tidsværdier klippes ikke til et fast interval og kan ikke blive uendelighedskoden.
Tidskildeområdet har `pointCount` Float32-stationsindeks, derefter skalaer og
pakkede tidsfarver. Tidsprofilområdet indeholder skalaer og pakkede værdier pr.
station. Browseren afkoder begge til Float32 og genskaber sidste dublerede
kildeprøve. Alle tidsindekserede beregninger bruger samme resamplede tidsakse
fra bådens punkter; binærfilen indeholder ingen ekstra tidsstempler.
Tidsprøverne bruger finite-difference-retning og målt SOG; tidsforbrug er positivt
også ved baglæns sejlads. Stationsprofilen summerer alle frem- og tilbagepassager.
Spring mellem ikke-naboben på rhumblinen afbryder en passage, medmindre springet
er højst én 10-meterstation. Nære start-/målben må ikke skabe en falsk helrutepassage.
Der gennemsnittes efter dækket længde inden for hver passages 10-metercelle,
ikke efter antal observationer. I de afkodede arrays markeres manglende tidsdata
med `-1e20`, og præcis nul fremdrift med positiv uendelighed. Tidsdata bruger ikke fartkodernes
0–25-knobs-klipning. Alt forberedes server-side og vokser lineært med antal både
og kildeprøver; der gemmes ingen parvise sammenligninger.

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
