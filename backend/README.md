# Eventsæt og GitHub-login

GitHub Pages leverer trackeren. Cloudflare Worker håndterer `/api/*` og
`/auth/*` på trackerens domæne. GitHub-login åbner i et separat vindue, og
trackeren bliver stående på kortet. Workerens eksisterende `/admin/`-links
kan bruges til at åbne kladder, der ligger i browserlageret på det gamle domæne.

Offentlige eventsæt kan hentes uden login. Lokale events og kladdebilleder gemmes
i browseren. GitHub-login giver adgang til egne private events.
Offentlig udgivelse kræver skriverettighed til repositoryet. Backenden kontrollerer
rettigheden hos GitHub ved hver offentlig skrivning. Branch protection og rulesets
gælder stadig.

## Opsætning

1. Opret en Cloudflare Worker med dette projekts `wrangler.jsonc`. Ret `SITE_URL`
   til trackerens offentlige adresse med afsluttende `/` og tilpas
   Workerens routes til `/api/*` og `/auth/*` på samme domæne. Trackerens
   DNS-record skal være proxied i Cloudflare. Ret
   `GITHUB_REPOSITORY` til det præcise `ejer/repo`. Standarden er
   `chlyhne/sr2026-presentation` og branch `main`. Repositoryet skal være offentligt
   for at kladdevisningen kan læse præsentationen uden login.
2. Registrér en **GitHub App** under GitHub Settings → Developer settings → GitHub
   Apps. Sæt homepage til Pages-adressen og callback til
   `https://<tracker-domæne>/auth/callback`. Behold også callbacken på det
   gamle admin-domæne, hvis de eksisterende admin-links stadig skal kunne logge ind. Giv repository permissions:
   **Contents: Read and write**, **Metadata: Read-only**. Ingen adgang til workflows
   eller administration er nødvendig. Webhooks kan deaktiveres. Installer appen
   på netop præsentationens repository. Behold udløbende user access tokens slået til.
3. Gem appens **Client ID** som en Worker-secret. Det er en offentlig identifikator,
   men samme opsætningsmetode bevarer den ved nye deployments.
   Generér en client secret i GitHub App-indstillingerne. Gem hemmeligheder gennem
   Wranglers interaktive prompts (skriv dem ikke i repoet):

   ```sh
   cd backend
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   ```

   `SESSION_SECRET` skal være mindst 32 tegn genereret tilfældigt, eksempelvis af en
   password manager. Den krypterer login-cookien; rotation logger alle ud.
4. Udgiv Worker med `npx wrangler deploy`. Sæt repository-variablen
   `SR_API_URL` til trackerens HTTPS-origin for at aktivere onlinefunktionerne i
   Pages-buildet. Udgiv derefter Pages.
   Workerens `PRIVATE_EVENTS`-binding bruger R2-bucketen `sr2026-private-events`.
   Bucketen skal have offentlig adgang slået fra. Behold det eksisterende,
   fungerende `SITE_URL`, indtil et nyt Pages-domæne er aktivt.
5. Åbn en stævneside, redigér et event med **Nyt event her**, og vælg **Gem privat**
   eller **Udgiv offentligt** for at kontrollere GitHub-login med din konto.
   Kontrollér også, at en konto uden skriverettighed bliver afvist. De lokale
   tests simulerer GitHub; de erstatter ikke denne rigtige integrationskontrol.

GitHub App-registrering og Cloudflare-konto skal tilkobles, før login kan bruges.
Der er ingen hemmeligheder i den medfølgende konfiguration, og koden er ikke i sig
selv en deployet backend. En app registreret som privat kan kun installeres hos
appens ejer; medredaktører behøver ikke selv installere den på en anden konto.

## API

Alle ændringer kræver `Origin` lig med Workerens origin. Sessionen ligger i en
`Secure; HttpOnly; SameSite=Lax; Path=/` cookie med `__Host-` præfiks, krypteret
med AES-GCM. OAuth bruger `state` og PKCE S256. Cookies til OAuth og session er
kryptografisk adskilte. GitHub-tokenet returneres aldrig til frontend. Sessionen
udløber senest efter otte timer; log ind igen for at fortsætte. Der gemmes ikke
refresh tokens.

| Route | Funktion |
| --- | --- |
| `GET /auth/login` | Start GitHub-login |
| `GET /auth/callback` | Sæt sessionscookien og afslut loginvinduet |
| `POST /api/logout` | Slet session-cookie |
| `GET /api/event-session` | Aktiv konto og rettigheder |
| `GET /api/presentation` | Offentligt dokument og SHA for det valgte stævne og sæt, samt aktiv konto hvis logget ind |
| `GET /api/private-events` | Egne private events og revision for det valgte stævne |
| `PUT /api/presentation` | `{document, sha}` → `{sha, commit}` |
| `POST /api/event-images?id=<uuid>` | Udgiv binært JPEG/PNG/WebP → `{id, url}` |
| `PUT /api/private-events` | Gem egne private events for stævnet med kontrol af revision |
| `POST /api/private-event-images` og `GET /api/private-event-images/<fil>` | Gem og hent billeder fra samme GitHub-konto og stævne |
| `GET /admin/config.js` | Bekræft at Workerens event-API er tilgængeligt på samme domæne |
| `GET /api/event-images/<uuid>.<ext>` | Hent offentligt billede fra repositoryet |
| `GET /admin/*` | Proxy til samme sti under Pages-basen |

Hvert stævne har et offentligt standardsæt, angivet i katalogets `presentationFile`.
Ekstra offentlige sæt kan registreres i stævnets `publicSets` med `id`, `title`
og `presentationFile`. Pages pakker alle offentlige sæt, så de også kan læses uden Worker.
Sættene bruger formatet `{version:1,notes:[],speedPins:[]}` med et valgfrit `title`.
Private events og billeder gemmes i R2 under brugerens numeriske GitHub-id og
stævnet. **Gem privat** på et offentligt sæt laver en privat kopi. En offentlig
version kan fjernes fra sættet via **Slet event** efterfulgt af **Udgiv offentligt**.
Tidligere offentlige kopier kan stadig findes i GitHub-historikken eller hos andre.
Rhumbline er et fast projektaktiv i
`viewer/rhumbline.json` og indgår ikke i præsentationen. Billeder får
UUID-navne under `viewer/event-images/` ved udgivelse. Billeder i onlinekladder
opbevares i browserens IndexedDB. Relative billedadresser er `event-images/<uuid>.<ext>`;
eksisterende UUID'er og billedadresser bevares ved samlingen af lageret.
Andre repository-stier kan ikke angives af klienten. Billeder må højst fylde
16 MiB, JSON højst 4 MiB. Indholdstyper, billedsignaturer og centrale eventfelter
valideres på serveren. Ved udgivelse kontrolleres også, at refererede billeder
findes som filer under `viewer/event-images/` i repositoryet. Editorens billedlæsning
bruger samme mappe på den offentlige GitHub-branch. Backendens validering accepterer ingen eksterne billed-URL'er.

Pages-pakningen kræver en eksisterende `presentation/presentation.json` med
`version: 1` og listerne `notes` og `speedPins`. Et manglende eller ugyldigt dokument
stopper pakningen med en fejl. Billeder pakkes direkte fra `viewer/event-images/`.

Servergemning bruger den indlæste SHA eller R2-revision. Ved versionskonflikt
bevares kladden. **Hent serverversion** læser et nyt sæt og arkiverer den
tidligere kladde til download i eventfanen. Upload af et billede ændrer ikke dokumentets
SHA. Afbrudte kladder kan efterlade ubenyttede billeder; de slettes ikke automatisk.
Uploads committes straks og bliver offentlige, når repo/Pages er offentligt.

## Tests

Fra projektroden:

```sh
node --test backend/worker.test.mjs
```

Testene kontrollerer manglende/udløbet/manipuleret session, read-only adgang,
identitetsskift, CSRF, OAuth state/PKCE, skjulte tokens, versionskonflikter,
validering, genererede billedstier, bevaring af billedbytes, afvisning af gamle
billedstier og proxyens fravær af videresendte credentials.

Dokumentation:
- [GitHub App-login](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Repository-rettigheder](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user)
- [Repository-filer](https://docs.github.com/en/rest/repos/contents)

Appen registreres som offentlig, så andre repository-samarbejdspartnere kan autorisere den. Backenden accepterer stadig kun skriverettighed til det faste repository. Se https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private .
