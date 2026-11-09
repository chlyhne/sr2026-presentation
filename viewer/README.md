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
  **Forrige** og eventlisten hopper direkte. I præsentationsmode afspiller
  **Næste** frem til næste event med den valgte afspilningshastighed og stopper
  præcist ved eventets tidspunkt. Tryk **Næste** igen undervejs for at springe
  direkte frem. Ved ankomst indlæses hele eventets gemte opsætning: kortudsnit,
  lag, vindmodel, både, bådnavne, annotationer og eventuelt billede.
  Er almindelig **Afspil** allerede i gang mellem events, springer **Næste**
  direkte til det næste kommende event. Events med samme tidspunkt skifter
  direkte. I redigering hopper **Næste** fortsat direkte.
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
  Med almindelig **Afspil** vælges det senest passerede event, også når et hurtigt tidsstep
  springer over eventets præcise sekund. Afspilningen fortsætter uden pause eller
  ændring af hastighed. Hurtige træk i skyderen vælger også passerede events,
  både fremad og bagud, selv når trækket ender uden for snapvinduet.
  Tidsvinduet er 1 % af tidslinjens viste tid og følger dermed automatisk dens
  tidsomfang ved zoom og panorering. Der er ingen ekstra tidsgrænse baseret på zoom.
  Snap springer ikke over skjulte tidshuller. Resten af skyderen kan bruges frit.
  Snap ændrer ikke kortudsnit eller lag. Direkte hop med Forrige/Næste og eventlisten
  genskaber hele eventets gemte kortvisning. Flere noter på samme tidspunkt deler
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
  Fremad med **→**, **↓**, **Page Down** eller mellemrum følger samme regler som
  **Næste**. Afspilning frem til et bestemt event følger tiden, også uden synlige
  både undervejs. Kortet følger Mercutio i midten med uændret zoomniveau, også
  når båden ikke er valgt. Uden en aktuel position flyttes kortet ikke.
  Ved ankomst stopper afspilningen uden at ændre det fulgte udsnit; eventets
  øvrige indstillinger og eventuelle billede gendannes. Et ekstra tryk på Næste
  undervejs hopper direkte til eventet med dets gemte udsnit.
  Zoom afbryder ikke forløbet;
  panorering centreres igen på Mercutio ved næste opdatering. Brug tidsskyderen,
  Forrige, eventlisten eller Pause for at afbryde det. **Afspil** alene ændrer
  aldrig kortets opsætning ved passage af et event og åbner ikke billeder over
  kortet; snap på tidslinjen bevarer også den aktuelle opsætning.
  `node scripts/test_viewer_next_event_playback.cjs` kontrollerer forskellen på
  de to afspilningsformer, hastighed, ekstra klik, ankomst og gemte indstillinger
  i lokal Firefox på PC, inklusive den offentlige præsentationsmode.
- Tidskyderen dækker 11. juni kl. 10.00 til 13. juni kl. 04.00 dansk sommertid.
- Tidslinjen følger kortudsnittet og de valgte både. Den indeholder perioder,
  hvor mindst én valgt båds aktuelle markør er i udsnittet; pauser uden både er
  fjernet fra skyderen. Events tilføjer ikke tidspunkter i disse huller.
  I præsentationen bruges hele tidsrummet, hvis ingen valgte både passerer
  udsnittet; der er ingen snapmål i denne situation. Uden synlige passager er
  skyderen deaktiveret i redigering, mens noterne stadig kan åbnes direkte.
- Tiden kan flyttes i **1-sekunds trin** med skyderen, knapperne eller piletasterne.
  Shift+piletast flytter 1 minut. Afspilning opdaterer 20 gange pr. sekund og kan køre med 1×, 2×, 5×, 10×,
  20×, 100×, 200× eller 400×. Ved 1× svarer ét sekund til ét sekund i sejladsen.
  Bådpositionerne interpoleres også mellem hele sekunder under afspilning.
  Piletaster på selve skyderen og sekundknapperne snapper ikke, så du kan flytte
  tiden væk fra et event i små trin. Piletaster uden for skyderen skifter events
  i præsentationen. Et træk i skyderen pauser afspilningen.
  Musehjulet over skyderen flytter ét sekund; Shift+musehjul flytter ét minut.
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
- Sporenes lag følger tiden langs kurven: den nyeste passage ligger øverst,
  også ved selvkrydsninger. To både kan derfor skifte mellem at være over og
  under hinanden ved forskellige krydsninger. Mercutios bådikon, navn og
  fartmærker har fortsat deres egen forreste placering over sporene.
- Alle både har hver sin faste farve i listen, bådnavnet og positionsmarkøren.
  Farven ændres ikke, når andre både vælges til eller fra. De fire oprindelige
  standardbådes farver er bevaret.
- **Sporfarven viser bådfarten over grunden (SOG)** fra TracTracs fartfelt med
  en jet-farveskala fra 0 til 15 knob. Farven mættes ved 15 knob. Kortets farvebjælke
  viser 0, 5, 10 og 15+ knob og følger med i præsentationen og PNG-billedet.
  Gråt spor betyder manglende fartdata. Sporene har en mørk kant mod vejrkortets farver.
- **Både i udsnittet** ligger som en lille bjælke lige under fartskalaen med
  samme bredde. Klik på bjælken for at folde listen ud eller sammen. Listen kan
  rulles og viser bådnavn, skipper, SOG i knob og bådtype for valgte både, hvis
  aktuelle ikon er i kortudsnittet. Den følger tidspunkt, afspilning, panorering,
  zoom og bådvalg; gamle spor uden et aktuelt ikon tæller ikke med. Farten bruger
  TracTracs registrerede SOG med samme tidsinterpolation som fartmærkerne. Ved en
  kort trackingpause vises seneste kendte position og dens målte fart, indtil
  ikonet udløber efter fem minutter. Manglende felter angives i listen.
  Hold musen over en række, eller fokusér den med Tab, for at forstørre det
  tilsvarende bådikon midlertidigt. Op/ned, Home og End flytter fokus i listen;
  Escape folder den sammen. Bjælken virker også i præsentation og fuld skærm,
  og skjules, når et eventbillede dækker kortet. Listen ændrer ikke gemte events
  og indgår ikke i kortets PNG-eksport.
  Listen er altid alfabetisk og indeholder kun de aktuelt synlige både.
  Både, der forlader udsnittet, fjernes med det samme. Når listen er foldet ud,
  fylder den ned til kortets bund. Hold musen over et bådikon på kortet for at
  rulle den åbne liste til bådens række og fremhæve den. Det ændrer ikke kortet
  eller tastaturfokus og åbner ikke en sammenfoldet liste.
  En fast farvestribe viser altid bådens farve. Fremhævning bruger baggrund og
  ramme, så bådfarven også er synlig under mouseover.
  Rækkerne har fast højde, så ændringer i fart eller lange navne ikke skubber de
  andre rækker. Hele navnet vises som tooltip. Fravalg af en båd fjerner dens række.
  Skippernavnene kommer fra de gemte TracTrac-deltageres `description`.
  Bådtypen hentes fra Manage2Sail via `uniqueId`/`BowNumber`, med TracTracs
  bådtype som reserve. Genskab `boat-details.js` med
  `python scripts/prepare_boat_details.py`; det genbruger projektets kildedata.
  `node scripts/test_viewer_boat_list.cjs` kontrollerer listen lokalt i Firefox på PC.
  `node scripts/test_viewer_boat_list_presentation.cjs` kontrollerer desuden den
  offentlige præsentationsmode uden redigering: alfabetisk rækkefølge, mouseover,
  afspilning, eventskift, rulning og browserens faktiske fuldskærmsvisning i
  Firefox. Testens events er simulerede; den gemmer ikke på serveren.
  `SR_FULL_TEST=1` aktiverer den bredere browser- og mobiltest ved en endelig udgivelse.
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
  tidspunkt. Sporene tegnes som kurver gennem målepunkterne og forbliver glatte
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
  kortudsnit og lag. Feltet **Tidspunkt (dansk tid)** ændrer eventets dato og
  klokkeslæt med sekunders præcision inden for sejladsens tidsrum. Når du gemmer,
  sorteres eventet automatisk efter det nye tidspunkt; markør, tegninger og
  vedhæftninger bevares. **Annullér redigering** kasserer også ændringer af tiden.
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
- **Beskær billede** åbner billedredigeringen for den vedhæftede fil. På et
  eksisterende event skal du først vælge **Redigér** ved noten. Træk i rammens
  hjørner for at ændre udsnittet, træk rammen for at flytte det, eller angiv
  venstre kant, top, bredde og højde i pixels. Træk uden for rammen for at vælge
  et nyt udsnit. **Hele billedet** nulstiller rammen, og **Annullér** eller Escape
  lukker uden ændringer. **Brug beskæring** uploader udsnittet som en ny WebP-fil
  og bruger den i eventets kladde. Klik derefter **Gem event** eller
  **Gem ændringer**, og online også **Udgiv**. En uploadfejl bevarer billedet og
  udsnittet, så du kan prøve igen. **Annullér redigering** genskaber det gemte
  billede. Andre events med samme originalbillede ændres ikke. Beskæringen følger
  med ved genindlæsning og i JSON-eksport/import; den oprindelige fil bevares på
  serveren ligesom ved udskiftning af en vedhæftning.
- **YouTube-video til event** vedhæfter en video via et YouTube-link. Almindelige
  videolinks, `youtu.be`, Shorts, live-links og embed-links accepteres. Et link
  med starttid, fx `?t=1m30s`, starter videoen ved det valgte tidspunkt.
  Videoen kan være et selvstændigt event uden tekst og kan kombineres med et billede.
  Klik **Gem event** eller **Gem ændringer**; **Fjern video** fjerner vedhæftningen,
  og **Annullér redigering** genskaber det gemte link.
  Højrepanelet viser et miniaturebillede med en afspilningsknap i begge tilstande.
  Et klik åbner afspilleren i fuld skærm og starter videoen. **Luk video** eller
  Escape lukker afspilleren og stopper lyden. Hvis præsentationen allerede er i
  fuld skærm, forbliver den der bagefter. Hvis browseren ikke tillader fuld skærm,
  vises en fejl, og videoen starter ikke i en alternativ visning.
  Eventnavigation og snapping åbner ikke videoen automatisk. Kortets tid,
  udsnit og bådvalg bevares, når videoen åbnes eller lukkes.
- Når du vælger et billed-event med **Forrige/Næste**, piletasterne, eventlisten
  eller notelisten, vises billedet automatisk over kortet. Det gælder i begge
  tilstande. Et snap til eventet på tidslinjen åbner kun billedet i højrepanelet.
  Billedet vises kun ét sted ad gangen: højrepanelets billede skjules, mens
  billedet er åbent over kortet, og kommer tilbage, når kortet vises igen.
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
`node scripts/test_viewer_image_overlay.cjs` kontrollerer billedskift, kun én
synlig billedvisning, navigation, tidslinje, langsomme svar og mobilvisning.
`node scripts/test_viewer_image_crop.cjs` kontrollerer beskæringsramme, faktiske
billedpixels, gemning/genindlæsning, eksport, annullering, uploadfejl, delte
originalbilleder og mobilvisning. Begge tests kører i Chromium og Firefox.

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

Tidslinjen har et balanceret træ over hvert spors sammenhængende indeksintervaller.
Hver knude gemmer en geografisk bounding box og de sammenlagte gyldige
tidsintervaller, inklusive positionernes holdetid ved datapauser. Træerne
forberedes for hele feltet ved opstart og beholdes ved bådvalg og panorering.
Et helt spor indenfor eller udenfor kortet afgøres ved roden. Kun grene, der
rammer kortgrænsen, undersøges nærmere; blade rummer højst 16 kildeintervaller,
og kantkrydsninger bruger fortsat den præcise kubiske kurve. Der antages ingen
maksimal bådfart. `node scripts/test_viewer_timeline_index.cjs` sammenligner
resultaterne med det tidligere flade indeks på både syntetiske spor og alle
gemte kortudsnit og kontrollerer genbrug af de forberedte intervaller.

Kurverne tegnes i den aktuelle skærmopløsning ved alle zoomniveauer; der
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
`node scripts/test_viewer_speed.cjs` kontrollerer alle kildekonverteringer.
`node scripts/test_viewer_webgl_tracks.cjs` kontrollerer renderede fartfarver,
kurvegeometri, trackhuller og PNG i lokal Firefox på PC (kræver Playwright).

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

Positionsmarkørerne bruger `common.svg`, `modern.svg` eller `classic.svg`.
`modern.svg` er kopieret fra `random simuleringer/cuteboat.svg`. Metadata i `boat-icons.js` angiver Vera, My,
Mercutio og saltamalin som 8 × 2,54 meter. THE HULK er 10,3 × 3,18 meter,
Rosa-Lux 10 × 3 meter, Alice 8 × 2,51 meter og Moster 7,77 × 2,5 meter.
XBOX er 12,75 × 4,18 meter, Quinta Light er 12,55 × 4,3 meter og
HANSEN 3.5 er 10,65 × 3,53 meter, og munje er 13,35 × 4,25 meter.
XBOX og Quinta Light har `modern` skrogform; munje og HANSEN 3.5 har `common`.
De øvrige både bruger indsamlede mål fra Websejler og SailboatData, når de
er identificeret sikkert. Både uden brugbare kilder har fortsat foreløbige
mål på 10 × 3 meter (`estimated: true`). Hver båd har et `metadata`-felt med
`lengthM`, `beamM` og `hull`. `hull` er `common` som standard; Slipstik og Ambra
bruger `classic.svg` og måler begge 10 × 2,3 meter. Alle tre SVG-filer ligger i
`viewer/` og indlæses direkte, så skrogtegningerne kan redigeres der.
Ret navneopslagene i `boatMetadataOverrides`, når mål eller skrogform ændres.

Ikoner følger bevægelsesretningen langs tracket. Minimumsskalaen er fælles:
2,54 meter svarer til 8 skærmpixels, både for længde og bredde. Større både
vises derfor større også ved oversigtszoom. Ved tæt zoom følger målene
kortets fysiske skala under hensyn til projektionen og
bådens breddegrad. Kortet kan zoomes tæt nok på til at vise denne forskel.
Navne har fortsat fast skriftstørrelse; farver, klik, præsentation og PNG bevares.

## Lag pr. event

Vind, vindtal, radar, TSS, skydeområde og synligheden af gemte noter tilhører
hvert event, sammen med vindmodel og radarens gennemsigtighed. I redigering
gemmes et ændret lag direkte til det valgte event, når tiden står præcist på
eventets tidspunkt. Ved fuld noteredigering følger lagene kladden og gemmes
eller annulleres med den. Ved andre tidspunkter ændres kun den aktuelle visning.

Forrige, Næste og direkte eventvalg genskaber de gemte lag. Snap på tidslinjen
bevarer de aktuelle lag og skriver ikke til events. Onlineændringer ligger
fortsat i kladden, indtil der klikkes Udgiv.

## Genbrug under afspilning

Gentagne tegneønsker fra afspilning, tidslinje, lag, bådvalg, zoom og resize
samles med `requestRender()` til næste `requestAnimationFrame`. Tegningen læser
den seneste tilstand. En fuld gentegning har forrang over en opdatering af
kortudsnittet; zoom alene genbruger de eksisterende bådmarkører. Tidsændringer,
eventvalg og lagring sker stadig synkront, så mellemtrin ikke tabes i logikken.
Den synkrone `render()` bevares til gendannelse af scener og programmatisk brug,
og `flushRender()` udfører ventende arbejde før fx PNG-eksport. Eksport afventer
derefter også de aktuelle vejrbufferes billeder. Fartmærker tegnes én gang pr.
fuld gentegning. Opløsning, sporpræcision og afspilningshastigheder er uændrede.

`node scripts/test_viewer_render_scheduler.cjs` kontrollerer samling af input,
seneste tilstand, prioritet, synkron tegning, ventende arbejde under en tegning,
genbrug ved panorering og eksport af den seneste scene.

Sporlaget bruger WebGL 2 i `track-renderer.js`. Hvert kildeinterval gemmes én
gang i en fast GPU-buffer med den oprindelige PCHIP-kurves koefficienter,
tidsstempler og registrerede fartværdier. Bufferne forberedes for hele sejladsen
for de valgte både og beholdes ved fravalg og frem-/tilbagespoling. Hele feltet
bruger ca. 46,7 MB til disse buffere. Afspilning ændrer tidsgrænser og de
intervaller, der tegnes, uden at bygge SVG-strenge eller uploade nye buffere.

GPU'en evaluerer kubiske kurver, klipper dem til de seneste to timer og slår
fartfarver op i den faste 128-trins palet. Dybden interpoleres fra det lokale
tidspunkt langs kurven; nyere passager dækker ældre, uanset båd og fartfarve.
Tidens høje og lave del gemmes separat, så millisekunder også kan skelnes sent
i sejladsen. Dybden sættes i vertex-shaderen, så GPU'en kan afvise skjulte
fragmenter tidligt. Kant og sporfarve tegnes i én passage med samme tidsdybde.
Overgangen mellem fartfarve og mørk kant udjævnes med `fwidth` og `smoothstep`
over cirka én rasterpixel. Sporlaget tegnes med 2× rasteropløsning i begge retninger
ud over WebGL-kontekstens multisample-antialiasing. Nedskaleringen udjævner også
den mørke yderkant mod kortet uden at ændre sporbredde eller tidsbaseret dybde.
Samme shader og supersampling bruges i PNG-eksporten.
Sammenhængende kildeintervaller deler en kant uden runde afslutninger imellem;
ellers ville et nyere stykkes mørke rand stribe det foregående stykke.
Runde afslutninger bruges ved sporets ender, reelle huller og tidsvinduets klip.
Huller over fem minutter forbindes fortsat ikke. Der fjernes ingen kildepunkter
efter zoomniveau eller geografisk udsnit. Ikoner og interaktive kortlag er fortsat SVG.

Canvas ligger i et SVG-`foreignObject` på sporenes oprindelige plads i lagfølgen.
Det indlejrede HTML-layout bruger skærmpixels og en invers SVG-transformation.
Dermed afrunder browserens canvas-kompositor ikke placeringen i kortkoordinater
før zoom; ved tæt zoom ville afrundingen ellers forskyde hele sporlaget.
Zoom, panorering, skærmskalering og ændret vinduesstørrelse opdaterer projektionen.
`mapViewport()` leverer det synlige kortrektangel og dets geografiske grænser
til både sporenes projektion og `visibleMapBounds()`. Fuldskærmsskift genopfrisker
sporlaget efter layout, og WebGL bruger grafikbufferens faktiske pixelstørrelse.
Klik søger i de oprindelige kurver ved selve klikket; der vedligeholdes ingen
usynlige SVG-klikstier under WebGL-afspilning. Ved overlap vælges den øverste
bådpassage ud fra tidspunktet ved klikpunktet. Hover i pause viser bådnavn og SOG og
ændrer markøren; Pin/Fjern pin, tastaturbetjening og lagring er uændret.
PNG-eksport gentegner sporene med supersampling af eksportens fulde 2×-opløsning og samme
tidsbaserede dybde og indsætter resultatet i kortets SVG. Øvrige kortlag og
ikoner eksporteres fortsat som vektorer før dannelsen af den endelige PNG.

Der er kun én renderingsvej: WebGL 2 til både baggrund og spor samt deres
PNG-eksport. Ingen CPU- eller SVG-reserve vælges på andre PC'er. Hvis WebGL
mangler eller en kontekst mistes, skjules kortet, afspilning stoppes, og årsagen
vises tydeligt. En gendannet kontekst genopbygger den samme WebGL-renderer.
Det generelle princip om én nominel implementering er beskrevet i
[projektprincipperne](../AGENTS.md).
`node scripts/test_viewer_track_time_layers.cjs` tester lokalt i Firefox på PC:
modsatrettede krydsninger, selvkrydsning, millisekunder, pauser, tidsvindue,
tilbagespoling, klik, genbrug af GPU-buffere og PNG med den nominelle renderer.
`node scripts/test_viewer_track_joins.cjs` kontrollerer tætte lige og buede spor
ved flere zoomniveauer, samlinger uden striber, kantudjævning, runde ender og PNG i lokal Firefox.

Baggrunden bruger én WebGL 2-flade i `background-renderer.js`, med fast
lagrækkefølge: vindfarvefelt, land, radar og kyst. Landpolygoner, inklusive
huller, trianguleres én gang med den lokalt medfølgende Earcut 3.0.2
(`vendor/earcut.js`, ISC-licens i filen). Kysten bruger faste trekantbuffere med
én skærmpixels bredde. Alle kildepunkter bevares. Panorering og zoom ændrer kun
kamera og synlige tegningsintervaller; geometri og vejrteksturer uploades ikke
igen. Vindpile, trafikseparering, skydeområder, ruter, ikoner og redigering
bevarer deres eksisterende lag.

Baggrunden og sporene deler `mapViewport()` og `positionMapCanvas()`, så både
klipning og placering bygger på kortets faktiske skærmrektangel, også i fuld
skærm og ved HiDPI. PNG-eksport gentegner også baggrunden med samme WebGL-renderer
i eksportens fulde 2×-opløsning, inklusive land, kyst og vejr.

`node scripts/test_viewer_background.cjs` kontrollerer landhuller, lagrækkefølge,
genbrug af geometri og teksturer, vejrskift, PNG og tab/gendannelse af konteksten.
`node scripts/test_viewer_nominal_rendering.cjs` kontrollerer i lokal Firefox
på PC både normal visning/PNG og tydelige fejl ved manglende WebGL eller tab af
en af de to kontekster. Den kontrollerer også, at video kræver fuld skærm.

`node scripts/test_viewer_webgl_tracks.cjs` kontrollerer faktiske GPU-pixels,
huller, fartdata, genbrug af buffere, eksport og tab/gendannelse af konteksten.
`node scripts/test_viewer_fullscreen_tracks.cjs` gennemgår den udgivne
præsentation før, under og efter fuld skærm og kontrollerer tekststørrelser og
faktiske sporpixels ved de gemte zoomniveauer. Testen bruger grafikkort og en
synlig browser som standard (`SR_HEADLESS=1` vælger headless).
`node scripts/benchmark_viewer_tracks.cjs` måler den nominelle WebGL-renderer med alle
106 både. Benchmarken bruger en synlig Firefox med grafikkort som standard;
`SR_HEADLESS=1` kan bruges til automatisering, men måler ofte softwaregrafik.

## Dobbelt buffer til vejrkort

Radar og vindfarvefelt har hver to billedbuffere til indlæsning og
to teksturer pr. lag i WebGL-baggrunden. De skjulte billednoder bruges kun til
indlæsning og lagtilstand; de tegnes ikke selv på kortet eller i PNG. Det næste radartidspunkt
og næste vindtime indlæses, afkodes og uploades på forhånd. Indlæsningen må
aldrig overskrive teksturen til det viste billede. Den færdige buffer vises ved
tidsskiftet. Den gamle buffer beholdes gennem den første tegnecyklus, før
den skjules og må genbruges, så skiftet ikke efterlader et tomt billede. Et uventet tidsspring beholder det aktuelle billede, indtil det
nye er klart; forældede indlæsninger kan ikke overtage visningen. Manglende
radardata skjules fortsat og markeres som manglende. PNG-eksport afventer
det valgte radar- og vindbillede og medtager kun de synlige buffere.

Bådikoner og navne tegnes i det fælles `boatMarkers`-lag over alle bådspor.
Det gælder også ved afspilning og PNG-eksport.

## Kilder til bådmål

`boat-measurements.js` indeholder de genererede, kildebelagte mål.
`boatMetadataOverrides` har forrang for mål angivet af brugeren; en ændring
af skrogformen alene bevarer de indsamlede mål. Standardformen er `common`.
THE HULK, My, Vera, Mercutio, saltamalin, Laolao, XBOX og Quinta Light bruger
`modern`; Slipstik og Ambra bruger `classic`.

Se `../data/boat-dimensions/dimensions.csv` for hele oversigten og
`../data/boat-dimensions/README.md` for metode og genskabelse.
