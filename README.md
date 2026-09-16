# Kulturverein Halogen – Website

## Setup (Schritt 3 aus unserem Plan)

1. **GitHub-Repo anlegen**
   - Neues Repo erstellen (z. B. `halogen-web`)
   - Diesen Ordnerinhalt hineinpushen

2. **Wrangler installieren & einloggen** (falls noch nicht vorhanden)
   ```
   npm install -g wrangler
   npx wrangler login
   ```

3. **D1-Datenbank erstellen**
   ```
   npx wrangler d1 create halogen-db
   ```
   Die zurückgegebene `database_id` in `wrangler.jsonc` bei `d1_databases` eintragen.

4. **Schema einspielen**
   ```
   npx wrangler d1 execute halogen-db --file=./schema.sql --remote
   ```

5. **R2-Bucket erstellen**
   ```
   npx wrangler r2 bucket create halogen-media
   ```

6. **Admin-Passwort als Secret setzen**
   ```
   npx wrangler secret put ADMIN_PASS
   ```
   (Benutzername steht aktuell fix auf `admin` in `wrangler.jsonc`, kann dort geändert werden.)

7. **Deployen**
   ```
   npx wrangler deploy
   ```

Danach ist die Seite unter der von Cloudflare vergebenen `*.workers.dev`-URL erreichbar,
später mit eigener Domain verknüpfbar.

## Struktur

- `public/index.html` – Startseite mit Hero-Bild + 4 bouncenden Panels
- `public/{programm,anmeldung,produkte,weiteres}/index.html` – Unterseiten
- `public/admin/index.html` – Admin-Editor (Basic-Auth-geschützt)
- `src/index.js` – Worker: API + Auth + statische Auslieferung
- `schema.sql` – D1-Tabellen + Startwerte
