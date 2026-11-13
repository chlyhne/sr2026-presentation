# Projektprincipper

- Beregn alt på forhånd, hvis det kan. Faste data og begge sammenligningsgrundlag skal være forberedt før betjening; bådvalg og visningsskift må ikke genberegne dem.
- Der må kun være én nominel implementering af en funktion. Tilføj ikke automatiske eller skjulte fallbacks. Hvis den nominelle vej fejler, skal fejlen vises tydeligt. En alternativ implementering kræver en konkret aftale med brugeren.
- Kortets baggrund og spor tegnes med WebGL 2. SVG til ikoner og annotationer er en del af den nominelle komposition, ikke en alternativ renderingsvej.
- To testniveauer: Kør den hurtige standardkontrol med `node scripts/test.cjs` ved hver ændring. Den må ikke starte browser, server eller genberegne hele datasættet.
- Udvidede tests køres kun, når brugeren melder et problem eller udtrykkeligt beder om dem. Brug `node scripts/test.cjs --extended <relevante tests>` og begræns dem til problemet i lokal Firefox på PC. Flere browsere og mobiltest hører til en udtrykkeligt aftalt endelig udgivelse.
- Kør browsertests skjult, enten headless eller på en separat virtuel skærm. Testvinduer må ikke vises på brugerens skrivebord.

## Iteration og teknisk gæld

- Arbejd i korte iterationer: implementer den ønskede adfærd ordentligt, kør den hurtige standardkontrol, og afslut, når ændringen er brugbar. Udvid ikke automatisk opgaven med generel oprydning, hærdning, arkitekturreviews eller dyb validering.
- Læs [TEKNISK_GAELD.md](./TEKNISK_GAELD.md) ved relevant arbejde. Opdater den løbende med konkret udskudt arbejde, berørte områder, kendt konsekvens/usikkerhed og et kort kriterium for afslutning. Saml overlappende punkter; fjern løste eller overhalede punkter. Filen er en aktuel arbejdsliste, ikke en historisk log.
- Ekstra testdækning, sjældne randtilfælde, bredere performanceanalyse og ikke-nødvendig refaktorering kan udskydes til gældslisten. Reelle fejl i den ønskede funktionalitet, datatab og brud på projektets arkitekturprincipper rettes i den aktuelle iteration. Beskriv en væsentlig kendt begrænsning kort ved aflevering.
- Kræv ikke bit-identiske resultater ved ændret numerisk repræsentation eller GPU-beregning. Kontroller relevant adfærd og meningsfulde tolerancer. Bevar præcision eller tabsfrihed, hvor det er et faktisk krav, eksempelvis kodning af kildeheltal.
- Genbrug allerede opnået test- og benchmarkevidens. Gentag kun en dyr kontrol, når nye ændringer, fejl eller konkret usikkerhed gør resultatet relevant igen; de eksisterende regler for udvidede tests gælder stadig. Afleveringer skal være korte og skelne mellem gennemført kontrol og udskudt arbejde.
- Når brugeren beder om catch-up, gennemgå gældslisten samlet mod det aktuelle featuresæt. Fjern først det, iterationerne har gjort irrelevant, og løs derefter den relevante gæld med samlet oprydning og målrettet validering. Ros eller accept af en enkelt iteration starter ikke automatisk et catch-up.
