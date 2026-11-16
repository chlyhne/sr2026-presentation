# Teknisk gæld

Aktuel liste over bevidst udskudt arbejde. Opdater ved relevante ændringer; slet
løste eller overhalede punkter. Arbejdsformen er beskrevet i [AGENTS.md](./AGENTS.md).
Listen bestiller ikke arbejde eller udvidede tests ved hver iteration. Catch-up
udføres, når brugeren beder om det, efter at featuresæt og adfærd er faldet på plads.

Hvert punkt angiver område, udskudt arbejde, konsekvens/usikkerhed og kriterium
for afslutning. Nye punkter skal være konkrete og kunne handles på.

## Åbne punkter

### DATA-02 — Undgå genberegning af sporprofiler ved rene kortændringer

- **Område:** [buildets fingerprint](./scripts/prepare_track_profiles.cjs) og kortdata i den fælles datapakke.
- **Udskudt:** Adskil kortets ændringsnøgle fra sporprofilernes, så et nyt kort kan pakkes uden at genberegne uændrede bådprofiler. Genbrug også det uændrede afstandsfelt, når kun kortets tolerance ændres.
- **Konsekvens:** En ren kortiteration udløser aktuelt omkring 80 sekunders klargøring af alle spor og referencefarver, fordi hele datapakken indgår i samme fingerprint.
- **Færdig når:** Kortændringer opdaterer de publicerede kortdata, mens uændrede sporprofiler genbruges med deres eksisterende integritetskontrol.

### UI-05 — Pinch efter voldsomme eller afbrudte bevægelser på telefon

- **Område:** [kortgestus](./viewer/viewer.js) og [målrettet kontrol](./scripts/test_viewer_pinch_zoom.cjs).
- **Gennemført:** Zoomgrundlaget opdateres efter hver pinch-bevægelse, så bevægelse forbi zoomgrænsen ikke ophober en dødzone. Nye primære berøringer, vinduestab af fokus og skjult side rydder afbrudte pan-/pinch-forløb. Skjult Firefox kontrollerer begge zoomgrænser og gentagne afbrydelser med syntetiske touch-pointere.
- **Udskudt/usikkerhed:** Telefonens faktiske levering af touch- og capture-events ved hurtige bevægelser er endnu ikke kontrolleret på en fysisk enhed.
- **Færdig når:** Hurtig pinch, løft/genplacering af fingre og afbrydelse/genoptagelse virker på den berørte telefon uden fastlåst zoom.

### UI-04 — Bane-/løbsfiltre og to permanente rhumblines

- **Område:** [bådvælger](./viewer/boat-list.js), [rutegemning](./scripts/serve_viewer.py) og [build](./scripts/prepare_track_profiles.cjs).
- **Udskudt:** Samlet browserkontrol af bane/løb, eventgemning/-gendannelse og referenceskift mellem banerne efter indtegning af Bøgestrømmens rhumbline. Kontroller også den kompakte skipper-/bådtype-linje og streaming af lange felter.
- **Gennemført:** Hurtige kontroller af filterkombinationer, banespecifikke projiceringer, manglende rute og valg af færdige profilopslag. Begge rutedefinitioner indgår i buildets fingerprint. Bøgestrømmens tegnekort er åbnet og starter med den rigtige bane. Målrettet skjult Firefox-kontrol bekræfter naturlig listehøjde, scroll ved mange både og målestokkens placering nederst til venstre eller lige ved siden af listen ved faktisk overlap, også efter filtrering og sammenklapning.
- **Konsekvens/usikkerhed:** Bøgestrømmens rute er nu indtegnet med 26 punkter; første punkt ligger midt på startlinjen. Ingen automatisk erstatning med Grønsunds rute. Browser- og telefonforløbet for referenceskift er endnu ikke valideret.
- **Færdig når:** Den rigtige profil vælges ved referenceskift, og bane-/løbsvalg (inklusive Alle baner/løb) virker i redigering og offentlig visning med eksisterende events.

### GPU-01 — Bekræft deploy-klargjorte spor og alle farvevalg på iPhone

- **Område:** [build](./scripts/prepare_track_profiles.cjs), [fillæsning](./viewer/track-files.js) og [renderer](./viewer/track-renderer.js).
- **Udskudt:** Samlet kontrol på den berørte iPhone af opstart, alle sportyper, referenceskift og 3×2-ikonrækken uden konteksttab.
- **Aktuel løsning:** Efter brugerens ønske beregnes begge geometrier, modeller, indeks, profiler og alle referencefarver ved build/deploy. Browseren læser tabsfrit kodede filer; der er ingen worker, IndexedDB-lagring eller klientberegning som reserve. WebGL 2 tegner kun fælles geometri og aktiv R32F-farvetype.
- **Gennemført:** Hurtige analytiske matematiktests og tabsfri codec-kontrol. Skjult Firefox kontrollerer opstart, begge geometrier, alle sportyper, referenceformler/-skift, manglende/korrupte filer samt kontekstgenskabelse. Filtesten blokerer worker, IndexedDB og beregning af kurver/indeks. Opstart inklusive stil- og referenceskift var ca. 3 sekunder på PC. Den konkrete telefon er endnu ikke kontrolleret med deploy-filerne.
- **Konsekvens/usikkerhed:** GPU-driverens tidligere fejl er ikke alene afkræftet af lokale tests. Residente geometri-/SOG-data efter upload er ca. 50,8 MB på desktop og 27,4 MB for enkle spor, ud over baggrunden.
- **Testarbejdsgang:** Automatisk genindlæsningskommando er ryddet efter brugerens ønske. Saml lokale rettelser og kontroller før én aftalt telefontest. Fejl og indlæsningstrin gemmes i `/tmp/sr2026-client-errors.jsonl` uden eventindhold.
- **Færdig når:** Den berørte iPhone starter og skifter mellem alle farvetyper og referencer stabilt med deploy-filer og WebGL 2-tegning.

### DATA-01 — Reducer førstegangsdownload af fælles spordata

- **Område:** [filcodec](./viewer/prepared-track-codec.js) og [build](./scripts/prepare_track_profiles.cjs).
- **Udskudt:** Yderligere tabsfri komprimering, eksempelvis byteplaner eller deltakanaler, af de fælles opslag og kurvemodeller.
- **Konsekvens/usikkerhed:** Første download er ca. 55 MB på iPhone og 65 MB på desktop med Mercutio. Fællesdelen udgør ca. 38 MB. Efterfølgende referencevalg henter 1–5 MB; fingerprintede URL'er kan caches. Hele buildet er ca. 475 MB og hentes ikke samlet, men første download kan være mærkbar på langsomme forbindelser.
- **Færdig når:** Downloadstørrelsen er målt reduceret uden tab af kildeheltal, Float64-modeller eller øvrige lagrede bytes, og uden at indføre ny tung klientberegning.

### TEST-01 — Tilpas ældre udvidede fixtures til deploy-filer

- **Område:** [fixturehjælper](./scripts/viewer-track-fixtures.cjs) og ældre udvidede spor-/profiltests.
- **Udskudt:** Migrering af ældre GPU-/CPU-klargøringsfixtures, som opretter profiler og syntetiske både direkte i klienten i stedet for at bruge et bygget fixture-datasæt.
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

### UI-02 — Eventredigering efter pause med midlertidige gates

- **Område:** [gates](./viewer/navigation.js), [afspilning](./viewer/timeline.js) og [eventlagring](./viewer/presentation.js).
- **Udskudt:** Ekstra browserdækning af oprettelse, gem og annullering af events efter pause med gates fra afspilning.
- **Konsekvens/usikkerhed:** Play/pause, passage af events, manuel spoling og frisk offentlig opstart er kontrolleret i Firefox. Gem bruger nu de synlige gates og afslutter deres midlertidige afspilningstilstand; den særlige kombination er kun kodegennemgået.
- **Færdig når:** En målrettet browserkontrol bekræfter, at et nyt event efter pause gemmer de synlige gates og derefter følger normale eventskift.

### UI-03 — Prompt under billedklargøring og online udgivelse

- **Område:** [eventprompt](./viewer/presentation.js) og [import/udgivelse](./viewer/online.js).
- **Udskudt:** Ekstra browserdækning af prompten under igangværende billedklargøring og ved autentificeret online udgivelse/import med indlejrede billeder.
- **Konsekvens/usikkerhed:** Gem, Gem ikke, Annullér, Escape, gemmefejl, afspilning, præsentation og eventskift efter ændret rækkefølge er kontrolleret i skjult Firefox på PC. Uploadannullering og online fortsættelse er kodegennemgået; deres særlige kombinationer er endnu ikke browserkontrolleret.
- **Færdig når:** Målrettet kontrol viser, at et sent uploadsvar ikke overskriver det nye event, og at online handlinger kun fortsætter efter et vellykket valg af Gem eller Gem ikke.

Det tidligere catch-up og genbrugelig validering er beskrevet i
[spor-/GPU-valideringen](./scripts/track-validation.md).
