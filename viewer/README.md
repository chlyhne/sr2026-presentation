# Sjælland Rundt — kort til præsentation

Kør fra projektroden for at bruge alle funktioner, inklusive billed-upload og PNG med radar.
Billeder, vind og tracks ligger lokalt, så der kræves ingen internetforbindelse:

```sh
python3 scripts/serve_viewer.py
```

Åbn derefter http://127.0.0.1:8097/ .

- **Start præsentation** skjuler indstillinger. Kortet står til venstre, og det
  valgte events tekst og eventuelle billede vises i panelet til højre.
  På smalle skærme ligger eventpanelet under kortet og kan rulles.
  Dine gemte noter bruges som events i kronologisk rækkefølge, ligesom notelisten.
  Eksisterende noter sorteres ved åbning, og nye events indsættes efter deres
  tidspunkt, også hvis de oprettes senere. Forrige/Næste følger hele datoen og
  klokkeslættet, så rækkefølgen også er korrekt over midnat. Events med samme
  tidspunkt beholder deres indbyrdes rækkefølge.
  Tilstanden starter ved den senest valgte note, eller ved den første note.
  Brug **Forrige**, **Næste** eller eventlisten til at hoppe direkte mellem dem.
  Eventets tekst og tidspunkt vises i eventpanelet, også for noter uden markør.
  Gemte kortudsnit, vejrlag, vindmodel, både og bådnavne genskabes ved hvert hop.
  Tidspunktet fastholdes, også når ingen valgte både er synlige i udsnittet og
  ved zoom, panorering, ændret vinduesstørrelse eller fuld skærm. Ved flere
  noter med samme tidspunkt vises kun det valgte events annotation på kortet.
- I redigering kan du **klikke direkte på eventteksten i højrepanelet** og rette
  den dér. Klik udenfor eller tryk **Ctrl+Enter** (Cmd+Enter på Mac) for at gemme;
  **Escape** annullerer. Enter indsætter et linjeskift. Kun teksten opdateres:
  tidspunkt, kortudsnit, lag, markør, tegninger og billede bevares.
  Notelisten og eventlisten opdateres med den rettede tekst. Et billede uden
  tekst får et klikbart felt til at tilføje en billedtekst. Præsentationens tekst
  er ikke redigerbar. Hvis du allerede redigerer hele noten, opdateres den
  igangværende kladde, som gemmes med **Gem ændringer** eller kasseres med
  **Annullér redigering**. Ved en gemmefejl bliver rettelsen stående i tekstfeltet.
- Tidsslider, **Afspil** og sekundknapper vises i både redigering og præsentation.
  Tidslinjen ligger under kortet, og eventnavigationen under højrepanelet,
  side om side på én række. På smalle skærme ligger de under hver deres visning.
  Klokken ved skyderen er den aktuelle visningstid; tiden ved eventteksten er
  eventets gemte tidspunkt. Alle tider vises som **HH:MM:SS** i dansk tid.
  Gule markeringer på skyderen viser gemte events i perioder,
  hvor mindst én valgt båds aktuelle markør er i kortudsnittet. Når du trækker
  inden for cirka 1 % af skyderens bevægelige længde på hver side af en markering,
  snapper tiden til eventets præcise tidspunkt, og det pågældende event vælges.
  Tidsvinduet er 1 % af tidslinjens viste tid og følger dermed automatisk dens
  tidsomfang ved zoom og panorering. Der er ingen ekstra tidsgrænse baseret på zoom.
  Snap springer ikke over skjulte tidshuller. Resten af skyderen kan bruges frit.
  Snap ændrer ikke kortudsnit eller lag. Forrige/Næste og eventlisten genskaber
  fortsat hele eventets gemte kortvisning. Flere noter på samme tidspunkt deler
  en markering; et allerede valgt event på dette tidspunkt bevares.
  Events i tidshuller mellem bådenes passager vises ikke som snapmål. De er stadig
  tilgængelige med Forrige/Næste, eventlisten og notelisten. Et manuelt hop til
  et event i et hul gør det ikke til et snapmål, heller ikke efter zoom eller
  panorering. Snapmålene opdateres med udsnittet og de valgte både.
- I præsentationen skifter **←/→** og **Page Up/Page Down** event;
  **Home/End** hopper til første/sidste event. Mellemrum går til næste event,
  når fokus er på selve kortet eller siden. Eventlisten bruger sin normale
  tastaturbetjening. **Fuld skærm** udnytter hele skærmen, hvis browseren
  understøtter det. **Redigér** eller **Escape** vender tilbage til redigering.
  Hvis et billede er åbnet over kortet, lukker Escape først billedet.
  Præsentationen ændrer ikke dine gemte noter. Uden noter vises en forklaring
  og deaktiverede navigationsknapper, indtil du opretter events i redigeringen.
- Tidskyderen dækker 11. juni kl. 10.00 til 13. juni kl. 04.00 dansk sommertid.
- Tidslinjen følger kortudsnittet og de valgte både. Den indeholder perioder,
  hvor mindst én valgt båds aktuelle markør er i udsnittet; pauser uden både er
  fjernet fra skyderen. Events tilføjer ikke tidspunkter i disse huller.
  I præsentationen bruges hele tidsrummet, hvis ingen valgte både passerer
  udsnittet; der er ingen snapmål i denne situation. Uden synlige passager er
  skyderen deaktiveret i redigering, mens noterne stadig kan åbnes direkte.
- Tiden kan flyttes i **1-sekunds trin** med skyderen, knapperne eller piletasterne.
  Shift+piletast flytter 1 minut. Afspilning går 1 synligt minut frem pr. trin.
  Piletaster på selve skyderen og sekundknapperne snapper ikke, så du kan flytte
  tiden væk fra et event i små trin. Piletaster uden for skyderen skifter events
  i præsentationen. Et træk i skyderen pauser afspilningen.
  Klokken og PNG-filnavnet indeholder sekunder. Ved et nyt udsnit eller bådvalg
  flyttes en tid uden for de synlige perioder til nærmeste synlige tidspunkt.
  I præsentationen bevares den valgte tid ved zoom, panorering og ændret
  skærmstørrelse. Navigation og snap ændrer ikke de gemte noter.
- Mercutio, Vera, My, The Hulk og Rosa-Lux er valgt fra start; begge baners øvrige tracks kan vælges.
- Hvert event gemmer sit eget udvalg af aktive både. Ved Forrige/Næste, valg i
  eventlisten eller klik på en note genskabes netop dette udvalg, også et tomt udvalg.
  Når du står ved et gemt events tidspunkt i redigering og ændrer bådvalget,
  gemmes valget automatisk til det event. De andre events ændres ikke.
  Under fuld noteredigering følger bådvalget kladden og gemmes eller annulleres
  sammen med resten. Et nyt event husker det udvalg, der er aktivt ved oprettelsen.
  Når du udforsker et andet tidspunkt eller er ved at oprette en ny note,
  ændrer bådvalget ikke det sidst valgte event.
  Ved første åbning af denne version initialiseres alle eksisterende events én
  gang med standardbådene. **Rosa-Lux** tilføjes desuden én gang til alle eksisterende
  events uden at ændre deres øvrige bådvalg. Andre eventfelter bevares.
  Senere ændringer af udvalg nulstilles ikke ved genindlæsning.
  Snap på tidslinjen ændrer hverken det aktive bådvalg eller gemte bådvalg.
- Mercutio tegnes altid efter de øvrige både, så spor, prik og navn ligger øverst
  ved overlap. Det gælder også Mercutios fartmærker, præsentation og PNG-eksport.
- Alle både har hver sin faste farve i listen, bådnavnet og positionsmarkøren.
  Farven ændres ikke, når andre både vælges til eller fra. De fire oprindelige
  standardbådes farver er bevaret.
- **Sporfarven viser bådfarten over grunden (SOG)** fra TracTracs fartfelt med
  en jet-farveskala fra 0 til 15 knob. Farven mættes ved 15 knob. Kortets farvebjælke
  viser 0, 5, 10 og 15+ knob og følger med i præsentationen og PNG-billedet.
  Gråt spor betyder manglende fartdata. Sporene har en mørk kant mod vejrkortets farver.
- Klik på en båds bådikon for at vise eller skjule navnet. Det gælder alle
  både. Tab og Enter/mellemrum kan også bruges. Navnevalget bevares ved zoom,
  tidsskift og til-/fravalg af både, gemmes med noter og kommer med i PNG-billedet.
  De fem standardbådes navne er vist fra start. At trække fra et bådikon flytter kortet.
  Alle eksisterende events får én gang vist navnene på deres aktive både.
  Bådudvalgene ændres ikke, og senere manuelle navneskjul bevares ved genindlæsning.
- Klik på et sted på et spor i redigering for at vise farten i knob
  som et mærke ved punktet, uden bådnavn. Mærket har bådens farve.
  Der klikkes på den glatte PCHIP-kurve, også mellem
  kildepunkterne. Farten kommer fra TracTracs oprindelige SOG-felt og interpoleres
  lineært mellem de to tilhørende kildetider; den beregnes ikke fra positionsændringer
  eller den afrundede jet-farve. Tal over 15 knob vises med deres faktiske værdi.
  Manglende fartdata vises som **Fart mangler** og kan ikke pinnes.
- **Pin** ved fartmærket gemmer punktet. Et pinnet mærke vises i både redigering
  og præsentation, når båden er valgt, punktets tid ligger i det viste to-timersspor,
  og selve punktet er i kortudsnittet. Det behøver ikke være bådens aktuelle position.
  Det skjules automatisk uden for perioden, ved fravalg af båden og uden for udsnittet.
  Klik på et pinnet mærke i redigering, og vælg **Fjern pin** for at fjerne det.
  Klik på tomt kort eller tryk Escape for at lukke et midlertidigt fartmærke;
  pinnede mærker bevares. Et træk fra sporet panorerer stadig kortet.
  Pin-knapperne kan også betjenes med Tab og Enter/mellemrum.
  Midlertidige mærker vises kun under redigering. Præsentationen viser kun pins.
  Synlige fartmærker kommer med på PNG-billedet; Pin/Fjern pin-knapperne gør ikke.

Fart-pins gemmes separat i browserens `sr2026-speed-pins` som `id`, `boatId` og
præcis tracktid i sekunder. De bevares ved genindlæsning og deles mellem events,
uden at ændre noterne. Position og fart slås op i det uændrede track ved visning.
Pins er lokale for browseren; den eksisterende note-JSON eksporterer noter og billeder.
`node scripts/test_viewer_speed_pins.cjs` kontrollerer valg af kurvepunkt, fart,
pin/unpin, genindlæsning, perioder og udsnit, panorering, præsentation og PNG i
Chromium og Firefox.

- Zoom og træk kortet. Alle både har samme faste sporbredde på skærmen:
  2,7 pixels farve med 4,7 pixels mørk kant. Det gælder ved alle zoomniveauer,
  også når en båd vælges til efter zoom. Der er ingen særlig bredde for standardbådene.
  Bådnavne, stednavne, vindtal og vindpile har fast skærmstørrelse.
  Mindste kortbredde er 0,05 kortenheder, så der kan zoomes
  yderligere 30 gange ind. Tidslinjen bruger hele den faktisk synlige kortflade.
- Vindpilene ligger i et kvadratisk gitter med 90 skærmpixels mellem centrene,
  uanset zoom. Gitteret opdateres ved zoom, panorering og ændret vinduesstørrelse.
  Pilene interpolerer vinden ved gitterets geografiske placeringer.
- **Trafikseparering · TSS** viser skillezoner med lilla skravering, skillelinjer
  med fuldt optrukne lilla linjer, grænser med stiplede linjer og trafikretning med
  store, åbne lilla pile. Laget er slået til fra start og kan skjules før en eksport.
  Valget gemmes med noter. Pile og skravering har fast skærmstørrelse ved zoom.
- **Skydeområde · Hatter Barn** viser polygonen fra dine syv hjørnekoordinater med
  sort kant og skravering. Laget kan vælges uafhængigt af TSS, gemmes med noter
  og følger med på PNG-billedet. Skraveringen har samme faste størrelse som TSS.
  Kyst, trafikseparering, skydeområde og Rute T ligger samlet i landkortets SVG-lag
  `baseMap`, over vindfarver, landfyld og radarbyger, men under vindpile og bådspor,
  også ved PNG-eksport. Landfyldet er et separat lag under radaren.
- **Rute T** tegnes som en åben, sort linje gennem brugerens 11 koordinater i
  den angivne rækkefølge. Linjen har fast stregbredde ved zoom og følger med i
  PNG-billedet. Koordinater og kildeoplysninger ligger i `../data/route-t.geojson`;
  decimalminutterne er bevaret i metadata. Linjen markerer den Rute T, der ifølge
  brugerens sejladsbestemmelser ikke måtte krydses.
- **Start og mål** er indtegnet fra TracTrac event 3539 og markeret med tekst og
  endepunkter. Startlinjen er grøn; mållinjen er rød og stiplet. Begge linjer
  ligger i `baseMap`, over radaren og under vindpile og bådspor, og kommer med
  i PNG-billedet. Stregbredde, endepunkter og tekst har fast størrelse ved zoom.
  De to replaybaner har samme linjer og tegnes derfor kun én gang.

Mållinjen bruger de statiske banepunkter **Helsingør Mål Mole**
`12.618503 E, 56.043069 N` og **Helsingør Mål Bøje** `12.622832 E, 56.044775 N`.
Startlinjens punkter **Start A** og **Start B** har tidsbestemte positioner i
TracTracs kontrol-replay. Kortet viser et fast udsnit af linjen ved Mercutios
klassestart 11. juni kl. **10:30:00 dansk sommertid** (08:30:00 UTC).
Der bruges den seneste kildeposition ved eller før start:
`12.615764 E, 56.052284 N` og `12.607778 E, 56.048291 N`.
Dette fastholder startlinjen, når et endepunkt senere i replayet flyttes mod havnen.

Kilde-ID'er, koordinater og kildetidspunkter ligger i `../data/course-lines.geojson`.
De fulde kontrolpositioner fra begge replays bevares i
`../data/tractrac/controls_groensund.json` og `controls_boegestroemmen.json`.
Målkoordinaterne kommer fra de eksisterende `race_*.json`-filer; Mercutios
starttid fra klasselisten i `races.json`. Genskab med
`node scripts/collect_course_lines.mjs`, `python3 scripts/prepare_course_lines.py`
og `python3 scripts/prepare_viewer.py` i den rækkefølge. Indsamlingen genbruger
TracTracs egen cachede MTB-worker. Begge baners koordinater sammenlignes før
linjerne sammenlægges; der afrundes ikke.

- Kun valgte både tegnes, med alle datapunkter fra de seneste to timer frem til
  den valgte tid. Bådmarkørerne følger en glat interpolation ved skyderens præcise
  tidspunkt. Sporene tegnes som SVG-kurver gennem målepunkterne og forbliver glatte
  ved alle zoomniveauer. Punkterne findes med binær søgning, så resten af tracket
  ikke gennemløbes ved hver opdatering.
- **Gem kort som PNG** downloader præcis det aktuelle kortudsnit i dobbelt
  skærmopløsning. Kun kortet kommer med, inklusive synlige annotationer, både,
  stednavne, vind og radar. Sidepanel og tidslinje kommer ikke med. Filnavnet
  indeholder kortets dato og klokkeslæt i dansk sommertid. Afspilning pauses,
  og den valgte radar indlæses færdig før billedet dannes.
- Skriv en hændelse, tryk **Placér på kortet**, og klik hvor den skete.
  Noten bliver en nummereret markør på kortet. Teksten vises i højrepanelet,
  som også er synligt under redigering. Zoom og træk kan stadig
  bruges under placering; **Annullér** eller Escape afbryder placeringen.
- Annotationer vises ved deres gemte tidspunkt. Klik på en note i listen for at
  genskabe tidspunkt, zoom, kortudsnit, vindmodel, vejrlag og valgte både.
  **Vis annotationer ved dette tidspunkt** kan skjule dem før en eksport.
  **Slet** fjerner noten. Eksisterende noter fra den tidligere version bevares.
- **Gem tidspunkt uden markør** opretter et bogmærke med tekst og kortindstillinger.
- **Redigér** ved en note åbner dens tekst, markør og tegninger. Du kan også klikke
  på notens markør på kortet. **Flyt / tilføj markør** ændrer placeringen.
  **Gem ændringer** opdaterer den eksisterende note, inklusive det aktuelle
  kortudsnit og lag; notens tidspunkt og plads i eventrækkefølgen bevares.
  **Annullér redigering** kasserer ændringerne og genskaber den gemte note.
  Tidsstyringen pauses under redigering. Gem eller annullér, før du skifter note
  eller starter præsentationen.
- Under redigering kan du vælge **Frihånd**, **Pil**, **Linje** eller **Cirkel**,
  farve og stregbredde. Træk på kortet for at tegne. En cirkel trækkes fra centrum
  til kanten. **Flyt kortet** skifter tilbage til panorering; musehjulet kan stadig
  zoome. Escape stopper værktøjet og kasserer en igangværende streg.
  **Fortryd sidste streg** fjerner seneste tegning; **Ryd tegninger** tømmer notens
  tegninger. Begge dele kan kasseres med **Annullér redigering**.
  Tegningerne gemmes først med **Gem ændringer**, følger geografien ved zoom og
  panorering og har fast stregbredde på skærmen. De følger annotationernes
  synlighed og vises kun for det aktive event i præsentationen, også når flere
  events har samme tidspunkt. Noter uden markør kan også have tegninger.
  Synlige tegninger følger med på PNG-billedet og i noteeksporten.
- **Billede til event** vedhæfter et JPEG-, PNG-, WebP- eller GIF-billede til en
  ny eller eksisterende note. Tekst er valgfri, så et billede kan være et selvstændigt
  event. Klik **Gem event** eller **Gem ændringer** for at gemme eventet.
  **Fjern billede** fjerner vedhæftningen; ændringer i en eksisterende note kan
  kasseres med **Annullér redigering**. Billedet vises i højrepanelet og følger
  det valgte event ved navigation.
- **YouTube-video til event** vedhæfter en video via et YouTube-link. Almindelige
  videolinks, `youtu.be`, Shorts, live-links og embed-links accepteres. Et link
  med starttid, fx `?t=1m30s`, starter videoen ved det valgte tidspunkt.
  Videoen kan være et selvstændigt event uden tekst og kan kombineres med et billede.
  Klik **Gem event** eller **Gem ændringer**; **Fjern video** fjerner vedhæftningen,
  og **Annullér redigering** genskaber det gemte link.
  Højrepanelet viser et miniaturebillede med en afspilningsknap i begge tilstande.
  Et klik åbner afspilleren i fuld skærm og starter videoen. **Luk video** eller
  Escape lukker afspilleren og stopper lyden. Hvis præsentationen allerede er i
  fuld skærm, forbliver den der bagefter. Når browserens fuldskærmsfunktion ikke
  er tilgængelig, fylder afspilleren hele browservinduet.
  Eventnavigation og snapping åbner ikke videoen automatisk. Kortets tid,
  udsnit og bådvalg bevares, når videoen åbnes eller lukkes.
- Når du vælger et billed-event med **Forrige/Næste**, piletasterne, eventlisten
  eller notelisten, vises billedet automatisk over kortet. Det gælder i begge
  tilstande. Et snap til eventet på tidslinjen åbner kun billedet i højrepanelet.
  Klik på billedet over kortet for at vise kortet igen; klik på billedet i panelet
  for at åbne det over kortet. Enter/mellemrum kan også bruges på billederne.
  Escape lukker et åbent billede før det eventuelt forlader præsentationen.
  Et lukket billede åbner ikke igen ved almindelig opdatering, zoom eller ændret
  vinduesstørrelse. Et nyt manuelt eventvalg åbner det igen. Tidsslideren,
  tidsknapperne og skift til et event uden billede lukker billedet over kortet.
  Billedet dækker kun kortfladen, så tekstpanelet og navigationen stadig kan bruges.
  Kortets udsnit, tid og lag ændres ikke af at åbne eller lukke billedet.
  Langsomme billedsvar kan ikke genåbne et tidligere event efter et skift.
  **Redigér** ved selve noten lukker billedet, så kortet kan bruges til markører
  og tegninger. Kortets PNG gemmer fortsat selve kortet med markører og tegninger;
  billedvisningen og eventpanelet er separate.

Billeder uploades via `POST /api/event-images` og gemmes på serverens disk i
`../data/event-images/`. De servergenererede adresser `/event-images/<uuid>.webp`
gemmes sammen med noten og virker fra andre browsere med adgang til serveren.
Selve noterne gemmes fortsat i den browser, hvor de oprettes.
YouTube-videoer gemmes som links sammen med noterne; selve videoen afspilles fra
YouTube. Afspilleren oprettes først ved klik og fjernes helt ved lukning.
Embedparametrene følger [YouTubes dokumentation](https://developers.google.com/youtube/player_parameters).
Browseren tilpasser billeder til højst 2048 pixels på den længste side og gemmer
dem som WebP. GIF vises som et stillbillede. Serveren accepterer højst 16 MB pr. upload.
Uploadede filer bliver liggende på serveren, også hvis en vedhæftning fjernes
eller redigeringen annulleres; andre gemte noter eller eksporter kan bruge filen.
Noterne opdateres først, når billed-upload og gemning er lykkedes.
- **Eksportér noter** gemmer en JSON-fil med UTC-tid og tekst. Browsernoter er lokale;
  eksportér dem for at bevare dem uafhængigt af browseren. JSON indeholder også
  markørens kortkoordinater og længde-/breddegrad samt kortindstillinger.
  Noter med tegninger indeholder desuden `drawings`: en liste med `tool`
  (`pen`, `arrow`, `line`, `circle`), `colour` (hex), `width` (skærmpixels) og
  `points` (samme geografiske SVG-kortkoordinater som notens `point`). Ældre noter
  uden `drawings` fungerer fortsat. Browserens gemmenøgle er stadig `sr2026-notes`.
  Billed-events har `image` med serverens `id` og `url`, filnavn og dimensioner.
  Eksporten indeholder også billedets bytes som `image.dataUrl`, så filen er en
  selvstændig sikkerhedskopi af noter og billeder. Serverhenvisningerne og
  browserens gemte noter ændres ikke af eksporten.
  Video-events indeholder `video` med `provider: "youtube"`, videoens `id`,
  starttid i sekunder (`start`) og et normaliseret YouTube-link (`url`).
  Disse felter følger med i JSON-eksporten.

Redigering, tegneværktøjer, annullering, genindlæsning, præsentation samt PNG- og
JSON-eksport er afprøvet i Chromium og Firefox. Testen kan gentages mod den lokale
server med `node scripts/test_viewer_notes.cjs` fra projektroden; den kræver
Playwright, som også kan angives med `PLAYWRIGHT_MODULE`.
YouTube-funktionen testes med `node scripts/test_viewer_event_videos.cjs` i begge
browsere. Testen erstatter YouTubes eksterne afspiller med en testside og kontrollerer
linkvalidering, gemning, genindlæsning, redigering, fuld skærm, lukning, mobilvisning
og eksport; selve YouTubes videoafspilning afhænger af tjenesten og netadgang.

## Datagrundlag

Vind: DMI HARMONIE (ca. 2 km) og ECMWF IFS (ca. 9 km) fra prognosearkiver,
samt Copernicus ERA5 (0,25°) fra reanalyse, leveret via Open-Meteo.
DMI er valgt ved åbning; modellen kan ændres i menuen. Hver model er forespurgt
ved 247 punkter i 0,25° trin med `cell_selection=nearest` og `elevation=nan`.
Det er en sampling af de oprindelige modelgitre. De returnerede gitterkoordinater
bruges i kortet. Vindfelterne har timeopløsning i UTC.

Vindens baggrundsfarver og grænser i m/s følger DMI’s aktuelle vindkort:
https://www.dmi.dk/vejrkort . Skalaen er aflæst fra DMI’s offentlige
`ReactBundle/index.bundle.js` den 7. november 2026 (vindlagets `legend`).
Den komplette skala fra 0 til 50+ m/s ligger i `weather.js`.
Første blå er `#6dbff2` ved 8 ≤ vind < 10 m/s; derefter `#3dabee`
ved 10–12 og `#008fe9` ved 12–14 m/s. Gul begynder ved 14 m/s.

Baggrunden interpolerer vindens øst- og nordkomponenter med invers
afstandsvægtning mellem de fire nærmeste samplingpunkter til et 200 × 236
billedgitter. Vindstyrken beregnes fra den resulterende vektor, ligesom ved pilene,
og farven vælges derefter med de faste intervalgrænser. Det er kun en visuel interpolation,
ikke flere observationer eller højere meteorologisk opløsning. Områder mere end
ca. 0,3 breddegrader fra nærmeste punkt farves ikke. Baggrunden ligger under
radaren, kystlinjen og sporene.

Vindpilene bruger de fire nærmeste gyldige modelpunkter med samme afstandsvægtning.
Øst- og nordkomponenterne interpoleres hver for sig, så retninger omkring
0°/360° behandles korrekt. Pilens retning og styrke beregnes fra den resulterende
vektor. Præcis ved et modelpunkt bruges dets uændrede vind. Vindstød interpoleres
separat som en skalar; manglende værdier udelades. Vindstille vises som en prik.
Uden for kortets datadækning og ved større huller tegnes ingen pile. Interpolationen
tilføjer ingen nye observationer eller meteorologisk detalje. Både pile, valgfrie
vindtalsmærker og værktøjstips beskriver de interpolerede værdier.

Slå **Vis tal for vind / vindstød** til for tal, begge i m/s. Pilene viser den almindelige
vindstyrke og retning, ikke stødenes styrke. Seneste hele time vises uden
tidsinterpolation; kilde og gyldighedstid står under tidslinjen. Vindstød vises
som en selvstændig modelparameter og erstatter ikke almindelig vindstyrke.

Prognosearkiver er sammenstykkede korte prognosehorisonter fra flere kørsler,
ikke én bestemt prognose fra før start. Modeller kan afvige fra lokale forhold.
Kontrollen af vindstyrken 12. juni er beskrevet i `../research/vindkontrol.md`.
Kilder: https://open-meteo.com/en/docs/historical-weather-api ,
https://open-meteo.com/en/docs/historical-forecast-api ,
https://open-meteo.com/en/docs/dmi-api . Open-Meteo: CC BY 4.0.

Radar: observerede DMI-kompositter fra `radardata/collections/composite`.
Der er 253 fullRange-billeder, ét for hvert 10-minutters trin. Kildens pixels er
500 m. De originale ODIM HDF5-filer ligger i `../data/radar/`.
Ved sekundtrin bruges radarbilledet for det seneste nominelle 10-minutters
tidspunkt; radarens eget tidspunkt står ved laget. Vindfeltet følger fortsat
seneste hele time. Der opfindes ingen nye vejrbilleder mellem kildetidspunkterne.

Radaren vises i **dBZ (ekkostyrke)**. Det er observationer af radarreflektivitet,
ikke modelnedbør eller en direkte måling af nedbør ved havoverfladen. Stærkere
nedbør giver typisk stærkere ekkoer; andre ekkoer og fejl kan også forekomme.
Vi omregner ikke til mm/time, da det ville kræve en usikker empirisk relation.
Radaren har en selvstændig rød–pink–violet skala for stigende ekkostyrke,
med grænser ved 0, 10, 20, 30, 40, 50 og 60 dBZ. Farverne er egne farver,
ikke DMI’s regnskala. De præcise farver ligger i `weather.js` og
`../scripts/prepare_radar.py`; farveskemaet versionsgemmes i radarens metadata,
så billedcachen bliver genfarvet efter en ændring. Radarens gennemsigtighed
styres separat i siden og følger med i PNG-billedet.

Ekkoer under 0 dBZ og kildens `undetect` er gennemsigtige. Manglende radardata
vises gråt. Hele manglende billeder skjules og markeres; et tidligere billede
bruges ikke som erstatning.

Geografisk placering: kildens stereografiske projektion transformeres til kortets
EPSG:4326-billedudstrækning (9,5–14 E / 54–57 N), med nærmeste nabopixel. Pixelcentre
udledes af UL-hjørnet og 500 m-afstanden. Der bruges ingen tidsinterpolation.
`radar/manifest.json` bevarer billedets nominelle tid, faktiske scanningstid,
kilde-ID, gain/offset, nodata/undetect og geografisk udstrækning.
Radarlaget følger altid DMI, også hvis vindmodellen ændres.
Kilde: https://www.dmi.dk/friedata/dokumentation/radar-data .

Genskab radarlaget først med `.venv/bin/python scripts/prepare_radar.py`, derefter
`python3 scripts/prepare_viewer.py`. Pakker til radarværktøjet står
i `../scripts/requirements-radar.txt`.

Tracks: TracTrac event 3539, SR Grønsund og SR Bøgestrømmen. Den fulde udgave er
bevaret i `../data/tractrac/combined_tracks.json`. Visningen indeholder alle 730.370
trackpunkter fra dette datasæt med uændrede koordinater og tidspræcision. Der er
ingen decimering eller forenkling af sporene. Tidsstempler omregnes fra millisekunder
til sekunder uden afrunding. Visningen interpolerer længde- og breddegrad hver
for sig med formbevarende kubisk Hermite-interpolation (PCHIP) i kildens tid.
Kurven går gennem alle målepunkter og holder sig inden for hvert nabopars
koordinatgrænser. Den samme kurve bruges til spor, positionsprik og beregning af,
hvornår båden er inde i kortudsnittet. Også passager mellem to målepunkter tæller
med på tidslinjen, selv når ingen af de to målepunkter ligger i udsnittet.

SVG renderer kurverne i den aktuelle skærmopløsning ved alle zoomniveauer; der
bruges ingen fast opløsning af ekstra punkter. Begge ender af to-timerssporet
afskæres ved de præcise tidspunkter på kurven. Interpolationen ændrer ikke
kildedata eller tilføjer observationer. Metode:
https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html .

Farten kommer fra MTB-positionernes oprindelige `speed`-felt, genudtrukket med
TracTracs egen worker. Råposterne ligger i `../data/tractrac/speeds_groensund.json`
og `speeds_boegestroemmen.json`. Hver fartværdi matches på præcis båd-ID,
længdegrad, breddegrad og millisekundtidspunkt til det eksisterende datasæt.
Alle 730.370 positioner har en gyldig fartværdi; gentagne kildeposter har samme
fart. Fart i km/t divideres med 1,852 til knob. Enheden er kontrolleret i
TracTracs `formatSpeed`/`Kts`-kode:
https://live.tractrac.com/viewer/app.CuZgOaCm.js .

Fartværdierne ligger i hver båds `speeds`-array, parallelt med `points`.
Der bruges ingen finite differences eller afledte af den interpolerede position
til farvelægningen. Kildens fart interpoleres lineært mellem kildetidspunkterne;
den oprindelige PCHIP-kurve opdeles ved jet-skalaens 128 farvetrin uden at ændre
geometrien. Der farves ikke hen over trackhuller på mere end fem minutter.
Manglende eller negative fartværdier vises gråt og erstattes ikke med nul.
Farver over 15 knob mættes uden at ændre eller afskære selve fartdataene.

Genskab fartdata med `node scripts/collect_track_speeds.mjs` og derefter
`python3 scripts/prepare_viewer.py`. Det første trin bruger den cachede
`worker_node.mjs` og de to løbsmetadatafiler til at hente replayet igen.
`node scripts/test_viewer_speed.cjs` kontrollerer alle kildekonverteringer samt
farveskala, mætning, kurvegeometri, trackhuller, bådfarver, præsentation og
PNG-eksport i Chromium og Firefox (kræver Playwright).

Trackhuller over fem minutter forbindes ikke med en linje; bådmarkører skjules,
når sidste position er mere end fem minutter gammel. Trackstart/-slut er ikke
nødvendigvis løbsstart/målgang.

Kystlinjen bruger nu **OpenStreetMap** i fuld kildeopløsning: 3.114 kyststrækninger
med 343.655 koordinater. Der er ingen geometrisk forenkling. Det tidligere
Natural Earth 1:10m var et generaliseret oversigtskort. OSM-udtrækket viser også
små kystdetaljer og havnebassiner, som manglede i oversigtskortet. Kortlaget fokuserer på kyster og havnebassiner.

Landmasserne fyldes med lys grå `#bdc7cb`; kyststregen bevarer `#365766`.
De 997 landpolygoner er dannet fra samme detaljerede OSM-kystlinje. Lagrækkefølgen
er vindfarver nederst, derefter landfyld, radar og kystomrids. Vindpile og spor
ligger over disse lag. Rækkefølgen gælder også ved PNG-eksport.
Kystlinjerne samles til flader
inden for udtrækkets geografiske grænse, og land/hav bestemmes af OSM-linjernes
retning (land til venstre). Der lukkes ikke med vilkårlige streger gennem havet.
Datagrundlaget forenkles ikke; øer og havnebassiner følger den eksisterende kyst.
Landlaget følger med i PNG. Det afledte datasæt er `../data/land-osm.geojson`.
Genskab med `.venv/bin/python scripts/prepare_land.py` og derefter
`python3 scripts/prepare_viewer.py`. Shapely står i `scripts/requirements-geography.txt`.

Kilden er OSM’s `natural=coastline`, hentet 7. november 2026 med Overpass.
Det regionale udtræk dækker 9,3–14,2 E / 53,8–57,2 N. Hele de udvalgte kystvejes
geometrier er bevaret. Råsvaret ligger i `../data/geography/osm-coastline.json`,
og GeoJSON med kilde-/licensmetadata i `../data/coastline-osm.geojson`.
Data gemmes lokalt; kort og PNG fungerer uden netforbindelse.

Visningen opdeler kysten i bidder med fælles endepunkter og tegner kun dem,
der rammer det synlige udsnit. Det holder tæt zoom og PNG-eksport hurtige uden
at fjerne kildens detaljer. Kreditering følger med på kortet og i PNG-billedet:
© OpenStreetMap contributors · https://www.openstreetmap.org/copyright .
Det afledte kystdatasæt er tilgængeligt under ODbL-1.0:
https://opendatacommons.org/licenses/odbl/1-0/ .

Genskab kystdatasættet med `python3 scripts/prepare_coastline.py` og derefter
`python3 scripts/prepare_viewer.py`. Første kommando genbruger det cachede råsvar.
Et allerede hentet Overpass-svar kan indlæses med `--source <fil>`.

## Genskab data

Skydeområdets polygon er **Hatter Barn skydeområde**, indtegnet efter brugerens
syv hjørnekoordinater modtaget 7. november 2026. De oprindelige koordinater
bevares i `../data/geography/hatter-barn-coordinates.json`, med decimalminutter
gemt som strenge.
Koordinaterne omregnes til decimalgrader uden afrunding og i samme rækkefølge.
`10° 60.000′ E` normaliseres til `11° 00.000′ E`. Første hjørne gentages som
ottende koordinat for at lukke polygonen. Grænsen tegnes med sort streg og
skravering, og følger med i PNG samt noter med gemte lagindstillinger.

Den genererede GeoJSON med kildekoordinater og metadata ligger i
`../data/military-areas.geojson`. Kilden er brugerens koordinater; ingen officiel
områdekode er tilknyttet. Laget indeholder ingen oplysninger om aktivering
eller skydetider under sejladsen.

Genskab med `python3 scripts/prepare_military.py` og derefter
`python3 scripts/prepare_viewer.py`. `--source <fil>` kan indlæse en anden
JSON-fil i samme format som kildefilen.

Trafiksepareringslaget er et lokalt OpenSeaMap/OpenStreetMap-udtræk med 78
geografiske objekter: 9 skillezoner, 10 skillelinjer, 25 grænser, 33 retningsforløb
og 1 trafikrundkørsel. Overpass-forespørgslen bruger den historiske database pr.
13. juni 2026 kl. 02.00 UTC, så laget svarer til præsentationens periode.
Kildens base-tidsstempel for serverens aktuelle database gemmes separat fra
det historiske tidspunkt, der er angivet i forespørgslen.

Alle koordinater og retningsforløbenes nodeorden er bevaret. Kun kildeobjekter
af typen `separation_zone` fyldes med skravering. Der opfindes ingen arealgrænser
omkring skillelinjer. Pilenes retning følger de registrerede `separation_lane`-veje:
https://wiki.openstreetmap.org/wiki/Tag:seamark:type=separation_lane .
En overordnet TSS-relation tegnes gennem de allerede medtagne medlemmer og
duplikeres ikke som en ekstra zone. Kysttrafikzoner og forsigtighedsområder er
udeladt fra dette lag. Data beskriver OSM’s registreringer af systemerne.

Råsvaret ligger i `../data/geography/osm-tss.json`; GeoJSON, forespørgsel,
historisk tidspunkt og licensmetadata ligger i `../data/traffic-separation.geojson`.
Genskab med `python3 scripts/prepare_tss.py` og derefter
`python3 scripts/prepare_viewer.py`. Et eksisterende Overpass-svar kan indlæses
med `--source <fil>`. Også TSS-data er lokale, under ODbL-1.0, og krediteringen
følger kortet og PNG-billederne.

Fra projektroden: `python3 scripts/prepare_viewer.py` (kræver `requests`).
Udtræk cachelagres. Manglende radartider findes i `radar/manifest.json` og vises som
manglende i brugerfladen. Visningen kræver ingen npm-pakker.

## Onlineudgaven

Se projektrodens README og docs/hosting.md. Eksporten er nu et objekt med `version`, `notes` og `speedPins`; billeder indlejres stadig i de enkelte noter. Import accepterer også ældre eksportfiler, der kun indeholder en liste af noter.

## Bådikoner og mål

Positionsmarkørerne bruger skroget fra `modern.svg`, kopieret fra
`random simuleringer/cuteboat.svg`. Metadata i `boat-icons.js` angiver Vera, My,
Mercutio og saltamalin som 8 × 2,54 meter. THE HULK er 10,3 × 3,18 meter,
Rosa-Lux 10 × 3 meter, Alice 8 × 2,51 meter og Moster 7,77 × 2,5 meter.
Alle øvrige både har foreløbige mål
på 10 × 3 meter (`estimated: true`). Hver båd har et `metadata`-felt med
`lengthM`, `beamM` og `hull`. `hull` er `modern` som standard; Slipstik og Ambra
bruger `classic.svg` og måler begge 10 × 2,3 meter. Begge SVG-filer ligger i
`viewer/` og indlæses direkte, så skrogtegningerne kan redigeres der.
Ret navneopslagene i `boatMetadataOverrides`, når mål eller skrogform ændres.

Ikoner følger bevægelsesretningen langs tracket. Bredden er mindst 8
skærmpixels. Når den geografiske bredde bliver større end det, vises både
længde og bredde i korrekt skala under hensyn til kortets projektion og
bådens breddegrad. Kortet kan zoomes tæt nok på til at vise denne forskel.
Navne har fortsat fast skriftstørrelse; farver, klik, præsentation og PNG bevares.
