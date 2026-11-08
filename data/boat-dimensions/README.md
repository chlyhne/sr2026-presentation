# Bådmål og kilder

`dimensions.csv` og `resolved.json` indeholder de endelige mål og skrogformer
for alle 106 tracks. `user` betyder brugerens egne mål, `certificate` et
individuelt målebrev, `type` et registreret eller publiceret typemål. Tom basis
betyder, at den foreløbige standard på 10 × 3 meter stadig bruges.

Manage2Sails `BowNumber` matches med TracTracs `uniqueId`. Det giver et entydigt
match for alle 106 både og håndterer navnevariationer som de to Vaiana-både.
Manage2Sail-udtrækket gemmer kun båddata, ingen besætningsoplysninger.

Websejler matches med navn og sejlnummer. Unavngivne certifikater kræver
entydigt sejlnummer og bådtype. Modstridende bådtyper afvises som individuelle
certifikatmatches. Typemål kræver et præcist typenavn eller et dokumenteret,
gennemgået alias. `LOA` og `Bmax` bruges, ikke målebrevets beregnede `L` og `B`.
Typemål markeres som `estimated: true`, da de ikke bekræfter den enkelte båd.

`sailboatdata-models.json` er manuelt verificerede fallback-mål fra de konkrete
kildesider. Skroglængde eller LOD bruges, når det er særskilt angivet, ellers
LOA. Målefelter, modelantagelser og eventuelle overordnede længder er bevaret i
filen. Der tilføjes ingen mål for ukendte one-offs eller tvetydige generationer.

Manuelle mål og skrogformer i `viewer/boat-icons.js` har altid forrang. Ukendte
skrogformer bruger `common`; de eksplicit valgte modern/classic-former bevares.

Brugeren har godkendt standardmål for Luffe 40 til Tjørn: 12,25 × 3,30 m
([SailboatData](https://sailboatdata.com/sailboat/luffe-40/)). SABRINA er sat til
39 fod (11,8872 m), med Munjes forhold mellem længde og bredde; det giver
en beregnet bredde på ca. 3,7843 m. Begge står derfor som manuelle valg (`user`),
sammen med de oplyste mål for Vi Ses, Dream on og Norma. Alle fem bruger `common`.
Abelone 3, Andraste, Ran og Salka Valka beholder standardmålene 10 × 3 m.

## Genskabelse

Kræver Python med `requests`, `beautifulsoup4` samt Node.js:

```sh
python3 scripts/collect_boat_dimensions.py --refresh-entries
python3 scripts/apply_boat_dimensions.py
```

Udelad `--refresh-entries` for at genbruge det gemte deltagerudtræk. Websejler-
svar cachelagres i `/tmp/sr2026-websejler-cache`. SailboatData-fallbacks ændres
kun efter kontrol af den konkrete kildeside. `websejler-matches.json` bevarer
også afviste kandidater og fund, der kræver nærmere identifikation.
