# Teknisk gæld

Aktuel liste over bevidst udskudt arbejde. Opdater ved relevante ændringer; slet
løste eller overhalede punkter. Arbejdsformen er beskrevet i [AGENTS.md](./AGENTS.md).
Listen bestiller ikke arbejde eller udvidede tests ved hver iteration. Catch-up
udføres, når brugeren beder om det, efter at featuresæt og adfærd er faldet på plads.

Hvert punkt angiver område, udskudt arbejde, konsekvens/usikkerhed og kriterium
for afslutning. Nye punkter skal være konkrete og kunne handles på.

## Åbne punkter

### MAP-02 — Visuel accept af brogeometri

- **Område:** [OSM-udtræk](./viewer/bridges.geojson), [brovalg](./viewer/events/catalog.json) og [WebGL-baggrund](./viewer/background-renderer.js).
- **Gennemført:** Alle ønskede forbindelser er repræsenteret af OSM-brosektioner og vælges eksplicit pr. stævne. Storebælts dæk tegnes som forberedte, udfyldte polygoner med geografisk bredde (Vestbro 40 m, Østbro 25 m); begge Lillebæltsbroer har tilsvarende udfyldte dæk med bredde fra pillernes længste sekskantsider, mens pillerne bevares. Den nye Lillebæltsbros lige dæk tilpasses med én rotation/translation gennem de to pyloners arealmidtpunkter og ens endestrækninger (ca. 557,8 m), uden skalering; hurtig kontrol genmåler centrering, endesymmetri og bevaret længde. Visuel accept af tilpasningen udestår. Øvrige broakser og kanter bruger kystens linjemesh. Alt tegnes under sporene. Hurtige tests kontrollerer fordelingen på alle fire stævner og tydelig fejl ved manglende geometri; pakken inkluderer den fælles GeoJSON-fil. Målrettet skjult Firefox-kontrol bekræfter fyld inden for og gennemsigtighed uden for begge dæks faktiske bredde ved to zoomniveauer samt uændrede GPU-buffere ved zoom.
- **Udskudt/usikkerhed:** Visuel browserkontrol af linjebredde, samlinger og kontrast ved oversigt og stort zoom. Udtrækket bruger vej-/baneakser og ved Guldborgbroen dækomridset, suppleret med de 12 pille-/pylonomrids, som findes i OSM (Østbroen, Lillebælt og Farø Syd). Pillerne skaleres geografisk og trianguleres én gang. Vestbroens 62 piller bruger nu brugerens individuelle satellitpunkter som midtpunkt på syd/sydøst-endefladen (6 m langs broen og 42 m på tværs). Hvert punkt fastholdes, og pillen drejes vinkelret på den nærmeste OSM-brostrækning med udstrækning mod nord/nordvest. Hurtig kontrol dækker alle 62 punkters fastholdelse, dimensioner og retning. Den tidligere fag-/fyrbaserede estimering er erstattet. Dækket tilpasses nu med én samlet rotation/translation (±2° og ±20 m pr. akse) til de faste pillemidtpunkter. Mindste-kvadraters-afstanden til centerlinjen er 0,42 m RMS og højst 0,88 m; løsningen ligger inden for de aftalte grænser. Hurtig kontrol genmåler residualerne på den publicerede geometri. Brugeren kontrollerer visuelt samspillet mellem det flyttede dæk og pillerne; satellitaflæsning og OSM-akse kan afvige. Øvrige manglende piller kræver en anden kilde eller en aftalt rekonstruktion. Ingen 3D-geometri.
- **Færdig når:** Broerne fremstår sammenhængende og læselige i brugerens foretrukne zoomniveauer på de fire kort.


### DATA-03 — Kalman-filtrering af GPS-outliers

- **Område:** [filter](./scripts/kalman_track_filter.cjs), [profilbyg](./scripts/prepare_track_profiles.cjs) og `trackFilter` i [konfigurationen](./viewer/events/catalog.json).
- **Gennemført:** Robust fitting pr. båd og konservativ innovationstest i begge retninger før kodning/profiler. Native snapshots og alle beholdte værdier bevares. Hurtige tests dækker enkelt-/dobbeltspikes, sporender, manøvrer, ujævne/sparsomme intervaller, huller og utilstrækkelige segmenter. De fire datasæt er gennemgået med fit-/afvisningsrapporter; 252 målinger udpeges samlet.
- **Udskudt/usikkerhed:** Visuel accept af de markerede målinger i de reelle sejladser. Sammenhængende GPS-forskydninger eller biltransport kan følge en troværdig bevægelse og blive bevaret; korte segmenter under fem punkter filtreres ikke. Kortets eksisterende afstandsfelt bygger fortsat på rådata og kan derfor bevare unødvendige detaljer nær afviste punkter.
- **Færdig når:** De virkelige afvisninger er accepteret med konkrete eksempler; eventuelle fejl klassificeres og bruges til målrettet justering. Næste kortforenkling anvender samme filtreringsgrundlag før afstandsberegningen.


### UI-07 — Samlet stævneskift og Silverrudder-metadata

- **Område:** [stævnevælger](./viewer/event-selection.js), [stævnekonfiguration](./viewer/events/catalog.json), [import](./scripts/import_tractrac_event.py) og online redigering.
- **Gennemført:** Alle syv TracTrac-løb er hentet direkte fra JSON/lagrede filer og samlet med deres UTC-starttider, kilde-ID'er og 411 trackere. Et separat 0,2°-kort er bygget fra den detaljerede Danmarkskilde og Silverrudder-sporene; kun Storebæltsbroens TSS er overført. Hurtige tests kontrollerer browserlagringens adskillelse/migrering, stævneskiftets navigation, ukendte ID'er samt backendens separate læse- og skriveveje. 2024 og 2026 er også importeret med hhv. syv separate løb og ét samlet løb med syv klassestarter; de genbruger 2025-kort og rute. Modelreglen udvælger featured-både ved import. Stævneafhængig opsætning er samlet i ét katalog; samme tracker-layout bruges via genererede indgangssider, også lokalt. Hurtige tests kontrollerer URL-præfikser og kladdemigrering. De tre Silverrudder-årgange har hver deres klargjorte vejrdata, og standardkontrollen kontrollerer kilder, tidsdækning og alle billedstier. Skjult Firefox-kontrol på Sjælland Rundt bekræfter vindfanernes 90-pixel-gitter, faste skærmstørrelse og genbrug af SVG-elementer ved afspilning, pan og zoom.
- **Udskudt/usikkerhed:** Visuel kontrol af de nye årgange 2024/2026, den nye landing og de symmetriske direkte links (inkl. admin-login) samt det samlede stævneskift, genoprettede Sjælland Rundt-events og Silverrudders filtre på PC/iPhone samt autentificeret udgivelse med det valgte stævne. Kontrollér trackerens Worker-routes og OAuth-callback med en rigtig GitHub-konto efter udrulning, inklusive privat adgang og offentlig udgivelse med passende rettigheder. Et vejrlag er endnu ikke kontrolleret under afspilning i lokal Firefox på Silverrudder. Ny import opdaterer native spor, bådmetadata og kildefastsatte start-/mållinjer (fast snapshot ved første løbsstart), mens manuelle mærke-/ruteindstillinger bevares i konfigurationen; ændringer i kildegrupperingen kræver en eksplicit opdatering af konfigurationen.
- **Færdig når:** Alle konfigurerede stævner kan åbnes/skiftes med deres egne noter og valg, alle syv løb kan vises samlet eller filtreres, og rhumbline/mærker er accepteret. Kontrollér Silverrudders startnumre og nationaliteter i udfoldede bådrækker ved sprogskift som del af den visuelle accept. Online redigering læser og skriver samme valgte stævne efter login. Vindfanernes tæthed og læsbarhed over nedbørsradaren er kontrolleret ved afspilning og zoom for en OPERA-årgang og en DMI-årgang.


### UI-06 — SOG-sammenligning i browseren

- **Område:** [sammenligningspanel](./viewer/boat-compare.js).
- **Udskudt:** Visuel kontrol af panel, farver og gateforløb i lokal Firefox samt øvrige sportyper efter aftale.
- **Konsekvens/usikkerhed:** Fart over 20 knob samles ved skalaens højre kant; tempo over 7200 sekunder pr. sømil vises ikke. Gateafgrænsningen af rhumbline-stationer er ikke browserkontrolleret. Browserforløbet er endnu ikke kontrolleret.
- **Færdig når:** Panel og gateafgrænsning er visuelt kontrolleret, og eventuelle øvrige målinger er afklaret.

### DATA-02 — Undgå genberegning af sporprofiler ved rene kortændringer

- **Område:** [buildets fingerprint](./scripts/prepare_track_profiles.cjs) og kortdata i den fælles datapakke.
- **Udskudt:** Adskil kortets ændringsnøgle fra sporprofilernes, så et nyt kort kan pakkes uden at genberegne uændrede bådprofiler. Genbrug også det uændrede afstandsfelt, når kun kortets tolerance ændres.
- **Konsekvens:** En ren kortiteration udløser aktuelt omkring 50 sekunders klargøring af alle bådes profiler, fordi hele datapakken indgår i samme fingerprint.
- **Færdig når:** Kortændringer opdaterer de publicerede kortdata, mens uændrede sporprofiler genbruges med deres eksisterende integritetskontrol.

### UI-05 — Pinch efter voldsomme eller afbrudte bevægelser på telefon

- **Område:** [kortgestus](./viewer/viewer.js) og [målrettet kontrol](./scripts/test_viewer_pinch_zoom.cjs).
- **Gennemført:** Zoomgrundlaget opdateres efter hver pinch-bevægelse, så bevægelse forbi zoomgrænsen ikke ophober en dødzone. Nye primære berøringer, vinduestab af fokus og skjult side rydder afbrudte pan-/pinch-forløb. Skjult Firefox kontrollerer begge zoomgrænser og gentagne afbrydelser med syntetiske touch-pointere.
- **Udskudt/usikkerhed:** Telefonens faktiske levering af touch- og capture-events ved hurtige bevægelser er endnu ikke kontrolleret på en fysisk enhed.
- **Færdig når:** Hurtig pinch, løft/genplacering af fingre og afbrydelse/genoptagelse virker på den berørte telefon uden fastlåst zoom.

### UI-04 — Bane-/løbsfiltre og to permanente rhumblines

- **Område:** [bådvælger](./viewer/boat-list.js), [rutegemning](./scripts/serve_viewer.py) og [build](./scripts/prepare_track_profiles.cjs).
- **Udskudt:** Samlet browserkontrol af bane/løb, eventgemning/-gendannelse og referenceskift mellem banerne efter indtegning af Bøgestrømmens rhumbline. Kontroller også den kompakte skipper-/bådtype-linje, streaming af lange felter og udvidede bådrækker med klasse/farvevalg. Hjerteklik ændrer favorit, øvrige rækkeklik udvider. Klik på kortets båd åbner listen, ekspanderer rækken og flytter fokus/scroll til den; gentaget klik lader rækken være åben. Kortklik låser også kameraets centrum til båden ved afspilning og zoom via den fælles centreringsfunktion; manuel kortgestus eller Escape frigør låsen. Centrering suspenderes under pointertræk i tidslinjen og genoptages ved slip/annullering; hurtig kontrol dækker fastholdt kamera under træk og centrering efter slip. Hurtig kontrol dækker panorering/zoom/tidsændring uden skift af referencebåd; visuel accept udestår. Farvevalg gemmes pr. stævne/båd i browseren og opdaterer liste, ikon og sporet ved egen bådfarve; visuel accept og genindlæsning med brugerfarver udestår.
- **Gennemført:** Hurtige kontroller af filterkombinationer, banespecifikke projiceringer, manglende rute og valg af færdige profilopslag. Begge rutedefinitioner indgår i buildets fingerprint. Bøgestrømmens tegnekort er åbnet og starter med den rigtige bane. Målrettet skjult Firefox-kontrol bekræfter, at hover følger den faktiske række under en stillestående mus efter ændret bådantal og scroll. Kontrollen bekræfter også naturlig listehøjde, scroll ved mange både og målestokkens placering nederst til venstre eller lige ved siden af listen ved faktisk overlap, også efter filtrering og sammenklapning.
- **Konsekvens/usikkerhed:** Bøgestrømmens rute er nu indtegnet med 26 punkter; første punkt ligger midt på startlinjen. Ingen automatisk erstatning med Grønsunds rute. Browser- og telefonforløbet for referenceskift er endnu ikke valideret.
- **Færdig når:** Den rigtige profil vælges ved referenceskift, og bane-/løbsvalg (inklusive Alle baner/løb) virker i redigering og offentlig visning med eksisterende events.

### GPU-01 — Kontekstgenskabelse med lokale buffere og GPU-sammenligning

- **Område:** [build](./scripts/prepare_track_profiles.cjs), [fillæsning](./viewer/track-files.js) og [renderer](./viewer/track-renderer.js).
- **Udskudt:** Målrettet kontrol af genskabelse efter WebGL-konteksttab med den nye sammensætning af lokale buffere og uploadede profiler.
- **Aktuel løsning:** Buildet gemmer kun ruteprojektioner og stationsprofiler pr. båd og bane. Klienten danner geometri, Float64-hældninger, tidsindeks og fartbuffer én gang ved opstart. Begge baners profiler uploades før betjening; shaderen sammenligner med den valgte reference uden filer for alle bådpar.
- **Gennemført:** Hurtig matematisk kontrol af lokal geometri og direkte stationsopslag. Målrettet skjult Firefox-kontrol af begge geometrier, alle tre sammenligninger, faktiske vertexshader-resultater, referenceskift uden download og fejl ved manglende/ødelagt fællesfil. Brugeren har bekræftet, at den deployede løsning virker glimrende på iPhone. Tidligere kontekstgenskabelsestests er ikke gentaget på den nye sammensætning.
- **Konsekvens/usikkerhed:** Den nye GPU-repræsentation beholder begge baners grundlag, så referenceskift ikke uploader faste data. Sporenes GPU-data er nu ca. 142,3 MB på desktop og 118,8 MB for enkle spor, ud over baggrunden (tidligere 50,8/27,4 MB). Lageret er lineært, og almindelig brug er nu bekræftet på den konkrete iPhone. Genskabelse efter et faktisk konteksttab er fortsat ikke kontrolleret med den nye sammensætning.
- **Testarbejdsgang:** Automatisk genindlæsningskommando er ryddet efter brugerens ønske. Saml lokale rettelser og kontroller før én aftalt telefontest. Fejl og indlæsningstrin gemmes i `/tmp/sr2026-client-errors.jsonl` uden eventindhold.
- **Færdig når:** Et fremprovokeret WebGL-konteksttab genskaber geometri, begge baners profiler og den valgte sportype/reference uden dublerede ressourcer eller ændret visning.

### TEST-01 — Tilpas ældre udvidede fixtures til deploy-filer

- **Område:** [fixturehjælper](./scripts/viewer-track-fixtures.cjs) og ældre udvidede spor-/profiltests.
- **Udskudt:** De udfasede tests af GPU-klargøringen er fjernet. Den aktive filtest dækker den nuværende indlæsning. Tilpasning af resterende browserfixtures fra root-vieweren til `/events/<id>/` samt migrering af ældre GPU-/CPU-klargøringsfixtures, som opretter profiler og syntetiske både direkte i klienten i stedet for at bruge et bygget fixture-datasæt.
- **Konsekvens/usikkerhed:** Deres gamle API-, beregnings- og lagerantagelser er overhalet. Den tidligere matematiske kontrol mod den uafhængige reference genbruges; den målrettede [filtest](./scripts/test_viewer_track_files.cjs) validerer begge geometrier og den nominelle lagring; hele den ældre catch-up-suite er ikke kørt på den nye arkitektur.
- **Færdig når:** Fixtures afventer filklargøring og aktivering, lagerassertioner følger aktiv type, og relevante tests består ved et aftalt catch-up.

### GPU-02 — Bekræft bådenes lagrækkefølge på iPhone

- **Område:** [kortkomposition](./viewer/index.html), [lagrækkefølge](./viewer/viewer.css) og WebGL-renderernes canvasværter.
- **Udskudt:** Bekræftelse på den berørte iPhone af rettelsen til både, der blev vist under sporene.
- **Konsekvens/usikkerhed:** WebGL 2 tegner fortsat baggrund og spor. Deres canvasser er nu almindelige HTML-lag med eksplicit rækkefølge: baggrund, SVG-kortdetaljer, spor, SVG-både og annotationer. Canvas inde i SVG foreignObject er fjernet fra de to renderere. Den konkrete iPhone-visning er endnu ikke bekræftet.
- **Færdig når:** Brugeren bekræfter, at bådene vises over sporene ved zoom og panorering på iPhone.

### MAP-01 — Komplette arealgrænser for trafikseparering

- **Område:** [trafiklaget](./viewer/traffic.js) og [kildedata](./data/traffic-separation.geojson).
- **Udskudt:** Visuel browserkontrol af de samlede TSS-flader mod dokumenterede ydergrænser.
- **Konsekvens/usikkerhed:** Trafiklaget bruger nu lukkede flader med sammenhængende skravering uden indvendige linjer. Hatter Barns gamle trafikgeometri er udeladt, og brugerens polygoner for Hatter Barn, Storebæltsbroen og Øresund er bevaret. Øresunds to tidligere flader er erstattet af brugerens femten punkter. Ved øvrige områder er åbne ender lukket mellem kildegrænserne. Samspillet mellem lagene er ikke browserkontrolleret.
- **Færdig når:** De samlede ydergrænser er kontrolleret mod dokumenterede grænser, og skraveringen er visuelt kontrolleret i Firefox.

### UI-02 — Browserdækning af den fælles eventfane

- **Område:** [eventfanen](./viewer/presentation.js), [afspilning](./viewer/timeline.js), [billeder](./viewer/event-images.js) og [udgivelse](./viewer/online.js).
- **Udskudt:** Genetablér særskilt browsertest af nyt event, ændring af tidspunkt over midnat, tegninger og klargøring af billeder under eventskift i den fælles eventfane. Skjult Firefox-test `online` dækker de tre eventkilder, loginvindue med simuleret GitHub, private billeder, oprettelse, konflikt, eksport og bevaret korttilstand uden sideskift. Billedimport og afbrudt login er endnu ikke kontrolleret i det nye flow. Kontrollér også, hvordan længere engelske og tyske tekster fylder i værktøjslinjen og på kortet. Quick checks dækker eksplicit lagring af kortvisningen, bådudvalg, gendannelse, bevaret centrum/målestok og nyere rettelser under udgivelse.
- **Konsekvens/usikkerhed:** Samspillet mellem fulgt udsnit, aktivering af kortværktøjer, oprettelse med midlertidige gates og layoutskift er endnu ikke afprøvet i lokal Firefox. Et sent billedsvar er kodegennemgået.
- **Udskudt billedoprydning:** Fjern kladdebilleder fra IndexedDB, når ingen aktiv eller tidligere kladde længere henviser til dem. Private billedobjekter, som blev erstattet, eller som blev uploadet før en afbrudt lagring, bruger fortsat plads i R2. Ryd dem op efter en frist og en kontrol af det aktuelle private dokument for samme konto og stævne.
- **Færdig når:** Målrettede kontroller i lokal Firefox dækker eventskift med kortforhåndsvisning, **Nyt event her** med aktive gates, upload over eventskift og kladdeændring under udgivelse.

Det tidligere catch-up og genbrugelig validering er beskrevet i
[spor-/GPU-valideringen](./scripts/track-validation.md).
