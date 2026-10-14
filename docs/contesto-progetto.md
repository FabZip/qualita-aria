# A.R.I.A. — Contesto tecnico del progetto “Qualità aria”

## 1. Scopo del progetto

“Qualità aria” è una Progressive Web App denominata **A.R.I.A. — Analisi e Rappresentazione degli Indicatori Ambientali**. Raccoglie, normalizza e rappresenta dati pubblici relativi a qualità dell’aria, stazioni di monitoraggio, temperature osservate ed eventi arborei comunali.

L’interfaccia principale mantiene tre modalità:

- **Mappa**;
- **Confronto**;
- **Differenza**.

“Alberi” è una fonte dati, non una quarta modalità.

Ultima release preparata durante lo sviluppo descritto in questo documento:

| Componente | Versione |
| --- | --- |
| Applicazione | `0.7.9` |
| Build | `89` |
| Worker ambientale | `0.9.12` |
| Dataset arboreo consolidato | `22` |
| Ultima migrazione D1 prevista | `0011_tree_source_cursor_offsets.sql` |

Il commit e il push della release `0.7.8` sono stati verificati su `main` al commit `1cef1d3`. Il 13 ottobre 2026 sono stati verificati in produzione il Worker `0.9.12`, le migrazioni D1 `0010`/`0011` e un refresh manuale completo senza errori. La release frontend `0.7.9` build 89 è in preparazione e non è ancora pubblicata.

## 2. Funzionalità principali

### Qualità dell’aria

L’utente può selezionare fonte, città o Comune, anno, inquinante e modalità di visualizzazione. Le fonti osservazionali trattano PM2.5, PM10 e NO₂ secondo la rispettiva disponibilità. La fonte previsionale separata tratta PM10, PM2.5, CO, SO₂, O₃ e NO₂ per i cinque giorni successivi. La CO₂ non viene ricavata dai dataset disponibili e non deve essere confusa con il CO.

Le stazioni vengono mostrate tramite posizione geografica, elenco sotto la mappa, valore annuale, copertura della serie e stato di validazione quando disponibile. I colori sulla mappa devono usare le stesse soglie dell’elenco.

### Temperature

Le statistiche annuali seguono queste regole:

- **MIN**: minima assoluta registrata nell’anno;
- **MEDIA**: media delle temperature medie giornaliere;
- **MAX**: massima assoluta registrata nell’anno.

Minima e massima annuali non devono essere medie degli estremi giornalieri. I dati modellistici non devono essere presentati come osservazioni fisiche.

### Eventi arborei

La fonte Alberi distingue:

- piantumazioni;
- abbattimenti o decrementi;
- eventi completati;
- eventi urgenti completati;
- eventi programmati;
- eventi comunicati ma non confermati;
- eventi da verificare.

Le statistiche arboree non rappresentano lo stato fitosanitario complessivo né un censimento completo del patrimonio. Censimenti, manutenzioni generiche e posti pianta non devono essere trasformati automaticamente in piantumazioni o abbattimenti.

Solo quantità note associate a interventi confermati come completati contribuiscono ai totali minimi documentati. Un evento programmato resta escluso dai totali; se la data è trascorsa senza conferma viene mostrato come `Programmato · data trascorsa`.

### Comportamento della mappa arborea

- verde: piantumazione;
- rosso: abbattimento;
- grigio: marker non appartenente all’evento selezionato;
- quantità sotto l’icona nella lista, oppure `-` se sconosciuta;
- stessa sagoma arborea nella lista e sulla mappa;
- più marker per eventi multilocalità;
- nessuna ripartizione artificiale delle quantità complessive;
- apertura di un evento con chiusura automatica del popup precedente;
- zoom su tutte le località dell’evento o sulla singola strada;
- geometrie stradali evidenziate in azzurro, senza significato semantico sul tipo di evento;
- linee poste sotto le etichette cartografiche;
- riempimento territoriale generale molto trasparente;
- popup territoriale disabilitato in modalità Mappa e disponibile, se utile, in Confronto e Differenza.

## 3. Architettura

### Frontend

Il frontend è una PWA statica basata su HTML, CSS, JavaScript, service worker, file JSON locali e una mappa interattiva. L’uso e la versione esatta di Leaflet sono **Da verificare** nel repository corrente.

Responsabilità principali:

- selezione di fonte, città, anno e inquinante;
- rendering delle mappe;
- confronto e differenza;
- eventi arborei, geometrie e popup;
- fusione tra dataset consolidato e dati dinamici;
- cache e installazione PWA;
- segnalazioni e pannello amministrativo.

Il frontend è destinato alla pubblicazione tramite GitHub Pages. Workflow esatto: **Da verificare**.

### Backend Cloudflare

Il Worker principale è denominato `qualita-aria-temperature` ed è sviluppato in:

```text
cloudflare/temperature-proxy
```

URL noto:

```text
https://qualita-aria-temperature.fabzip.workers.dev
```

Gestisce temperature osservate, eventi arborei dinamici, scansione automatica delle fonti, archivio D1, geocodifica, segnalazioni, revisione amministrativa e cron.

È stato utilizzato anche un proxy EEA separato:

```text
https://qualita-aria-eea.fabzip.workers.dev
```

La posizione del relativo sorgente nel repository è **Da verificare**.

### Database D1

Database logico:

```text
qualita-aria-tree-events
```

Binding:

```text
TREE_DB
```

Le migrazioni note vanno da `0001_tree_events.sql` a `0011_tree_source_cursor_offsets.sql` e gestiscono eventi, sincronizzazioni, coordinate, località multiple, segnalazioni, override geografici, cursori delle fonti e ripresa parziale dei link.

## 4. Struttura del repository

```text
/
├── assets/
│   └── branding/
│       └── aria-logo-header.svg
├── aria-splash/
├── cloudflare/
│   └── temperature-proxy/
│       ├── migrations/
│       │   ├── 0001_tree_events.sql
│       │   ├── 0002_tree_event_coordinates.sql
│       │   ├── 0003_tree_event_locations.sql
│       │   ├── 0004_tree_location_reports.sql
│       │   ├── 0005_guidonia_seed_events.sql
│       │   ├── 0006_guidonia_109_tree_authorization.sql
│       │   ├── 0007_remove_invalid_valle_pilella_event.sql
│       │   ├── 0008_guidonia_verified_tree_events.sql
│       │   ├── 0009_retry_guidonia_geocoding.sql
│       │   ├── 0010_tree_source_cursors.sql
│       │   └── 0011_tree_source_cursor_offsets.sql
│       ├── src/index.js
│       ├── README.md
│       ├── wrangler.toml
│       └── wrangler.toml.example
├── css/
│   ├── app.css
│   ├── aria-splash.css
│   ├── header-overrides.css
│   └── trees.css
├── data/
│   ├── italian-capitals.json
│   ├── tree-coordinates.json
│   ├── tree-paths.json
│   ├── trees-proxy.json
│   ├── trees.json
│   └── version.json
├── docs/
│   └── contesto-progetto.md
├── js/
│   ├── app.js
│   ├── aria-splash.js
│   ├── eea-utd.js
│   └── trees.js
├── CHANGELOG.md
├── README.md
├── index.html
├── manifest.json
├── service-worker.js
└── version.json
```

La presenza esatta di ogni file nella revisione Git corrente è **Da verificare**.

### Ruolo dei file principali

- `index.html`: struttura UI, selettori, mappe, modali, header, segnalazioni e pannello amministrativo.
- `js/app.js`: logica generale, fonti, città, anni, inquinanti, mappe, PWA e caricamento dati.
- `js/trees.js`: eventi arborei, marker, lista, paginazione, popup, geometrie, zoom, fusione dati e segnalazioni.
- `js/eea-utd.js`: flusso preliminare EEA E2a/UTD e file Parquet.
- `service-worker.js`: cache offline e invalidazione delle versioni precedenti.
- `data/trees.json`: dataset arboreo consolidato e fallback offline.
- `data/tree-coordinates.json`: coordinate consolidate.
- `data/tree-paths.json`: geometrie GeoJSON di strade, tratti, parchi e aree.
- `data/trees-proxy.json`: configurazione frontend dell’endpoint dinamico; contenuto corrente **Da verificare**.
- `data/version.json`: revisione dataset.
- `version.json`: versione e build dell’app.
- `cloudflare/temperature-proxy/src/index.js`: Worker principale.

L’header deve usare `assets/branding/aria-logo-header.svg` con testo alternativo `A.R.I.A. — Analisi e Rappresentazione degli Indicatori Ambientali`.

## 5. Fonti dati e flussi

### EEA E1a

Usa le statistiche annuali validate della tabella:

```text
AirQualityDataFlows.latest.AirQualityStatistics
```

### EEA E2a/UTD

Flusso preliminare dell’anno non consolidato:

1. richiesta lista file;
2. download Parquet;
3. lettura osservazioni;
4. selezione della serie con copertura migliore;
5. soglia minima di copertura del 75%;
6. associazione ai metadati delle stazioni;
7. calcolo annuale.

Gli identificativi dei sampling point possono non coincidere direttamente con i metadati. Non modificare prefissi o suffissi senza test di regressione. La mancanza di risultati per una città può dipendere dalla fonte EEA e non dal frontend.

### OpenAQ

Fornisce dati di stazioni fisiche. La select dei Comuni deve riposizionare la mappa e aggiornare le stazioni. La sua paginazione non deve rimanere visibile passando ad Alberi.

### ARPA Lazio

La fonte si chiama `ARPA Lazio`, consente di scegliere il Comune e usa Roma come valore iniziale. I codici comunali ARPA a otto cifre vengono normalizzati al codice ISTAT a sei cifre, ad esempio `12058091 → 058091`. Il file 2025 conterrebbe 376 Comuni: **Da verificare** nel dataset corrente.

### Temperature osservate

Fonti dichiarate:

- rete micro-meteorologica ARPA Lazio;
- NOAA/NCEI Global Summary of the Year;
- Meteostat come fallback limitato a provider osservativi;
- cataloghi WMO/ICAO e GSOD.

ERA5-Land e altri provider modellistici non devono essere usati come osservazioni fisiche.

### OpenStreetMap e Nominatim

Usati per cartografia, geocodifica, ricerca indirizzi e geometrie. I risultati devono ricadere nel riquadro del Comune atteso. Sono configurati almeno Roma e Guidonia Montecelio.

### Roma Capitale

Fonti automatiche:

```text
https://www.comune.roma.it/web/it/informazioni-di-servizio.page?tem=verde_urbano
https://www.comune.roma.it/web/it/notizie.page?tem=verde_urbano
```

Il crawler deve seguire la paginazione dell’anno corrente, accettare interventi programmati fino al 31 dicembre, separare più blocchi `Ubicazione`, mantenere la pagina come gruppo ed escludere falsi positivi e manutenzioni generiche.

### Guidonia Montecelio

Fonti utilizzate:

- Determine Halley;
- Ordinanze Halley;
- sito istituzionale;
- comunicazioni AVR Group;
- atti e PDF verificati manualmente.

Archivi automatici:

```text
https://guidonia.halleyweb.it/zf/index.php/atti-amministrativi/determine/index/table-determine-public-page/{pagina}
https://guidonia.halleyweb.it/zf/index.php/atti-amministrativi/ordinanze/index/table-ordinanze-public-page/{pagina}
```

Il parser riconosce date `gg/mm/aaaa`. Quantità e indirizzi possono trovarsi soltanto nei PDF; l’estrazione automatica degli allegati nel Worker è **Da verificare**.

## 6. API ed endpoint

### Health check

```http
GET /health
```

Deve indicare versione Worker, disponibilità D1, Comuni arborei e cron configurati.

### Eventi arborei

```http
GET /v1/trees/events?city=roma&year=2026
GET /v1/trees/events?city=guidonia-montecelio&year=2026
```

### Refresh fonti

```http
POST /v1/trees/refresh
Authorization: Bearer <TREE_ADMIN_TOKEN>
```

Campi diagnostici previsti dalla `0.9.12`:

- `discovered`;
- `inserted`;
- `updated`;
- `excludedRemoved`;
- `errors`;
- `archivePagesScanned`;
- `archiveSources`;
- `scanComplete`;
- `futureEventsFound`;
- `scanThrough`;
- `geocoding`.

`scanComplete: true` significa che ogni archivio configurato ha raggiunto almeno una volta la fine delle pubblicazioni dell’anno corrente.

### Revisione e segnalazioni

```http
POST /v1/trees/review
POST /v1/trees/location-reports
POST /v1/trees/event-reports
GET  /v1/trees/geocode?q=<indirizzo>
```

La revisione può correggere titolo, data, località, tipo, stato, quantità e validazione, oppure rifiutare un evento.

Le segnalazioni geografiche usano una mappa satellitare con mirino fisso al centro, ricerca indirizzo e reset. Le segnalazioni possono essere anonime; autore ed email sono facoltativi. Quando la posizione non è il problema deve essere disponibile “Segnala evento”, senza mappa.

### Temperature

```http
GET /v1/temperature?bbox=<west,south,east,north>&year=<anno>
GET /v1/observed?pollutantSource=arpa&bbox=<bbox>&year=<anno>
GET /v1/observed?pollutantSource=eea&bbox=<bbox>&year=<anno>
```

### Proxy EEA

Endpoint osservati:

```http
GET /v1/utd/files?country=IT&city=Roma&pollutant=PM2.5
GET /v1/utd/file?country=IT&city=Roma&pollutant=PM2.5&index=0
GET /v1/annual?year=2025&pollutant=PM2.5&country=IT&bbox=<bbox>
```

Il contratto completo è **Da verificare**.

## 7. Configurazione locale e variabili

Percorso locale utilizzato:

```text
/mnt/linux-data/www/qualita-aria
```

Esempio `wrangler.toml`:

```toml
name = "qualita-aria-temperature"
main = "src/index.js"
compatibility_date = "2026-08-26"
preview_urls = false

[[d1_databases]]
binding = "TREE_DB"
database_name = "qualita-aria-tree-events"
database_id = "INSERIRE_DATABASE_ID"
migrations_dir = "migrations"

[triggers]
crons = ["0 3 * * *", "30 3 * * *"]

[vars]
TREE_SYNC_ENABLED = "true"
```

Variabili e secret:

| Nome | Tipo | Scopo |
| --- | --- | --- |
| `TREE_DB` | binding D1 | archivio arboreo |
| `TREE_SYNC_ENABLED` | variabile | abilita sincronizzazione |
| `TREE_ADMIN_TOKEN` | secret | refresh manuale e operazioni bearer protette |
| `TREE_ADMIN_PASSWORD` | secret | approvazioni amministrative |
| `ARIA_TREE_TOKEN` | variabile shell temporanea | valore locale del token amministrativo |

Non inserire valori segreti in Git, README, `wrangler.toml`, changelog, URL o log. I secret Cloudflare non sono recuperabili in chiaro: se persi, vanno sostituiti.

## 8. Comandi operativi

### Avvio frontend statico

```bash
cd /mnt/linux-data/www/qualita-aria
python3 -m http.server 8080
```

Comandi npm del frontend: **Da verificare**.

### Controlli JSON

```bash
jq empty version.json
jq empty data/version.json
jq empty data/trees.json
```

### Controllo sintattico Worker

Il Worker è un ES module. Con Node configurato come CommonJS, `node --check src/index.js` può fallire su `export default` pur senza errori Wrangler.

```bash
cp cloudflare/temperature-proxy/src/index.js /tmp/aria-worker.mjs
node --check /tmp/aria-worker.mjs
```

### Verifica account e D1

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest whoami
npx wrangler@latest d1 list
npx wrangler@latest d1 migrations list \
  qualita-aria-tree-events \
  --remote \
  --config ./wrangler.toml
```

Sono già avvenuti errori `7403` e `7404` dovuti all’account Cloudflare sbagliato. Non modificare il `database_id` prima di aver verificato l’account.

### Migrazioni e deploy

```bash
npx wrangler@latest d1 migrations apply \
  qualita-aria-tree-events \
  --remote \
  --config ./wrangler.toml

npx wrangler@latest deploy \
  --config ./wrangler.toml
```

L’output deve mostrare `env.TREE_DB`, `env.TREE_SYNC_ENABLED` e i cron `0 3 * * *` e `30 3 * * *`.

### Health check

```bash
curl -sS \
  "https://qualita-aria-temperature.fabzip.workers.dev/health?t=$(date +%s)"
```

### Refresh manuale

```bash
read -rsp "Token: " ARIA_TREE_TOKEN
echo

curl -sS -X POST \
  -H "Authorization: Bearer $ARIA_TREE_TOKEN" \
  https://qualita-aria-temperature.fabzip.workers.dev/v1/trees/refresh

unset ARIA_TREE_TOKEN
```

Per il primo backfill può essere necessario ripetere il refresh fino a `scanComplete: true`.

Esito della verifica in produzione del 13 ottobre 2026:

- `/health` ha restituito la versione Worker `0.9.12`;
- il refresh manuale ha restituito `ok: true`, `discovered: 40`, `inserted: 7`, `updated: 22` ed `errors: 0`;
- la geocodifica ha elaborato 7 candidati, risolvendone 5 e rifiutandone 2;
- `scanComplete: false` conferma che il backfill progressivo deve ancora raggiungere la fine di tutti gli archivi configurati;
- l’esecuzione riuscita conferma insieme autenticazione amministrativa, binding D1 e disponibilità dello schema introdotto dalle migrazioni `0010`/`0011`.

### Rigenerazione token

```bash
ARIA_TREE_TOKEN="$(openssl rand -hex 32)"

printf '%s' "$ARIA_TREE_TOKEN" |
  npx wrangler@latest secret put TREE_ADMIN_TOKEN \
    --config ./wrangler.toml
```

Conservare il valore in un password manager, quindi:

```bash
unset ARIA_TREE_TOKEN
```

### Verifica endpoint arborei

```bash
curl -sS \
  "https://qualita-aria-temperature.fabzip.workers.dev/v1/trees/events?city=roma&year=2026&t=$(date +%s)"

curl -sS \
  "https://qualita-aria-temperature.fabzip.workers.dev/v1/trees/events?city=guidonia-montecelio&year=2026&t=$(date +%s)"
```

### Verifica patch ZIP

```bash
unzip -t qualita-aria-vX.Y.Z-patch.zip
unzip -Z1 qualita-aria-vX.Y.Z-patch.zip
sha256sum qualita-aria-vX.Y.Z-patch.zip
```

## 9. Decisioni tecniche consolidate

1. **Alberi è una fonte**, perché Mappa, Confronto e Differenza sono modalità di lettura.
2. **Gli avvisi producono totali minimi documentati**, non censimenti annuali completi.
3. **Gli aggregati pluriennali restano separati** e non vengono replicati sui singoli anni.
4. **Le quantità complessive non vengono divise** tra località senza una ripartizione ufficiale.
5. **Le correzioni `manual_confirmed` e `manual_rejected` prevalgono** sugli aggiornamenti automatici.
6. **Le chiavi devono rimanere stabili**: il primo blocco multilocalità conserva la chiave storica, i successivi usano `--2`, `--3`; gli atti Halley usano il token dell’atto e non la pagina dell’archivio.
7. **Il crawler segue la paginazione**, perché un evento futuro può essere stato pubblicato mesi prima.
8. **La scansione accetta date fino al 31 dicembre** dell’anno corrente.
9. **La geocodifica è conservativa**: se il risultato non è attendibile viene mostrato `da verificare`, senza coordinate inventate.
10. **Le segnalazioni possono essere anonime**; email e autore sono facoltativi.
11. **Il pannello amministrativo si apre con cinque clic sulla versione** e ogni approvazione richiede la password amministrativa.
12. **La password amministrativa deve essere un secret**, non codice frontend offuscato.
13. **Ogni release cambia la cache PWA**.
14. **Le patch contengono soltanto file modificati**, senza asset e dataset invariati.

## 10. Funzionalità completate o preparate

- PWA installabile e splash A.R.I.A.;
- logo orizzontale nell’header;
- fonti EEA, OpenAQ e ARPA Lazio;
- selezione di città e Comuni;
- Mappa, Confronto e Differenza;
- fonte Alberi e fallback locale;
- bilanci, aggregati separati ed eventi datati;
- D1 per eventi dinamici;
- ordinamento decrescente e paginazione;
- icone arboree, quantità e stato scaduto;
- eventi multilocalità e geometrie;
- zoom su tutte le località;
- marker non pertinenti grigi;
- popup singolo;
- geocodifica progressiva e ricerca indirizzi;
- segnalazioni della posizione e dell’evento;
- pannello e revisione amministrativa;
- supporto Roma e Guidonia;
- cron e cursori di scansione;
- select ARPA per Comune;
- correzione coordinate e colori EEA;
- riposizionamento OpenAQ;
- calcolo corretto delle temperature annuali;
- pulsante “Installa app” nascosto quando la PWA è già aperta come app;
- suite di test versionata per parser, cursori, fusione degli eventi e riepiloghi arborei.

La catena backend Alberi è stata verificata in produzione il 13 ottobre 2026 con Worker `0.9.12` e refresh privo di errori. Restano da pubblicare e verificare nella PWA il frontend `0.7.9` build 89 e, progressivamente, le singole funzionalità che dipendono dai dati dinamici.

## 11. Problemi noti, limitazioni e rischi

- La pubblicazione effettiva del frontend `0.7.9` build 89 è ancora da eseguire e verificare nella PWA pubblica.
- Il primo refresh del Worker `0.9.12` è riuscito senza errori, ma il backfill non è ancora completo (`scanComplete: false`).
- Account Cloudflare errato può produrre errori `7403` o `7404`.
- Gli allegati PDF di Guidonia possono contenere informazioni non presenti nell’HTML.
- `scanComplete` certifica la scansione dell’archivio configurato, non la completezza delle pubblicazioni comunali.
- Le pagine possono mescolare lavori eseguiti, futuri, più località e quantità aggregate.
- Incroci, parchi, intervalli di civici e descrizioni composite possono essere geocodificati male.
- Non tutte le vie dispongono di una geometria attendibile.
- Il flusso EEA UTD può scaricare file validi senza produrre stazioni visualizzabili.
- Dopo un deploy può servire ricaricare forzatamente o riaprire la PWA.
- Il Worker monolitico aumenta il rischio di regressioni tra temperatura e Alberi.
- Le fonti pubbliche possono cambiare HTML e rompere i parser.
- Esistono limiti Cloudflare e limiti di cortesia dei servizi di geocodifica.
- Modificare prefissi o suffissi EEA può impedire l’associazione tra osservazioni e stazioni.

## 12. TODO

### Priorità alta

- pubblicare e verificare il frontend `0.7.9` build 89 nella PWA pubblica;
- completare il backfill fino a `scanComplete: true`;
- verificare gli eventi futuri trovati per Roma e Guidonia;
- controllare i falsi positivi Halley;
- verificare manualmente gli eventi con dati soltanto nei PDF.

### Priorità media

- aggiungere test automatici con fixture HTML;
- testare multilocalità, date future e chiavi stabili;
- testare che gli upsert preservino le revisioni manuali;
- documentare formalmente lo schema JSON delle API;
- valutare estrazione sicura dei PDF;
- mostrare lo stato dei cursori nel pannello amministrativo;
- consolidare nel fallback locale le correzioni manuali affidabili;
- separare il Worker in moduli.

### Priorità bassa

- valutare la rinomina di `temperature-proxy`;
- unificare la documentazione dei proxy;
- introdurre test end-to-end;
- automatizzare patch minimali, SHA-256 e controllo ZIP;
- documentare una procedura di rollback.

## 13. Convenzioni per le modifiche

### Versionamento

Ogni release applicativa aggiorna:

- `version.json`;
- build;
- cache del service worker;
- `README.md`;
- `CHANGELOG.md`.

Se cambia il Worker, aggiornare versione nel `/health`, README del Worker, configurazione di esempio ed eventuali migrazioni.

### Commit

Includere la versione nel messaggio:

```text
feat(scope): vX.Y.Z descrizione
fix(scope): vX.Y.Z descrizione
```

### Sicurezza

Non committare token, password, API key, credenziali, valori dei secret o file temporanei che li contengano.

### Dati arborei

Non inventare quantità, non attribuire aggregati a singoli anni, non dividere quantità complessive, non trasformare manutenzioni in abbattimenti, non considerare “programmato” come “completato”, non creare coordinate fittizie e non sovrascrivere correzioni manuali.

### Compatibilità

Prima di modificare identificativi o normalizzazioni verificare tutti i consumatori, mantenere le chiavi esistenti e testare anni e città già funzionanti. Controllare Roma e almeno una città diversa, oltre ai dataset EEA validati e preliminari.

### UI

Mantenere leggibilità mobile, un solo popup, etichette cartografiche visibili, legende non duplicate, testi brevi, select coerenti e assenza di messaggi tecnici non necessari.

### Patch

Le patch devono essere ZIP minimali, verificate con `unzip -t`, accompagnate da SHA-256 e da comandi Git/Worker. Non reinserire asset invariati.

## 14. Indicazioni per un agente Codex

Prima di intervenire:

1. leggere `README.md`, `CHANGELOG.md`, `version.json`, `data/version.json`, README del Worker e tutte le migrazioni;
2. eseguire `git status --short` e preservare modifiche locali non correlate;
3. usare `rg` e `rg --files` per cercare nel progetto;
4. verificare la versione realmente presente nei file;
5. non assumere che una patch preparata sia stata applicata o distribuita;
6. distinguere codice locale, Git remoto, Worker pubblicato, D1 remoto e cache browser;
7. non sovrascrivere il `wrangler.toml` reale o il suo `database_id`;
8. controllare `whoami` e `d1 list` prima delle migrazioni;
9. testare parser Roma, parser Guidonia, multilocalità, date future, chiavi stabili, revisioni manuali, geocodifica, popup, zoom e cache;
10. usare “Da verificare” per le informazioni non dimostrate;
11. classificare come da verificare gli eventi ambigui, escludendoli dai totali;
12. al termine fornire modifiche, test, ZIP, SHA-256, comandi Git, comandi Worker e indicazione esplicita su migrazioni e deploy.

## 15. Sequenza consigliata per riprendere il lavoro

```bash
cd /mnt/linux-data/www/qualita-aria

git status --short
git log -5 --oneline

jq . version.json
jq . data/version.json

rg -n "version|treeSyncSchedule|TREE_ADMIN|TREE_DB" \
  cloudflare/temperature-proxy/src/index.js \
  cloudflare/temperature-proxy/README.md \
  cloudflare/temperature-proxy/wrangler.toml \
  version.json

cd cloudflare/temperature-proxy

npx wrangler@latest whoami
npx wrangler@latest d1 list
npx wrangler@latest d1 migrations list \
  qualita-aria-tree-events \
  --remote \
  --config ./wrangler.toml

curl -sS \
  "https://qualita-aria-temperature.fabzip.workers.dev/health?t=$(date +%s)"
```

Confrontare quindi:

| Elemento | Locale | Remoto |
| --- | --- | --- |
| Versione app | `version.json` | GitHub Pages |
| Versione Worker | `src/index.js` | `/health` |
| Migrazioni | cartella `migrations` | `wrangler d1 migrations list --remote` |
| Cron | `wrangler.toml` | output deploy |
| Eventi | JSON di fallback | `/v1/trees/events` |
| Cache | `service-worker.js` | browser/PWA |

Una nuova modifica deve iniziare solo dopo questo confronto.
