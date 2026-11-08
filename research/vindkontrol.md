# Kontrol af vind den 12. juni 2026

Brugerens vurdering: retningen passer, men vindstyrken er for lav, især fredag eftermiddag.

## Kontrolleret

- Den eksisterende visning brugte `wind_speed_10m` fra ERA5 i m/s.
- Tallene blev vist uændret; der var ingen ekstra omregning til knob eller km/t.
- API-data er UTC; klokken i kortet er Europe/Copenhagen (UTC+2).
- Visningen bruger seneste hele times vindfelt, hvis tidskyderen står mellem to timer.
- Den tidligere visning viste ikke vindstød.

Fire modelkilder er sammenlignet ved Mercutios nærmeste trackposition til hver hel
time 12. juni kl. 11–22 dansk tid. Hver model bruger nærmeste modelgitterpunkt,
uden korrektion til en bestemt terrænhøjde. De præcise forespurgte og returnerede
koordinater, tider og værdier ligger i `data/weather/route_comparison.json`.

| Dansk tid | ERA5 vind/stød | ECMWF IFS vind/stød | DMI HARMONIE vind/stød | DWD ICON-D2 vind/stød |
| --- | --- | --- | --- | --- |
| 14 | 7,67 / 10,5 | 8,44 / 11,7 | 7,8 / 9,6 | 8,40 / 10,3 |
| 15 | 8,04 / 10,7 | 8,60 / 11,8 | 8,7 / 10,9 | 9,53 / 11,5 |
| 16 | 7,91 / 9,6 | 8,29 / 10,8 | 9,2 / 12,2 | 8,97 / 12,0 |
| 17 | 7,67 / 10,5 | 9,13 / 12,4 | 8,6 / 10,8 | 9,39 / 11,5 |
| 18 | 7,74 / 10,6 | 8,27 / 12,2 | 8,2 / 10,6 | 9,90 / 12,1 |
| 21 | 5,93 / 8,2 | 9,50 / 12,5 | 7,3 / 9,7 | 8,87 / 11,4 |

Alle værdier i m/s. Vind og vindstød er særskilte modelparametre.
Tabelværdierne er ikke observationer ombord eller målinger fra en vejrstation.

## Vurdering

ERA5 giver mindre vind end de højere opløste modeller i flere af de relevante timer.
Der er især forskel om aftenen. Det understøtter, at ERA5 alene er et utilstrækkeligt
sammenligningsgrundlag for besætningens oplevelse. Det fastslår ikke den faktiske
vind ombord eller én entydig fysisk årsag til afvigelsen. De øvrige modeller er
også uenige indbyrdes, og de modellerede vindstød dokumenterer ikke alle de
15 m/s-pust, som omtales i beretningen.

## Ændring i kortet

DMI HARMONIE (regional model, ca. 2 km) er valgt som startmodel. Brugeren kan
skifte til ECMWF IFS (ca. 9 km) og ERA5 (0,25°). Alle tre modeller vises med
separate tal for vind / vindstød; pilen følger almindelig vindstyrke og retning.
Det geografiske udsnit samples på samme 247 punkter til kortvisningen. Det er
altså ikke en visning af hvert oprindeligt 2 km-modelgitterpunkt.

DMI og IFS er prognosearkiver; ERA5 er en efterfølgende reanalyse. Prognosearkiverne
er tidsserier sat sammen af korte prognosehorisonter fra flere kørsler og må ikke
beskrives som én bestemt prognose fra før start. Ingen værdier er ganget op for
at passe til erindringen. Lokale observationer er endnu ikke sammenholdt med modellerne.

Kilder og metoder:
- https://open-meteo.com/en/docs/historical-weather-api
- https://open-meteo.com/en/docs/historical-forecast-api
- https://open-meteo.com/en/docs/dmi-api
