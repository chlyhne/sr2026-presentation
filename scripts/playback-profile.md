# Afspilningsprofilering, 11. november 2026

De tidligere afsnit dokumenterer forløbet frem til rastercachen. Den gældende
implementering bruger direkte GPU-tegning uden rastercache; review og plan
findes i [GPU-arkitekturen](../docs/gpu-architecture.md).

## Opsætning og metode

- Commit `5c7efe6`, lokal headless Firefox 137 på Windows, ANGLE/Intel HD Graphics.
- 106 både, standardkortudsnit, 1500 × 1000 CSS-pixel viewport, 100× afspilning.
- Sporcanvas: 1650 × 1890 pixels. Sporvindue: to timer, medmindre andet angives.
- Først instrumenterede målinger af JavaScript, DOM/layout og mutationer; derefter kontrolkørsler uden funktionsinstrumentering eller MutationObserver.
- Hvert afspilningsscenarie opvarmes i to sekunder. Kontrolkørsler måles i fem sekunder.
- Frameinterval er tiden mellem `drawMap`-kald, ikke en direkte måling af skærmens præsentation. rAF-intervaller måles separat.
- Firefox tilbyder ikke `EXT_disjoint_timer_query_webgl2` i denne opsætning. Isolerede sporprøver måler derfor kommandotid og efterfølgende `gl.finish()`-ventetid. Ventetiden omfatter GPU/driver/synkronisering, **ikke ren shader-eksekvering**. Dette sker kun i profilværktøjet, aldrig i produktionsafspilningen.
- GPU-prøver tegner ti gange pr. kombination og ser bort fra de første to tidsmålinger. Hver prøve venter på den forrige, så en voksende GPU-kø ikke forveksles med billig rendering.

## Resultater

### Reel afspilning uden funktionsinstrumentering

Vind og radar er slået fra for at isolere rendering fra netværk og vejrskift.

| Variant | Gennemsnitligt frameinterval | p95 | Gennemsnitligt rAF-interval |
| --- | ---: | ---: | ---: |
| Uændret renderer, både og spor | 128,5 ms | 152 ms | 128,5 ms |
| Uden spor, stadig bådmarkører/navne | 62,4 ms | 68 ms | 18,3 ms |
| Uden markør-/listeopdatering, stadig spor | 112,4 ms | 133 ms | 112,4 ms |
| Diagnostisk 4 i stedet for 32 underopdelinger, både og spor | 63,2 ms | 76 ms | 33,1 ms |
| Samme diagnostiske mesh, uden markør-/listeopdatering | 62,4 ms | 68 ms | 16,7 ms |

De fire underopdelinger er **kun et kontrolleret årsagsforsøg**, leveret via Playwrights svarinterception. Rendererens kildefil er ikke ændret, og forsøget er ikke en kvalitetsvalideret løsning.

### Isoleret sporarbejde

Den nominelle mesh indeholder 264 vertices pr. kildeinterval: 32 underopdelinger × 6 vertices plus 72 vertices til endekapper. Også kapper, der senere afvises af shaderen, starter som vertexarbejde.

| Sporlængde | Kildeintervaller/frame | Vertices/frame | Aflevering i JS | Ventetid til færdigt sporarbejde |
| --- | ---: | ---: | ---: | ---: |
| 15 minutter | 9.388 | 2.478.432 | 1,1 ms | 36,1 ms |
| 2 timer | 73.648 | 19.443.072 | 1,8 ms | 146,1 ms |
| Hele sporet ved ca. 12 timer | 454.031 | 119.864.184 | 0,9 ms | 669,5 ms |

Der er kun 106 draw calls pr. frame. Absolut referencefarve øger ventetiden til henholdsvis 35,8, 163,4 og 730,5 ms. Tallene er fra den instrumenterede GPU-prøve, ikke afspilningsmålingen i tabellen ovenfor.

Med fire underopdelinger, men uændrede endekapper og øvrig shader, falder to-timers-prøven til 7.070.208 vertices og 53,4 ms ventetid; med referencefarver 61,9 ms. Det peger på overdreven geometri/vertexbehandling, ikke langsom aflevering af 106 draw calls. Prøverne er sekventielle, ikke en temperatur- eller belastningskontrolleret hardwarebenchmark.

### JavaScript og layout

I den let instrumenterede kørsel uden vejr:

- `drawMap`: gennemsnitligt 46,4 ms, p95 70 ms.
- `renderTracks`: 44,1 ms inklusive markører, navne, skalering og bådliste.
- Selve `webglTracks.render`: 1,6 ms; dette er kommandotid, ikke GPU-tid.
- `getScreenCTM`: samlet 18,0 ms pr. tegning fordelt på 11 kald. Læsningerne ligger efter DOM-skrivninger og tvinger browseren til at opdatere SVG/layout.
- 41 tegninger tilføjer 41.984 noder og ændrer 46.250 attributter: cirka 1.024 tilføjede noder og 1.128 attributændringer pr. frame. Det skyldes især, at bådmarkører, skrog, titler og navne bygges forfra.
- Bådlisten opdateres også, når dens panel er lukket; `updateVisibleBoats` tager gennemsnitligt 11,3 ms inklusive sine layoutlæsninger.

Ved den faktiske afspilning mod et event kaldes `setview` og dermed `updateTimeline` for hver centrering. Målingen viser gennemsnitligt 6,7 ms i `updateTimeline` pr. kald, oven i den øvrige rendering. Det er en ekstra belastning, ikke den primære forklaring på langsom almindelig afspilning.

## Konklusion og næste rettelser

1. **Reducer unødvendigt vertexarbejde.** De korte, fælles 10-sekunders-intervaller får stadig 32 underopdelinger hver, uanset kurvatur og zoom. Brug forberedte, indekserede mesh-niveauer og vælg efter en skærmfejlgrænse, så kubiske kurver, præcis klipning og antialiasing bevares. Undgå også at sende samtlige kappevertices for interne intervaller. Et fast skift til fire underopdelinger er ikke en tilstrækkeligt valideret løsning ved nærzoom.
2. **Bevar SVG-noderne.** Opret bådmarkør/skrog/navn én gang og opdater kun nødvendige værdier. Saml kamera-/layoutlæsninger før DOM-skrivninger og undgå at opdatere uændret listelayout ved hver afspilningsframe.
3. **Undgå dobbelt planlægning og uvedkommende arbejde.** `setInterval(50)` efterfulgt af `requestAnimationFrame` giver i kontrolkørslerne cirka 62–63 ms mellem kortopdateringer, selv når browseren igen leverer rAF ved 60 Hz. Undersøg samlet rAF-baseret 20-fps-planlægning. Referencefølgning bør heller ikke gentage dyr tidslinjesynlighedsberegning ukritisk.

Den forrige rettelse fjernede attributgenbindinger, men ramte ikke de to store udgifter: unødvendigt vertexarbejde og SVG/layout-churn. Ovenstående er den oprindelige undersøgelse før cacheændringen nedenfor.

## Implementeret blokcache

Sporenes indre blokke rasteriseres nu én gang til verdensforankrede GPU-atlaser. Hver blok dækker 32 kildeintervaller; kun bevægelige endeblokke rasteriseres igen under afspilning. De øvrige blokke sammensættes som instancerede teksturquads. Den eksisterende kubiske interpolation, 4× MSAA og 2× supersampling bevares. Panorering, bådvalg og tilbagevenden til tidligere zoom genbruger cacheindhold; nye zoom-/stilvarianter opbygges ved behov og beholdes i memory.

En ekstra kildeperiode på hver side og klipning til blokkens indre tidsinterval bevarer antialiasing uden samlingskanter. Tidsdybde bevarer seneste passage ved krydsninger og korrekt handicapforskydning. Referenceændringer nulstiller rastercachen, ikke de faste spor- og profildata.

Samme lokale Firefox-opsætning, to timers spor, alle 106 både, 100× afspilning, fem sekunders kontrolkørsel uden funktionsinstrumentering:

| Variant | Gennemsnitligt frameinterval | p95 | Gennemsnitligt rAF-interval |
| --- | ---: | ---: | ---: |
| Cache, både og spor, uden vejr | 62,6 ms | 75 ms | 22,1 ms |
| Cache, uden markør-/listeopdatering | 63,0 ms | 76 ms | 17,3 ms |

- Frameinterval falder fra 128,5 til 62,6 ms, omtrent en halvering. Dette er stadig ikke stabile 20 fps.
- Gennemsnitligt cirka 3.870–4.000 kubiske kildeintervaller rasteriseres pr. frame mod tidligere 73.648: cirka 95 % mindre geometriarbejde. Cachequads tilføjer cirka 13.000 vertices pr. frame.
- Kørsel med markører havde 196 nye cachebygninger og 174.239 genbrug over 80 renderkald; næste kørsel havde ingen nye bygninger. Ingen af kørslerne allokerede flere atlasbytes efter opvarmning.
- SVG/layout og interval→rAF-planlægning er ikke ændret og er nu de oplagte næste områder. Tallene er korte lokale kontrolmålinger, ikke en hardwareuafhængig garanti.

Valideret i headless Firefox: 14 cachescenarier med 10 genbrugskontroller, billedsammenligning mod samme kubiske rasteriseringsprimitive, samlinger, krydsninger, huller, brøkdele af sekunder, baglæns søgning, haleafklipning, stilarter og referenceskift. De relevante eksisterende tests for tidslag, handicap, overflow og GPU-bindinger er også bestået. Ingen faste data uploades under afspilning; kun de små quadbeskrivelser opdateres.

## Gentag målingen

Start den lokale server med `python scripts/serve_viewer.py --port 18453`, og kør derefter:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/E1536993/AppData/Local/Temp/sr2026-test-tools/node_modules/playwright'
$env:SR_PROFILE_OUTPUT="$env:TEMP/sr2026-playback-profile.json"
node scripts/profile_viewer_playback.cjs
```

Profilværktøjet bruger kun headless Firefox og ændrer kun den isolerede browsersession. Miljøvariable:

- `SR_VIEWER_URL`: lokal URL; standard `http://127.0.0.1:18453/`.
- `SR_PROFILE_MS`: målevindue pr. afspilningsscenarie; standard 8000 ms.
- `SR_PROFILE_CASES`: kommasepareret udvalg af `normal,no-weather,no-markers,no-tracks,gpu-finish,follow-reference`. `normal` har vind, men ikke radar; de øvrige isolerer uden vejr. Hvert scenarie bruger alle både og 100× afspilning.
- `SR_PROFILE_INSTRUMENT=0`: fravælg funktionsinstrumentering og DOM-observer; behold frame-/rAF-måling.
- `SR_PROFILE_SKIP_GPU=1`: spring den isolerede GPU-prøvematrix over.
- `SR_PROFILE_OUTPUT`: gem rå målinger og browser-/GPU-oplysninger som JSON. Gem rå kørsler separat; deres oplysninger om miljø og instrumentering er nødvendige for korrekt fortolkning.

## Zoom efter ændret cacheoptagelse

Samme lokale headless Firefox på Windows med Intel HD Graphics, 106 både,
1500 × 1000 CSS-pixel viewport, standardkortudsnit og udgangspunkt ved
`D.start + 43200`. Vind og radar er slået fra. Den virkelige wheel-handler
modtager 12 zoomtrin ind og otte ud omkring kortets centrum. Tidslinjens normale
afgrænsning bevares; 14 trin giver viewport-tegning og seks ændrer tidspunkt og
giver fuld tegning. Samme instrumentering og kameraforløb bruges før og efter.

| Måling | Før (`7978624`) | Efter |
| --- | ---: | ---: |
| Hændelsesarbejde, gennemsnit | 10,55 ms | 6,35 ms |
| Tegnekald, gennemsnit | 537,30 ms | 18,05 ms |
| Tegnekald, p95 | 2046 ms | 30 ms |
| Efterfølgende GPU/driver-ventetid, gennemsnit | 153,10 ms | 28,20 ms |
| Nye rasterfelter, 20 trin | 16.264 | 0 |
| Ekstra atlaslager, 20 trin | 96 MiB | 0 |

Tegnekaldets tid er JavaScript/DOM og aflevering af GPU-kommandoer. Den separate
ventetid bruger `gl.finish()` i profilværktøjet og er ikke ren GPU-shadertid eller
en måling af skærmens præsentation. Tallene er korte lokale kontrolmålinger med
vejrlag slået fra; kameraforløbet ender delvist over land. En første eftermåling
før den sidste justering gav 23,8 ms pr. tegnekald, ligeledes uden nye rasterfelter.

Årsagen var cacheopbygning ved hver ny målestok: tusindvis af blokke blev
rasteriseret, MSAA-resolved og kopieret til atlas, selv om næste wheel-hændelse
straks gjorde målestokken uaktuel. Cachen optager nu først nye felter, når
målestokken har været uændret i 150 ms. Manglende felter tegnes med den eksisterende
kubiske geometriprimitiv, og sammenhængende intervaller samles. Der startes ingen
ekstra tegning efter zoom; næste almindelige tegning kan fylde cachen. Eksisterende
felter kan stadig bruges straks, og projektionsgrænser gemmes kun for seneste målestok.

Valideret dengang med de tidligere cachetests: 14 scenarier med
pixelkontrol af kold zoom, stabil målestok, tilbagevenden til cachede målestokke,
kurver, samlinger, tidsdybde og farvevalg. [Wheel-testen](./test_viewer_zoom.cjs)
zoomer omkring referencebåden, så spor forbliver synlige: 12 zoomtrin med 24
indskudte fulde tegninger gav nul nye felter og nul atlasallokeringer. Efter
stabilisering byggedes 1.651 felter, som næste afspilningsframe genbrugte.
Testen afviser også genberegning af sammenligninger, ændring af faste GPU-data
og udskiftning af de forberedte sporbuffere.

Gentag zoommålingen med `node scripts/profile_viewer_zoom.cjs` og den samme
`PLAYWRIGHT_MODULE`/lokale server som ovenfor.

## Direkte GPU-rendering efter arkitekturreview

Rastercachen, atlas og kompositionsshader er nu fjernet. Kurver tegnes direkte
med procedurelle vertices og et centerlinjebudget på 0,125 CSS-pixel, og kapper
tegnes særskilt. Kameraet genbruger scenens GPU-kommandooplysninger og fælles
layoutmåling. SVG-markører og signaturer bevares; kameraet flytter ikke tiden.

Samme lokale Firefox/Intel-opsætning som ovenfor: 20 zoomtrin med hele feltet,
vejrlag slået fra. Inputarbejdet faldt fra 6,35 til 0,45 ms i gennemsnit og
tegnekaldet fra 18,05 til 5,20 ms. Separat GPU/driver-ventetid var 24,95 ms mod
28,20 ms. Den nye kamerakontrakt bevarer tiden; før skete der tidsspring i seks
trin, så forløbene har samme input/kamera, men ikke helt samme tidsindhold.

Uinstrumenteret afspilning, to sekunders opvarmning og tre sekunders måling pr.
scenarie: gennemsnitligt rAF-interval uden vejr 16,76 ms (før 17,96), med vind
16,67 ms (før 18,06), ved referencefølgning 17,65 ms (før 25,86). Scenetegningens
interval er fortsat cirka 60–62 ms med den uændrede 50 ms timer.
Den direkte renderer bruger cirka 475.716 vertices og 212 draw-kald pr. frame
med 106 både og to timers spor, uden uploads af spor- eller kompositionsdata.

Review, gennemført plan, detaljerede testresultater og begrænsninger står i
[GPU-arkitekturen](../docs/gpu-architecture.md). Det tidligere diagnostiske
mesh-skift er fjernet fra profilværktøjet sammen med rastercachen.
