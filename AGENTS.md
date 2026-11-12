# Projektprincipper

- Beregn alt på forhånd, hvis det kan. Faste data og begge sammenligningsgrundlag skal være forberedt før betjening; bådvalg og visningsskift må ikke genberegne dem.
- Der må kun være én nominel implementering af en funktion. Tilføj ikke automatiske eller skjulte fallbacks. Hvis den nominelle vej fejler, skal fejlen vises tydeligt. En alternativ implementering kræver en konkret aftale med brugeren.
- Kortets baggrund og spor tegnes med WebGL 2. SVG til ikoner og annotationer er en del af den nominelle komposition, ikke en alternativ renderingsvej.
- To testniveauer: Kør den hurtige standardkontrol med `node scripts/test.cjs` ved hver ændring. Den må ikke starte browser, server eller genberegne hele datasættet.
- Udvidede tests køres kun, når brugeren melder et problem eller udtrykkeligt beder om dem. Brug `node scripts/test.cjs --extended <relevante tests>` og begræns dem til problemet i lokal Firefox på PC. Flere browsere og mobiltest hører til en udtrykkeligt aftalt endelig udgivelse.
- Kør browsertests skjult, enten headless eller på en separat virtuel skærm. Testvinduer må ikke vises på brugerens skrivebord.
