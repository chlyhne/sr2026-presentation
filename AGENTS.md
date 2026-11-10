# Projektprincipper

- Beregn alt på forhånd, hvis det kan. Faste data og begge sammenligningsgrundlag skal være forberedt før betjening; bådvalg og visningsskift må ikke genberegne dem.
- Der må kun være én nominel implementering af en funktion. Tilføj ikke automatiske eller skjulte fallbacks. Hvis den nominelle vej fejler, skal fejlen vises tydeligt. En alternativ implementering kræver en konkret aftale med brugeren.
- Kortets baggrund og spor tegnes med WebGL 2. SVG til ikoner og annotationer er en del af den nominelle komposition, ikke en alternativ renderingsvej.
- Test løbende lokalt i Firefox på PC og begræns testen til den relevante ændring. Flere browsere og mobiltest hører til en udtrykkeligt aftalt endelig udgivelse.
- Kør browsertests skjult, enten headless eller på en separat virtuel skærm. Testvinduer må ikke vises på brugerens skrivebord.
