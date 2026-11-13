# Spor, GPU og gate-UI — validering

Catch-up gennemført 13. november 2026 på lokal Windows-PC med i7-13850HX og
NVIDIA RTX 3500 Ada Laptop. Kun headless Firefox på desktop er brugt.
Firefox anonymiserer rendererstrengen til ANGLE/NVIDIA GeForce 8800 GTX.
Grundlag: 106 både, 730.370 originale observationer og 41.709 ti-meterstationer.

## Kontroller og genbrug

`node scripts/test.cjs` forbliver den hurtige standardkontrol: 48 logiktests og
syntakskontrol, cirka 0,4 sekund, uden browser/server eller fuldt datasæt.

Ved bestilt catch-up bruges `node scripts/test.cjs --extended catch_up` med
`SR_VIEWER_URL` og eventuelt `PLAYWRIGHT_MODULE`. `SR_TEST_KEEP_GOING=1` lader
alle valgte delkontroller gennemføre og opsummerer fejl til sidst. Ved konkrete
problemer vælges fortsat kun de relevante testnavne. Allerede beståede kontroller
gentages kun ved en relevant ændring eller ny konkret usikkerhed.

| Testnavne | Ansvar |
| --- | --- |
| `gpu_preparation` | Originalpunkter, GPU-PCHIP, præcis delt tid, Float32-profiler, otte basisfixtures og oprydning ved fejl. |
| `gpu_profiles` | Hele feltet mod en uafhængig Float64-kontrol, numerisk proveniens og seks målrettede randtilfælde. |
| `track_geometry`, `track_bindings`, `track_joins`, `track_time_layers` | Kubisk geometri, bindings-/rækkegrænser, antialiasing og nyeste passage ved krydsninger. |
| `scale_overflow`, `time_profiles` | Overflowfarver, manglende data, returpassager, stilstand og faktisk renderede tidsfarver. |
| `reference_boat`, `fleet_preparation` | Alle tre sammenligningskanaler, referencevalg, ressourcegenbrug, kontekstgendannelse og fejl i kildedata. |
| `playback_camera` | Zoom under afspilning, datapauser, kontinuerlig tid og handicapvisning. |
| `navigation`, `navigation_online`, `rhumbline_setup` | Måleværktøj, referencepalet, hover, præferencer og den separate permanente rute. |
| `pin_units`, `speed_pins` | Værdier/enheder, picking, gem/indlæs, fejlet gemning samt tids-, båd- og viewportfiltrering. |
| `gates`, `view_controls` | Gate-/eventadfærd, rangering, scroll, tastatur, lagrækkefølge og midlertidige pins i lokal/offentlig visning. |

Alle ovenstående delkontroller er gennemført. Forældede 10-bit-forventninger og
kald til fjernede CPU-forberedelsesfunktioner er erstattet. Ren tidsmatematik og
stationsformat er fjernet fra den store navigationstest, da de dækkes i det
hurtige niveau. Renderede farver, brugerinteraktion og GPU-tilstand har særskilt
ansvar; de er ikke bit-identiske kopier af numeriktesten.

## Numeriske resultater

Der er sammenlignet 3.651.037 gyldige fartstationer og 3.660.372 tidsstationer.

| Måling | Median | 95-percentil | 99-percentil |
| --- | ---: | ---: | ---: |
| Absolut fartafvigelse, knob | 0,0000126 | 0,000140 | 0,000966 |
| Relativ afvigelse i tidsdensitet | 0,000151 % | 0,00229 % | 0,0162 % |

Kun endelige tidsværdier indgår i percentilerne; overflowtilstande sammenlignes separat.
Tidsfejl normaliseres med `max(0.1, abs(Float64-værdi))`; fælles overflow regnes
som samme tilstand. Der er 55 forskelle i fartdækning og 25 i tidsdækning, under
0,01 % af de gyldige stationer. De to spatialt forskellige samplinger er ikke
bit-identiske, og dækning af en meget kort delpassage kan derfor variere.

1.119 fartstationer afviger mere end 0,1 knob: 453 ved ruteknæk, 300 ved en anden
første/kort delpassage og 366 inden for kurvesamplingens lokale fartinterval.
Ingen uforklarede afvigelser blev fundet i denne klassifikation. Den største
afvigelse, 21,45 knob, gælder Sneppen station 5143: GPU'en registrerer en tidligere
kort passage ved cirka 69.635 s, mens Float64-samplingen først vælger cirka
112.868 s. Det er en forskel i passagevalg, ikke en generel Float32-fartfejl.

Målrettede regressioner kontrollerer præcise ruteendepunkter, meget lille endelig
VMG, en første passage på to meter med efterfølgende datapausetrin, Float32-ens
naboprogressioner, vendinger under den numeriske opløsning og nærliggende
start-/målben uden en falsk helrutepassage. Interpolation af den kubiske geometri
afviger højst cirka 1,4 cm fra CPU-modellen i testkurven. Rendererens målte
skærmfejl er højst 0,0782 px mod budgettet 0,125 px.

Der er stadig lokale samplingforskelle i halen: største endelige relative
tidsafvigelse er 9,32 (Grand Delice, station 41704 ved afslutningen af ruten), og
to stationer har forskellig finite/overflow-status ved grænsen til naboceller med
uendeligt tidsforbrug. Ti-meterprofiler med højst otte meters kurvesampling er
en rumlig tilnærmelse; meget korte ekstra genbesøg og store lokale gradienter
giver ikke en bit-identisk profil. Disse repræsentationsforskelle er synlige i
resultatet fra `gpu_profiles`, ikke skjult som bestået bit-perfektion.

## Ressourcer og UI

Fejl er injiceret under shaderkompilering, transform feedback, profiltegning og CPU-readback. Ingen
delvise båddata offentliggøres; ressourceantallet vender tilbage til udgangspunktet,
GPU-tilstanden ryddes op, og efterfølgende klargøring lykkes. Efter `dispose()` er
der ingen ejede GPU-objekter tilbage. Plateauer afslutter ikke længere en passage, og en retningsændring kræver en
excursion på 0,2 meter fra passagens ekstremum: to gange endepunktets 0,1-meterbudget
for Float32-projektion. Små, konsistente bevægelser akkumuleres og kan stadig
skifte retning. Det fjerner falske genbesøg fra afrundingsstøj. Uendeligt
tidsforbrug får desuden en eksplicit overflowtilstand, så en vægtet middelværdi
ikke kan runde ned under markøren og gøre uendelighed til et stort endeligt tal.

En separat projektions-VAO forhindrer, at
attributbindingsreferencer fastholder midlertidige adressebuffere.

Referencevalg genbruger alle faste ressourcer og blev målt til 27–60 ms.
De optalte permanente GPU-data fylder cirka 155,68 MB; CPU-profilspejlene cirka
49,98 MB. Driverens interne lager er ikke medregnet.

Native scroll er kontrolleret med 106 gate-rækker, inklusive musehjul uden
kortzoom, tastatur uden eventnavigation og bevaret scroll ved kameraændringer.
Resultatboksen ligger over sporene; bådikoner over boksen kan stadig rammes.
Pin/Fjern pin er kontrolleret i lokal præsentation og offentlig visning, og
gemte pins forbliver uændrede af midlertidige valg.

## Måling af den integrerede app ved 20 Mbit/s

Kør `node scripts/benchmark_viewer_startup.cjs`. `SR_BENCHMARK_REPORT` kan gemme
de rå resultater som JSON. Benchmarken sender den faktiske kildepakke i paced
32-KiB-blokke over HTTP; kun sporpakken hastighedsbegrænses. Metadata, kode,
kort og vejr leveres lokalt. Det er en måling af spordata, ikke hele den offentlige
sides download. Browserkonteksterne er nye; driverens shadercache kan være varm.

Kildepakken er 2.615.729 bytes. GPU-klar omfatter afkodning, nominel app-boot frem
til GPU-klargøring, shaderkompilering, alle både, alle tre sammenligningsgrundlag,
CPU-profilspejle og GPU-fence. Felt-frame inkluderer efterfølgende app-klargøring
og en tegnet frame med alle både samt en afsluttende GPU-fence.

| Kørsel | Overførsel | Request → GPU-klar | Request → felt-frame |
| --- | ---: | ---: | ---: |
| 1 | 1,106 s | 7,481 s | 8,416 s |
| 2 | 1,070 s | 8,931 s | 9,806 s |
| 3 | 1,071 s | 8,643 s | 9,633 s |
| Median | 1,071 s | **8,643 s** | **9,633 s** |

Shaderkompilering tog 0,759 s–1,202 s og den synkrone del af bådklargøringen
3,557 s–4,369 s. Faser kan overlappe; tallene skal ikke summeres til samlet tid.
Det tidligere forsøgs 7,30 s er ikke en ny måling af den integrerede app og bruges
ikke som dens resultat. Der er ikke kørt en ny A/B-måling mod den fjernede vej.
