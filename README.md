# Sjælland Rundt 2026 — præsentation

Selvstændig webapp med kort, bådspor, vind, radar og events fra Sjælland Rundt.
Beretning, magasin og LaTeX/PDF-dokumenter ligger i det separate projekt `../SR 2026/`.

## Lokalt preview og redigering

Kør fra denne projektmappe:

```sh
python3 scripts/serve_viewer.py
```

Åbn <http://127.0.0.1:8097/>. Brug samme browser og adresse som før flytningen;
browserens eksisterende noter følger adressen, ikke mappens placering.
Lokalt uploadede billeder ligger i `data/event-images/`.
Se [viewerens vejledning](viewer/README.md) for kortets betjening og datakilder.

## Mapper

| Mappe | Indhold |
|---|---|
| `viewer/` | HTML, CSS, JavaScript og færdige kort-/vejraktiver |
| `data/` | Kildedata, cache og eksisterende lokale eventbilleder |
| `scripts/` | Lokal server, dataforberedelse, test og Pages-build |
| `research/` | Kildenoter til kort og præsentation |
| `presentation/` | Den fælles udgivne præsentations JSON-fil, når den er oprettet |
| `backend/` | GitHub-login, rettighedskontrol og API til gemning/upload |
| `docs/` | Drift og flytning af eksisterende noter |
| `dist/` | Genereret offentlig hjemmeside; ignoreres af Git |

## Online

GitHub Pages viser den udgivne præsentation. Redaktøren åbnes på backendens
`/admin/`, hvor login og API ligger på samme origin. Brugere med skriverettighed
til dette repository kan redigere og udgive. Andre kan se den offentlige visning.
Backenden kontrollerer rettigheder ved gemning og upload.

[Opsæt GitHub Pages](docs/hosting.md), følg [backendens opsætning](backend/README.md),
og [flyt dine lokale noter med](docs/migration.md).

Byg de offentlige filer uden npm eller Python-pakker:

```sh
python3 scripts/build_pages.py
```

Angiv eventuelt backendens HTTPS-origin med `SR_API_URL`. Hemmeligheder hører
kun til backendens secret-konfiguration. Workflowet læser den offentlige adresse
fra repository-variablen `SR_API_URL`.
