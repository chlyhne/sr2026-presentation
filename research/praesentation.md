# Sjælland Rundt 2026 — arbejdsgrundlag

Formål: en nøgtern gennemgang af Mercutios overaltsejr med vejret som rød tråd.
Primær fortællekilde: `beretning.tex` og `beretning_SR2026.pdf`.
Beretningens tidspunkter og fartangivelser er erindringer, indtil de er sammenholdt med data.

## Foreslået fortælleform

Hvert udsnit besvarer de samme spørgsmål: Hvad forventede vi? Hvad så vi?
Hvad valgte vi? Hvad viser tracket om udfaldet?
Skeln mellem samtidige prognoser, senere vejrrekonstruktion og besætningens observationer.

| Afsnit | Vejr og beslutning ifølge beretningen | Ønsket dokumentation |
| --- | --- | --- |
| Forberedelse | Uenige modeller; sydlig vind fredag og senere vestlig vind | Prognoser udstedt før start, overblik over hele banen |
| Helsingør–København | Vestlige byger; vestlig placering for mere vind | Mercutio/My/Vera på samtidige satellitbilleder |
| Kastrup–Dragør | Svag vind, vindhuller og tiltagende modstrøm | Tætte tracks med tid; selvstændig strømkilde hvis tilgængelig |
| Stevns–Møn | Forventet højredrejning; rækkefølgen af halserne | Tracks og vindretning over tid; samtidig DMI-prognose hvis bevaret |
| Grønsund–Farø | Svag øst-sydøstlig vind bliver sydlig og tiltager | Vindfelter samt Mercutio/Vera/Moster |
| Agersø–Storebæltsbroen–Røsnæs | Tiltagende vind og skift fra fok til A5 til A2 | Tracks, beregnet SOG og besætningens sejlskift |
| Røsnæs–Sjællands Odde | Kontroltab og skift til Code-0; Vera passerer | Samtidige positioner og fartkurver |
| Odde–Gilleleje | Faldhavari; efterfølgende kraftige byger | Tidsfæst havari med track og erindring; satellit og vind |
| Gilleleje–Helsingør | Vinddrejning mod vest og aftagende vind; gentagne A2-skift | Tætte tracks med Vera, skyudvikling og måltider |
| Resultat | Samlet effekt af valg, bådtype og samarbejde | Officielle resultater; skeln mellem sejlet og korrigeret tid |

## Tracks

Arrangørens hjemmeside henviser til TracTrac event **3539**:
https://www.tractrac.com/event-page/event_20260610_SjllandRun/3539

Eventmetadata og løbsliste er hentet i `data/tractrac/`.
De aktive replays hedder **SR Grønsund** og **SR Bøgestrømmen**.
De øvrige poster er skjulte baneskabeloner og skal ikke indgå som ekstra sejladser.
Two-Racing gennem Grønsund har i løbslisten start 11. juni 2026 kl. 08.30 UTC
(kl. 10.30 dansk sommertid). Bekræft Mercutios klasse i bådmetadata.

`scripts/collect_tracks.py` genbruger decoder og worker-patch fra den eksisterende
Silverrudder-scraper. Output bevarer rå metadata for begge baner og bruger
`bane:uuid` som nøgle, så objekter fra forskellige baner ikke overskriver hinanden.
Identiske positioner fjernes inden for hvert track; positioner sorteres efter UTC-tid.
Fuld opløsning bevares i datasættet. Eventuel reduktion til visning sker senere.
Kontrollér også eventuelle samme-båd-forekomster på tværs af baner før feltstatistik.

## Vindkort

ECMWF/Copernicus ERA5 er en kandidat til rekonstruktion af de større vejrsystemer:
https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=documentation
https://climate.copernicus.eu/climate-reanalysis

Datasættet har timeværdier; det almindelige atmosfæriske gitter er 0,25 grader.
Hent 10 m u/v-vind samt eventuelt havniveau-tryk for 11.–13. juni 2026,
med et område, der også viser systemerne rundt om Danmark (fx 53–58 N, 8–15 E).
Afgræns endeligt efter tracks. Datoerne er et indledende dataudtræk, ikke præcise måltider.

Beregn fart fra sqrt(u²+v²), og brug meteorologisk vindretning (hvorfra vinden kommer).
Gem data i UTC; vis dansk sommertid i figurerne. Vis tydeligt gyldighedstid og kilde.
ERA5 er en efterfølgende reanalyse, og må ikke præsenteres som den prognose, vi så ombord.
Gitteret kan ikke alene dokumentere lokale vindhuller, kysteffekter eller bygepust.
Historiske operationelle prognoser og DMI-materiale skal undersøges separat.
Adgang til præcis de ønskede arkivfelter og eventuelt login er endnu ikke afprøvet.

## Satellit

EUMETSAT er den direkte arkivkilde til Meteosat-billeder:
https://user.eumetsat.int/data-access
https://data.eumetsat.int/
https://view.eumetsat.int/

Undersøg synlige/RGB-billeder i dagslys og infrarøde billeder om natten.
Der ønskes både oversigt over Danmark og tættere udsnit ved Øresund og nordkysten.
Arkivets konkrete produkt, tidsopløsning, juni-dækning og adgang skal først bekræftes.
EUMETViews visning er ikke i sig selv bevis for, at hele juni kan hentes via korttjenesten.
Et dagligt middagsbillede er utilstrækkeligt til at følge byger gennem sejladsen.

Til geografiske overlays kræves kendt projektion og billedudstrækning.
Gem originalprodukt og metadata; undgå skærmbilleder uden geografisk reference.
Skyer dokumenterer skyudvikling, men angiver ikke i sig selv overfladevind eller nedbør.

## Næste dataarbejde

1. Valider begge udtræk og den sammenlagte fil; find Mercutio, Vera, My og The Hulk.
2. Fastlæg passagetider ved de vigtigste steder og tilknyt beretningens episoder.
3. Afprøv ét vindfelt og ét satellitbillede fra en central episode før massehentning.
4. Lav et første kortudsnit med ens projektion og UTC-synkroniserede lag.
5. Byg præsentationen omkring dokumenterede episoder, med kilde og tid på hvert kort.

## Udført 7. november 2026

Begge replays er hentet og afkodet til normal afslutning (ingen timeout).
Grønsund: 83 tracks og 614.103 rå positioner.
Bøgestrømmen: 23 tracks og 117.450 rå positioner.
Samlet: 106 tracks og 730.370 positioner efter fjernelse af identiske punkter.
Ingen deltager-UUID'er går igen på tværs af de to løb.
Alle positioner har gyldige koordinater og tidsstempler i millisekunder;
de samlede tracks er sorteret efter tid.
Mercutio, Vera, My, The Hulk og Moster er identificeret; se `data/tractrac/validation.json`.
Tracking begynder før start og fortsætter efter mål: første/sidste trackpunkt må ikke
bruges som start-/måltid uden yderligere afgrænsning.

## Visuel tidsfæstelse

Hændelser identificeres ved at se radar, vind og track sammen.
Arbejdsfladen er `viewer/index.html`, med fælles tidskyder og noter,
som kan eksporteres til JSON. Hændelser skal ikke tidsfæstes på forhånd.

Visningen bruger lokale DMI-radarbilleder, tre vindmodeller med 247 gitterpunkter
hver og 106 bådspor. Satellitlaget og dets billedserie er fjernet.
Se `viewer/README.md` for kilder, fortolkning, databehandling og betjening.
