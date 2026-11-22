# 0.8.7 — Widget ufficiale RainViewer e ricerca CAP italiani

Il radar usa ora il widget ufficiale offerto dal comando **Incorpora** di [RainViewer](https://www.rainviewer.com/it/weather-radar-map-live.html), con tema scuro e centratura sulla località scelta. Animazione, timeline, zoom e funzioni interne sono gestiti direttamente da RainViewer; i controlli esterni consentono di ricentrare, ricaricare e aprire il radar in una nuova scheda. Disponibilità e funzioni dipendono dal servizio. Sostituito il precedente renderer delle immagini radar: le limitazioni dell'API pubblica descritte nella release 0.8.6 non definiscono le funzioni del widget.

Su dispositivi touch la mappa parte protetta dal pulsante **Attiva radar**, per consentire lo scorrimento della pagina; **Blocca interazione** ripristina la protezione. I gesti dentro l'iframe dipendono da RainViewer: non è possibile imporre dall'app lo spostamento con due dita. Il widget viene rimosso quando si cambia fonte o si nasconde la pagina e ripristinato al ritorno. Spostare il radar non cambia la località delle previsioni.

Corretta la ricerca di CAP come `00012`, assenti nella risposta del geocoding Open-Meteo: i CAP italiani completi sono cercati in un catalogo GeoNames locale, preservando gli zeri iniziali e mostrando tutte le località associate. `00012` propone anche Guidonia Montecelio. CAP sconosciuti e codici incompleti hanno messaggi espliciti; la ricerca mondiale per nome continua a usare Open-Meteo. Le coordinate dei CAP sono punti di riferimento delle località, non indirizzi precisi.

Catalogo: 4.736 CAP e 18.415 località, [GeoNames IT.zip](https://download.geonames.org/export/zip/IT.zip), CC BY 4.0, acquisito il 22 novembre 2026. File di circa 1 MB caricato solo alla prima ricerca CAP, non nel precaricamento PWA. Rigenerazione: scaricare IT.zip e usare `python3 tools/build_postal_codes.py /percorso/IT.zip --date YYYY-MM-DD`. Attribuzione visibile nell'app.

App **0.8.7 build 120**, cache PWA aggiornata. Nessuna modifica a Worker, database o secret. Verifiche: 30 test automatici superati, ricerca e selezione di `00012` nel browser e caricamento effettivo del widget ufficiale.

# 0.8.6 — Radar meteo, ricerca località e avvio geolocalizzato

La pagina Meteo ora usa lo stesso stile cartografico delle altre fonti: condizioni attuali, mappa radar centrale e previsioni orarie/giornaliere sotto. Rimossa la sezione “Località della previsione”; nome della località e coordinate restano compatti accanto al meteo. Il selettore limitato alle città italiane è sostituito da ricerca mondiale di città, paesi e CAP tramite Open-Meteo / GeoNames, con risultati distinti per provincia/regione/Paese, attesa di 450 ms, cancellazione delle richieste precedenti e gestione accessibile degli esiti.

All'apertura Meteo richiede la geolocalizzazione, condividendo le richieste concorrenti di inizializzazione. Se il consenso manca o la posizione non è disponibile, invita a cercare una località e **non usa Roma come ripiego**. Il pulsante Geolocalizza permette di tornare alla posizione corrente. La località cercata resta indipendente dalle selezioni delle altre fonti; spostare il radar non cambia il luogo della previsione.

Radar gratuito **RainViewer Weather Maps API**, senza chiave, per uso personale/educativo e piccoli progetti comunitari. Attribuzione visibile. L'API corrente fornisce le ultime 2 ore di immagini a intervalli di 10 minuti; dal 2026 non offre nowcast futuro né satellite IR. Palette Universal Blue, zoom nativo massimo 7 (ingrandimento cartografico ulteriore senza inventare dettaglio radar). Comandi: riproduci/pausa, precedente/successivo, timeline da tastiera, opacità, maschera delle aree senza copertura, aggiornamento, ricentramento, zoom e schermo intero. Su mobile spostamento con due dita. Ora del frame nel fuso della località cercata, UTC esplicito quando il fuso non è ancora noto; dati non recenti segnalati.

Metadati radar in cache per 5 minuti; immagini in memoria con limite di 128 elementi e coda di richieste distanziate di 800 ms per pagina (meno di 80 nuove richieste/minuto), per rispettare il limite prudenziale di 100/IP/minuto indicato nella documentazione di transizione. Animazione senza precaricamento di tutte le immagini, attesa del caricamento del frame, arresto quando si cambia fonte o si nasconde la pagina. Copertura scura distinta da assenza di precipitazioni. Errori radar non bloccano le previsioni e viceversa. Nessuna garanzia di disponibilità del servizio gratuito.

Riferimenti: https://www.rainviewer.com/api/weather-maps-api.html, https://www.rainviewer.com/api/transition-faq.html, https://www.rainviewer.com/api.html e https://open-meteo.com/en/docs/geocoding-api.

App **0.8.6 build 119**, cache PWA aggiornata; nessun nuovo Worker, database, account o secret. Verifiche: 30 test superati, API reali RainViewer e ricerca Guidonia, controlli radar nel browser e layout a 390 px senza overflow. Geolocalizzazione verificata con fixture controllate nei test; nessun consenso di posizione del dispositivo concesso automaticamente dall'agente.

# 0.8.5 — Posizione meteo riconoscibile e provenienza

Con Geolocalizza, la scheda meteo mostra località/comune/regione/Paese quando identificabili, coordinate effettivamente richieste al servizio, accuratezza dichiarata dal dispositivo, istante di acquisizione e link di verifica su OpenStreetMap. Il nome viene ricavato via BigDataCloud dal browser, solo dalle coordinate appena ottenute con consenso; nessuna chiamata per le città del catalogo, nessuna localizzazione automatica tramite IP. Cache in memoria per 15 minuti, richieste simultanee condivise e timeout. Attribuzione e link privacy visibili: il servizio usa i segnali coordinate/IP per migliorare la propria geolocalizzazione (documentazione: https://www.bigdatacloud.com/docs/free-api/free-reverse-geocode-to-city-api).

La provenienza meteo distingue il punto richiesto dal punto della griglia restituito da Open-Meteo, con distanza e quota di riferimento della previsione. Esplicitata la selezione automatica Best Match: non si attribuiscono dati a stazioni o a un modello specifico non identificato nella risposta. Se mancano metadati, vengono indicati come non disponibili. Le coordinate e la fonte sono visibili anche per le città scelte manualmente.

Un errore nel riconoscimento del nome non blocca il meteo e non sostituisce le coordinate con Roma o con quelle della griglia: mostra un avviso e mantiene il link mappa. Risposte IP o coordinate non coerenti vengono ignorate. App **0.8.5 build 118**, cache PWA aggiornata; nessuna modifica a Worker, database o secret. Test: suite completa (29 test), località/coordinate/griglia distinte, null e coordinate zero, escaping, cache, richieste condivise e guasto del servizio nomi senza perdita del meteo.

# 0.8.4 — Meteo come fonte iniziale

Nuova fonte iniziale **Meteo · Open-Meteo**, con Roma selezionata, città italiane e opzione Geolocalizza su richiesta. Mostra condizioni attuali stimate dal modello, temperatura percepita, umidità, vento e precipitazioni, prossime 24 ore e previsione a 7 giorni con minime/massime, pioggia e vento. Orari nel fuso della località e condizioni meteorologiche tradotte in italiano. Nessun anno o filtro inquinante nella schermata meteo; le altre fonti restano disponibili con le proprie selezioni.

API ufficiale `https://api.open-meteo.com/v1/forecast`, senza chiave, `timezone=auto`, unità °C/km/h/mm. Piano gratuito destinato a uso non commerciale: la sola gratuità dell'app non basta in presenza di pubblicità/monetizzazione. Attribuzione Open-Meteo e CC BY 4.0 visibile. Documentazione e condizioni: https://open-meteo.com/en/docs e https://open-meteo.com/en/terms.

Cache per coordinate di 15 minuti in memoria e localStorage, riuso delle richieste simultanee, timeout e pulsante Riprova. Nessun dato meteo inventato o fallback silenzioso su risposte scadute; valori null mostrati come sconosciuti. Richieste obsolete ignorate dopo cambio città/fonte. Geolocalizzazione attivata solo scegliendo Geolocalizza, senza richieste automatiche di permesso all'avvio. Il caricamento meteo non attende che le mappe siano pronte.

App **0.8.4 build 117**, cache PWA aggiornata; Worker, secret e database invariati. Verifiche: suite automatica (29 test), risposta API reale, browser con Roma/Milano e passaggio alle previsioni aria, layout mobile 390 px senza overflow, 24 schede orarie e 7 giornaliere.

# 0.8.3 — Calendari arborei di Roma e intervalli dei lavori

Importazione giornaliera dei calendari ufficiali dei 15 Municipi di Roma, oltre agli avvisi del dipartimento Ambiente. Gli intervalli mantengono inizio e fine lavori anche oltre dicembre; un intervento non risulta trascorso finché non termina il periodo previsto. La data dell'avviso non viene più usata come data di esecuzione quando questa manca, anche per gli avvisi automatici già archiviati. Le date manuali restano invariate.

Sono esclusi i soli lavori di potatura e le generiche messe in sicurezza. Gli abbattimenti eventuali restano di tipo da verificare, con icona neutra e quantità sconosciuta. I lavori programmati non entrano nei totali degli interventi eseguiti. Nessun punto viene inventato per indirizzi generici o rinviati a un allegato. L'editor consente di correggere la fine lavori e assegnarla alle singole parti della divisione, conservando la provenienza e le esclusioni.

App `0.8.3`, build `116`, Worker ambientale `0.11.0`; migrazione D1 `0013_tree_calendar_intervals.sql` da applicare prima del deploy. Nuovo cron alle **03:10 UTC** per i calendari, separato dalla scansione avvisi delle 03:00 e dalla geocodifica delle 03:30. Secret e binding invariati. Test: `node --test tests/*.test.mjs` (22 file), controllo sintassi e dry-run Wrangler.

Distribuzione verificata il 21 novembre 2026: migrazione 0013 applicata, Worker 0.11.0 online e prima importazione dei 15 calendari completata senza errori. API pubblica: 305 eventi Roma 2026, di cui 13 da calendario ancora nel periodo programmato; i due figli manuali di `IDS1677374` restano separati con un abbattimento ciascuno. L'importazione iniziale usa gli stessi upsert del Worker su HTML ufficiali appena verificati, senza leggere secret. La geocodifica prosegue con il cron dedicato.

# 0.8.2 — Divisione di eventi senza località originali

Corretto il blocco del salvataggio quando l'evento automatico ha `locations: []`: il server ora valida gli indirizzi dei nuovi interventi, senza richiederli anche nel record originale incompleto. La stessa correzione consente di correggere o rimuovere questi eventi. Fonte comune e transazione atomica restano preservate.

Il modulo segnala gli errori vicino ai pulsanti di salvataggio, conserva i campi e indica quale intervento ha un indirizzo mancante. Gli errori del server sulle parti includono il numero dell'intervento.

App `0.8.2` build `115`, Worker ambientale `0.10.1`, cache PWA aggiornata. **Necessario il deploy del Worker**; nessuna nuova migrazione oltre alla `0012` richiesta da 0.8.0, nessuna modifica ai secret:

```bash
git pull --ff-only origin main
cd cloudflare/temperature-proxy
npx wrangler deploy --config ./wrangler.toml
```

Regressione basata sull'evento pubblico `IDS1677374` (piazza San Saturnino / via Avigliana), letto senza modificare D1 remoto: la validazione falliva prima della transazione. Test su SQLite locale di divisione con due indirizzi e un abbattimento ciascuno, modifica/rimozione dell'originale incompleto, importazione dal catalogo locale e rifiuto atomico delle parti non valide. Tutti i 21 file di test superati.

# 0.8.1 — Ricerca negli eventi amministrativi

Il pannello di modifica Alberi offre “Cerca negli eventi”: filtra in tempo reale titolo, indirizzi, municipio/zona, fonte, descrizione, data, quantità e tipo. La ricerca ignora maiuscole e accenti, combina più parole e mostra il conteggio dei risultati. Svuotando il campo tornano tutti gli eventi; le modifiche non salvate restano nei rispettivi editor durante il filtraggio. App `0.8.1` build `114`, cache PWA aggiornata. Nessuna nuova migrazione o modifica ai Worker rispetto a 0.8.0.

# 0.8.0 — Amministrazione e divisione degli eventi Alberi

Il pannello amministratore (cinque tocchi sulla versione) consente di caricare gli eventi per Comune e anno, anche senza una segnalazione. Ogni evento offre modifica del numero di alberi e del tipo: **Piantumazione · verde** oppure **Abbattimento · rosso**; le quantità sconosciute possono restare vuote.

**Dividi in più interventi** prepara record distinti con quantità, tipo, stato, data lavori e indirizzi propri, mantenendo la fonte e la pubblicazione originali in comune. Nessuna ripartizione automatica delle quantità. L'originale viene escluso mentre i nuovi interventi vengono creati nella stessa transazione, senza doppio conteggio. La geolocalizzazione lavora sulle località di ciascun intervento (massimo otto tentativi immediati, gli altri al cron).

**Rimuovi e ignora evento** esclude il record da mappa, elenco e totali e impedisce che i successivi aggiornamenti lo ripristinino. I record esclusi e la cronologia delle nuove operazioni amministrative restano nell'archivio. Le decisioni richiedono sempre la password amministratore; non viene salvata nel browser.

App `0.8.0` build `113`, Worker ambientale `0.10.0`, cache PWA aggiornata. **Per attivare il nuovo editor occorrono la migrazione D1 `0012_tree_admin_event_split.sql` e il deploy del Worker**; il push frontend da solo non basta. Dopo aver verificato account Cloudflare e database:

```bash
git pull --ff-only origin main
cd cloudflare/temperature-proxy
npx wrangler d1 migrations apply qualita-aria-tree-events --remote --config ./wrangler.toml
npx wrangler deploy --config ./wrangler.toml
```

Nessuna modifica ai secret, al proxy OpenAQ o a EEA. Migrazione e deploy remoti non eseguiti durante lo sviluppo. Suite di 21 file di test superata; SQLite con tutte le migrazioni, collaudo browser locale su archivio simulato e dry-run Wrangler riusciti.

# 0.7.32 — Etichette e barre Alberi

Corretto il riepilogo Alberi: le etichette “Piantati documentati” e “Abbattimenti documentati” hanno spazio dedicato e vanno a capo senza sovrapporsi alle barre. Su mobile ogni etichetta precede la propria barra su una riga distinta. App `0.7.32`, build `112`, cache PWA/CSS aggiornata. Nessuna modifica ai dati o ai Worker.

# 0.7.31 — Mappe mobile con due dita

Su dispositivi con puntatore touch, spostamento e zoom delle mappe usano i gesti cooperativi MapLibre: un dito permette di scorrere la pagina, due dita di muovere la mappa. Suggerimento in italiano. Attivo su mappa principale, confronto e segnalazioni; il divisore del confronto resta trascinabile con un dito. Interazione desktop invariata. App `0.7.31`, build `111`, cache PWA e CSS aggiornati. Nessuna modifica ai Worker, database o secret.

# 0.7.30 — OpenAQ: campo Periodo durante il caricamento

Il campo anno `singleYearField` resta nascosto per tutta la richiesta OpenAQ, anche quando si cambia periodo o si sposta la mappa. Eliminata la comparsa temporanea di un secondo campo Periodo. App `0.7.30`, build `110`, cache PWA aggiornata; proxy OpenAQ invariato `0.4.3`, nessun nuovo deploy Worker o migrazione richiesti da questa modifica.

# 0.7.29 — OpenAQ 0.4.3 (21 novembre 2026)

La ricerca OpenAQ include tutte le varianti di unità dei gas, prima limitate ai soli ID ppm. Ripristinata la select città condivisa con EEA, mantenendo **Geolocalizza** come scelta iniziale e la memoria della città per fonte. Cambiare città aggiorna area e stazioni; cambiare periodo o inquinante conserva il centro corrente.

App `0.7.29`, build `109`, cache PWA aggiornata; proxy OpenAQ `0.4.3` **da distribuire**. Nessuna migrazione, modifica ai secret o ai Worker EEA/temperature/alberi. Dopo il push frontend, per attivare la correzione dei gas:

```bash
git pull --ff-only origin main
cd cloudflare/openaq-proxy
npx wrangler deploy --config ./wrangler.jsonc
```

Verificare `/health` (`0.4.3`), quindi riaprire la PWA. Il push su GitHub non distribuisce questo Worker.

# A.R.I.A. 0.7.28

Corretto il caricamento EEA bloccato con HTTP 403/502: il proxy usa POST multipart e si identifica con lo User-Agent A.R.I.A. Il solo passaggio a POST non era sufficiente da Cloudflare; la correzione completa è nel proxy EEA `0.2.2`, distribuito l'8 novembre 2026. Il fallback del browser usa POST ma resta soggetto al CORS upstream. App `0.7.28` build 108, senza ulteriori modifiche al frontend. Non servono nuovi token applicativi. Per distribuire il proxy nel proprio ambiente:

```bash
git pull --ff-only origin main
cd cloudflare/eea-proxy
npx wrangler@latest deploy --config ./wrangler.jsonc
```

Controllare che `https://qualita-aria-eea.fabzip.workers.dev/health` restituisca `version: "0.2.2"`, quindi ricaricare l'app. Il deploy richiede l'accesso Cloudflare dell'account corretto; `TREE_ADMIN_TOKEN` non è coinvolto. Nessuna migrazione o modifica al Worker alberi/temperature.

# A.R.I.A. 0.7.27

Gli avvisi arborei misti non vengono più scartati: quando il testo lo consente, abbattimenti e piantumazioni diventano interventi distinti della stessa fonte. Quantità e date ambigue restano da verificare; una scadenza degli abbattimenti non viene attribuita automaticamente alle piantumazioni.

Dopo qualsiasi segnalazione, anche di posizione, l'amministratore può correggere titolo, Comune, anno, data lavori, Municipio/zona, tutte le località (una per riga), tipo, stato, quantità complessiva, fonte, data di pubblicazione e descrizione. Per gli eventi già localizzati è disponibile anche `Segnala dati evento`. Le correzioni sono preservate dai refresh e le località modificate vengono geocodificate nuovamente; restano immutabili gli identificativi e la cronologia tecnica.

App `0.7.27` build 107, Worker ambientale `0.9.14` **da distribuire**. Nessuna nuova migrazione D1 o modifica dei secret:

```bash
cd /mnt/linux-data/www/qualita-aria
git pull --ff-only origin main
cd cloudflare/temperature-proxy
npx wrangler@latest deploy --config ./wrangler.toml
```

Dopo il deploy avviare il refresh arboreo con il token esistente (procedura nel [README del Worker](cloudflare/temperature-proxy/README.md#forzare-manualmente-laggiornamento-arboreo)), oppure attendere il cron. Il recupero è progressivo e può richiedere più passaggi. Il nuovo pannello amministrativo segnala se il Worker non è aggiornato, evitando salvataggi incompleti.

# A.R.I.A. 0.7.26

Ogni fonte conserva i propri filtri durante la navigazione: tornando a EEA, OpenAQ, ARPA Lazio, previsioni o alberi ritrovi città/area, inquinante e periodo selezionati, con gli anni di confronto e la modalità compatibile. Le opzioni dipendenti vengono ricostruite prima del ripristino; valori non più disponibili lasciano un'opzione valida. La memoria è limitata alla pagina aperta e non viene salvata nel browser dopo un ricaricamento. App `0.7.26` build 106; nessun nuovo deploy dei Worker.

# A.R.I.A. 0.7.25

La vista EEA `Oggi` include ora anche l'ultima media giornaliera disponibile quando una stazione non pubblica dati orari. Il valore è accompagnato dalla dicitura `media giornaliera del …`, senza un orario istantaneo inventato. Sono esclusi periodi non ancora conclusi e dati futuri; la data effettiva rimane visibile anche se precedente a oggi. Corretto un filtro che poteva scartare tutte le osservazioni giornaliere già scaricate e lasciare vuote mappa ed elenco. App `0.7.25` build 105; nessun nuovo deploy dei Worker, basta ricaricare il frontend aggiornato.

# A.R.I.A. 0.7.24

Nella mappa delle segnalazioni arboree il pulsante `Mappa stradale` / `Satellite` permette di leggere i nomi delle vie senza perdere la posizione scelta con il mirino. Dopo l'invio riuscito, sia le segnalazioni di posizione sia quelle sull'evento chiudono il modulo e mostrano una notifica con il numero della segnalazione. In caso di errore il modulo rimane aperto e conserva i dati; il doppio invio è bloccato durante l'attesa. App `0.7.24` build 104; cache PWA aggiornata, nessun nuovo deploy dei Worker.

# A.R.I.A. 0.7.23

Gli avvisi arborei programmati vengono conservati anche senza quantità dichiarata; migliorato il riconoscimento delle date e ricontrollate le prime pagine durante il recupero degli archivi. Una revisione della località cerca subito la nuova posizione e aggiorna elenco e puntatori senza cambiare selezione. Le coordinate già approvate restano se cambia soltanto il titolo; nessun punto viene inventato quando la posizione non è risolvibile. App `0.7.23` build 103, Worker ambientale `0.9.13` da distribuire; nessuna nuova migrazione D1 e nessun cambio dei secret.

```bash
cd /mnt/linux-data/www/qualita-aria
git pull --ff-only origin main
cd cloudflare/temperature-proxy
npx wrangler@latest deploy --config ./wrangler.toml
```

Dopo il deploy eseguire un refresh arboreo con `TREE_ADMIN_TOKEN` (procedura in [README del Worker](cloudflare/temperature-proxy/README.md#forzare-manualmente-laggiornamento-arboreo)), oppure attendere il cron. Il refresh recupera anche le correzioni manuali già salvate rimaste senza coordinate; gli indirizzi irrisolvibili vengono ritentati dopo almeno 24 ore. `scanComplete: false` richiede ulteriori passaggi per completare l'archivio: non implica che gli avvisi recenti siano esclusi.

# A.R.I.A. 0.7.22

Corretto anche in OpenAQ il nome `MILANO PASCAL CITTÀ STUDI`. Una normalizzazione condivisa gestisce nomi e testi visualizzati da EEA, OpenAQ, ARPA e temperature, compresi elenco, ricerca e cartografia. Accenti già corretti, identificativi e URL restano invariati. App 0.7.22 build 102; nessun nuovo deploy dei Worker.

# A.R.I.A. 0.7.21

La selezione di una città EEA usa un raggio di 10 km anziché 40; anche le previsioni usano uno zoom cittadino maggiore. Corretto il parser dei CSV ARPA storici, che includeva erroneamente un separatore vuoto, e reso più robusto il riconoscimento del Comune durante i caricamenti paralleli. App 0.7.21 build 101, senza nuovo deploy dei Worker.

# A.R.I.A. 0.7.20

Corretto il nome della stazione EEA `MILANO PASCAL CITTÀ STUDI` nei dati annuali e nelle ultime misure. La normalizzazione gestisce anche risposte del proxy già in cache. App 0.7.20 build 100, senza nuovo deploy dei Worker.

# A.R.I.A. 0.7.19

Corretto il recupero delle misure EEA: il filtro testuale della città poteva restituire zero file anche con stazioni presenti. Il proxy ora cerca il catalogo nazionale e seleziona i file usando le stazioni dell’area geografica; non tronca il catalogo ai primi file. App 0.7.19 build 99. È necessario distribuire il Worker EEA 0.2.0; il frontend segnala esplicitamente un proxy precedente.

# A.R.I.A. 0.7.18

In EEA, `Oggi` mostra l’ultima misura disponibile per stazione anche se precedente alla giornata corrente. Il badge indica l’inquinante seguito da `- ultima misura` e il riquadro Periodo mostra la data più recente tra le stazioni visualizzate. Nell’elenco resta disponibile l’orario di ogni misura; la temperatura continua a riferirsi a oggi. App 0.7.18 build 98, senza modifiche ai Worker.

# A.R.I.A. 0.7.17

Il selettore EEA `Periodo` contiene `Oggi` e tutte le annualità disponibili. Rimane visibile anche nella vista odierna; selezionando un anno si torna alle statistiche annuali. Il campo Mese rimane nascosto. App 0.7.17 build 97, senza modifiche ai Worker.

# A.R.I.A. 0.7.16

EEA propone `Geolocalizza` come selezione iniziale e il periodo `Oggi`, con l’ultima misura preliminare della giornata per stazione e il relativo orario. La disponibilità dipende dai tempi di trasmissione EEA. L’overlay meteo odierno mostra minima prevista / temperatura attuale / massima prevista da Open-Meteo; il popup indica l’orario e la natura modellistica dei valori. App 0.7.16 build 96, senza modifiche ai Worker.

# A.R.I.A. 0.7.15

Corretto il primo caricamento OpenAQ quando più aggiornamenti si sovrappongono durante la geolocalizzazione. Le richieste attendono la posizione e le dimensioni della mappa vengono aggiornate prima di selezionare l’area. App 0.7.15 build 95; proxy OpenAQ 0.4.2.

# A.R.I.A. 0.7.14

OpenAQ parte dalla posizione del dispositivo e dal periodo `Oggi`. La mappa si allarga progressivamente quando mancano misure, fino allo zoom 5. Il selettore propone PM2.5, PM10, NO₂, O₃, SO₂ e CO; la disponibilità dipende dalle stazioni. Se la posizione non è disponibile, è possibile spostare la mappa manualmente. App 0.7.14 build 94 e proxy OpenAQ 0.4.2, da distribuire prima del frontend.

# A.R.I.A. 0.7.13

OpenAQ consente ora di scegliere `Oggi` nel selettore del periodo. La PWA richiede esclusivamente misure registrate dalla mezzanotte locale, mantenendo disponibili anche gli intervalli mobili di 7, 15 e 30 giorni. App 0.7.13 build 93, proxy OpenAQ 0.4.1, dataset invariato alla revisione 22 e Worker ambientale invariato alla versione 0.9.12.

# A.R.I.A. 0.7.12

La vista delle previsioni adotta ora un dashboard originale A.R.I.A.: riepilogo del giorno, grafico continuo sulle 24 ore, quattro schede per le fasce della giornata e selezione orizzontale dei cinque giorni. Sono state eliminate la struttura a fisarmonica e le barre segmentate. App 0.7.12 build 92, dataset invariato alla revisione 22, Worker invariato alla versione 0.9.12.

# A.R.I.A. 0.7.11

La vista previsionale usa un unico selettore per scegliere PM10, PM2.5, CO, SO₂, O₃ e NO₂. La barra di pulsanti duplicata è stata rimossa insieme al relativo codice. App 0.7.11 build 91, dataset invariato alla revisione 22, Worker invariato alla versione 0.9.12.

# A.R.I.A. 0.7.10

La leggibilità dell’intera interfaccia è stata aumentata applicando `+0.2rem` a tutte le dimensioni dei caratteri, comprese le viste responsive, le previsioni, le schede delle stazioni, Temperatura, Alberi e lo splash iniziale. App 0.7.10 build 90, dataset invariato alla revisione 22, Worker invariato alla versione 0.9.12.

# A.R.I.A. 0.7.9

La nuova fonte `Previsioni qualità dell’aria` mostra per la città selezionata cinque giorni di stime modellistiche Open-Meteo/CAMS. Sono disponibili PM10, PM2.5, CO, SO₂, O₃ e NO₂, con media e massimo giornalieri e dettaglio per notte, mattina, pomeriggio e sera. Le previsioni restano chiaramente separate dalle misure di stazione e dalle valutazioni annuali. L’interfaccia è stata inoltre alleggerita rimuovendo diagnostica e spiegazioni tecniche non utili alla lettura dei dati. App 0.7.9 build 89, dataset invariato alla revisione 22, Worker invariato alla versione 0.9.12.

# A.R.I.A. 0.7.8

La release corregge il conteggio degli eventi arborei non confermati, la classificazione delle date future, il riconoscimento delle quantità e la fusione di più interventi provenienti dalla stessa pagina. Il crawler distribuisce il lavoro fra le fonti, salva i cursori soltanto dopo l’elaborazione riuscita e riprende senza perdite le pagine con più di 40 link mediante la migrazione D1 `0011_tree_source_cursor_offsets.sql`. Le segnalazioni geografiche usano ora il Comune corretto. App 0.7.8 build 88, dataset invariato alla revisione 22, Worker 0.9.12.

# A.R.I.A. 0.7.7

Il crawler arboreo esplora progressivamente le pagine degli archivi dell'anno corrente invece di leggere soltanto la prima pagina. Ogni fonte conserva in D1 un cursore indipendente: informazioni di servizio e notizie per Roma Capitale, determine e ordinanze per Guidonia Montecelio. Le date degli interventi programmati sono accettate fino al 31 dicembre. Il refresh espone pagine visitate, intervallo delle pubblicazioni, completamento della scansione ed eventi futuri trovati. App 0.7.7 build 87, dataset invariato alla revisione 22, Worker 0.9.11.

# A.R.I.A. 0.7.6

Le pagine arboree che contengono più blocchi `Ubicazione` vengono suddivise in interventi distinti, ognuno con la propria data, quantità e posizione. La pagina resta il gruppo comune per selezione, zoom e fonte ufficiale. La procedura non forza più Roma nel database ed è compatibile anche con gli eventi di Guidonia Montecelio, mantenendo inalterate le correzioni manuali già confermate. App 0.7.6 build 86, dataset invariato alla revisione 22, Worker 0.9.10.

# A.R.I.A. 0.7.3

Ripristinato l'evento 2019 del Parco di Valle Pilella con la fonte puntuale corretta e i 50 alberi indicati nell'ordinanza. Le 61 piantumazioni AVR del 2024 sono ora separate per località e quantità: 49 a Colle Fiorito, 5 in Piazza Matteotti e 7 in Piazza Carrara. Aggiunti l'intervento 2025 di circa 200 ripiantumazioni a La Sorgente, cinque eventi 2026 per le 82 piante AVR e l'ordinanza 32/2026 relativa a potature e abbattimenti in nove tratti di Colleverde, senza inventare una quantità. Il Worker 0.9.7 geocodifica ora anche Guidonia Montecelio usando il contesto e i limiti territoriali corretti. App 0.7.3 build 83, dataset 22.

# A.R.I.A. 0.7.2

Rimosso l'evento non verificabile di Valle Pilella, il cui collegamento puntava a una pagina generale dell'archivio delle ordinanze anziché a un atto specifico. Corretto inoltre l'invio di “Segnala evento”: la chiave della fonte viene ora risolta da una funzione condivisa disponibile anche al gestore del modulo. App 0.7.2 build 82, dataset 21; Worker invariato alla 0.9.6.

# A.R.I.A. 0.7.1

La determina di Guidonia Montecelio n. 1110 del 3 ottobre 2024 è stata verificata anche nel PDF allegato. L'evento conserva lo stesso identificativo della 0.7.0 e documenta 109 alberi autorizzati all'abbattimento in 17 località o insiemi di vie, con successivo reimpianto sostitutivo previsto. La quantità resta complessiva perché l'atto non la ripartisce territorialmente; lo stato è programmato poiché l'autorizzazione non certifica l'esecuzione. Il dataset è alla revisione 20 e il Worker resta alla versione 0.9.6.

# A.R.I.A. 0.7.0

La fonte Alberi supporta ora due comuni separati: Roma e Guidonia Montecelio. Guidonia parte da una raccolta documentale parziale 2024; statistiche, confine comunale, selezioni ed eventi non vengono mescolati con Roma. Il Worker 0.9.6 accetta entrambi gli identificatori mantenendo invariato `roma`.

# A.R.I.A. 0.6.6

La versione 0.6.6 ripristina le stazioni EEA UTD/E2a 2025 di Roma associando i metadati tramite SampleId esatto e, solo quando questo fallisce, tramite il codice ufficiale EoI della stazione. Nessun identificatore originale viene riscritto.

# Qualità dell'aria

PWA mobile-first per esplorare dati reali sulla qualità dell'aria su una mappa interattiva, confrontare periodi storici quando la fonte lo consente e distinguere chiaramente tra misure di stazione e valutazioni territoriali.

L'app è pubblicata come sito statico su GitHub Pages e usa un Cloudflare Worker come proxy sicuro per OpenAQ, così la API key non viene mai esposta nel browser.

## Fonti dati

### EEA · stazioni

La fonte EEA utilizza le statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei.

Aree disponibili:

- **Italia** — mostra una seconda selezione **Città** con 118 capoluoghi e co-capoluoghi italiani; **Roma** è selezionata di default. I punti dei centri abitati provengono da GeoNames e sono stati verificati all'interno dei rispettivi confini comunali ISTAT 2026.
- **Europa**

Quando l'area è **Italia**, il capoluogo selezionato determina la posizione iniziale della mappa. Se l'utente sposta o ingrandisce la mappa, dopo **2 secondi senza ulteriori movimenti** la query EEA viene aggiornata usando la bounding box effettivamente visibile. La finestra geografica non rappresenta il confine amministrativo del comune o della provincia.

Inquinanti attivi:

- PM2.5
- PM10
- NO₂

Per le statistiche annuali l'app usa in via prioritaria i dati **E1a validati**. Per l'anno più recente, se la statistica annuale validata non è ancora disponibile per una città italiana, può usare come fallback le osservazioni **E2a / UTD preliminari** del servizio ufficiale EEA e calcolare una media annuale provvisoria.

I dati UTD sono sempre marcati con **◐ Preliminare UTD** e non vengono presentati come equivalenti ai dati **✓ Validati E1a**. Le medie UTD vengono mostrate solo quando la serie scelta raggiunge almeno il 75% di copertura dell'anno.

La visualizzazione sfumata attorno alle stazioni è una rappresentazione grafica dei punti misurati e non una superficie modellata continua.

## ARPA Lazio · comuni

La fonte ARPA Lazio utilizza le valutazioni comunali annuali ufficiali per i comuni dell'intera regione. Una select dedicata viene popolata direttamente con i comuni presenti nel file annuale; Roma resta selezionata per impostazione predefinita.

L'app legge direttamente i file annuali pubblicati da ARPA Lazio e ricava, quando disponibili:

- MIN
- MED
- MAX

per:

- PM2.5
- PM10
- NO₂

Il colore applicato al perimetro del comune selezionato indica l'ambito territoriale della valutazione. Non implica che la concentrazione sia uniforme in ogni punto del territorio.

## OpenAQ · area visibile

OpenAQ viene usato per estendere la copertura oltre l'Europa.

Per evitare richieste mondiali troppo grandi, i dati vengono caricati solo per la bounding box attualmente visibile sulla mappa.

Caratteristiche:

- zoom-out limitato per impedire una vista dell'intero pianeta;
- caricamento con debounce condiviso: dopo `moveend` l'app attende 2 secondi senza altri movimenti prima di aggiornare i dati;
- monitor fissi classificati come reference monitor;
- esclusione dei sensori mobili;
- recenza selezionabile: 7, 15 o 30 giorni;
- suddivisione automatica della bounding box in quadranti quando una zona contiene troppe location;
- nessun risultato parziale silenzioso: nelle aree ancora troppo dense viene richiesto di aumentare lo zoom;
- cache Cloudflare per ridurre richieste duplicate.

Inquinanti OpenAQ attivi:

- PM2.5
- PM10

NO₂ non è ancora attivo nella vista OpenAQ perché i dati possono essere espressi con unità diverse; l'app evita di mescolare valori non omogenei sulla stessa scala.

## Previsioni qualità dell’aria

La fonte previsionale mostra l’andamento atteso nei cinque giorni successivi per uno dei 118 capoluoghi e co-capoluoghi disponibili. Utilizza dati modellistici Open-Meteo/CAMS e non li presenta come misure di stazione.

Inquinanti disponibili:

- PM10
- PM2.5
- CO
- SO₂
- O₃
- NO₂

Per ogni giorno sono riportati media, massimo e valori medi di notte, mattina, pomeriggio e sera. Le classi qualitative derivano dagli indici disponibili per l’inquinante selezionato.

## Modalità di visualizzazione

### Mappa

Mostra i dati della fonte, dell'inquinante e del periodo selezionati.

Le stazioni sono ricercabili e l'elenco è paginato. Selezionando una stazione dall'elenco, la mappa viene centrata sulla relativa posizione.

Gli aggiornamenti provocati da pan e zoom sono centralizzati: l'app aspetta **2 secondi dopo l'ultimo movimento** prima di ricaricare. Questo evita richieste ripetute mentre l'utente sta ancora esplorando la mappa. Per EEA e OpenAQ la nuova richiesta usa l'area visibile; ARPA Lazio mantiene invece il confine amministrativo del comune selezionato.

Per ridurre la latenza EEA, le richieste passano da un **Worker Cloudflare dedicato**. Le statistiche annuali E1a vengono memorizzate nella Cache API del Worker e quindi possono essere riutilizzate anche dopo un reload o da un'altra sessione. Il browser mantiene inoltre una cache spaziale locale: piccoli spostamenti dentro la stessa cella non generano una nuova richiesta.

Per i dati preliminari UTD, il Worker memorizza sia l'elenco dei file sia i **Parquet binari per 6 ore**. Il browser li elabora una sola volta per **città + anno + inquinante** durante la sessione e poi filtra localmente la viewport.

### Confronto

Per le fonti storiche compatibili, mostra due periodi sincronizzati tramite divisore swipe.

L'elenco riporta entrambi i valori e indica se il valore è aumentato, diminuito o rimasto stabile.

### Differenza

Calcola la variazione tra due periodi sulle entità presenti in entrambi i dataset.

Per OpenAQ il confronto è temporaneamente disabilitato: la vista attuale rappresenta l'ultimo dato disponibile entro una finestra di recenza e non sarebbe corretto confrontare direttamente misure acquisite in momenti differenti.

## Periodi temporali

EEA e ARPA sono attualmente collegati a dataset annuali, quindi il selettore mensile non viene mostrato.

L'aggregazione mensile potrà essere aggiunta usando flussi dati dedicati. Questo sarà anche uno dei presupposti per un confronto OpenAQ temporalmente omogeneo.

OpenAQ non mostra un selettore anno/periodo, perché la vista rappresenta sempre l'ultimo dato disponibile. Mostra invece soltanto la **recenza massima** accettata:

- 7 giorni
- 15 giorni
- 30 giorni

## Interpretazione dei dati

L'app distingue tra:

- **stazioni misurate**, rappresentate come punti;
- **valutazioni territoriali**, rappresentate sul relativo perimetro amministrativo.

La heatmap serve esclusivamente a facilitare la lettura spaziale dei punti e non deve essere interpretata come interpolazione scientifica o modello atmosferico.

## Temperatura · stazioni fisiche nelle fonti osservazionali

Il selettore `Fonte inquinante` continua a scegliere esclusivamente EEA,
ARPA Lazio o Globale · OpenAQ.

I cerchi e le etichette numeriche dell'inquinante non vengono più mostrati
sulla mappa: su mobile il campo cromatico resta leggibile e i valori puntuali
rimangono nell'elenco sotto la mappa.

### ARPA Lazio

La temperatura usa la rete micro-meteorologica fisica ARPA Lazio. I marker
`🌡` hanno dimensione fissa e restano alle coordinate reali delle postazioni.

### EEA

La temperatura non viene ricavata da EEA. Nel Lazio viene data priorità ad
ARPA Lazio. Fuori dal Lazio vengono cercate stazioni fisiche nel layer
NOAA/NCEI **Global Summary of the Year (GSOY)**.

GSOY fornisce direttamente EMNT (Extreme Min Temp), TAVG (Annual Mean Temp) ed
EMXT (Extreme Max Temp). Sono mostrate soltanto stazioni con coordinate e tutti e
tre i valori annuali.

Una stazione fisica può non essere disponibile nel solo GSOY per un certo
anno quando il servizio annuale non pubblica la tripla completa EMNT / TAVG /
EMXT. In questo caso l'app tenta il fallback osservativo descritto sotto, senza
sostituire la stazione con dati a celle.

Quando GSOY non pubblica la tripla annuale, il Worker cerca le stazioni fisiche
WMO/ICAO nel catalogo NOAA/NCEI GSOD e usa i dump giornalieri Meteostat. Ogni
valore viene accettato soltanto se le colonne di provenienza di temperatura
media, minima e massima indicano esclusivamente provider osservativi. Fonti
modellistiche, previsioni e interpolazioni sono escluse. La stazione viene
mostrata solo con almeno il 75% dei giorni validi nell'anno.

Per Bari 2025 questo fallback restituisce le stazioni fisiche `BARI` (WMO
16270, ICAO LIBD) e `GIOIA DEL COLLE` (WMO 16312, ICAO LIBV), entrambe con
copertura osservativa superiore al 98%.

Per Firenze 2025 restituisce `FIRENZE` (WMO 16170, ICAO LIRQ) con copertura
osservativa del 98,4%, oltre a `CIMONE MOUNTAIN` quando compresa nell'area
visibile.

I dati Meteostat richiedono attribuzione; nell'app vengono mantenuti il nome
della fonte, i codici WMO/ICAO, i provider osservativi usati e la percentuale
di copertura.

### Globale · OpenAQ

OpenAQ mostra esclusivamente l'inquinante. Non vengono caricati marker, celle o
heatmap ERA5-Land.

### Modalità Temperatura

La modalità/tab `Temperatura` è stata rimossa completamente dall'interfaccia.
Non viene più inizializzata la visualizzazione ERA5-Land a celle/superficie.

## PWA

L'app può essere installata dal browser tramite il pulsante **Installa app**.

Il service worker conserva la shell applicativa per migliorare caricamento e resilienza, mentre i dati ambientali reali vengono richiesti dalla rete e non vengono sostituiti da dati simulati offline.

## Splash screen A.R.I.A.

All'inizio di una nuova sessione viene mostrata la splash approvata di **A.R.I.A. — Analisi e Rappresentazione degli Indicatori Ambientali**. È un overlay temporaneo: MapLibre, interfaccia e fonti iniziano a caricarsi normalmente dietro di essa.

La chiave `sessionStorage` è `ariaSplashShown`. La durata ordinaria è 3 secondi, con dissolvenza di 380 ms; con `prefers-reduced-motion` la permanenza scende a 850 ms e la dissolvenza a 180 ms. Un timeout di sicurezza avvia comunque la chiusura entro 4,6 secondi. Il pulsante `Salta` chiude immediatamente la schermata e il nodo viene rimosso realmente dal DOM.

I file attivi sono `css/aria-splash.css` e `js/aria-splash.js`; gli stili sono limitati a `#aria-splash` e alle classi `.aria-splash__*`. La cartella `aria-splash/` rimane nel repository come demo approvata e non viene caricata dall'app né aggiunta alla cache offline.

## Statistiche arboree

La fonte **Alberi · fonti comunali** mostra eventi e bilanci arborei documentati, separandoli dal censimento del patrimonio esistente. Un albero censito non viene considerato una nuova piantumazione; una sparizione tra due censimenti non viene considerata un abbattimento senza conferma della fonte.

Queste statistiche non descrivono lo stato fitosanitario, la vitalità o la condizione degli alberi esistenti. Lo stato dell'evento — per esempio programmato, eseguito o urgente — viene invece conservato quando è dichiarato dalla fonte.

La prima fonte attiva è il [Bilancio Arboreo di Roma Capitale](https://www.comune.roma.it/web/it/scheda-servizi.page?contentId=INF70550). I bilanci 2017–2020 e il dato parziale 2021 sono rappresentati come aggregati comunali, quindi non vengono creati falsi punti sulle strade. Il totale novembre 2021–dicembre 2025 resta aggregato e non viene suddiviso tra i singoli anni.

Quando il dato è comunale, la mappa colora il confine amministrativo in base al saldo: verde se le piantumazioni superano tagli o decrementi, rosso nel caso opposto. Sotto la mappa le barre rendono confrontabili piantumazioni e tagli/decrementi e riportano anche totale documentato e saldo esplicito.

Gli eventi datati con indirizzo sono mostrati anche come alberi sulla mappa: verde per le piantumazioni e rosso per gli abbattimenti. La dimensione cresce con la quantità documentata e tre sagome diverse evitano un insieme di marker tutti uguali. Le stesse sagome sono riutilizzate nella lista, mentre gli eventi programmati hanno opacità ridotta. Cliccando un evento nell'elenco, la mappa raggiunge la posizione e apre il relativo popup. L'elenco è suddiviso in pagine da sei eventi.

Il riepilogo sotto la mappa mostra piantumazioni, abbattimenti, totale degli interventi documentati e saldo. Il precedente indicatore circolare centrale è stato rimosso per non coprire gli eventi sulla mappa. Quando si entra nella fonte Alberi, gli eventuali controlli di paginazione della lista OpenAQ vengono nascosti e sostituiti dalla sola paginazione degli eventi arborei.

Se l'evento dispone di una geometria verificata, la selezione dalla lista evidenzia in azzurro la strada o il contorno disponibile e inquadra automaticamente tutte le località riconosciute. Il tracciato azzurro è neutro: non distingue piantumazioni e abbattimenti, che continuano a essere comunicati esclusivamente dalle icone verdi o rosse. Il tracciato viene disegnato sotto le etichette della cartografia per lasciare leggibili i nomi delle vie.

Le geometrie consolidate sono conservate in `data/tree-paths.json`. Le geometrie comuni, come il contorno di Villa Borghese, possono essere riutilizzate da più eventi. Le righe appartenenti alla stessa pagina ufficiale condividono la visualizzazione geografica: selezionandone una, la mappa inquadra tutte le strade e le aree riconosciute per quella fonte. Negli eventi con più strade, la quantità resta complessiva e non viene ripartita senza una dichiarazione della fonte. Se soltanto alcune località sono state riconosciute, la lista mostra il rapporto fra località visualizzate e località documentate.

Per evitare alberelli incoerenti rispetto al percorso, il frontend verifica la distanza fra il marker consolidato e la geometria dell'evento. Oltre 150 metri il punto viene riallineato al centro dell'estensione della strada o dell'area verificata. Questo controllo interviene solo quando esiste una geometria consolidata e non trasforma i centroidi di distretto in posizioni puntuali non documentate.

Ogni record dichiara la precisione geografica (`point`, `address`, `area`, `district` o `city`). Un punto `area` o `district` è intenzionalmente indicativo e non rappresenta la posizione di ogni singolo albero. La geocodifica consolidata è separata in `data/tree-coordinates.json`; l'attribuzione geografica è basata su OpenStreetMap. Padova, Bologna e Torino sono predisposte ma non dichiarate disponibili finché non vengono verificate fonti pubbliche di eventi, storici confrontabili o documenti ufficiali sufficienti.

I dati arborei consolidati sono pre-elaborati in JSON/GeoJSON; il frontend non interpreta direttamente PDF o grandi portali durante la navigazione.

Dalla versione 0.4.5 il proxy Cloudflare esegue inoltre una scansione automatica delle fonti configurate di Roma Capitale e conserva i nuovi eventi in un database D1. Con il Worker `0.8.2` la scansione viene eseguita ogni lunedì alle 03:00 UTC. Dalla versione 0.4.8 il refresh associa progressivamente le coordinate ai nuovi indirizzi e le conserva in D1: il frontend può quindi aggiungere i nuovi marker senza geocodificare dal browser. Il frontend unisce questi risultati al dataset consolidato, eliminando i duplicati in base alla pagina ufficiale. Se il proxy o D1 non sono disponibili, l'app continua a funzionare usando `data/trees.json` e `data/tree-coordinates.json` come fallback.

La classificazione automatica è prudente: un evento viene confermato automaticamente soltanto quando pagina, quantità, tipo e stato di esecuzione sono inequivocabili. Pagine con interventi multipli, lavori futuri o formulazioni miste vengono indicate come `da verificare` e non modificano il totale minimo. Le correzioni manuali sono effettuabili tramite un endpoint amministrativo protetto da token.

La fonte arborea utilizza le stesse tre modalità delle altre fonti:

- **Mappa**: bilancio dell'anno selezionato o periodo aggregato dichiarato esplicitamente;
- **Confronto**: due mappe per due bilanci annuali documentati;
- **Differenza**: variazione del saldo fra due anni comparabili.

Un totale pluriennale non viene ripartito artificialmente e quindi non entra nei confronti o nelle differenze fra singoli anni. Il bilancio novembre 2021–dicembre 2025 e il periodo 2024–marzo 2025 sono selezioni autonome. Per quest'ultimo la fonte non specifica il mese iniziale del 2024.

Per il 2023, 2024, 2025 e 2026 l'app include una raccolta iniziale di avvisi e notizie ufficiali con data, luogo, stato e quantità. La loro somma è indicata come **totale minimo documentato**, non come totale annuale completo: gli avvisi pubblicamente reperibili potrebbero non coprire tutti gli interventi. Quantità sconosciute ed eventi soltanto programmati o annunciati sono mostrati nell'elenco ma non vengono sommati al minimo eseguito.

Per il 2026 il minimo iniziale comprende 603 alberi messi a dimora e 19 abbattimenti confermati. Ulteriori quantità comunicate per programmi e interventi non ancora attestati come completati restano visibili con il relativo stato, senza alterare il saldo minimo.

La risposta dinamica espone la data dell'ultima scansione. Nell'interfaccia viene indicato se l'aggiornamento automatico è attivo oppure se è in uso il fallback locale.

La procedura per forzare una scansione senza salvare il token nella cronologia del terminale è documentata in `cloudflare/temperature-proxy/README.md`. L'app e i cron automatici non conoscono e non richiedono il token amministrativo.

Il Worker corrente è la versione `0.9.12`; esegue ogni giorno la scansione progressiva degli archivi, ricontrolla a rotazione gli avvisi già archiviati e smaltisce la coda geografica. L'app è alla versione `0.7.13` build 93 e il dataset è alla revisione 22. Le previsioni di qualità dell’aria coprono PM10, PM2.5, CO, SO₂, O₃ e NO₂ per cinque giorni e restano separate dalle fonti osservazionali. Gli eventi Alberi consolidati e dinamici sono ordinati per data decrescente. Gli interventi programmati con periodo già concluso sono segnalati come `Programmato · data trascorsa`, senza considerarli automaticamente eseguiti; la quantità è mostrata sotto l'icona e usa un trattino quando non è disponibile. Gli eventi privi di coordinate riportano `da verificare` e mostrano `Segnala evento`, con un modulo privo di mappa; l'amministratore può correggere i dati o escludere definitivamente l'evento dalla pubblicazione. Gli avvisi dinamici con più ubicazioni conservano tutti i luoghi e li mostrano come marker dello stesso evento. Gli utenti possono segnalare una posizione su una mappa satellitare con mirino fisso, ricerca indirizzo e ripristino della posizione iniziale; cinque clic consecutivi sulla versione aprono il pannello di revisione, protetto dal secret Cloudflare TREE_ADMIN_PASSWORD richiesto per ogni decisione. Le temperature annuali mostrano il minimo assoluto dell'anno, la media delle temperature medie giornaliere e il massimo assoluto dell'anno; minima e massima non sono più medie degli estremi giornalieri. Il catalogo geografico EEA contiene 118 capoluoghi e co-capoluoghi: tutte le coordinate sono state sostituite con i centri abitati GeoNames e verificate entro i confini comunali ISTAT 2026. La superficie EEA usa le stesse soglie cromatiche dell'elenco, quindi il colore rappresenta il valore della stazione e non la densità dei punti. In OpenAQ la select dei comuni riposiziona la mappa sul centro della città e aggiorna immediatamente le stazioni nell'area visibile. Il pulsante `Installa app` viene mostrato nella normale navigazione web e nascosto quando la PWA è avviata dalla schermata Home, anche su iOS e iPadOS. La fonte `ARPA Lazio` consente di scegliere il comune presente nei file annuali e visualizza il relativo confine amministrativo; Roma resta il valore predefinito. Il file 2025 contiene 376 comuni. I codici ARPA a otto cifre, come `12058091` per Roma, vengono normalizzati nel codice comunale ISTAT `058091`, così tutti i comuni possono popolare correttamente la select. Il selettore delle fonti usa peso tipografico normale anche quando è selezionata OpenAQ. Le select Alberi espongono soltanto annualità o periodi dotati di statistiche, aggregati o eventi documentati: sono stati rimossi il 2013–2016 e il 2022. Le annualità con eventi usano etichette compatte come `2025 eventi`; gli aggregati sono indicati soltanto dall'intervallo temporale. Le select delle altre fonti mostrano sempre il solo anno. Il dato ufficiale del 2016 copre soltanto maggio–dicembre e non viene presentato impropriamente come totale annuale; la prima annualità omogenea resta il 2017. Gli aggregati mostrano direttamente il riepilogo e il collegamento alla fonte ufficiale, senza avviso introduttivo ridondante. Se l'archivio dinamico non è raggiungibile, l'app continua a usare silenziosamente i dati consolidati senza mostrare un avviso di fallback. L'intestazione usa il logo orizzontale A.R.I.A. incluso tra gli asset offline. Il riepilogo mostra in forma compatta la data dell'ultimo aggiornamento e il numero di nuovi eventi aggiunti. Quando si seleziona un evento, le sole geometrie appartenenti a quell'evento determinano l'inquadratura; gli altri marker diventano grigi per rendere immediatamente riconoscibili le località coinvolte. Gli eventi multilocalità possono mostrare più marker collegati alla stessa quantità complessiva e vengono inquadrati insieme. L'apertura di un nuovo evento chiude automaticamente il popup precedente. In modalità Mappa il riempimento territoriale generale non apre popup; il riepilogo territoriale resta cliccabile in Confronto e Differenza. Per la fonte Alberi viene mostrata soltanto la legenda sopra la mappa, senza duplicazioni sotto la cartografia.

Le geometrie storiche consolidate coprono 9 eventi su 10 del 2023, tutte le tre località dell'evento 2024 e il tratto Togliatti 1493–1091 del 2025. `Via Mario` non viene georeferenziata perché la denominazione pubblicata non consente di scegliere in modo attendibile fra gli omonimi presenti nella cartografia.

La modalità `Differenza` calcola una variazione soltanto quando le due selezioni hanno la stessa natura: bilancio ufficiale con bilancio ufficiale oppure raccolta parziale con raccolta parziale.

## Architettura

Frontend:

- HTML, CSS e JavaScript
- MapLibre GL JS
- hyparquet per la lettura browser dei file EEA UTD in formato Parquet
- SheetJS per i file XLSX ARPA
- GitHub Pages

Dati e servizi:

- EEA Discodata
- elenco locale dei capoluoghi italiani per delimitare le query EEA
- file ufficiali ARPA Lazio
- OpenAQ API v3
- Cloudflare Worker per proteggere la API key OpenAQ e applicare cache, filtri e limiti geografici
# A.R.I.A. 0.6.5

La versione 0.6.5 corregge l'associazione fra i file binari EEA UTD/E2a del 2025 e i metadati delle stazioni di Roma e rende affidabile la disponibilità del collegamento Segnala evento.
