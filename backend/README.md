# GitHub-login og beskyttet redigering

Backend er en Cloudflare Worker uden runtime-afhængigheder. GitHub Pages viser den
udgivne præsentation. Workerens `/admin/` viser den samme brugerflade på Workerens
eget domæne, så login virker med en almindelig sikker cookie uden tredjepartscookies
eller GitHub-tokens i browserens JavaScript.

Kun en bruger med **Write, Maintain eller Admin** til det konfigurerede repository
kan læse redigeringsdata, uploade og udgive. Rettigheden hentes hos GitHub ved hver
anmodning; en tidligere login-session giver ikke adgang efter fjernet repo-adgang.
GitHub App-tokenet handler på brugerens vegne og kan kun de handlinger, som både
brugeren og appen har rettighed til. Branch protection og rulesets gælder stadig.

## Opsætning

1. Opret en Cloudflare Worker med dette projekts `wrangler.jsonc`. Ret `SITE_URL`
   til den offentlige Pages-adresse **med afsluttende `/`** og
   `GITHUB_REPOSITORY` til det præcise `ejer/repo`. Standarden er
   `chlyhne/sr2026-presentation` og branch `main`.
2. Registrér en **GitHub App** under GitHub Settings → Developer settings → GitHub
   Apps. Sæt homepage til Pages-adressen og callback til
   `https://<worker-domæne>/auth/callback`. Giv repository permissions:
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
4. Udgiv Worker med `npx wrangler deploy`. Sæt den offentlige sides admin-adresse
   til `https://<worker-domæne>/admin/`, og udgiv Pages igen.
5. Åbn `/admin/`, vælg GitHub-login, og kontrollér upload/udgivelse med din konto.
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
| `GET /auth/callback` | Afslut login og gå til `/admin/` |
| `GET /api/session` | `{authenticated, canEdit, login?}` |
| `POST /api/logout` | Slet session-cookie |
| `GET /api/presentation` | `{document, sha}` fra repositoryets aktuelle branch |
| `PUT /api/presentation` | `{document, sha}` → `{sha, commit}` |
| `POST /api/event-images` | Binært JPEG/PNG/WebP → `{id, url}` |
| `GET /admin/config.js` | `window.SR_CONFIG={apiBase:origin,admin:true}` |
| `GET /admin/event-images/<uuid>.<ext>` | Beskyttet adgang til nye billeder før Pages er opdateret |
| `GET /admin/*` | Proxy til samme sti under Pages-basen |

Præsentationen gemmes kun i `presentation/presentation.json` med formatet
`{version:1,notes:[],speedPins:[]}`. Billeder får servergenererede UUID-navne under
`viewer/event-images/`. Relative billedadresser er `event-images/<uuid>.<ext>`.
Andre repository-stier kan ikke angives af klienten. Billeder må højst fylde
16 MiB, JSON højst 4 MiB. Indholdstyper, billedsignaturer og centrale eventfelter
valideres på serveren. Ved udgivelse kontrolleres også, at refererede billeder
findes i repositoryet. Backendens validering accepterer ingen eksterne billed-URL'er.

Udgivelse kræver den SHA, som dokumentet blev indlæst med. Hvis en anden redaktør
har udgivet en nyere version, svarer serveren `409`; klienten skal bevare kladden
og lade brugeren eksportere/genindlæse. Upload af et billede ændrer ikke dokumentets
SHA. Afbrudte kladder kan efterlade ubenyttede billeder; de slettes ikke automatisk.
Uploads committes straks og bliver offentlige, når repo/Pages er offentligt.

## Tests

Fra projektroden:

```sh
node --test backend/worker.test.mjs
```

Testene kontrollerer manglende/udløbet/manipuleret session, read-only adgang,
identitetsskift, CSRF, OAuth state/PKCE, skjulte tokens, versionskonflikter,
validering, genererede billedstier og proxyens fravær af videresendte credentials.

Dokumentation:
- [GitHub App-login](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Repository-rettigheder](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user)
- [Repository-filer](https://docs.github.com/en/rest/repos/contents)

Appen registreres som offentlig, så andre repository-samarbejdspartnere kan autorisere den. Backenden accepterer stadig kun skriverettighed til det faste repository. Se https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private .
