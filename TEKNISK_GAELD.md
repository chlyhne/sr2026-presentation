# Teknisk gæld

Aktuel liste over bevidst udskudt arbejde. Opdater ved relevante ændringer; slet
løste eller overhalede punkter. Arbejdsformen er beskrevet i [AGENTS.md](./AGENTS.md).
Listen bestiller ikke arbejde eller udvidede tests ved hver iteration. Catch-up
udføres, når brugeren beder om det, efter at featuresæt og adfærd er faldet på plads.

Hvert punkt angiver område, udskudt arbejde, konsekvens/usikkerhed og kriterium
for afslutning. Nye punkter skal være konkrete og kunne handles på.

## Åbne punkter

### GPU-01 — Tilbagevendende konteksttab under indlæsning på iPhone

- **Område:** [GPU-klargøring](./viewer/gpu-track-preparation.js) og [sporfejl](./viewer/track-renderer.js).
- **Udskudt:** Bekræftelse på den berørte iPhone med enkle spor med bådfarver og ikonrækken genindført som tre kolonner og to rækker. Den konkrete årsag til det tidligere konteksttab er endnu ikke fastslået.
- **Konsekvens/usikkerhed:** Telefonen virkede efter begrænsning af rasteropløsningen, men konteksttabet er meldt igen under indlæsning. Transform feedback opdeles nu i højst 4.096 punkter pr. kald, og profilberegning i én teksturrække med 1.024 stationer pr. kald; GPU-kommandoerne flushes mellem delene. Datasættet, beregningerne og de permanente teksturer er uændrede. Fejlen angiver seneste båd, GPU-trin og antal klargjorte både. Hukommelsestryk kan stadig spille ind.
- **Aktuel diagnose:** Begge kontekster mistes efter første tegning med grafikbuffer 340 × 1248 og alle 106 både klargjort. Lokal Firefox viser ét sporinterval, fire kildeendestykker og cirka 156 MB permanente GPU-spordata. Årsagen på iPhone er fortsat ukendt. Forsøget med delt referenceplads og CPU-upload ved referencevalg er rullet tilbage på brugerens anmodning; alle referenceprofiler bliver på GPU'en af hensyn til hurtigt bådskift. Yderligere fejlsøgning er stoppet efter brugerens instruktion.
- **Ny iPhone-visning:** Efter at telefonen igen fejlede med sammenligningsfarver, er iPhone på brugerens anmodning tilbage på helt enkle spor: bådfarver, fast tykkelse, 32 bytes pr. kildepunkt og seks vertices pr. sporstykke. Ingen GPU-profiler, sammenligningsdata, kurver eller kapper oprettes. Ikonrækken er fortsat tre kolonner og to rækker, og menuer åbner under hele rækken. Desktop beholder alle farvevalg. Sporindstillingerne viser kun sporlængde og handicapkompensering, og bådlisten står direkte under overskriften. Den hurtige standardkontrol er bestået. Brugeren melder nu, at Chrome virker, og har bedt om at lade WebGL-fejlsøgningen ligge; stabilitet i de øvrige berørte visninger er fortsat uafklaret.
- **Færdig når:** Opstart virker stabilt på den berørte iPhone, og knapperne kan vises i to rækker uden konteksttab; ellers bruges den konkrete fejl og dens klargøringstrin til at afgrænse næste rettelse.

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

Det tidligere catch-up og genbrugelig validering er beskrevet i
[spor-/GPU-valideringen](./scripts/track-validation.md).
