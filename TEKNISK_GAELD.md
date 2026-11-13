# Teknisk gæld

Aktuel liste over bevidst udskudt arbejde. Opdater ved relevante ændringer; slet
løste eller overhalede punkter. Arbejdsformen er beskrevet i [AGENTS.md](./AGENTS.md).
Listen bestiller ikke arbejde eller udvidede tests ved hver iteration. Catch-up
udføres, når brugeren beder om det, efter at featuresæt og adfærd er faldet på plads.

Hvert punkt angiver område, udskudt arbejde, konsekvens/usikkerhed og kriterium
for afslutning. Nye punkter skal være konkrete og kunne handles på.

## Åbne punkter

### UI-02 — Eventredigering efter pause med midlertidige gates

- **Område:** [gates](./viewer/navigation.js), [afspilning](./viewer/timeline.js) og [eventlagring](./viewer/presentation.js).
- **Udskudt:** Ekstra browserdækning af oprettelse, gem og annullering af events efter pause med gates fra afspilning.
- **Konsekvens/usikkerhed:** Play/pause, passage af events, manuel spoling og frisk offentlig opstart er kontrolleret i Firefox. Gem bruger nu de synlige gates og afslutter deres midlertidige afspilningstilstand; den særlige kombination er kun kodegennemgået.
- **Færdig når:** En målrettet browserkontrol bekræfter, at et nyt event efter pause gemmer de synlige gates og derefter følger normale eventskift.

Det tidligere catch-up og genbrugelig validering er beskrevet i
[spor-/GPU-valideringen](./scripts/track-validation.md).
