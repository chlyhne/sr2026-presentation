# Flyt eksisterende events til onlineversionen

Noter og fart-pins fra den gamle lokale visning findes i browseren. De er ikke
med i Git alene, og en anden browser eller adresse har sin egen opbevaring.

1. Start `python3 scripts/serve_viewer.py` fra den nye projektmappe.
2. Åbn **http://127.0.0.1:8097/** i den browser, du hidtil har brugt. Hvis du tidligere
   brugte `localhost` eller en anden port, skal du bruge præcis den gamle adresse.
3. Eksportér præsentationen. Eksporten indeholder events, tegninger, kortindstillinger,
   fart-pins og de vedhæftede billeder, som indlejres i filen. Gem denne fil som backup.
4. Åbn online-redaktøren på backendens `/admin/`, og log ind med GitHub.
5. Importér eksportfilen. De indlejrede billeder uploades med din godkendte session.
6. Kontrollér events, billeder og fart-pins i previewet, og vælg **Udgiv**.
7. Vent på at Pages-udgivelsen afsluttes, og kontrollér den offentlige adresse.

Ældre noteeksporter kan indeholde en liste af events uden fart-pins. Brug en ny
eksport fra den opdaterede lokale visning for at få pins med. Den oprindelige
browserkopi bevares, så du kan sammenligne før og efter.

Hvis den fælles præsentation bliver ændret fra en anden browser imens, afviser
serveren en udgivelse baseret på en ældre version. Gem din eksport som backup,
og indlæs den nyeste fælles version, før du samler ændringerne.
