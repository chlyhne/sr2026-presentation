# Teknisk gæld

Aktuel liste over bevidst udskudt arbejde. Opdater ved relevante ændringer; slet
løste eller overhalede punkter. Arbejdsformen er beskrevet i [AGENTS.md](./AGENTS.md).
Listen bestiller ikke arbejde eller udvidede tests ved hver iteration. Catch-up
udføres, når brugeren beder om det, efter at featuresæt og adfærd er faldet på plads.

Hvert punkt angiver område, udskudt arbejde, konsekvens/usikkerhed og kriterium
for afslutning. Nye punkter skal være konkrete og kunne handles på.

## Åbne punkter

### GPU-01 — Saml og ajourfør de udvidede sportests

- **Område:** [browsertests](./scripts/) og [fælles sporfixtures](./scripts/viewer-track-fixtures.cjs).
- **Udskudt:** Gennemgå ældre testforventninger og overlap efter skiftet til originale kildepunkter og GPU-profiler. Flere ældre tests er tilpasset, men hele den udvidede samling er ikke verificeret samlet.
- **Konsekvens/usikkerhed:** Gamle tests kan indeholde antagelser om tidligere sampling, kvantisering eller klargøring. Det er ikke i sig selv tegn på en appfejl. GPU-klargøring, referencevalg/kontekstgendannelse, feltklargøring, afspilning/kamera og tidsprofiler er kontrolleret i lokal headless Firefox.
- **Færdig når:** Den relevante dækning er samlet uden unødvendige dubletter, fixtures følger den nominelle GPU-vej, og forventninger bruger adfærd og passende tolerancer. Kør den samlede relevante dækning ved catch-up, ikke efter hver featureændring.

### GPU-02 — Afsluttende numerisk kontrol af ruteprofiler

- **Område:** [GPU-klargøring](./viewer/gpu-track-preparation.js) og [uafhængigt testgrundlag](./scripts/profile-reference-math.js).
- **Udskudt:** En samlet kontrol af stationsprofiler ved ruteknæk, nærliggende start-/målben, meget korte delpassager og næsten nul fremdrift på det endelige datasæt.
- **Konsekvens/usikkerhed:** Float32 og ændret kurvesampling kan vælge en anden første kort passage eller give store absolutte forskelle ved næsten nul VMG. Kanoniske tilfælde med fremdrift, returpassager, stilstand, manglende data, datahuller og tomme/isolerede spor er kontrolleret; bit-identiske profiler er ikke et krav.
- **Færdig når:** Resterende relevante afvigelser er forklaret eller rettet med fysisk meningsfulde tolerancer og få målrettede regressioner. Undgå en fuld sammenligning ved hver iteration.

### GPU-03 — Gentag slutmålingen på den færdige app

- **Område:** [indlæsning](./viewer/replay-data.js), [boot](./viewer/boot.js) og [GPU-klargøring](./viewer/gpu-track-preparation.js).
- **Udskudt:** En afsluttende måling fra request til første GPU-færdige frame ved 20 Mbit/s på den integrerede app.
- **Konsekvens/usikkerhed:** Målingen på cirka 7,30 s mod 12,12 s stammer fra det separate forsøg. Den integrerede løsning har siden fået præcisionsrettelser og CPU-spejle til opslag; forsøgstiden er derfor ikke en ny måling af den færdige app. Den aktuelle sporpakke er 2.615.729 bytes.
- **Færdig når:** Ét sammenligneligt måleforløb omfatter download, afkodning, shaderkompilering, alle både, sammenligningsgrundlag og GPU-fence. Gem resultat og betingelser; gentag først ved en relevant performanceændring.

### GPU-04 — Gør GPU-klargøringen lettere at vedligeholde

- **Område:** [GPU-klargøring](./viewer/gpu-track-preparation.js).
- **Udskudt:** Gør teksturlayout, enheder og shadertrin tydeligere, og gennemgå frigivelse af midlertidige ressourcer ved afbrudt klargøring.
- **Konsekvens/usikkerhed:** Implementationen er kompakt og kræver kendskab til de enkelte teksturkanaler. Normal klargøring og kontekstgendannelse er kontrolleret; oprydning efter fejl midt i klargøringen er ikke gennemgået systematisk.
- **Færdig når:** Layout og ressourceejerskab er lette at følge, og afbrudt klargøring frigiver relevante ressourcer. Bevar én nominel GPU-vej og undgå en bred ombygning, mens featurearbejdet fortsat ændrer strukturen.
