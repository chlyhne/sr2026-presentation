# Sjælland Rundt — kort til præsentation

Kør fra projektroden for at bruge alle funktioner, inklusive billed-upload.
Billeder, vind og tracks ligger lokalt, så der kræves ingen internetforbindelse:

```sh
python3 scripts/serve_viewer.py
```

Åbn derefter http://127.0.0.1:8097/ .

- Ved første indlæsning vises kun en fremdriftsbjælke. Siden bliver tilgængelig,
  når data, hele feltets spor og sammenligninger samt det første vejrkort er klar.
  Den offentlige side åbner direkte i præsentationsvisning uden at vise redigeringen først.
  Bjælken vises ikke igen ved bådvalg, afspilning eller navigation på siden.
  Hvis indlæsningen fejler, vises fejlen og en knap til at genindlæse.
- Bådnavne vises som standard; klik på båden for at skjule eller vise navnet.
  Når en båd får et fyldt hjerte, vises dens navn også.
  Et events gemte valg af bådnavne bruges fortsat ved navigation til eventet.
- **Lag → Grid** viser et antialiaseret afstandsgrid oven på kortbaggrunden,
  under sporene. Afstanden skifter automatisk mellem **15 sømil, 5 sømil,
  2 sømil, 1 sømil, 400 m og 100 m**, så cellerne normalt er mindst 80 skærmpixel brede.
  Den aktuelle afstand vises i lagmenuen, og lagets tilstand gemmes med eventet.
  Grid er forankret ved 55° N, 12° Ø; afstandene er kalibreret ved 55° N
  i kortets eksisterende længde-/breddegradsprojektion.
- Nederst til højre vises en målestok i sømil eller meter, også når grid er slået
  fra. Den viser altid gridets aktuelle afstand, og stregen svarer til bredden
  af én gridcelle på kortet.
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
  direkte frem. Ved ankomst indlæses eventets gemte kortindstillinger: lag,
  vindmodel, sporlængde og sportype, referencebåd, handicapkompenserede spor,
  bådfavoritter, navne, søgefilter, favoritfilter og annotationer samt eventuelt billede.
  Det gemte kortudsnit bruges kun ved direkte hop; afspilning hen til eventet
  beholder det udsnit, der følger referencebåden.
  I redigering gemmes ændringer af kortindstillinger automatisk til det valgte
  event på dets præcise tidspunkt, men flytning og zoom ændrer ikke det gemte udsnit.
  Under fuld redigering gemmes indstillingerne i kladden indtil **Gem ændringer**.
  Gamle events og importerede historikker bevarer deres eksisterende indstillinger;
  manglende felter får faste standarder, ikke indstillinger fra det forrige event.
  Historiske bådvalg bliver favoritter med favoritfilteret slået til, så samme
  både fortsat vises; et gammelt tomt udvalg viser fortsat ingen både.
  Historikken omskrives ikke ved åbning. Et ændret event får `settings.mapVersion: 1`;
  dokumentformatet er fortsat version 1. Ukendte kortversioner afvises.
  Er almindelig **Afspil** allerede i gang mellem events, springer **Næste**
  direkte til det næste kommende event. Events med samme tidspunkt skifter
  direkte. I redigering hopper **Næste** fortsat direkte.
  Eventets tekst og tidspunkt vises i eventpanelet, også for noter uden markør.
  Gemte kortudsnit, vejrlag, vindmodel, både og bådnavne genskabes ved hvert hop.
  Tidspunktet fastholdes, også når ingen valgte både er synlige i udsnittet og
  ved zoom, panorering, ændret vinduesstørrelse eller fuld skærm. Ved flere
  noter med samme tidspunkt vises kun det valgte events annotation på kortet.
- Overskriften står i en hvid boks over farveskalaen med samme bredde.
  Fuld skærm og log ind er ikoner ved lagvælgeren. Log ind vises på den offentlige
  side, når loginserveren er konfigureret. Redigeringshandlinger ligger i venstrepanelet.
- Knappen med den **åbne bog** ved lagvælgeren skjuler og viser højrepanelet,
  både i redigering og præsentation. Kort, tidslinje og kortværktøjer tilpasser
  sig pladsen, mens kortets centrum, zoom og tidspunkt bevares.
  Frem og tilbage mellem events åbner højrepanelet igen, også når Næste starter
  afspilning frem til eventet.
- **Enter i bådfilteret** vender hjertet for hver båd på den aktuelle liste.
  Søgeteksten og bådvalget uden for listen bevares.
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
  både undervejs. Kortet følger den valgte referencebåd i midten med uændret zoomniveau, også
  når båden ikke er valgt. Uden en aktuel position flyttes kortet ikke.
  Ved ankomst stopper afspilningen uden at ændre det fulgte udsnit; eventets
  øvrige indstillinger og eventuelle billede gendannes. Et ekstra tryk på Næste
  undervejs hopper direkte til eventet med dets gemte udsnit.
  Zoom afbryder ikke forløbet;
  panorering centreres igen på referencebåden ved næste opdatering. Brug tidsskyderen,
  Forrige, eventlisten eller Pause for at afbryde det. **Afspil** alene ændrer
  aldrig kortets opsætning ved passage af et event og åbner ikke billeder over
  kortet; snap på tidslinjen bevarer også den aktuelle opsætning.
  `node scripts/test_viewer_next_event_playback.cjs` kontrollerer forskellen på
  de to afspilningsformer, hastighed, ekstra klik, ankomst og gemte indstillinger
  i lokal Firefox på PC, inklusive den offentlige præsentationsmode.
- Playbaren har den klassiske rækkefølge `|<` · `<<` · `>`/`||` · `>>` · `>|`:
  Forrige event, lavere hastighed, afspil/pause, højere hastighed og næste event.
  `<<` og `>>` vælger ét niveau ad gangen blandt 1×, 2×, 5×, 10×, 20×, 100×,
  200× og 400×. De ændrer ikke tidspunktet, mens der er pause, og afspiller altid
  fremad. Knapperne deaktiveres ved laveste/højeste niveau. Hastighedsvælgeren
  viser det aktuelle niveau. Eventlisten ligger fortsat under eventpanelet.
- Den samlede tidsperiode udledes af hele spordatasættet med margen før start
  og efter sidste position.
- Tidslinjen følger kortudsnittet og de valgte både. Den indeholder perioder,
  hvor mindst én valgt båds aktuelle markør er i udsnittet; pauser uden både er
  fjernet fra skyderen. Events tilføjer ikke tidspunkter i disse huller.
  I præsentationen bruges hele tidsrummet, hvis ingen valgte både passerer
  udsnittet; der er ingen snapmål i denne situation. Uden synlige passager er
  skyderen deaktiveret i redigering, mens noterne stadig kan åbnes direkte.
- **Afspil** følger den valgte tid sammenhængende, også mellem skyderens
  passageperioder og i udsnit uden både. Zoom, panorering, resize og filtrering
  flytter ikke tiden og ændrer ikke afspilningens slutgrænse. Afspil/Pause kan
  bruges, selv om skyderen er deaktiveret. Almindelig afspilning stopper ved
  datasættets slutning; handicapvisning bruger hele feltets forberedte sluttid
  inklusive målophold, uafhængigt af bådfilteret.
- Tiden kan flyttes i **1-sekunds trin** med skyderen eller piletasterne.
  Shift+piletast flytter 1 minut. Afspilning opdaterer 20 gange pr. sekund og kan køre med 1×, 2×, 5×, 10×,
  20×, 100×, 200× eller 400×. Ved 1× svarer ét sekund til ét sekund i sejladsen.
  Bådpositionerne interpoleres også mellem hele sekunder under afspilning.
  Piletaster på selve skyderen snapper ikke, så du kan flytte
  tiden væk fra et event i små trin. Piletaster uden for skyderen skifter events
  i præsentationen. Et træk i skyderen pauser afspilningen.
  Musehjulet over skyderen flytter ét sekund; Shift+musehjul flytter ét minut.
  Klokken indeholder sekunder. Tiden bevares ved nyt udsnit, bådvalg og ændret
  skærmstørrelse i både redigering og præsentation. Navigation og snap ændrer
  ikke de gemte noter.
- Mercutio, Vera, My, The Hulk og Rosa-Lux er valgt fra start; begge baners øvrige tracks kan vælges.
- **Lag** øverst til højre på kortet åbner valgene **Vind** og **Byger**.
  De kan slås til og fra hver for sig, også i præsentation og fuld skærm.
  Klik udenfor eller tryk Escape for at lukke lagmenuen. I redigering gemmes
  ændringer på det aktive event; i præsentation ændrer de kun den aktuelle visning.
  Vindmodel og radarens synlighed justeres
  fortsat i sidepanelet.
  `node scripts/test_viewer_layers.cjs` tester lagmenuen lokalt i Firefox på PC.
- **Linealknappen** ved siden af **Lag** starter en afstandsmåling uden undermenu.
  Klik to steder på kortet: afstand i sømil og kurs vises direkte på målingen.
  Tryk på linealen igen for at fjerne målingen, eller tryk Escape. Kortet kan
  trækkes og zoomes undervejs. Måleværktøjet virker også i præsentation og fuld skærm.
- Den permanente rhumbline tegnes én gang på det separate lokale kort
  <http://127.0.0.1:18097/rhumbline.html> (start serveren med
  `python3 scripts/serve_viewer.py --port 18097`). Klik punkterne i sejlretningen,
  og vælg **Gem permanent rhumbline**. Punkterne gemmes i projektfilen
  `viewer/rhumbline.json`; et allerede gemt forløb kan ikke overskrives fra kortet.
  Definitionen findes ikke i præsentationen, dens noter, kladde eller eksport,
  og der er ingen rutetegning i præsentationens Mål-menu. Alle visninger henter
  den samme projektfil. Genindlæs visningen efter den første definition.
- **Spor** ved siden af **Mål** og **Lag** samler sporlængde, referencebåd og sportype.
  Vælg 15 eller 30 minutter, 1, 2, 4 eller 8 timer, eller hele forløbet.
  Længden gælder både kortet, valg af spor med musen og fartmærker.
  **Referencebåd** indeholder alle både, også dem der ikke er valgt til visning.
  Mercutio er standardreference. Valget ændrer sammenligningen og den båd,
  kortet følger under afspilning frem til næste event; det vælger ikke båden til visning.
  Referencebådens navn vises i overskriften, sportyperne og signaturforklaringen.
  Valgene huskes lokalt og ændrer ikke præsentationens events. Klik udenfor
  eller tryk Escape for at lukke menuen, også i præsentation og fuld skærm.
  **Sportype** vælger mellem de almindelige SOG-farver og en rød–blå skala
  for forskellen i fremdrift langs rhumblinen. Rød betyder langsommere end referencebåden
  ved **samme sted på ruten**; mættet blå betyder hurtigere. Bådenes passagetidspunkter
  kan være forskellige. I alle tre sammenligningsvisninger tegnes referencebådens
  spor i bådens egen farve med 18 % opacitet, under de andre bådes spor.
  Vælg **Mod [referencebådens navn] · absolut** eller **Mod [referencebådens navn] · handicap**. Skalaen mættes
  ved ±2 knob og er lys ved nul. Værdier under den røde grænse får varm gul,
  og værdier over den blå grænse får magenta. Skalaens spidser viser disse farver.
  Hold musen over et spor i redigering for at se
  forskellen og tidspunktet for referencebådens passage. Der kræves en defineret permanent rhumbline.
  Grå betyder manglende fælles passage, fart, retning eller nødvendigt måltal;
  der skiftes ikke til en anden beregningsmetode.
  `node scripts/test_viewer_navigation.cjs` kontrollerer måling, tegning,
  samme-sted-sammenligning, handicap, WebGL-farver, gemning og fuld skærm
  lokalt i Firefox på PC. `node scripts/test_viewer_navigation_online.cjs`
  kontrollerer, at offentlig visning, redaktørkladde, import, eksport og udgivelse
  bruger projektfilen og aldrig indeholder rutepunkter.
  `node scripts/test_viewer_rhumbline_setup.cjs` tester det separate tegnekort
  med simuleret gemning. `python3 scripts/test_rhumbline_server.py` tester den
  permanente engangsgemning på en isoleret lokal server.
- **Spor → Handicapkompenseret spor** er ét flueben, som skifter hele kortet til
  handicapkompenserede positioner. Der vises én almindelig, fuldt synlig båd pr.
  bådvalg, med samme skrog, størrelse, farve, navn og betjening som normalt.
  Originalpositionerne og gennemsigtige kopier vises ikke i denne tilstand.
  Sporene bruger altid bådens faste farve; sportype er derfor låst til **Bådfarve**,
  og den tidligere sportype genskabes, når fluebenet fjernes.
  Hvert spor slutter ved den kompenserede båd. Både endepunkt og sporlængde følger
  den kompenserede tid, og kurven er stadig bådens oprindelige PCHIP-kurve.
  Bådlisten, valg af fartpunkter og pins følger samme viste position og sporperiode.
  Fluebenet huskes lokalt, ligesom sportype og referencebåd.
  Korrektionen bruger bådens **eget ToD-måltal og klassestart**, uafhængigt af
  referencebåden. Alle både på begge ruter bruger ét fælles starttidspunkt:
  den seneste officielle klassestart i feltet. Inden for hver rute bruges feltets
  højeste ToD-måltal som fast grundlag. Sejltiden regnes fra bådens officielle
  startskud, også hvis den først krydser startlinjen senere. Alle både forsinkes derfor;
  til- og fravalg af både ændrer ikke deres tidsforløb.
  Ved mål er visningstiden `fælles start + sejltid + (TA_maks − TA_båd) × banelængde`.
  Første båd i mål på **samme rute** har dermed den bedste korrigerede tid,
  også når originalerne startede på forskellige tidspunkter.
  Den officielle banelængde i handicapberegningen er 232 sømil via Grønsund
  og 216 sømil via Bøgestrømmen, bestemt af den enkelte båds bane.
  Det samlede tillæg fordeles efter bådens fremdrift langs dens eget sejlede spor
  fra start til registreret mål, normaliseret til løbets banelængde. Ekstra sejlede
  sømil ændrer dermed ikke handicapkorrektionen ved mål.
  Kun tidsnøgler og et tidslinjeindeks forberedes før betjening; den oprindelige
  sporgeometri genbruges uændret. Trackinghuller følger den normale femminuttersregel.
  Tidslinjen følger de kompenserede passager og kan forlænges ud over vejrperioden;
  ved mål holdes båden stille i fem minutter. Events kan også gemmes og redigeres
  ved de forlængede tider. Både uden et registreret måltid eller tracking ved
  start/mål får en synlig forklaring på den manglende kompensation.
  `node scripts/test_ghost_math.cjs` kontrollerer ToD, forskudte starter, mål-rækkefølge
  og hele feltets faste tidsforløb. `node scripts/test_viewer_ghosts.cjs` tester
  flueben, bådpositioner, fast sporfarve, sporender, tidslinje, målpassager, genindlæsning og
  præsentation lokalt i Firefox på PC.
- Hvert event gemmer sit eget udvalg af aktive både. Ved Forrige/Næste, valg i
  eventlisten eller klik på en note genskabes netop dette udvalg, også et tomt udvalg.
  Når du står ved et gemt events tidspunkt i redigering og ændrer bådvalget,
  gemmes valget automatisk til det event. De andre events ændres ikke.
  Under fuld noteredigering følger bådvalget kladden og gemmes eller annulleres
  sammen med resten. Et nyt event husker det udvalg, der er aktivt ved oprettelsen.
  Når du udforsker et andet tidspunkt eller er ved at oprette en ny note,
  ændrer bådvalget ikke det sidst valgte event.
  Gemte bådvalg bevares ved genindlæsning.
  Snap på tidslinjen ændrer hverken det aktive bådvalg eller gemte bådvalg.
- Sporenes lag følger tiden langs kurven: den nyeste passage ligger øverst,
  også ved selvkrydsninger. To både kan derfor skifte mellem at være over og
  under hinanden ved forskellige krydsninger. Referencebådens bådikon, navn og
  fartmærker har fortsat deres egen forreste placering over sporene.
- Alle både har hver sin faste farve i listen, bådnavnet og positionsmarkøren.
  Farven ændres ikke, når andre både vælges til eller fra. De fire oprindelige
  standardbådes farver er bevaret.
- **Sporfarven viser bådfarten over grunden (SOG)** fra TracTracs fartfelt med
  en jet-farveskala fra 0 til 15 knob. Farven mættes ved 15 knob. Kortets farvebjælke
  viser 0, 5, 10 og 15+ knob og følger med i præsentationen.
  Gråt spor betyder manglende fartdata. Sporene har en mørk kant mod vejrkortets farver.
- **Både** ligger som en lille bjælke lige under fartskalaen med samme bredde.
  Klik på bjælken for at folde den alfabetiske liste ud eller sammen. Den viser
  bådnavn, skipper, SOG i knob og bådtype, også for både uden et aktuelt ikon i
  kortudsnittet. Manglende fart angives som “Fart mangler”.
  Tragtikonet markerer filterfeltet, som filtrerer løbende på bådnavn, skipper
  eller bådtype uden forskel på store og små bogstaver. Tomt felt viser alle både.
  Et fyldt hjerte ved en båd betyder favorit. Hjertet ved filterfeltet begrænser
  listen og kortet til favoritter; teksten filtrerer videre inden for dette udvalg.
  Slås hjertet fra, filtreres igen blandt alle både. Det knuste hjerte fjerner
  favoritter fra **hele feltet**, også både skjult af filterteksten.
  Ændringer vises straks, uden en Færdig-knap. Filter og favoritvisning bevares,
  når listen foldes sammen. Escape rydder først en filtertekst og folder ellers
  listen sammen. Enter i feltet eller mellemrum på en fokuseret række skifter
  hjerterne. Tekst og favoritvisning ændrer ikke gemte events; hjertevalg bruger
  den eksisterende eventgemning i redigering. I præsentation ændres kun visningen.
  Under tekstfiltrering skifter klik på kortets bådikoner også favoritstatus.
  Hold musen over en række, eller fokusér den med Tab, for at forstørre det
  tilsvarende bådikon midlertidigt. Op/ned, Home og End flytter fokus i listen;
  Escape folder den sammen. Bjælken virker også i præsentation og fuld skærm,
  og skjules, når et eventbillede dækker kortet. I præsentation ændrer bådvalg ikke
  gemte events; i redigering bruges samme eventgemning som det øvrige bådvalg.
  Når listen er foldet ud,
  fylder den ned til kortets bund. Hold musen over et bådikon på kortet for at
  rulle den åbne liste til bådens række og fremhæve den. Det ændrer ikke kortet
  eller tastaturfokus og åbner ikke en sammenfoldet liste.
  En fast farvestribe viser altid bådens farve. Fremhævning bruger baggrund og
  ramme, så bådfarven også er synlig under mouseover.
  Rækkerne har fast højde, så ændringer i fart eller lange navne ikke skubber de
  andre rækker. Hele navnet vises som tooltip. Uden søgning fjerner fravalg bådens række.
  Skippernavnene kommer fra de gemte TracTrac-deltageres `description`.
  Bådtypen hentes fra Manage2Sail via `uniqueId`/`BowNumber`, med TracTracs
  bådtype som reserve. Genskab `boat-details.js` med
  `python scripts/prepare_boat_details.py`; det genbruger projektets kildedata.
  `node scripts/test_viewer_boat_list.cjs` kontrollerer listen lokalt i Firefox på PC.
  `node scripts/test_viewer_boat_search.cjs` kontrollerer søgning, midlertidig
  kortvisning og bådvalg via liste og kort i redigering og offentlig præsentation.
  `node scripts/test_viewer_boat_list_presentation.cjs` kontrollerer desuden den
  offentlige præsentationsmode uden redigering: alfabetisk rækkefølge, mouseover,
  afspilning, eventskift, rulning og browserens faktiske fuldskærmsvisning i
  Firefox. Testens events er simulerede; den gemmer ikke på serveren.
  `SR_FULL_TEST=1` aktiverer den bredere browser- og mobiltest ved en endelig udgivelse.
- Klik på en båds bådikon for at vise eller skjule navnet. Det gælder alle
  både. Tab og Enter/mellemrum kan også bruges. Navnevalget bevares ved zoom,
  tidsskift og til-/fravalg af både og gemmes med noter.
  Alle bådes navne er vist som standard, også når flere både vælges eller findes
  med søgning. At trække fra et bådikon flytter kortet.
  Gemte bådudvalg og manuelle navneskjul bevares ved genindlæsning.
- Klik på et sted på et spor i redigering for at vise farten i knob
  som et mærke ved punktet, uden bådnavn. Mærket har bådens farve.
  Der klikkes på den glatte PCHIP-kurve, også mellem
  kildepunkterne. Farten kommer fra TracTracs oprindelige SOG-felt og interpoleres
  lineært mellem de to tilhørende kildetider; den beregnes ikke fra positionsændringer
  eller den afrundede jet-farve. Tal over 15 knob vises med deres faktiske værdi.
  Manglende fartdata vises som **Fart mangler**. Punktet kan stadig pinnes.
- Mærkets værdi følger den synlige sportype: SOG i **kn**, absolut eller
  handicapkorrigeret fartforskel i **kn**, eller tidsgevinst i **s/100 m**.
  Positive forskelle betyder hurtigere fremdrift end referencebåden ved samme
  sted på ruten. Sammenligningsværdierne læses fra sporets forberedte WebGL-data;
  skift af sportype genberegner dem ikke. Referencebådens mærker viser fortsat SOG.
  Manglende sammenligning vises som **Sammenligning mangler**, uden skift til SOG.
  Punktet kan både pinnes og fjernes, når data mangler.
- **Pin** ved fartmærket gemmer punktet. Et pinnet mærke vises i både redigering
  og præsentation, når båden er valgt, punktets tid ligger i det viste to-timersspor,
  og selve punktet er i kortudsnittet. Det behøver ikke være bådens aktuelle position.
  Det skjules automatisk uden for perioden, ved fravalg af båden og uden for udsnittet.
  Klik på et pinnet mærke i redigering, og vælg **Fjern pin** for at fjerne det.
  Klik på tomt kort eller tryk Escape for at lukke et midlertidigt fartmærke;
  pinnede mærker bevares. Et træk fra sporet panorerer stadig kortet.
  Pin-knapperne kan også betjenes med Tab og Enter/mellemrum.
  Midlertidige mærker vises kun under redigering. Præsentationen viser kun pins.

Fart-pins gemmes separat i browserens `sr2026-speed-pins` som `id`, `boatId` og
præcis tracktid i sekunder. De bevares ved genindlæsning og deles mellem events,
uden at ændre noterne. Position og fart slås op i det uændrede track ved visning.
Pins er lokale for browseren; den eksisterende note-JSON eksporterer noter og billeder.
`node scripts/test_viewer_speed_pins.cjs` kontrollerer valg af kurvepunkt, fart,
pin/unpin, genindlæsning, perioder og udsnit, panorering og præsentation i
Chromium og Firefox.
`node scripts/test_viewer_pin_units.cjs` tester lokalt i Firefox på PC, at pins
følger sportypens tal og enhed, genbruger forberedte sammenligninger og bevarer
deres betydning ved referencevalg, genindlæsning, manglende data og præsentation.

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
  store, åbne lilla pile. Laget er slået til fra start og kan skjules.
  Valget gemmes med noter. Pile og skravering har fast skærmstørrelse ved zoom.
- **Skydeområde · Hatter Barn** viser polygonen fra dine syv hjørnekoordinater med
  sort kant og skravering. Laget kan vælges uafhængigt af TSS og gemmes med noter.
  Skraveringen har samme faste størrelse som TSS.
  Kyst, trafikseparering, skydeområde og Rute T ligger samlet i landkortets SVG-lag
  `baseMap`, over vindfarver, landfyld og radarbyger, men under vindpile og bådspor.
  Landfyldet er et separat lag under radaren.
- **Rute T** tegnes som en åben, sort linje gennem brugerens 11 koordinater i
  den angivne rækkefølge. Linjen har fast stregbredde ved zoom.
  Koordinater og kildeoplysninger ligger i `../data/route-t.geojson`;
  decimalminutterne er bevaret i metadata. Linjen markerer den Rute T, der ifølge
  brugerens sejladsbestemmelser ikke måtte krydses.
- **Start og mål** er indtegnet fra TracTrac event 3539 og markeret med tekst og
  endepunkter. Startlinjen er grøn; mållinjen er rød og stiplet. Begge linjer
  ligger i `baseMap`, over radaren og under vindpile og bådspor.
  Stregbredde, endepunkter og tekst har fast størrelse ved zoom.
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

- Kun valgte både tegnes, med alle datapunkter inden for den valgte sporlængde frem til
  den valgte tid. Bådmarkørerne følger en glat interpolation ved skyderens præcise
  tidspunkt. Sporene tegnes som kurver gennem målepunkterne og forbliver glatte
  ved alle zoomniveauer. Punkterne findes med binær søgning, så resten af tracket
  ikke gennemløbes ved hver opdatering.
- Skriv en hændelse, tryk **Placér på kortet**, og klik hvor den skete.
  Noten bliver en nummereret markør på kortet. Teksten vises i højrepanelet,
  som også er synligt under redigering. Zoom og træk kan stadig
  bruges under placering; **Annullér** eller Escape afbryder placeringen.
- Annotationer vises ved deres gemte tidspunkt. Klik på en note i listen for at
  genskabe tidspunkt, zoom, kortudsnit, vindmodel, vejrlag og valgte både.
  **Vis annotationer ved dette tidspunkt** kan skjule dem.
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
  Synlige tegninger følger med i noteeksporten.
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
  og tegninger. Billedvisningen og eventpanelet er separate.

Billeder uploades via `POST /api/event-images` og gemmes på serverens disk i
`./event-images/`. De servergenererede adresser `/event-images/<uuid>.webp`
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

Redigering, tegneværktøjer, annullering, genindlæsning, præsentation samt
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
styres separat i siden.

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

Tracks: TracTrac event 3539, SR Grønsund og SR Bøgestrømmen. Begge replayfiler er
genhentet og valideret mod de officielle klassestarter og registrerede måltider;
`../data/tractrac/coverage.json` dokumenterer dækningen for alle 106 både og de
81 registrerede målpassager. Alle 730.370 positioner er identiske med det tidligere
download. Den tidligere faste visningsgrænse 13. juni kl. 04 dansk tid er fjernet:
visningsperioden udledes nu af hele datasættet og omfatter alle startskud og
slutpositioner med fem minutters margen. Den fulde udgave er
bevaret i `../data/tractrac/combined_tracks.json`. De 730.370 oprindelige
trackpunkter er offlinegrundlaget. Buildet resampler alle både med formbevarende
kubisk Hermite-interpolation (PCHIP) på det fælles gitter `DATA.start + n * 10`
sekunder. Præcise første/sidste tidspunkter og begge sider af datahuller bevares
som ekstra knuder. Huller over fem minutter interpoleres ikke. Det nuværende
datasæt giver 1.800.766 knuder, fordi mange oprindelige intervaller er 60 eller
120 sekunder. Position og målt SOG resamples før alle sammenligningsberegninger.
Renderingen interpolerer fortsat kubisk mellem de nye knuder, ikke lineært.
Den samme kurve bruges til spor, positionsprik og beregning af,
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
kildedata; de resamplede knuder er interpolerede værdier, ikke nye observationer. Metode:
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
Absolut fart bruger målt SOG, ikke fart beregnet af koordinatforskelle.
Kildens fart resamples kubisk under buildet; mellem replayknuderne interpoleres
fartfarven lineært. Replayets PCHIP-kurve opdeles ved jet-skalaens 128 farvetrin uden at ændre
geometrien. Der farves ikke hen over trackhuller på mere end fem minutter.
Manglende eller negative fartværdier vises gråt og erstattes ikke med nul.
Farver over 15 knob mættes uden at ændre eller afskære selve fartdataene.

Genskab fartdata med `node scripts/collect_track_speeds.mjs` og derefter
`python3 scripts/prepare_viewer.py`. Det første trin bruger den cachede
`worker_node.mjs` og de to løbsmetadatafiler til at hente replayet igen.
`node scripts/test_viewer_speed.cjs` kontrollerer alle kildekonverteringer.
`node scripts/test_viewer_webgl_tracks.cjs` kontrollerer renderede fartfarver,
kurvegeometri og trackhuller i lokal Firefox på PC (kræver Playwright).

Trackhuller over fem minutter forbindes ikke med en linje; bådmarkører skjules,
når sidste position er mere end fem minutter gammel. Trackstart/-slut er ikke
nødvendigvis løbsstart/målgang.

Kystlinjen bruger **OpenStreetMap** i fuld kildeopløsning: 3.114 kyststrækninger
med 343.655 koordinater. Der er ingen geometrisk forenkling. Kortlaget viser
kyster, små kystdetaljer og havnebassiner.

Landmasserne fyldes med lys grå `#bdc7cb`; kyststregen bevarer `#365766`.
De 997 landpolygoner er dannet fra samme detaljerede OSM-kystlinje. Lagrækkefølgen
er vindfarver nederst, derefter landfyld, radar og kystomrids. Vindpile og spor
ligger over disse lag.
Kystlinjerne samles til flader
inden for udtrækkets geografiske grænse, og land/hav bestemmes af OSM-linjernes
retning (land til venstre). Der lukkes ikke med vilkårlige streger gennem havet.
Datagrundlaget forenkles ikke; øer og havnebassiner følger den eksisterende kyst.
Det afledte datasæt er `../data/land-osm.geojson`.
Genskab med `.venv/bin/python scripts/prepare_land.py` og derefter
`python3 scripts/prepare_viewer.py`. Shapely står i `scripts/requirements-geography.txt`.

Kilden er OSM’s `natural=coastline`, hentet 7. november 2026 med Overpass.
Det regionale udtræk dækker 9,3–14,2 E / 53,8–57,2 N. Hele de udvalgte kystvejes
geometrier er bevaret. Råsvaret ligger i `../data/geography/osm-coastline.json`,
og GeoJSON med kilde-/licensmetadata i `../data/coastline-osm.geojson`.
Data gemmes lokalt; kortet fungerer uden netforbindelse.

Visningen opdeler kysten i bidder med fælles endepunkter og tegner kun dem,
der rammer det synlige udsnit. Det holder tæt zoom hurtigt uden
at fjerne kildens detaljer. Kreditering følger med på kortet:
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
skravering og følger med i noter med gemte lagindstillinger.

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
følger kortet.

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
Navne har fortsat fast skriftstørrelse; farver, klik og præsentation bevares.

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
og `flushRender()` udfører ventende arbejde. Fartmærker tegnes én gang pr.
fuld gentegning. Opløsning, sporpræcision og afspilningshastigheder er uændrede.

`node scripts/test_viewer_render_scheduler.cjs` kontrollerer samling af input,
seneste tilstand, prioritet, synkron tegning, ventende arbejde under en tegning og
genbrug ved panorering.

Sporlaget bruger WebGL 2 i `track-renderer.js`. Hvert kildeinterval gemmes én
gang som fire RGBA32F-texels med PCHIP-kurvens koefficienter,
tidsstempler og registrerede fartværdier. Teksturerne forberedes for hele sejladsen
og hele feltet, før kortets betjening åbnes, og beholdes ved fravalg og
frem-/tilbagespoling. Alle bådes projicerede kildeprøver og passageprofiler
bygges offline før opstart med den samme fælles nominelle matematik som visningen.
Ved opstart og derefter én gang pr. referencevalg beregner GPU'ens transform feedback
absolut- og handicapforskel samt tidsforskel pr. 100 meter i en genbrugt
sammenligningsbuffer med tre floats pr. kildeprøve. Resultatet kopieres direkte
fra GPU-bufferen til en genbrugt RGB32F-tekstur via `PIXEL_UNPACK_BUFFER`, uden
CPU-tilbagelæsning. Alle tre grundlag er dermed klar før betjening, også når sammenligningen
er slået fra ved indlæsning. Referencevalg kræver ingen CPU-genberegning eller upload
af sporgeometri; bådvalg og grundlagsskift genbruger de eksisterende GPU-data.
Afspilning ændrer tidsgrænser og de intervaller, der tegnes, uden at bygge SVG-strenge,
slå referencepassager op pr. frame eller uploade nye spordata. Vertex-shaderen
adresserer geometri og sammenligninger med `firstInstance + gl_InstanceID`.
Der er ingen rastercache, atlas, kompositionsshader eller cacheopvarmning. Hvert
synligt tidsinterval tegnes direkte fra sine forberedte koefficienter. GPU'en
danner trekantsstrimler procedurelt fra `gl_VertexID`; der uploades ingen mesh
eller beskrivelser af skærmfelter under betjening.

Underopdelingen vælges ud fra en fast grænse på 0,125 CSS-pixel for kurvens
centerlinje. For en kubik `p(u)` ligger `p''(u)` på et linjestykke, så maksimum
af endepunkternes normer begrænser dens anden afledte. Før betjening gemmes
hver båds maksimale grænse `M`. Kameraets skærmskala giver antallet
`N = ceil(sqrt(M * scale / (8 * 0.125)))`, mindst én underopdeling.
Det følger interpolationsgrænsen `error <= max(|p''|) / (8*N*N)`.
Der er intet fast loft på 32 underopdelinger ved nærzoom. Kameraet vælger kun
et antal fra allerede forberedte data; kildepunkter og kurver genberegnes ikke.

Virkelige kapper ved sporender og huller adresseres af en lille statisk RG32I-
tekstur. Tidsvinduets to klippede ender tilføjes som to instanser. Kroppen og
kapperne bruger samme shader og samme tidsdybde, med to draw-kald pr. båd.
Interne kildeintervaller får ingen kappevertices. Referencebåden tegnes først
med egen farve og 18 % opacitet; dybden nulstilles derefter for de øvrige både.
`webglTracks.stats` tæller frames, draw-kald, vertices, kildeintervaller og kapper.

`mapViewport()` er det fælles kamera for WebGL og SVG. Det afleder projektionen
fra kortets viewBox og én gemt CSS-layoutmåling med SVG's `xMidYMid meet`.
Layout genmåles ved resize, panelskift og sidescroll. Zoom/panorering læser
hverken `getScreenCTM()` eller `getBoundingClientRect()` og uploader kun
shaderparametre. Bådmarkører, skrog, navne, signatur, målestok og geografisk
faste SVG-figurer genbruges; kameraet genberegner ikke bådlistens indhold.
Vindpile og fartmærkers kantplacering har fortsat kameraafhængig SVG-logik.

Kameraændringer bevarer tidspunktet og udløser kun en viewport-tegning.
Tidslinjens geografiske passageindeks opdateres samlet 150 ms efter sidste
kameraændring. Det er afledt slider-UI og udløser ingen scenetegning eller
tidsændring. Ved betjening af slider eller step synkroniseres et ventende
indeks først. Afspilning bruger kun den valgte tid, forløbet vægtid, hastighed og
en global slutgrænse eller et udtrykkeligt eventmål. Der gemmes intet separat
afspilningsoffset eller kopi af passageperioder. Opdatering af slideren kan
hverken flytte afspilningsklokken, nulstille dens ticktid eller stoppe den.
`node scripts/test_viewer_playback_camera.cjs` kontrollerer faktisk wheel-zoom
hen over gamle passagegrænser, opstart i et tidshul, brøkdele uden stilstand,
Afspil/Pause uden synlige passager og begge globale slutgrænser.

`node scripts/test_viewer_track_geometry.cjs` sammenligner alle fem farvevalg
med en tæt 128-delt GPU-reference og efterprøver centerlinjens fejlgrænse ned
til mindste kortbredde. `node scripts/test_viewer_track_bindings.cjs` kontrollerer
frem-/tilbagespoling, handicap og teksturrækkegrænser uden attributændringer,
uploads eller tilbagelæsning af faste GPU-data under afspilning.
`node scripts/test_viewer_zoom.cjs` kontrollerer wheel-ankring, bevaret tid,
genbrug af SVG og nul layoutmålinger, GPU-uploads eller scene-/listeopdateringer
under zoom. `node scripts/profile_viewer_zoom.cjs` måler input, tegning og separat
GPU/driver-ventetid; `gl.finish()` bruges kun i profilværktøjet.
Arkitekturreview, plan og resultater findes i [GPU-arkitekturen](../docs/gpu-architecture.md).

GPU'en evaluerer kubiske kurver, klipper dem til den valgte sporlængde og slår
fartfarver op i den faste 128-trins palet. Dybden interpoleres fra det lokale
tidspunkt langs kurven; nyere passager dækker ældre, uanset båd og fartfarve.
Tidens høje og lave del gemmes separat, så millisekunder også kan skelnes sent
i sejladsen. Dybden sættes i vertex-shaderen, så GPU'en kan afvise skjulte
fragmenter tidligt. Kant og sporfarve tegnes i én passage med samme tidsdybde.
Overgangen mellem fartfarve og mørk kant udjævnes med `fwidth` og `smoothstep`
over cirka én rasterpixel. Sporlaget tegnes med 2× rasteropløsning i begge retninger
ud over WebGL-kontekstens multisample-antialiasing. Nedskaleringen udjævner også
den mørke yderkant mod kortet uden at ændre sporbredde eller tidsbaseret dybde.
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

Der er kun én renderingsvej: WebGL 2 til både baggrund og spor samt SVG til
ikoner og annotationer som en del af den nominelle komposition.
Ingen CPU- eller SVG-reserve vælges på andre PC'er. Hvis WebGL
mangler eller en kontekst mistes, skjules kortet, afspilning stoppes, og årsagen
vises tydeligt. En gendannet kontekst genopbygger den samme WebGL-renderer.
Det generelle princip om én nominel implementering er beskrevet i
[projektprincipperne](../AGENTS.md).
`node scripts/test_viewer_track_time_layers.cjs` tester lokalt i Firefox på PC:
modsatrettede krydsninger, selvkrydsning, millisekunder, pauser, tidsvindue,
tilbagespoling, klik og genbrug af GPU-buffere med den nominelle renderer.
`node scripts/test_viewer_track_joins.cjs` kontrollerer tætte lige og buede spor
ved flere zoomniveauer, samlinger uden striber, kantudjævning og runde ender i lokal Firefox.

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
skærm og ved HiDPI.

`node scripts/test_viewer_background.cjs` kontrollerer landhuller, lagrækkefølge,
genbrug af geometri og teksturer, vejrskift og tab/gendannelse af konteksten.
`node scripts/test_viewer_nominal_rendering.cjs` kontrollerer i lokal Firefox
på PC både normal visning og tydelige fejl ved manglende WebGL eller tab af
en af de to kontekster. Den kontrollerer også, at video kræver fuld skærm.

`node scripts/test_viewer_webgl_tracks.cjs` kontrollerer faktiske GPU-pixels,
huller, fartdata, genbrug af buffere og tab/gendannelse af konteksten.
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
indlæsning og lagtilstand; de tegnes ikke selv på kortet. Det næste radartidspunkt
og næste vindtime indlæses, afkodes og uploades på forhånd. Indlæsningen må
aldrig overskrive teksturen til det viste billede. Den færdige buffer vises ved
tidsskiftet. Den gamle buffer beholdes gennem den første tegnecyklus, før
den skjules og må genbruges, så skiftet ikke efterlader et tomt billede. Et uventet tidsspring beholder det aktuelle billede, indtil det
nye er klart; forældede indlæsninger kan ikke overtage visningen. Manglende
radardata skjules fortsat og markeres som manglende.

Bådikoner og navne tegnes i det fælles `boatMarkers`-lag over alle bådspor.
Det gælder også ved afspilning.

## Kilder til bådmål

`boat-measurements.js` indeholder de genererede, kildebelagte mål.
`boatMetadataOverrides` har forrang for mål angivet af brugeren; en ændring
af skrogformen alene bevarer de indsamlede mål. Standardformen er `common`.
THE HULK, My, Vera, Mercutio, saltamalin, Laolao, XBOX og Quinta Light bruger
`modern`; Slipstik og Ambra bruger `classic`.

Se `../data/boat-dimensions/dimensions.csv` for hele oversigten og
`../data/boat-dimensions/README.md` for metode og genskabelse.

### Måling og fartforskel langs rhumblinen

`rhumbline-geometry.js` beregner sfæriske rhumbline-distancer med jordradius
6.371.008,8 m og 1 sømil = 1.852 m. Klikpunkter gemmes som længde/breddegrader;
skærmens zoom ændrer ikke målingen. Hvert delstræk har konstant geografisk kurs.
Bådens sted findes ved vinkelret projektion på rutens nærmeste delstræk i
Mercator-koordinater og omsættes til fysisk distance fra rutens begyndelse.
Der ekstrapoleres ikke før/efter den tegnede rute.

Den målte TracTrac-SOG projiceres på delstrækkets kurs ved hjælp af retningen fra
den nominelle PCHIP-kurve. Sideværts sejlads tæller derfor ikke som fremdrift.
Hver mulig referencebåds gyldige trackintervaller samples med højst 10 meters
geografisk bueafstand, ikke et fast tidsinterval. Fremdriften gemmes ved et fælles
gitter langs rhumblinen med 10 meters afstand. Den anden båds **samme langs-rute-position**
slås direkte op ved den nærmeste station,
uanset klokkeslæt og tværgående afstand fra ruten. Hvis referencebåden passerer samme
rute-position flere gange, bruger fartvisningerne den første fremadgående passage.
Tidsvisningen summerer i stedet alle passager i en separat stationsprofil.
Begge slags profiler er forberedt for alle både, så opslag kun kræver et array-indeks.
Passagegrænser afrundes til nærmeste
station (højst fem meters usikkerhed); en kort passage kan dække én station.
Den sidste station repræsenterer rutens præcise slutpunkt.
Sammenligningen kan bruge referencebådens senere passage, også når den ligger efter kortets aktuelle tid.
Trackinghuller over fem minutter forbindes ikke, og der ekstrapoleres ikke til
rute-positioner ud over gitterets halve stationsbredde, som referencebåden ikke
har passeret med gyldige data. Huller større end 10 meter bevares som manglende.

Absolut forskel er `v_båd − v_reference`, hvor begge farter er den projicerede
fremdrift i knob ved samme sted. Handicapvisningen bruger løbets TracTrac-felt
`handicapDistance` som ToD-sømiletid `TA` i sekunder/sømil, ført med via
`prepare_boat_details.py`. ToD-tillægget i den valgte båds reference er
`TA_reference − TA_båd`. Det omregnes til sammenlignelig fart som
`v_korrigeret = v_båd / (1 + (TA_reference − TA_båd) × v_båd / 3600)`;
farven viser `v_korrigeret − v_reference`. Manglende måltal eller en ikke-positiv
nævner giver manglende sammenligning. Beregningen er en lokal sammenligning af
fremdrift, ikke en resultatliste med starttidskorrektion.
Baggrund: [Dansk Sejlunions forklaring af DH og tid på distance](https://dansksejlunion.dk/kapsejlads/regler-og-vejledning/dh-reglen).

Visningen **tid pr. 100 m · alle passager** bruger to forberedte tidsdatasæt pr. båd,
uden handicapkorrektion. Retningen findes som finite difference mellem successive
GPS-positioner; ved slutningen af en sammenhængende serie bruges den indgående
difference. Fartstørrelsen kommer fra den separate målte SOG, ikke GPS-differencens
længde pr. sekund. Den projicerede fart på rhumblinen giver den tidsindekserede
værdi `secondsPerMeter = 3600 / (1852 × abs(projiceretSOG))`.
Baglæns sejlads har dermed et positivt tidsforbrug, også ved vendepunkter hvor
PCHIP-tangenten er nul.

Disse værdier projiceres langs den nominelle sporkurve til 10-meterstationer.
Inden for en enkelt fremad- eller tilbagegående passage gennemsnittes tidsforbruget
efter dækket længde i hver stationscelle. Bidragene fra forskellige passager
lægges sammen; målefrekvensen giver ikke flere bidrag i sig selv. En båd, der
sejler frem, tilbage og frem over samme sted med konstant fart, får således tre
gange tidsforbruget dér. Huller over fem minutter eller manglende SOG forbindes ikke.

Farven på båd B bruger dens tidsindekserede værdi sammen med referencebåd A's
summerede stationsværdi: `100 × (referenceSecondsPerMeter − ownSecondsPerMeter)`.
Positiv værdi betyder indhentet tid (mættet blå), negativ tabt tid (rød).
En enkelt passage ved 3 knob mod 4 knob giver cirka −16,2 s/100 m;
13 mod 14 knob giver kun cirka −1,1 s/100 m. En reference, der kun sejler
baglæns, har stadig en gyldig tidsprofil, selv om fartprofilen ikke har en
fremadgående passage. Egen baglæns passage har samme lokale tidsforbrug som
fremadgående passage med samme projicerede fartstørrelse; den får ikke et ekstra
fortegnsbaseret tab. Det er referenceprofilen, der summerer genbesøg.
Den lineære farveskala går til ±120. Større tab (under −120) vises varmt gult,
og større gevinst (over +120) vises magenta. Præcis på grænserne er farverne
fortsat rød og blå. Skalaens spidser viser farverne uden for intervallet;
hover og pins viser altid den faktiske værdi.
Præcis nul projiceret fart giver uendeligt tidsforbrug, ikke manglende data.
GPU'en bruger en endelig overflowmarkør, så interpolation ikke giver NaN;
hover og pins viser ±∞, og sporet bruger skalaens overflowfarve.
Hvis begge værdier er uendelige, er forskellen udefineret og vises grå,
ligesom manglende fælles data. En periode uden ændring i station får sin faktiske
varighed fordelt på stationens 10 meter i referenceprofilen.
Visningen er en lokal sammenligning af tidsforbrug, ikke et akkumuleret forspring.
Valget gemmes ligesom de øvrige sporvalg.

De projicerede kildeprøver og passageprofiler for alle både bygges offline af
[`prepare_track_profiles.cjs`](../scripts/prepare_track_profiles.cjs) før opstart.
Generator og visning bruger den samme nominelle matematik i
[`tracks.js`](./tracks.js), [`rhumbline-geometry.js`](./rhumbline-geometry.js) og
[`navigation-math.js`](./navigation-math.js); den fælles tidsgrænsesøgning ligger i
[`track-time.js`](./track-time.js). Der findes ingen separat alternativ beregningsvej.
Profilerne bruger pakkede 10 bit pr. 10-meterstation: 0–1022 koder for 0–25 knob,
1023 for manglende data. Højere hastigheder klippes til 25; negative til 0.
Afrunding til nærmeste kode giver højst cirka 0,0123 knobs kvantiseringsfejl
inden for intervallet. Ruten på cirka 417 km giver 41.709 stationer pr. båd.
Fart ved hvert resamplet tidsindekseret punkt gemmes også med pakkede 10 bit.
På serveren fylder kildepositionen otte bytes: Float32-indeks og -progression;
dertil kommer fartkoderne, fire værdier i fem bytes. Kun sidste bytes ubrugte
høje bits nuludfyldes. Negativ egen VMG bevares i indeksfeltets fortegn uden ekstra bytes;
positioner og tidsstempler kvantiseres ikke til 10 bit.
Alle både pakkes i én fingerprint-navngivet `fleet.bin`, som hentes med ét request.
Manifest v7 angiver hver båds byte-offsets og den samlede filstørrelse; indlæsningen
afviser ugyldige områder, overlap og afkortede filer uden at offentliggøre delvise data.
Pages publicerer det aktuelle manifest, metadata og den tilhørende samlede fil;
den oprindelige `data.js` bruges kun offline. [`replay-data.js`](./replay-data.js)
henter metadata og binærfil parallelt og genskaber tidsaksen fra segmentgrænser
og det fælles 10-sekunders gitter. Replayposition og målt SOG fylder 12 bytes pr.
punkt som lokale Float32-koordinater og fart; farvegrundlag forbliver pakkede 10 bit.
Fartdata fylder cirka 21,16 MiB: 15,89 MiB kildeprøver og
5,27 MiB referenceprofiler. Browseren afkoder kildeprøverne én gang til GPU'ens
Float32-format (20,61 MiB), mens alle referenceprofiler beholdes som Uint16-koder (8,43 MiB).
Profilerne pakkes ud af downloadbufferen, så denne kan frigives efter indlæsning;
der beholdes ingen views, som fastholder de allerede afkodede kildeprøver.
Også tidsfarver gemmes som pakkede 10-bit-heltal, først efter at projektioner og
summering af passager er færdige. Hver blok på højst 256 værdier har én Float32-skala,
så store endelige tidsforbrug bevares uden et fast maksimum. Koderne 0–1021 er
`kode * skala`; 1022 betyder uendelighed og 1023 manglende data. Fejlen er højst
cirka 0,049 % af blokkens største endelige værdi. Skalaerne fylder cirka 0,016 byte
pr. værdi ud over de 1,25 byte for selve 10-bit-koderne. Stationsindeks bevarer
deres Float32-præcision, og alle tidsindekserede farvearrays bruger bådens ene
resamplede tidsakse; der gemmes ingen ekstra tidsstempler. Slutprøvens dublet
genskabes ved afkodning. Den samlede binærfil er cirka 56,14 MiB før HTTP-komprimering,
inklusive 20,61 MiB replaykoordinater og SOG, 9,04 MiB tidsprøver og 5,34 MiB tidsprofiler.
Det samlede CPU-lager for afkodede fart- og tidsprofiler
er cirka 59,64 MiB. Lageret vokser lineært med
kildeprøver og antal både; der opbygges ingen cache for alle bådpar.
Profilerne gemmer hverken stationspositioner eller tider. Hoverens omtrentlige
referencetid findes ved opslag og interpolation mellem de allerede forberedte
kildepositioner og deres resamplede tidsstempler.

Kun den valgte references fart- og tidsprofiler uploades til en genbrugt RG32F
GPU-tekstur, cirka 0,320 MiB i den aktuelle opsætning. Transform feedback slår dens stationer op én gang pr.
referencevalg og skriver absolut-, handicap- og tidsforskel ved de resamplede
kildepunkter til en genbrugt GPU-buffer med tre floats pr. kildeprøve. Den ekstra
kanal bruger cirka 6,87 MiB GPU-lager for det aktuelle felt og opretter ingen
cache for bådpar. Kildebufferen
indeholder det heltallige stationsindeks, progression i sømil og egen VMG; indekset
beregnes før Float32-konvertering, så GPU'en ikke afrunder til en anden station.
En separat statisk kildebuffer indeholder tidsprøvens stationsindeks og tidsforbrug.
Forskellene interpoleres langs sporet i den fælles WebGL 2-renderer.
Et grundlagsskift ændrer kun shaderens valg af de allerede
forberedte værdier. Referencevalg genberegner ingen CPU-profiler og uploader
ingen sporgeometri; afspilning laver ingen referenceopslag pr. frame.
Geometriteksturerne, sammenligningsteksturerne og sammenligningsbufferne bevares ved afspilning. CPU-data
bevares også ved tab af WebGL-konteksten, så GPU-ressourcer og sammenligningsværdier
kan genskabes fra de forberedte data.
Referencebådens spor bruger bådens egen farve med 18 % opacitet i sammenligningsvisningerne
og tegnes under de øvrige spor. Almindelig SOG-visning beholder SOG-paletten.
Farver uden sammenligningsdata
er grå og bruger aldrig SOG som erstatning. Den permanente definition ligger kun
i `viewer/rhumbline.json` som `{version:1,points:[[lon,lat],...]}`. Boot henter og
validerer denne fil og låser punkterne for resten af visningen; en manglende eller
ugyldig fil vises som en indlæsningsfejl. En tom punktliste angiver, at ejeren
endnu ikke har tegnet ruten; sammenligning er da utilgængelig med en tydelig besked.
Lokalt tegnes ruten på `/rhumbline.html`, som genbruger de samme WebGL-renderere
med isoleret eventlager. `POST /api/rhumbline` på den lokale server gemmer filen
atomisk og afviser overskrivning af en allerede defineret rute. Det separate
tegneværktøj udgives ikke med Pages. Projektfilen følger med Pages-bygget.
Sportype, sporlængde og referencebåd er lokale visningspræferencer under
`sr2026-track-comparison`, `sr2026-track-length` og `sr2026-reference-boat`;
de gemmes ikke i præsentationsdokumenter og ændrer ikke events. Målelinjen
er midlertidig.
