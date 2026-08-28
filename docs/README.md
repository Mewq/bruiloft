# Sinan & Aisha — webversie

`index.html` is de hele app in één bestand: geen build, geen andere bestanden nodig.

## Online zetten met GitHub Pages

1. Zet deze `docs/` map in de repo `Mewq/Mijn_app` op branch `main` en push.
2. Ga naar **Settings → Pages**.
3. Source: **Deploy from a branch**. Branch: **main**, folder: **/docs**. Opslaan.
4. Na ongeveer een minuut staat hij op:

   https://mewq.github.io/Mijn_app/

Open die link op je iPhone en kies **Deel → Zet op beginscherm** om hem
schermvullend als app te gebruiken.

## Let op

- Foto's, budget, gasten en spelvoortgang staan in de browser zelf
  (localStorage), niet in dit bestand. Op een nieuw apparaat begin je leeg —
  gebruik het deelbestand in het menu om alles over te zetten.
- De repo is openbaar zodra Pages aanstaat. Wil je dat niet: zet de repo op
  privé en gebruik Netlify Drop met een geheime URL, of Cloudflare Pages met
  toegangsbeperking.
- `.nojekyll` staat erbij zodat GitHub Pages het bestand niet verbouwt.
