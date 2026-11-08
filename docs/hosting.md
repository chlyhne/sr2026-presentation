# GitHub Pages

1. Brug dette projekt som selvstændigt GitHub-repository med `main` som standardbranch.
2. Vælg **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Opsæt backenden efter [backend/README.md](../backend/README.md).
4. Tilføj repository-variablen **SR_API_URL** under **Settings → Secrets and variables → Actions → Variables**.
   Værdien er backendens HTTPS-origin, fx `https://sr2026-api.example.workers.dev`, uden `/admin/`.
5. Push til `main`, eller kør **Publish presentation** manuelt under Actions.

Workflowet bygger kun de offentlige filer i `dist/`. Forskningsnoter, rådata,
backendkode og øvrige projektfiler medtages ikke i Pages-artifaktet.
Repositoryets synlighed bestemmer separat, hvem der kan læse selve kildekoden.

`presentation/presentation.json` er den fælles udgivne præsentation. Mangler den
ved første build, bliver der udgivet en tom eventliste. Dine gamle browsernoter
ændres ikke af et build. [Importér dem](migration.md), før du deler den færdige præsentation.

Online gemninger sker gennem GitHub App på brugerens vegne og kan udløse Pages-workflowet.
Brug ikke workflowets `GITHUB_TOKEN` til at gemme præsentationen med forventning om,
at det starter et nyt push-workflow. Nye udgivelser bliver synlige efter et færdigt
Pages-deploy; en allerede åben besøgsvisning skal genindlæses.

GitHub App skal installeres på dette repository med **Contents: Read and write**
og **Metadata: Read**. Workflow- og administratorrettigheder er ikke nødvendige
for redigeringen. Branchbeskyttelse gælder stadig: hvis direkte skrivning til `main`
er blokeret, skal udgivelsesarbejdsgangen tilpasses den politik.

Kilde: [GitHub Pages med egne workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Guidet engangsopsætning af GitHub App

Kør `python3 scripts/setup_github_app.py` fra projektroden. Den lokale side sender en forudfyldt registrering til GitHub, og efter din godkendelse gemmes App-klient-id, klienthemmelighed og en tilfældig sessionsnøgle direkte som Cloudflare-hemmeligheder. Installér derefter appen kun på `sr2026-presentation`. Hjælperen kræver eksisterende `gh`- og Wrangler-login; den bruger Node 22 via npx og gemmer ikke nøgler i filer.
