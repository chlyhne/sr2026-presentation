# Eventsæt og GitHub-login

GitHub Pages leverer trackeren. Cloudflare Worker håndterer `/api/*` og
`/auth/*` på trackerens domæne. GitHub-login åbner i et separat vindue, og
trackeren bliver stående på kortet. Workerens eksisterende `/admin/`-links
kan bruges til at åbne kladder, der ligger i browserlageret på det gamle domæne.

Offentlige eventsæt kan hentes uden login. Lokale events og kladdebilleder gemmes
i browseren. GitHub-login giver adgang til egne private events.
Offentlig udgivelse kræver skriverettighed til repositoryet. Backenden kontrollerer
rettigheden hos GitHub ved hver offentlig skrivning.

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
5. Åbn en stævneside, log ind fra eventsætvælgeren, og gem et event med disketten.
   Kontrollér både et privat og et offentligt sæt.
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
| `GET /api/event-sets?event=<id>` | Offentlige sæt og egne private sæt |
| `GET /api/event-sets?event=<id>&set=<id>` | Læs det valgte sæt og dets revision |
| `PUT /api/event-sets?event=<id>&set=<id>` | Opret eller gem `{document, revision, visibility}` |
| `POST /api/event-set-images/<uuid>?event=<id>&set=<id>` | Klargør et billede til sættet |
| `GET /api/event-set-images/<fil>?event=<id>&set=<id>` | Læs et billede, som sættet henviser til |
| `GET /admin/config.js` og `GET /admin/*` | Admin-konfiguration og proxy til Pages |

Sættene bruger `{version:1,notes:[],speedPins:[]}` med et valgfrit `title`.
Håndterede sæt og deres billeder gemmes i den private R2-bucket
`sr2026-private-events`. Workerens API styrer adgangen efter sættets aktuelle
synlighed. Et billede bliver først tilgængeligt, når et gemt sæt henviser
til det. Kladdens billeder ligger i browserens IndexedDB.

Ved første servergemning overtager R2 det pågældende sæts stabile ID fra stævnets
`presentationFile` eller `publicSets`. Gamle private serverevents kan åbnes
af ejeren og flyttes til samme lager ved næste gemning. Den statiske Pages-visning
indeholder projektets gamle offentlige dokumenter og billeder, som også kan
findes i GitHub-historikken. Ændring af et sæts synlighed gælder den aktuelle
visning gennem Workerens API.

Servergemning bruger den indlæste revision. Ved versionskonflikt bevares kladden.
**Hent serverversion** arkiverer den tidligere kladde til download i eventfanen.

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
