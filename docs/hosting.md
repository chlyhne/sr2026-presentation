# GitHub Pages

1. Brug dette projekt som selvstændigt GitHub-repository med `main` som standardbranch.
2. Vælg **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Opsæt backenden efter [backend/README.md](../backend/README.md).
4. Tilføj repository-variablen **SR_API_URL** under **Settings → Secrets and variables → Actions → Variables**.
   Værdien er trackerens HTTPS-origin, hvor Workerens `/api/*` og `/auth/*` er routet.
5. Push til `main`, eller kør **Publish presentation** manuelt under Actions.

Forsiden viser stævnevælgeren. Åbn `events/<id>/` for at se, redigere og skifte
eventsæt. GitHub-login åbner i et separat vindue.

Workflowet bygger kun de offentlige filer i `dist/`. Forskningsnoter, rådata,
backendkode og øvrige projektfiler medtages ikke i Pages-artifaktet.
Repositoryets synlighed bestemmer separat, hvem der kan læse selve kildekoden.

Hvert stævne har sit eget præsentationsdokument. `presentation/presentation.json`
er fortsat Sjælland Rundts dokument; Silverrudder bruger
`presentation/silverrudder-2025.json`. Buildet kræver de konfigurerede dokumenter. Dine gamle browsernoter
ændres ikke af et build. [Importér dem](migration.md), før du deler den færdige præsentation.

Med Workers serverfunktioner aktiveret gemmes eventsæt og deres billeder i R2.
Eventsætvælgeren læser de aktuelle offentlige sæt direkte fra Workeren.
GitHub App bekræfter identitet og udgivelsesrettigheder. Pages-workflowet bruges
til selve trackeren og de statiske præsentationsfiler.

Kilde: [GitHub Pages med egne workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Guidet engangsopsætning af GitHub App

Kør `python3 scripts/setup_github_app.py` fra projektroden. Den lokale side sender en forudfyldt registrering til GitHub, og efter din godkendelse gemmes App-klient-id, klienthemmelighed og en tilfældig sessionsnøgle direkte som Cloudflare-hemmeligheder. Installér derefter appen kun på `sr2026-presentation`. Hjælperen kræver eksisterende `gh`- og Wrangler-login; den bruger Node 22 via npx og gemmer ikke nøgler i filer.
