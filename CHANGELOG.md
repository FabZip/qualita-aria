# Changelog

## [1.0.0] — Intorno a me e diario ambientale

Nuova schermata iniziale **Intorno a me**, con geolocalizzazione o ricerca città/CAP, senza ripiego su Roma. Riepiloga meteo, previsioni aria, eventi arborei documentati, disponibilità delle allerte e terremoti recenti. La località resta condivisa tra riepilogo, meteo, diario, allerte, terremoti e incendi; le viste EEA/OpenAQ/previsioni ricevono il punto selezionato. La scelta manuale di una città in queste viste aggiorna il riferimento comune. La località vive in memoria nella pagina, senza persistenza delle coordinate. Alberi conserva il proprio catalogo di comuni coperti.

**Diario ambientale**: elenco e mappa di eventi arborei e terremoti, con ricerca testuale, categoria, periodo (7/30/365 giorni fa, inclusi interventi futuri) e distanza (10/50/100/200 km). Fonte e collegamento originale per evento; programmato/eseguito/da verificare distinti. Gli eventi senza posizione o data non entrano nella mappa. Confini di copertura espliciti: raccolte comunali di Roma e Guidonia Montecelio, non censimento completo. Riutilizza `TreeStats.rows` per anno precedente e corrente, comprese divisioni, correzioni ed esclusioni già gestite dal servizio. Il termine dei lavori può estendersi nell'anno successivo.

Voci dedicate e separate:

- **Allerte**: bollettino ufficiale Protezione Civile dal [repository pubblico DPC](https://github.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica). Risoluzione dell'ultima pubblicazione tramite commit, lettura di metadati e GeoJSON coerenti con quel commit, individuazione della zona alle coordinate selezionate (poligoni, multipoligoni e buchi). Mostra validità e rischi idraulico, temporali e idrogeologico; un bollettino scaduto o una zona non trovata non significano assenza di allerta. Collegamento al bollettino nazionale e richiamo agli aggiornamenti regionali/comunali.
- **Terremoti**: [catalogo FDSN INGV](https://webservices.ingv.it/fdsnws/event/1/), eventi registrati con ora locale, magnitudo/tipo, profondità in km, epicentro e distanza. Richiesta entro 200 km nell'ultimo anno, massimo 500 eventi più recenti; raggiungimento del limite segnalato, nessuna pretesa di completezza e nessuna previsione sismica. Parametri temporali UTC senza suffisso, come richiesto dal servizio. Filtri iniziali: 7 giorni e 100 km.
- **Incendi**: mappa delle aree bruciate EFFIS degli ultimi 1/7/30 giorni tramite [WMS ufficiale](https://forest-fire.emergency.copernicus.eu/downloads-instructions), livelli `modis.ba.today/week/month`, con attribuzione Copernicus EFFIS / Commissione Europea JRC. Il portale EFFIS vieta l'iframe da domini esterni, quindi non viene incorporato. Collegamento al visualizzatore completo, centrato sulla località, per punti caldi e pericolo previsto. Assenza di poligoni non equivale ad assenza di incendi. Nessuna importazione automatica di eventi incendi nel diario; le allerte restano bollettini consultabili nella propria sezione.

Riepilogo aria esplicitamente modellistico (CAMS / Open-Meteo), distinto dalle misure di stazione. Richieste indipendenti con esiti parziali dichiarati, cache in memoria di 15 minuti, richieste simultanee condivise, timeout, risposte obsolete ignorate dopo cambio vista/località. La cache PWA esclude i nuovi servizi dinamici. Le mappe nuove usano gesti cooperativi MapLibre (due dita su touch). Nessuna notifica o preferito introdotti in questa release.

App **1.0.0 build 124**, Worker ambientale **0.11.0**, nessuna migrazione, secret o nuovo deploy Worker. Verifiche: 30 suite automatiche superate; parser INGV, date, distanza, filtri, geometrie e bollettini scaduti; browser con dati reali su Guidonia e Milano, allerta locale, terremoti, ricerca nel diario, mappa EFFIS e passaggio della località verso EEA. Layout a 390 px senza overflow orizzontale. Geolocalizzazione del dispositivo non concessa dall'agente: percorsi con consenso/rifiuto coperti dalle fixture già presenti.

## [0.8.10] — Rimozione della fonte ARPA Lazio

Rimossa la fonte autonoma ARPA Lazio: opzione nel menu, selezione del comune, valutazioni annuali, grafico storico, parser CSV/XLSX, cache e stili dedicati. Rimossa anche la dipendenza SheetJS, usata soltanto per quei file. Restano Meteo, EEA, OpenAQ, previsioni della qualità dell'aria e alberi, con i rispettivi confronti e filtri.

I confini ISTAT condivisi con gli alberi restano disponibili tramite funzioni comunali generiche. Le stazioni fisiche ARPA usate dal servizio temperature per EEA restano una provenienza dei dati, non una fonte selezionabile; nessuna modifica ai Worker o al database.

App **0.8.10 build 123**, cache PWA aggiornata. Superate le 29 suite rimaste; eliminato il test del parser ARPA rimosso, aggiornati i test di cambio fonte e render OpenAQ.

## [0.8.9] — Radar senza testi ridondanti

Rimossi la spiegazione permanente sotto il radar e il collegamento esterno duplicato: restano il marchio e il link RainViewer nel widget. Il messaggio di caricamento scompare al caricamento dell'iframe; eventuali errori invitano a usare Ricarica radar.

App **0.8.9 build 122**, cache PWA aggiornata. Suite completa: 30 test superati. Worker e database invariati.

## [0.8.8] — Ricerca meteo senza azioni duplicate

Rimosso il pulsante Cerca: i suggerimenti compaiono automaticamente digitando e la scelta della località aggiorna meteo e radar. Invio continua ad anticipare la ricerca mentre si digita, ma non rilancia il geocoding del nome completo di una località già selezionata (causa del falso messaggio “località non trovata”, anche dopo la selezione di un CAP). Eliminata la riga duplicata “Previsioni per…” sotto la ricerca; la località resta visibile nella scheda meteo.

App **0.8.8 build 121**, cache PWA aggiornata; Worker e database invariati. Verifica: suite completa e regressione selezione CAP seguita da Invio, senza nuova richiesta di ricerca.

## [0.8.7] — Widget ufficiale RainViewer e ricerca CAP italiani

Il radar usa ora il widget ufficiale offerto dal comando **Incorpora** di [RainViewer](https://www.rainviewer.com/it/weather-radar-map-live.html), con tema scuro e centratura sulla località scelta. Animazione, timeline, zoom e funzioni interne sono gestiti direttamente da RainViewer; i controlli esterni consentono di ricentrare, ricaricare e aprire il radar in una nuova scheda. Disponibilità e funzioni dipendono dal servizio. Sostituito il precedente renderer delle immagini radar: le limitazioni dell'API pubblica descritte nella release 0.8.6 non definiscono le funzioni del widget.

Su dispositivi touch la mappa parte protetta dal pulsante **Attiva radar**, per consentire lo scorrimento della pagina; **Blocca interazione** ripristina la protezione. I gesti dentro l'iframe dipendono da RainViewer: non è possibile imporre dall'app lo spostamento con due dita. Il widget viene rimosso quando si cambia fonte o si nasconde la pagina e ripristinato al ritorno. Spostare il radar non cambia la località delle previsioni.

Corretta la ricerca di CAP come `00012`, assenti nella risposta del geocoding Open-Meteo: i CAP italiani completi sono cercati in un catalogo GeoNames locale, preservando gli zeri iniziali e mostrando tutte le località associate. `00012` propone anche Guidonia Montecelio. CAP sconosciuti e codici incompleti hanno messaggi espliciti; la ricerca mondiale per nome continua a usare Open-Meteo. Le coordinate dei CAP sono punti di riferimento delle località, non indirizzi precisi.

Catalogo: 4.736 CAP e 18.415 località, [GeoNames IT.zip](https://download.geonames.org/export/zip/IT.zip), CC BY 4.0, acquisito il 22 novembre 2026. File di circa 1 MB caricato solo alla prima ricerca CAP, non nel precaricamento PWA. Rigenerazione: scaricare IT.zip e usare `python3 tools/build_postal_codes.py /percorso/IT.zip --date YYYY-MM-DD`. Attribuzione visibile nell'app.

App **0.8.7 build 120**, cache PWA aggiornata. Nessuna modifica a Worker, database o secret. Verifiche: 30 test automatici superati, ricerca e selezione di `00012` nel browser e caricamento effettivo del widget ufficiale.

## [0.8.6] — Radar meteo, ricerca località e avvio geolocalizzato

La pagina Meteo ora usa lo stesso stile cartografico delle altre fonti: condizioni attuali, mappa radar centrale e previsioni orarie/giornaliere sotto. Rimossa la sezione “Località della previsione”; nome della località e coordinate restano compatti accanto al meteo. Il selettore limitato alle città italiane è sostituito da ricerca mondiale di città, paesi e CAP tramite Open-Meteo / GeoNames, con risultati distinti per provincia/regione/Paese, attesa di 450 ms, cancellazione delle richieste precedenti e gestione accessibile degli esiti.

All'apertura Meteo richiede la geolocalizzazione, condividendo le richieste concorrenti di inizializzazione. Se il consenso manca o la posizione non è disponibile, invita a cercare una località e **non usa Roma come ripiego**. Il pulsante Geolocalizza permette di tornare alla posizione corrente. La località cercata resta indipendente dalle selezioni delle altre fonti; spostare il radar non cambia il luogo della previsione.

Radar gratuito **RainViewer Weather Maps API**, senza chiave, per uso personale/educativo e piccoli progetti comunitari. Attribuzione visibile. L'API corrente fornisce le ultime 2 ore di immagini a intervalli di 10 minuti; dal 2026 non offre nowcast futuro né satellite IR. Palette Universal Blue, zoom nativo massimo 7 (ingrandimento cartografico ulteriore senza inventare dettaglio radar). Comandi: riproduci/pausa, precedente/successivo, timeline da tastiera, opacità, maschera delle aree senza copertura, aggiornamento, ricentramento, zoom e schermo intero. Su mobile spostamento con due dita. Ora del frame nel fuso della località cercata, UTC esplicito quando il fuso non è ancora noto; dati non recenti segnalati.

Metadati radar in cache per 5 minuti; immagini in memoria con limite di 128 elementi e coda di richieste distanziate di 800 ms per pagina (meno di 80 nuove richieste/minuto), per rispettare il limite prudenziale di 100/IP/minuto indicato nella documentazione di transizione. Animazione senza precaricamento di tutte le immagini, attesa del caricamento del frame, arresto quando si cambia fonte o si nasconde la pagina. Copertura scura distinta da assenza di precipitazioni. Errori radar non bloccano le previsioni e viceversa. Nessuna garanzia di disponibilità del servizio gratuito.

Riferimenti: https://www.rainviewer.com/api/weather-maps-api.html, https://www.rainviewer.com/api/transition-faq.html, https://www.rainviewer.com/api.html e https://open-meteo.com/en/docs/geocoding-api.

App **0.8.6 build 119**, cache PWA aggiornata; nessun nuovo Worker, database, account o secret. Verifiche: 30 test superati, API reali RainViewer e ricerca Guidonia, controlli radar nel browser e layout a 390 px senza overflow. Geolocalizzazione verificata con fixture controllate nei test; nessun consenso di posizione del dispositivo concesso automaticamente dall'agente.

## [0.8.5] — Posizione meteo riconoscibile e provenienza

Con Geolocalizza, la scheda meteo mostra località/comune/regione/Paese quando identificabili, coordinate effettivamente richieste al servizio, accuratezza dichiarata dal dispositivo, istante di acquisizione e link di verifica su OpenStreetMap. Il nome viene ricavato via BigDataCloud dal browser, solo dalle coordinate appena ottenute con consenso; nessuna chiamata per le città del catalogo, nessuna localizzazione automatica tramite IP. Cache in memoria per 15 minuti, richieste simultanee condivise e timeout. Attribuzione e link privacy visibili: il servizio usa i segnali coordinate/IP per migliorare la propria geolocalizzazione (documentazione: https://www.bigdatacloud.com/docs/free-api/free-reverse-geocode-to-city-api).

La provenienza meteo distingue il punto richiesto dal punto della griglia restituito da Open-Meteo, con distanza e quota di riferimento della previsione. Esplicitata la selezione automatica Best Match: non si attribuiscono dati a stazioni o a un modello specifico non identificato nella risposta. Se mancano metadati, vengono indicati come non disponibili. Le coordinate e la fonte sono visibili anche per le città scelte manualmente.

Un errore nel riconoscimento del nome non blocca il meteo e non sostituisce le coordinate con Roma o con quelle della griglia: mostra un avviso e mantiene il link mappa. Risposte IP o coordinate non coerenti vengono ignorate. App **0.8.5 build 118**, cache PWA aggiornata; nessuna modifica a Worker, database o secret. Test: suite completa (29 test), località/coordinate/griglia distinte, null e coordinate zero, escaping, cache, richieste condivise e guasto del servizio nomi senza perdita del meteo.

## [0.8.4] — Meteo come fonte iniziale

Nuova fonte iniziale **Meteo · Open-Meteo**, con Roma selezionata, città italiane e opzione Geolocalizza su richiesta. Mostra condizioni attuali stimate dal modello, temperatura percepita, umidità, vento e precipitazioni, prossime 24 ore e previsione a 7 giorni con minime/massime, pioggia e vento. Orari nel fuso della località e condizioni meteorologiche tradotte in italiano. Nessun anno o filtro inquinante nella schermata meteo; le altre fonti restano disponibili con le proprie selezioni.

API ufficiale `https://api.open-meteo.com/v1/forecast`, senza chiave, `timezone=auto`, unità °C/km/h/mm. Piano gratuito destinato a uso non commerciale: la sola gratuità dell'app non basta in presenza di pubblicità/monetizzazione. Attribuzione Open-Meteo e CC BY 4.0 visibile. Documentazione e condizioni: https://open-meteo.com/en/docs e https://open-meteo.com/en/terms.

Cache per coordinate di 15 minuti in memoria e localStorage, riuso delle richieste simultanee, timeout e pulsante Riprova. Nessun dato meteo inventato o fallback silenzioso su risposte scadute; valori null mostrati come sconosciuti. Richieste obsolete ignorate dopo cambio città/fonte. Geolocalizzazione attivata solo scegliendo Geolocalizza, senza richieste automatiche di permesso all'avvio. Il caricamento meteo non attende che le mappe siano pronte.

App **0.8.4 build 117**, cache PWA aggiornata; Worker, secret e database invariati. Verifiche: suite automatica (29 test), risposta API reale, browser con Roma/Milano e passaggio alle previsioni aria, layout mobile 390 px senza overflow, 24 schede orarie e 7 giornaliere.

## [0.8.3] — Calendari arborei di Roma e intervalli dei lavori

Importazione giornaliera dei calendari ufficiali dei 15 Municipi di Roma, oltre agli avvisi del dipartimento Ambiente. Gli intervalli mantengono inizio e fine lavori anche oltre dicembre; un intervento non risulta trascorso finché non termina il periodo previsto. La data dell'avviso non viene più usata come data di esecuzione quando questa manca, anche per gli avvisi automatici già archiviati. Le date manuali restano invariate.

Sono esclusi i soli lavori di potatura e le generiche messe in sicurezza. Gli abbattimenti eventuali restano di tipo da verificare, con icona neutra e quantità sconosciuta. I lavori programmati non entrano nei totali degli interventi eseguiti. Nessun punto viene inventato per indirizzi generici o rinviati a un allegato. L'editor consente di correggere la fine lavori e assegnarla alle singole parti della divisione, conservando la provenienza e le esclusioni.

App `0.8.3`, build `116`, Worker ambientale `0.11.0`; migrazione D1 `0013_tree_calendar_intervals.sql` da applicare prima del deploy. Nuovo cron alle **03:10 UTC** per i calendari, separato dalla scansione avvisi delle 03:00 e dalla geocodifica delle 03:30. Secret e binding invariati. Test: `node --test tests/*.test.mjs` (22 file), controllo sintassi e dry-run Wrangler.

Distribuzione verificata il 21 novembre 2026: migrazione 0013 applicata, Worker 0.11.0 online e prima importazione dei 15 calendari completata senza errori. API pubblica: 305 eventi Roma 2026, di cui 13 da calendario ancora nel periodo programmato; i due figli manuali di `IDS1677374` restano separati con un abbattimento ciascuno. L'importazione iniziale usa gli stessi upsert del Worker su HTML ufficiali appena verificati, senza leggere secret. La geocodifica prosegue con il cron dedicato.

## [0.8.2] — Divisione di eventi senza località originali

Corretto il blocco del salvataggio quando l'evento automatico ha `locations: []`: il server ora valida gli indirizzi dei nuovi interventi, senza richiederli anche nel record originale incompleto. La stessa correzione consente di correggere o rimuovere questi eventi. Fonte comune e transazione atomica restano preservate.

Il modulo segnala gli errori vicino ai pulsanti di salvataggio, conserva i campi e indica quale intervento ha un indirizzo mancante. Gli errori del server sulle parti includono il numero dell'intervento.

App `0.8.2` build `115`, Worker ambientale `0.10.1`, cache PWA aggiornata. **Necessario il deploy del Worker**; nessuna nuova migrazione oltre alla `0012` richiesta da 0.8.0, nessuna modifica ai secret:

```bash
git pull --ff-only origin main
cd cloudflare/temperature-proxy
npx wrangler deploy --config ./wrangler.toml
```

Regressione basata sull'evento pubblico `IDS1677374` (piazza San Saturnino / via Avigliana), letto senza modificare D1 remoto: la validazione falliva prima della transazione. Test su SQLite locale di divisione con due indirizzi e un abbattimento ciascuno, modifica/rimozione dell'originale incompleto, importazione dal catalogo locale e rifiuto atomico delle parti non valide. Tutti i 21 file di test superati.

## [0.8.1] — Ricerca negli eventi amministrativi

Il pannello di modifica Alberi offre “Cerca negli eventi”: filtra in tempo reale titolo, indirizzi, municipio/zona, fonte, descrizione, data, quantità e tipo. La ricerca ignora maiuscole e accenti, combina più parole e mostra il conteggio dei risultati. Svuotando il campo tornano tutti gli eventi; le modifiche non salvate restano nei rispettivi editor durante il filtraggio. App `0.8.1` build `114`, cache PWA aggiornata. Nessuna nuova migrazione o modifica ai Worker rispetto a 0.8.0.

## [0.8.0] — Amministrazione e divisione degli eventi Alberi

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

## [0.7.32] — Etichette e barre Alberi

Corretto il riepilogo Alberi: le etichette “Piantati documentati” e “Abbattimenti documentati” hanno spazio dedicato e vanno a capo senza sovrapporsi alle barre. Su mobile ogni etichetta precede la propria barra su una riga distinta. App `0.7.32`, build `112`, cache PWA/CSS aggiornata. Nessuna modifica ai dati o ai Worker.

## [0.7.31] — Mappe mobile con due dita

Su dispositivi con puntatore touch, spostamento e zoom delle mappe usano i gesti cooperativi MapLibre: un dito permette di scorrere la pagina, due dita di muovere la mappa. Suggerimento in italiano. Attivo su mappa principale, confronto e segnalazioni; il divisore del confronto resta trascinabile con un dito. Interazione desktop invariata. App `0.7.31`, build `111`, cache PWA e CSS aggiornati. Nessuna modifica ai Worker, database o secret.

## [0.7.30] — OpenAQ: campo Periodo durante il caricamento

Il campo anno `singleYearField` resta nascosto per tutta la richiesta OpenAQ, anche quando si cambia periodo o si sposta la mappa. Eliminata la comparsa temporanea di un secondo campo Periodo. App `0.7.30`, build `110`, cache PWA aggiornata; proxy OpenAQ invariato `0.4.3`, nessun nuovo deploy Worker o migrazione richiesti da questa modifica.

## [0.7.29] — OpenAQ 0.4.3 (21 novembre 2026)

La ricerca OpenAQ include tutte le varianti di unità dei gas, prima limitate ai soli ID ppm. Ripristinata la select città condivisa con EEA, mantenendo **Geolocalizza** come scelta iniziale e la memoria della città per fonte. Cambiare città aggiorna area e stazioni; cambiare periodo o inquinante conserva il centro corrente.

App `0.7.29`, build `109`, cache PWA aggiornata; proxy OpenAQ `0.4.3` **da distribuire**. Nessuna migrazione, modifica ai secret o ai Worker EEA/temperature/alberi. Dopo il push frontend, per attivare la correzione dei gas:

```bash
git pull --ff-only origin main
cd cloudflare/openaq-proxy
npx wrangler deploy --config ./wrangler.jsonc
```

Verificare `/health` (`0.4.3`), quindi riaprire la PWA. Il push su GitHub non distribuisce questo Worker.

## [0.7.28]

- Le query Discodata usano POST multipart, come il client ufficiale EEA, sia nel Worker sia nel fallback del browser. Risolto il percorso GET rifiutato dal gateway EEA con 403, che causava anche 502 su metadati ed elenco file UTD.
- Conservati parametri SQL, paginazione, limiti, cache e filtri geografici. Nessuna credenziale aggiunta o modificata.
- Aggiunti test sul trasporto POST, boundary multipart, paginazione, risultati vuoti, limiti ed errori; aggiornato il test di selezione geografica UTD.
- App `0.7.28` build 108 e cache PWA aggiornata; proxy EEA `0.2.1` da distribuire. Worker ambientale `0.9.14`, OpenAQ `0.4.2`, dataset e database invariati.

### Proxy EEA [0.2.2]

- Risolto il 403 Discodata proveniente dal Worker: le POST multipart includono ora uno User-Agent esplicito e veritiero `QualitaAria/0.2.2 (+https://fabzip.github.io/qualita-aria/)`. Il solo passaggio a POST della versione 0.2.1 non era sufficiente da Cloudflare.
- Diagnostica degli errori limitata al titolo e all'identificazione del gateway, senza esporre l'intera pagina; preservato `upstreamStatus` anche negli errori dell'elenco file UTD.
- Worker 0.2.2 distribuito e verificato su metadati non in cache, catalogo UTD e lettura dei Parquet reali nel browser al primo caricamento e dopo reload. Nessuna modifica a frontend, dataset, credenziali o database.

## [0.7.27]

- Inclusi gli avvisi arborei misti, separando blocchi di abbattimento e piantumazione quando identificabili; blocchi ambigui conservati come da verificare, senza quantità inventate.
- Il parser usa il corpo dell'articolo anziché menu e metadati; corretti titolo, data di pubblicazione esplicita, scadenze con giorno della settimana, entità accentate e località elencate. Quantità parziali non diventano totali completi.
- Pannello amministrativo completo dopo segnalazioni sia di evento sia di posizione: titolo, Comune, anno, data lavori, Municipio/zona, località multiple, tipo, stato, quantità complessiva, URL fonte, pubblicazione e descrizione.
- Aggiunto `Segnala dati evento` anche per gli interventi con marker; mantenuta l'approvazione dedicata della singola posizione. Errori di salvataggio visibili nel pannello e conferma prima di escludere l'intero evento.
- Protetti tutti i dati corretti manualmente dai successivi upsert. Località/Comune modificati invalidano le posizioni e avviano la geocodifica; nuove annualità rese disponibili nelle select, revisioni/spostamenti/esclusioni non annullati dal fallback consolidato.
- Le date di pubblicazione non sono presentate come date dei lavori quando questi non hanno una data dichiarata.
- App `0.7.27` build 107, Worker `0.9.14`, cache PWA aggiornata. Nessuna nuova migrazione o rotazione dei secret; deploy Worker e successivo recupero degli avvisi richiesti.

## [0.7.26]

- Aggiunta memoria separata delle select per EEA, OpenAQ, ARPA Lazio, previsioni e alberi: area/città/Comune, inquinante, periodo e anni di confronto vengono ripristinati tornando alla fonte.
- Ripristinata anche la modalità Mappa/Confronto/Differenza, rispettando i limiti di OpenAQ e previsioni; stato delle schede sincronizzato.
- Il ripristino rispetta le dipendenze città → periodi e fonte → inquinanti, valida le opzioni disponibili e riapplica i valori dopo la ricostruzione delle select. Nessuna persistenza tra ricaricamenti della pagina.
- App `0.7.26` build 106, cache PWA aggiornata; nessuna modifica ai Worker o al database.

## [0.7.25]

- Rimossa l'esclusione sistematica delle serie giornaliere dalla vista EEA `Oggi`, che può mostrare stazioni con la sola ultima media giornaliera disponibile.
- La selezione verifica la fine dell'intervallo quando disponibile; per le medie giornaliere senza fine esplicita attende 24 ore dall'inizio. Restano esclusi valori futuri e periodi non conclusi. A parità d'inizio viene preferito il dato subgiornaliero dello stesso sampling point.
- Elenco stazioni e riquadro Periodo distinguono le medie giornaliere dai dati con orario, conservando la data effettiva e senza attribuirle automaticamente a oggi.
- Aggiunta diagnostica delle osservazioni per aggregazione e test sintetico con due file, 582 righe, 556 osservazioni valide; test di primo avvio/reload nel browser con risposte giornaliere e orarie simulate.
- App `0.7.25` build 105, cache PWA e moduli aggiornati. Statistiche annuali, Worker e database invariati.

## [0.7.24]

- Aggiunto il pulsante Mappa stradale / Satellite nella mappa delle segnalazioni arboree, mantenendo centro, zoom e mirino al cambio di stile.
- Le segnalazioni di posizione e dell'evento chiudono la modale soltanto dopo l'invio riuscito e mostrano una notifica con il numero di segnalazione.
- Pulsante di invio disabilitato durante la richiesta per evitare duplicati; in caso di errore viene riabilitato e il modulo resta aperto con i dati inseriti.
- App `0.7.24` build 104, cache PWA e riferimenti CSS/JS aggiornati. Nessuna modifica ai Worker o al database.

## [0.7.23]

- Conservati gli avvisi arborei programmati senza quantità dichiarata, esclusi dai totali degli interventi eseguiti. Riconosciute date ISO, intervalli e giorni multipli, con anno di pubblicazione come fallback nei campi data.
- Ricontrollate le prime pagine degli archivi a ogni refresh, con rotazione dei link oltre i primi due, senza attendere la conclusione del backfill. Budget riservato al ricontrollo dei vecchi avvisi; date vecchie isolate non interrompono pagine contenenti pubblicazioni dell'anno corrente.
- Le revisioni delle località avviano subito la geocodifica dell'evento e ricaricano lista e mappa. Titolo e altri metadati non cancellano le coordinate se le località restano uguali; i vecchi tracciati locali non prevalgono sulle correzioni manuali.
- Ricerca limitata all'area della città, errori temporanei ritentabili e recupero delle correzioni manuali precedenti senza posizione. Risposte degli eventi non memorizzate in cache; stato Programmato visibile anche senza coordinate.
- App `0.7.23` build 103, cache PWA aggiornata; Worker ambientale `0.9.13` da distribuire, nessuna nuova migrazione o modifica dei secret.
- Aggiunti test di revisione su SQLite con tutte le migrazioni, refresh durante backfill, geocodifica, conservazione dei puntatori, fusione dei tracciati e aggiornamento dell'interfaccia.

## [0.7.22]

- Estesa a OpenAQ la correzione di `MILANO PASCAL CITTÀ STUDI`, prima limitata a EEA.
- Aggiunta `js/display-text.js` per normalizzare i testi visualizzati e ripristinare sequenze UTF-8 interpretate come Latin-1/Windows-1252, compresi accenti e apostrofi; i caratteri definitivamente persi vengono corretti soltanto per nomi noti.
- Normalizzazione condivisa nei nomi OpenAQ/EEA, Comuni ARPA, catalogo città, elenco stazioni, ricerca, dati cartografici e marker temperatura. Identificativi e URL restano invariati.
- Verificati 51 file applicativi/dati senza UTF-8 invalido o altre sequenze sospette; test di regressione OpenAQ, accenti, Unicode internazionale e doppia codifica.
- App `0.7.22` build 102, cache PWA aggiornata; nessun nuovo deploy dei Worker.

## [0.7.21]

- Inquadratura EEA più ravvicinata alla selezione di una città: raggio da 40 a 10 km; zoom previsionale cittadino portato a 11.
- Corretto il parser CSV ARPA: rimosso il separatore vuoto e ripristinato il punto e virgola, mantenendo virgola e tabulazione.
- Migliorata la normalizzazione dei codici ISTAT comunali; le righe senza codice possono essere associate tramite nome esatto e univoco. Il Comune richiesto viene conservato durante i download paralleli.
- App `0.7.21` build 101; cache e test aggiornati. Nessun nuovo deploy dei Worker.

## [0.7.20]

- Corretto il nome EEA `MILANO PASCAL CITT� STUDI` in `MILANO PASCAL CITTÀ STUDI`, anche nelle varianti di codifica alterata e nelle risposte già in cache.
- Normalizzazione applicata alle ultime misure UTD, alle statistiche annuali dal proxy e al fallback diretto, mantenendo gli identificativi delle stazioni.
- App `0.7.20` build 100; cache aggiornata, nessuna modifica ai Worker.

## [0.7.19]

- Rimossa la dipendenza dal nome città nella richiesta EEA UTD: il servizio restituisce un catalogo nazionale filtrato per Paese ISO e nome dell’inquinante.
- Il proxy usa bounding box e metadati per selezionare i file con codici stazione riconoscibili; i file non classificabili vengono conservati e filtrati per sampling point nel browser.
- Eliminati i troncamenti ai primi 100 file del proxy e 60 del browser; cataloghi oltre il limite di sicurezza di 2000 file producono un errore esplicito. Segnalati anche aggiornamento proxy richiesto e letture parziali.
- Cache nazionale e binaria separate dalla vecchia cache cittadina; i file binari sono identificati dall’URL effettivo anziché dall’indice.
- Test con 329 file nazionali e stazione rilevante oltre il vecchio limite, filtro geografico, nomi non classificabili e download coerente.
- App `0.7.19` build 99; Worker EEA `0.2.0`, da distribuire per attivare la correzione.

## [0.7.18]

- Il periodo EEA `Oggi` mostra ora l’ultima misura disponibile per stazione anche quando risale a giornate precedenti, mantenendo esclusi valori futuri e medie giornaliere.
- Badge mappa uniformato a `<inquinante> - ultima misura` per PM2.5, PM10 e NO₂.
- Il riquadro Periodo riporta la data più recente tra le misure visualizzate; le date e gli orari di ciascuna stazione restano nell’elenco. Senza misure disponibili viene mostrato un trattino.
- L’overlay temperatura continua a mostrare minima e massima previste di oggi e temperatura attuale.
- App `0.7.18` build 98, cache aggiornata; nessuna modifica ai Worker.

## [0.7.17]

- Corretto il selettore EEA: `Oggi` è aggiunto al controllo che contiene gli anni, etichettato `Periodo`, sempre visibile in modalità Mappa.
- Eliminata la sostituzione del campo Mese con `Oggi`/`Intero anno`. Le annualità storiche restano disponibili nello stesso controllo; Confronto e Differenza usano soltanto anni.
- Aggiornato l’instradamento UTD e temperatura per distinguere il periodo `today` dall’anno selezionato.
- Aggiunto test di regressione del selettore e verificato nel browser il passaggio Oggi → 2025 → Oggi con servizi simulati.
- App `0.7.17` build 97; cache aggiornata, nessuna modifica ai Worker.

## [0.7.16]

- Aggiunta `Geolocalizza` come selezione iniziale delle città EEA, mantenendo il catalogo delle città e gestendo il consenso alla posizione.
- Aggiunto il periodo `Oggi`: ultima misura UTD disponibile nella giornata locale per ogni stazione, con data e ora. Non si applica la soglia di copertura annuale del 75%; dati mancanti, futuri e medie giornaliere sono esclusi.
- Per EEA/Oggi la temperatura mostra minima prevista, temperatura attuale e massima prevista tramite Open-Meteo, con indicazione della natura modellistica. Restano disponibili le statistiche annuali.
- Aggiunti test per selezione delle misure odierne, valori mancanti e temperatura corrente; verificato nel browser il flusso con geolocalizzazione e servizi simulati.
- App `0.7.16` build 96, cache PWA aggiornata. Nessuna modifica ai Worker.

## [0.7.15]

- Corretta una concorrenza al primo ingresso in OpenAQ: tutti i render iniziali attendono la stessa geolocalizzazione, evitando richieste sulla vecchia area e ricerche annullate.
- Aggiornate le dimensioni della mappa prima della richiesta dei dati, anche quando si proviene dalla vista previsionale nascosta.
- Aggiunto test di regressione con due caricamenti concorrenti durante la geolocalizzazione.
- App `0.7.15` build 95; proxy OpenAQ invariato alla versione `0.4.2`.

## [0.7.14]

- OpenAQ usa la geolocalizzazione con inquadratura iniziale a livello cittadino e periodo predefinito `Oggi`; rimosso il selettore città.
- In assenza di misure, la mappa allarga progressivamente la ricerca fino al limite di zoom 5, mantenendo periodo e inquinante.
- Ripristinato il selettore inquinante con PM2.5, PM10, NO₂, O₃, SO₂ e CO. Il proxy normalizza i gas da ppm/ppb a µg/m³ a 25 °C e 1 atm (volume molare 24,45 L/mol).
- App `0.7.14` build 94; proxy OpenAQ `0.4.2`, da distribuire prima del frontend.

## [0.7.13]

- Aggiunta l’opzione `Oggi` al selettore del periodo OpenAQ, accanto agli intervalli di 7, 15 e 30 giorni.
- Il filtro usa la mezzanotte locale come soglia: non include misure di ieri anche quando hanno meno di 24 ore.
- Esteso il proxy OpenAQ con il parametro validato `datetime_min`; metadati e cache distinguono il filtro odierno dagli intervalli mobili.
- Aggiunti test automatici per mezzanotte locale, fallback a 30 giorni, soglia del Worker, health check e rifiuto delle date non valide.
- App aggiornata alla versione `0.7.13` build 93 e proxy OpenAQ alla versione `0.4.1`; dataset e Worker ambientale restano invariati.

## [0.7.12]

- Ridisegnata la vista previsionale con un’impostazione originale A.R.I.A.: riepilogo del giorno selezionato, metriche principali e navigazione orizzontale tra i cinque giorni.
- Sostituite le righe espandibili e le barre segmentate con un grafico continuo delle 24 ore e quattro schede compatte per notte, mattina, pomeriggio e sera.
- Aggiunti al modello visuale i valori orari già forniti da Open-Meteo/CAMS, mantenendo separati dati modellistici e misure di stazione.
- Estesi i test automatici al profilo orario e verificati cambio giorno, cambio inquinante e layout mobile senza overflow.
- App aggiornata alla versione `0.7.12` build 92; dataset e Worker restano invariati.

## [0.7.11]

- Rimossa dalla vista previsionale la seconda barra di pulsanti degli inquinanti: PM10, PM2.5, CO, SO₂, O₃ e NO₂ si selezionano ora soltanto dal controllo principale.
- Eliminati markup, stili e gestori di evento non più necessari, mantenendo invariato il caricamento delle previsioni.
- App aggiornata alla versione `0.7.11` build 91; dataset e Worker restano invariati.

## [0.7.10]

- Aumentate di `0.2rem` tutte le dimensioni tipografiche dell’app, comprese le viste responsive, le previsioni, le schede stazione, Temperatura, Alberi e lo splash iniziale.
- Aggiornate le chiavi di cache dei fogli di stile e la cache PWA per distribuire immediatamente le nuove dimensioni.
- App aggiornata alla versione `0.7.10` build 90; dataset e Worker restano invariati.

## [0.7.9]

- Aggiunta la fonte separata `Previsioni qualità dell’aria`, basata sui dati modellistici Open-Meteo/CAMS e distinta dalle misure EEA, ARPA e OpenAQ.
- Le previsioni coprono PM10, PM2.5, CO, SO₂, O₃ e NO₂ per cinque giorni, con media, massimo e dettaglio per notte, mattina, pomeriggio e sera.
- Le classi qualitative usano gli indici disponibili per ciascun inquinante; i valori mancanti non vengono più interpretati come zero.
- Rimossi dall’interfaccia i dettagli tecnici su proxy, cache, Worker, formati interni e pannello diagnostico.
- Aggiunti test automatici per URL, sei inquinanti, aggregazioni temporali, indici qualitativi, valori mancanti e cache previsionale.
- App aggiornata alla versione `0.7.9` build 89; dataset e Worker restano invariati.

## [0.7.8]

- I totali minimi escludono gli eventi `automatic_pending` e `manual_rejected`, anche quando riportano quantità e stato apparentemente completato.
- Le date di esecuzione future restano programmate e non vengono confermate automaticamente.
- Il parser non interpreta più il numero di determine e ordinanze come quantità arborea; riconosce invece quantità esplicite di alberi, esemplari e piante.
- La fusione tra dataset consolidato e D1 distingue gli interventi della stessa pagina tramite data, località, tipo e quantità, senza perdere le chiavi derivate.
- Ricerca indirizzi, coordinate proposte e approvazioni geografiche usano l’area corretta di Roma o Guidonia Montecelio.
- I cursori vengono salvati soltanto dopo l’elaborazione riuscita dei dettagli; una fonte in errore viene ritentata senza bloccare le altre.
- Le pagine archivio con più di 40 link vengono elaborate in blocchi senza perdite tramite offset e firma della pagina, introdotti dalla migrazione `0011_tree_source_cursor_offsets.sql`.
- Aggiunti test automatici per riepiloghi, parser, date future, distribuzione equa delle fonti, retry dei cursori, pagine oltre il limite e ricerca geografica per Comune.
- Worker aggiornato alla versione `0.9.12`; app aggiornata alla versione `0.7.8` build 88, dataset invariato alla revisione 22.

## [0.7.7]

- Sostituita la lettura della sola prima pagina con una scansione paginata e progressiva degli archivi dell'anno corrente.
- Aggiunti connettori distinti per informazioni di servizio e notizie di Roma Capitale, determine e ordinanze di Guidonia Montecelio.
- Aggiunta la migrazione D1 `0010_tree_source_cursors.sql`, che conserva il cursore di ogni fonte senza modificare gli eventi esistenti.
- Il refresh restituisce `archivePagesScanned`, `archiveSources`, `scanComplete`, `futureEventsFound` e `scanThrough`.
- Aggiunto il riconoscimento delle date numeriche usate negli atti Halley.
- La scansione completa viene eseguita ogni giorno alle 03:00 UTC; la coda geografica continua alle 03:30 UTC.
- Worker aggiornato alla versione `0.9.11`; app aggiornata alla versione `0.7.7` build 87, dataset invariato alla revisione 22.

## [0.7.6]

- Le schede strutturate con più blocchi `Ubicazione` vengono suddivise in eventi distinti, ciascuno con data, quantità e posizione proprie.
- Il caso `IDS1634378` produce correttamente due interventi del 31 agosto e quello di Villa Borghese del 1° settembre 2026.
- Le chiavi derivate mantengono la pagina come gruppo comune, evitando duplicazioni e consentendo alla mappa di inquadrare insieme gli interventi della stessa fonte.
- Il salvataggio non forza più la città `roma`: la medesima struttura è utilizzabile anche per Guidonia Montecelio, senza modificare le chiavi manuali già confermate.
- Non è richiesta una nuova migrazione: al primo refresh il record originario viene aggiornato e le ubicazioni aggiuntive vengono inserite come record distinti.
- Worker aggiornato alla versione `0.9.10`; app aggiornata alla versione `0.7.6` build 86, dataset invariato alla revisione 22.

## [0.7.5]

- La scansione Roma distingue ora la data di pubblicazione dalla data prevista dell’intervento.
- Gli avvisi pubblicati durante l’anno vengono acquisiti anche quando programmano lavori fino al 31 dicembre.
- Le date esplicite di esecuzione, inizio lavori e intervallo programmato determinano l’anno e l’ordinamento dell’evento; in assenza di una data operativa resta valido il giorno di pubblicazione.
- Gli interventi futuri restano classificati come programmati e non entrano nei totali degli eventi eseguiti.
- Worker aggiornato alla versione `0.9.9`; app aggiornata alla versione `0.7.5` build 85, dataset invariato alla revisione 22.

## [0.7.4]

- Corretta la fusione tra eventi consolidati e D1: coordinate e geometrie vengono associate tramite `sourceKey`, non più scartate quando più eventi condividono la stessa `sourceUrl`.
- Gli eventi `manual_confirmed` senza coordinate sono indicati come documentati con “geolocalizzazione in attesa”, distinguendoli dagli eventi realmente da verificare.
- Aggiunta la migrazione `0009_retry_guidonia_geocoding.sql` per rimettere in coda tutte le località automatiche di Guidonia; gli override geografici approvati restano separati e continuano ad avere priorità.
- Worker aggiornato alla versione `0.9.8`; app aggiornata alla versione `0.7.4` build 84, dataset invariato alla revisione 22.

## [0.7.3]

- Ripristinato Valle Pilella nell'anno 2019 con il collegamento puntuale all'ordinanza n. 1/2019 e la quantità documentata di 50 alberi.
- Divise le 61 piantumazioni AVR del 2024 in tre eventi geolocalizzabili: Colle Fiorito 49, Piazza Matteotti 5 e Piazza Carrara 7.
- Aggiunto l'avvio nel 2025 della sostituzione di circa 200 piante nell'area La Sorgente a Colle Fiorito.
- Aggiunte le 82 piantumazioni concluse il 3 marzo 2026, ripartite in cinque eventi: Colleverde 47, Vena d'Oro 11, Parco Azzurro 12, Setteville Nord 2 e Villanova 10.
- Aggiunta l'ordinanza n. 32/2026 per potature e abbattimenti in nove tratti di Colleverde; quantità non disponibile perché il documento non distingue né conta gli abbattimenti.
- Corretto il geocodificatore del Worker: la coda include ora sia Roma sia Guidonia Montecelio e usa per ciascun comune nome e limiti geografici dedicati.
- Aggiunta la migrazione `0008_guidonia_verified_tree_events.sql`.
- App aggiornata alla versione `0.7.3` build 83, dataset alla revisione 22 e Worker alla versione `0.9.7`.

## [0.7.2]

- Rimosso l'evento `guidonia-valle-pilella-messa-dimora`: la fonte indicata non identifica un'ordinanza specifica e non consente di verificare l'intervento.
- Aggiunta la migrazione `0007_remove_invalid_valle_pilella_event.sql` per rimuovere lo stesso record da D1 senza modificare la migrazione storica 0005.
- Corretto l'errore `sourceKey is not defined` nell'invio di “Segnala evento”, centralizzando la risoluzione della chiave della fonte.
- App aggiornata alla versione `0.7.2` build 82 e dataset alla revisione 21; Worker invariato alla versione `0.9.6`.

## [0.7.1]

- Verificato il PDF ufficiale dell'autorizzazione paesaggistica 34/2024 di Guidonia Montecelio.
- Corretto l'evento esistente, senza cambiarne l'identificativo: 109 alberi autorizzati all'abbattimento, stato programmato e successivo reimpianto sostitutivo previsto.
- Sostituite le sette località generiche con 17 località o insiemi di vie riportati nell'atto; la quantità resta complessiva e non viene suddivisa artificialmente.
- Aggiunta la migrazione dati `0006_guidonia_109_tree_authorization.sql`, che azzera soltanto la precedente geocodifica generica dell'evento e avvia quella delle ubicazioni documentate.
- Controllati gli altri risultati indicizzati per “Autorizzazione Paesaggistica”: non sono stati aggiunti atti privi di un riferimento esplicito ad alberi, alberature, abbattimenti o reimpianti.
- App aggiornata alla versione `0.7.1` build 81, dataset alla revisione 20; Worker invariato alla versione `0.9.6`.

## [0.7.0]

- Aggiunto Guidonia Montecelio alla selezione della fonte Alberi con identificatore isolato `guidonia-montecelio`.
- Aggiunti il confine comunale ISTAT 058047, centro mappa e periodo documentato 2024.
- Inseriti tre riferimenti documentali iniziali; soltanto i 61 alberi con quantità ed esecuzione documentate incidono sul totale minimo.
- Aggiornato il Worker alla 0.9.6 per servire separatamente Roma e Guidonia Montecelio tramite il campo `city` già esistente.
- Aggiunta la migrazione dati `0005_guidonia_seed_events.sql`; non altera lo schema e non modifica eventi di Roma.
- Dataset aggiornato alla revisione 19.

## [0.6.6]

- Corretto il collegamento tra le serie EEA UTD/E2a 2025 di Roma e i metadati mediante il codice ufficiale EoI della stazione, usato solo come fallback dopo il confronto esatto di SampleId.
- Gli identificatori originali non vengono modificati; il fallback serve esclusivamente al confronto in memoria.
- Aggiunto alla diagnostica il conteggio stationCodeFallbackMatches.

## [0.6.5]

- Corretto l'abbinamento tra i Samplingpoint dei file Parquet EEA UTD/E2a e i metadati delle stazioni quando l'identificatore contiene metodo e data.
- Ripristinata la visualizzazione delle stazioni EEA preliminari 2025 su Roma senza modificare la soglia minima di copertura del 75%.
- Reso disponibile Segnala evento anche quando la chiave della fonte deve essere ricavata dall'URL o dall'identificatore dinamico.

## [0.6.4] — Proxy ambientale 0.9.5 — 2026-09-02

- Gli eventi dinamici non geolocalizzati mostrano “Segnala evento” al posto del comando relativo alla posizione.
- Il nuovo modulo raccoglie descrizione, nome ed email facoltativi senza caricare una mappa.
- Il pannello amministrativo distingue le segnalazioni geografiche da quelle sull’evento e consente di modificarne titolo, data, località, tipo, stato e quantità.
- L’amministratore può rimuovere un evento dalla pubblicazione; la decisione e le correzioni manuali hanno priorità sui refresh successivi.
- Ogni modifica, eliminazione o rifiuto richiede nuovamente la password amministrativa.
- Rafforzato anche il filtro delle fonti: vengono rimossi i falsi eventi relativi alle chiusure di via del Foro Italico/viale Newton e al PUI Tor Bella Monaca.
- App aggiornata alla versione `0.6.4` build 77 e Worker alla versione `0.9.5`; dataset invariato alla revisione 18 e nessuna migrazione D1 richiesta.

## Proxy ambientale [0.9.3] — 2026-09-01

- Separata la scansione settimanale delle fonti dallo smaltimento quotidiano della coda geografica.
- Il lunedì alle 03:00 UTC resta attivo il refresh completo; ogni giorno alle 03:30 UTC vengono elaborate soltanto le località ancora in attesa.
- Il limite resta di otto località per esecuzione, senza interrogare quotidianamente il portale Roma Capitale.
- Aggiornato `wrangler.toml.example`; non sono richieste migrazioni D1 e l’app resta alla versione `0.6.1` build 74.

## [0.6.3] — 2026-09-01

- Rimossi dalla lista Alberi i testi “mostra sulla mappa” e “verifica automatica”.
- Gli eventi privi di coordinate mostrano soltanto l’indicazione “da verificare”, senza la dicitura ridondante “posizione in verifica”.
- “Segnala posizione” non viene più proposto per gli eventi non geolocalizzati, perché manca un punto iniziale attendibile da correggere.
- App aggiornata alla versione `0.6.3` (build 76), dataset invariato alla revisione 18 e Worker invariato alla versione `0.9.3`.

## [0.6.2] — 2026-09-01

- Gli eventi ancora classificati come programmati mostrano “Programmato · data trascorsa” quando l’ultimo giorno documentato è già passato.
- La scadenza è soltanto un’indicazione temporale: lo stato ufficiale non viene convertito automaticamente in eseguito.
- La quantità degli alberi è stata spostata sotto l’icona nella lista degli eventi; quando non è disponibile viene mostrato un trattino.
- App aggiornata alla versione `0.6.2` (build 75), dataset invariato alla revisione 18 e Worker invariato alla versione `0.9.3`.

## Proxy ambientale [0.9.2] — 2026-09-01

- Il refresh arboreo ricontrolla anche gli avvisi già archiviati, ordinandoli dal meno recente, oltre alle pagine presenti nell’elenco corrente di Roma Capitale.
- I record storici rimasti con indirizzi troncati, come `IDS1631055` e `IDS1630638`, vengono così riprocessati dal parser corretto.
- Il limite complessivo resta di 40 pagine per esecuzione; non sono richieste migrazioni D1 e l’app resta alla versione `0.6.1` build 74.

## [0.6.1] — 2026-09-01

- La mappa delle segnalazioni usa una vista satellitare con attribuzione Esri.
- Il punto proposto è indicato da un mirino fisso al centro: si sposta la cartografia, non il marker.
- Aggiunta la ricerca degli indirizzi nell’area di Roma tramite il Worker.
- Aggiunto il pulsante “Ripristina” per tornare alla posizione iniziale della località selezionata.
- App aggiornata alla versione `0.6.1` (build 74), dataset invariato alla revisione 18 e Worker aggiornato alla versione `0.9.1`.

## [0.6.0] — 2026-09-01

- Lo zoom degli eventi multilocalità considera contemporaneamente tutte le geometrie e tutti i marker dell’avviso.
- Le geometrie stradali o di area restituite dalla geocodifica vengono conservate e mostrate in azzurro sotto le etichette della cartografia.
- Aggiunto “Segnala posizione” accanto alla fonte ufficiale, con scelta della località e marker trascinabile sulla mappa.
- Le segnalazioni possono essere anonime; nome ed email sono facoltativi e viene registrata automaticamente la data di invio.
- Aggiunta l’area amministrativa, accessibile con cinque clic consecutivi sulla versione dell’app.
- La password non è presente nel frontend: viene verificata tramite il secret Cloudflare `TREE_ADMIN_PASSWORD` per ogni approvazione o rifiuto.
- Le correzioni approvate hanno priorità sulla geocodifica automatica e non vengono sovrascritte dalle scansioni successive.
- Aggiunta la migrazione D1 `0004_tree_location_reports.sql` per segnalazioni e override geografici.
- App aggiornata alla versione `0.6.0` (build 73), dataset invariato alla revisione 18 e Worker aggiornato alla versione `0.9.0`.

## Proxy ambientale [0.8.5] — 2026-09-01

- Gli avvisi dinamici conservano tutte le ubicazioni riportate dalla stessa pagina ufficiale e le espongono come marker appartenenti a un unico evento.
- Corretti definitivamente i luoghi abbreviati già archiviati come `P`: una nuova scansione sostituisce il dato precedente e annulla le coordinate obsolete.
- La geocodifica procede per singola ubicazione, conserva i risultati parziali e mantiene il limite di otto nuovi luoghi per esecuzione.
- Aggiunta la migrazione D1 `0003_tree_event_locations.sql`; app invariata alla `0.5.19` build 72, dataset invariato alla revisione 18.

## [0.5.19] — 2026-09-01

- Corretta l'estrazione degli indirizzi nelle nuove schede di Roma Capitale: abbreviazioni come `P.co`, `P.za` e le entità HTML non interrompono più il nome del luogo.
- Ripristinata l'estrazione delle quantità indicate con `n°` e mantenuta la validazione prudente delle schede prive dei requisiti completi.
- Se il luogo estratto cambia, il Worker annulla le vecchie coordinate errate e avvia una nuova geocodifica con varianti espanse e fallback controllato entro Roma.
- Gli eventi Alberi vengono ordinati per data decrescente dopo l'unione fra archivio consolidato e aggiornamenti dinamici.
- Ripristinata la regola CSS che nasconde il pulsante `Installa app` quando l'app è già installata.
- App aggiornata alla versione `0.5.19` (build 72), dataset invariato alla revisione 18 e Worker aggiornato alla versione `0.8.4`.

## [0.5.18] — 2026-08-30

- Corretto il calcolo delle temperature annuali: `MIN` è ora il minimo assoluto dell'anno e `MAX` il massimo assoluto dell'anno.
- `MEDIA` resta l'unica aggregazione media annuale ed è calcolata sulle temperature medie giornaliere.
- Aggiornate tutte le fonti: ARPA Lazio, NOAA/NCEI GSOY (`EMNT`, `TAVG`, `EMXT`), fallback Meteostat ed ERA5-Land/Open-Meteo.
- Aggiornate le etichette in mappa da “minima/massima media annuale” a “minima/massima assoluta annuale”.
- App aggiornata alla versione `0.5.18` (build 71), dataset invariato alla revisione 18 e Worker aggiornato alla versione `0.8.3`.

## [0.5.17] — 2026-08-30

- Il pulsante `Installa app` viene mostrato soltanto durante la navigazione nel browser.
- Il pulsante resta nascosto quando la PWA è avviata dalla schermata Home su Android o iOS/iPadOS.
- Gestiti anche l'evento di installazione e il cambio dinamico della modalità di visualizzazione, senza lampeggio iniziale del pulsante.
- App aggiornata alla versione `0.5.17` (build 70); dataset invariato alla revisione 18 e Worker invariato alla versione `0.8.2`.

## [0.5.16] — 2026-08-30

- Corretta la select dei comuni in OpenAQ: il cambio città ora sposta immediatamente la mappa sul centro geografico selezionato.
- Il cambio comune azzera l'area visibile precedente e richiede subito le stazioni OpenAQ della nuova inquadratura.
- Soppressa la richiesta duplicata che poteva essere generata dall'evento `moveend` durante il riposizionamento automatico.
- App aggiornata alla versione `0.5.16` (build 69); dataset invariato alla revisione 18 e Worker invariato alla versione `0.8.2`.

## [0.5.15] — 2026-08-30

- Corretta la discordanza cromatica EEA tra elenco e mappa: la superficie non usa più la densità della heatmap per determinare il colore.
- La superficie sfumata usa ora le stesse soglie del valore riportato nell'elenco (`<10`, `10–19,9`, `20–29,9`, `≥30 µg/m³`).
- La correzione vale per la mappa singola e per entrambe le mappe della modalità Confronto.
- App aggiornata alla versione `0.5.15` (build 68); dataset invariato alla revisione 18 e Worker invariato alla versione `0.8.2`.

Questo file registra le modifiche funzionali dell'app. Da questa release deve essere aggiornato insieme a ogni incremento di versione.

## [0.5.14] — 2026-08-30

### EEA · puntamento dei capoluoghi

- Corretto il punto di Pavia da `45.321817, 8.846624` a `45.19205, 9.15917`.
- Verificato l'intero catalogo EEA: 55 dei 118 punti precedenti risultavano esterni al rispettivo territorio comunale.
- Sostituite tutte le coordinate con i centri abitati GeoNames e verificata la loro inclusione nei confini comunali ISTAT 2026.
- Tutti i 118 capoluoghi e co-capoluoghi superano ora il controllo geografico.
- Incrementata la versione del catalogo `data/italian-capitals.json` da 1 a 2.
- App aggiornata alla versione `0.5.14` (build 67), dataset alla revisione 18 e Worker invariato alla versione `0.8.2`.

## [0.5.13] — 2026-08-30

### ARPA Lazio · elenco completo dei comuni

- Corretta la normalizzazione dei codici ISTAT ARPA a otto cifre: il prefisso regionale `12` viene rimosso prima del confronto con i confini comunali.
- Il file ufficiale 2025 ora popola la select con tutti i 376 comuni presenti, invece della sola voce iniziale Roma.
- Verificata la presenza dei cinque capoluoghi Frosinone, Latina, Rieti, Roma e Viterbo, oltre agli altri comuni regionali.
- Rinominata la voce della fonte da `ARPA Lazio · comune` a `ARPA Lazio`.
- App aggiornata alla versione `0.5.13` (build 66); dataset invariato alla revisione 17 e Worker invariato alla versione `0.8.2`.

## [0.5.12] — 2026-08-30

### ARPA Lazio · selezione del comune

- Confermato che i file `Standard comunali` comprendono i comuni del Lazio e non soltanto Roma.
- Aggiunta una select `Comune`, popolata con i record disponibili nel file ARPA dell'anno selezionato; Roma resta il valore iniziale.
- Il record, il valore MIN/MED/MAX, il riepilogo storico, il centro e il confine amministrativo ora seguono il comune selezionato.
- Aggiunto il caricamento dei confini comunali delle cinque province del Lazio tramite codice ISTAT.
- Rimosso il grassetto dal selettore della fonte, compresa la voce OpenAQ.
- App aggiornata alla versione `0.5.12` (build 65); dataset invariato alla revisione 17 e Worker invariato alla versione `0.8.2`.

## [0.5.11] — 2026-08-30

### Interfaccia · installazione e periodi Alberi

- Applicato il nuovo stile richiesto al pulsante `Installa app` tramite un foglio di override caricato dopo gli stili principali.
- Corretto il riuso accidentale delle etichette Alberi nelle altre fonti: le loro select mostrano nuovamente soltanto l'anno.
- Abbreviate le annualità arboree documentate in `2026 eventi`, `2025 eventi`, `2024 eventi` e `2023 eventi`.
- Abbreviati gli aggregati in `nov. 2021 – dic. 2025` e `2024 – mar. 2025`, eliminando le diciture `stagione` e `aggregato`.
- La fonte del secondo periodo non specifica il mese iniziale del 2024; non è stato quindi trasformato arbitrariamente in gennaio.
- Collegato il periodo `2024 – mar. 2025` alla notizia ufficiale specifica da cui provengono le quantità.
- App aggiornata alla versione `0.5.11` (build 64), dataset alla revisione 17 e Worker invariato alla versione `0.8.2`.

## [0.5.10] — 2026-08-28

### Alberi · messaggi e fonti degli aggregati

- Rimosso l'avviso introduttivo sul totale aggregato novembre 2021–dicembre 2025.
- Rimosso l'avviso `Fallback locale`; i dati consolidati restano disponibili quando l'archivio dinamico non risponde.
- Aggiunto il collegamento `Fonte ufficiale` ai riepiloghi di entrambi i periodi aggregati.
- App aggiornata alla versione `0.5.10` (build 63); dataset invariato alla revisione 16 e Worker invariato alla versione `0.8.2`.

## [0.5.9] — 2026-08-28

### Alberi · annualità disponibili

- Rimossi dalle select Alberi gli anni 2013, 2014, 2015 e 2016, che erano generati dall'interfaccia ma non disponevano di statistiche annuali confrontabili.
- Rimosso anche il 2022, privo di statistiche, aggregati ed eventi visualizzati nell'app.
- Il dato ufficiale del 2016 copre soltanto maggio–dicembre e non viene quindi presentato come un totale annuale; la prima annualità omogenea resta il 2017.
- Le annualità delle altre fonti ambientali restano invariate.
- App aggiornata alla versione `0.5.9` (build 62); dataset invariato alla revisione 16 e Worker invariato alla versione `0.8.2`.

## [0.5.8] — 2026-08-28

### Alberi · geometrie storiche 2023–2025

- Aggiunte geometrie verificate per 9 dei 10 eventi del 2023, per l'evento multilocalità del 2024 e per il tratto documentato del 2025.
- Viale Palmiro Togliatti evidenzia il tratto compreso fra i civici 1493 e 1091 e mostra due marker agli estremi.
- L'evento 2024 mostra tre marker e tre aree distinte per Piazza Venezia, Piazza San Marco e Piazza d'Aracoeli; gli 11 alberi restano una quantità complessiva non ripartita.
- Circonvallazione Gianicolense mostra separatamente i civici 35 e 161.
- Esteso il rendering a più marker appartenenti allo stesso evento: selezione, popup esclusivo, grigio degli eventi estranei e inquadratura restano sincronizzati.
- Corretto il marker di Via Algardi, precedentemente associato per errore a Via del Casino Algardi: ora usa Via Alessandro Algardi.
- Corretti anche i riferimenti puntuali di Via del Vascello e Piazza San Giovanni di Dio.
- `Via Mario` resta senza geometria: la fonte non specifica il nome completo e non è stato scelto arbitrariamente uno degli omonimi cartografici.
- Dataset aggiornato alla revisione 16 e schema dei percorsi alla versione 3.
- App aggiornata alla versione `0.5.8` (build 61); Worker invariato alla versione `0.8.2`.

## [0.5.7] — 2026-08-28

### Alberi · legenda unica

- Rimossa la legenda verticale duplicata sotto la mappa.
- Mantenuta soltanto la legenda già presente sopra la mappa.
- Nascosto il contenitore della guida nella fonte Alberi, evitando spazio vuoto residuo.
- App aggiornata alla versione `0.5.7` (build 60); dataset invariato alla revisione 15 e Worker invariato alla versione `0.8.2`.

## [0.5.6] — 2026-08-28

### Intestazione · logo A.R.I.A.

- Sostituiti l'eyebrow `DATI PUBBLICI REALI · EUROPA E MONDO` e il titolo `Qualità dell'aria` con il logo orizzontale A.R.I.A.
- Aggiunto `assets/branding/aria-logo-header.svg`, mantenendo il testo alternativo completo per l'accessibilità.
- Incluso il logo nella cache offline della PWA.
- App aggiornata alla versione `0.5.6` (build 59); dataset invariato alla revisione 15 e Worker invariato alla versione `0.8.2`.

## [0.5.5] — 2026-08-28

### Alberi · interfaccia semplificata

- Rimossa l'apertura del popup cliccando sul riempimento territoriale generale di Roma nella sola modalità Mappa; il popup resta disponibile in Confronto e Differenza.
- Rimossa dalla descrizione la frase relativa a censimenti, posti pianta e manutenzioni.
- Sostituito il lungo testo sotto la mappa con una legenda verticale compatta: albero verde `piantumazioni`, albero rosso `abbattimenti`.
- Rimossa la dicitura `Copertura parziale · totale minimo documentato` dal riepilogo.
- App aggiornata alla versione `0.5.5` (build 58), con cache offline dedicata; dataset invariato alla revisione 15.

## [0.5.4] — 2026-08-28

### Alberi · popup evento esclusivo

- Selezionando un evento vengono chiusi automaticamente i popup degli eventi precedentemente aperti.
- Rimane visibile al massimo un popup evento alla volta, senza modificare evidenziazione, colori o inquadratura geografica.
- App aggiornata alla versione `0.5.4` (build 57), con cache offline dedicata; dataset invariato alla revisione 15.

## [0.5.3] — 2026-08-28

### Alberi · selezione e inquadratura degli eventi

- Rimossa la scritta `Aggiornamento automatico attivo` e ridotto leggermente il testo del riepilogo della sincronizzazione.
- Il riepilogo usa la forma compatta `Aggiornato al [data e ora]. [N] nuovi eventi aggiunti.`.
- Corretto il raggruppamento improprio per pagina-fonte: più interventi pubblicati nella stessa pagina di Roma Capitale restano eventi distinti.
- Selezionando Villa Borghese viene inquadrato soltanto il perimetro del parco; selezionando Via Ludovisi viene inquadrata soltanto la strada associata.
- Gli eventi realmente multilocalità mantengono tutte le proprie vie nella stessa inquadratura.
- Durante la selezione, gli alberi estranei diventano grigi e restano colorati soltanto quelli appartenenti all'evento scelto.
- App aggiornata alla versione `0.5.3` (build 56), con cache offline dedicata; dataset invariato alla revisione 15.

## [0.5.2] — 2026-08-28

### Alberi · messaggio di aggiornamento

- Accorciato il riepilogo della sincronizzazione automatica in `Aggiornato al [data e ora]. [N] nuovi eventi aggiunti.`.
- App aggiornata alla versione `0.5.2` (build 55), con cache offline dedicata.
- Dataset invariato alla revisione 15.
- La stessa patch aggiorna il Worker alla versione `0.8.2` con scansione settimanale.

## Proxy arboreo [0.8.2] — 2026-08-28

- Modificata la pianificazione automatica da mensile a settimanale: il refresh viene eseguito ogni lunedì alle 03:00 UTC.
- Aggiornati il valore diagnostico `treeSyncSchedule`, l'esempio `wrangler.toml.example` e le istruzioni di deploy.
- Nessuna migrazione D1 e nessuna modifica al token amministrativo sono necessarie.
- La versione dell'app è `0.5.2` build 55; il dataset resta alla revisione 15.

## [0.5.1] — 2026-08-28

### Alberi · percorsi multilocalità e marker coerenti

- Collegati gli eventi appartenenti alla stessa pagina ufficiale: selezionando una delle località vengono evidenziate e inquadrate insieme tutte le geometrie disponibili della fonte.
- Aggiunto il contorno verificato di Villa Borghese agli eventi che interessano il parco.
- Corretto il marker di via Ludovisi, che era posizionato a circa 458 metri dalla strada evidenziata.
- Aggiunto un controllo geometrico generale: se il punto di un evento dista più di 150 metri dalla propria strada o area verificata, il marker viene riallineato automaticamente alla geometria.
- Il controllo corregge anche le anomalie individuate per Fratelli Bandiera, l'evento programmato del Municipio III e via Kobler.
- Reso attivo il percorso anche cliccando direttamente sull'alberello della mappa, oltre che sull'evento nell'elenco.
- Conservato il conteggio delle località mappate rispetto a quelle documentate per le fonti ancora parzialmente georeferenziate.

### Versioning

- App aggiornata alla versione `0.5.1` (build 54).
- Dataset geografico aggiornato alla revisione 15.
- Cache offline aggiornata a `qualita-aria-v0.5.1`.
- Worker invariato alla versione `0.8.1`: non è richiesto un nuovo deploy del proxy.

## [0.5.0] — 2026-08-26

### Alberi · evidenziazione geografica degli eventi

- Ridotta l'opacità del riempimento comunale al range `0.06–0.14`, mantenendo leggibili strade e toponimi.
- Aggiunto un tracciato azzurro in stile navigatore quando si seleziona un evento con geometria disponibile.
- Il tracciato usa sempre lo stesso azzurro e non comunica il tipo di evento: verde e rosso restano riservati alle icone degli alberi.
- Inseriti tracciato e bordo sotto il primo livello di etichette della cartografia, in modo che i nomi delle vie rimangano visibili.
- La mappa inquadra automaticamente tutte le geometrie disponibili per gli eventi che interessano più luoghi.
- Per gli eventi multilocalità viene indicato quante località sono state riconosciute, senza suddividere artificialmente la quantità complessiva.
- Aggiunto `data/tree-paths.json` con geometrie consolidate e semplificate dei tratti verificati.

### Versioning

- App aggiornata alla versione `0.5.0` (build 53).
- Dataset visibile aggiornato alla revisione 14.
- Cache offline aggiornata a `qualita-aria-v0.5.0`.

## [0.4.9] — 2026-08-26

### Alberi · leggibilità e riepilogo

- Rimosso dalla mappa il cerchio centrale con il totale degli interventi, che copriva i marker degli eventi.
- Spostato il totale degli interventi documentati nel riepilogo a barre sotto la mappa, insieme a piantumazioni, abbattimenti e saldo.
- Rimosso dall'elenco il messaggio separato sull'attribuzione e sulle posizioni indicative.
- Aumentati dimensione, contrasto e interlinea del testo guida arboreo sotto la mappa.
- Sostituiti i quadratini della lista con le stesse sagome arboree e gli stessi colori utilizzati dai marker sulla mappa.
- Impedita la permanenza dei controlli di paginazione OpenAQ quando si passa alla fonte Alberi.

### Versioning

- App aggiornata alla versione `0.4.9` (build 52).
- Dataset invariato alla revisione 13.
- Cache offline aggiornata a `qualita-aria-v0.4.9`.

## Proxy arboreo [0.8.1] — 2026-08-26

- Rimossa la chiave duplicata `locationPrecision` dalla trasformazione degli eventi D1.
- Conservato il valore geocodificato quando disponibile, con fallback coerente a `city` per Roma o `address` per gli altri luoghi.
- Eliminato il warning Wrangler `Duplicate key "locationPrecision" in object literal`.
- La versione dell'app resta `0.4.8` build 51; il dataset resta alla revisione 13.

## [0.4.8] — 2026-08-26

### Alberi · eventi sulla mappa

- La selezione della fonte arborea apre ora sempre il primo periodo disponibile, `2026 · eventi documentati`, invece di conservare il 2025 selezionato da un'altra fonte.
- Impaginato l'elenco degli eventi in pagine da sei elementi con comandi Precedente e Successiva.
- Reso cliccabile ogni evento localizzato: la mappa si sposta sull'indirizzo, aumenta lo zoom e apre il popup informativo.
- Visualizzati contemporaneamente sulla mappa tutti gli eventi del periodo dotati di posizione verificata.
- Sostituiti i marker uniformi con tre sagome arboree; la dimensione varia in scala logaritmica con la quantità documentata.
- Conservati verde per le piantumazioni e rosso per gli abbattimenti; gli eventi programmati sono resi meno opachi.
- Aggiunto un catalogo separato di coordinate con precisione `address`, `area` o `district`, per non presentare le posizioni territoriali indicative come punti esatti.
- Il conteggio riepilogativo indica ora gli eventi visualizzati, non un unico ambito territoriale.

### Proxy e geocodifica

- Aggiunta la migrazione D1 `0002_tree_event_coordinates.sql` per coordinate, precisione, etichetta e data di geocodifica.
- Il refresh mensile geocodifica al massimo otto nuovi indirizzi per esecuzione, in sequenza e con cache persistente D1.
- Le coordinate dinamiche vengono restituite dall'endpoint pubblico degli eventi e utilizzate automaticamente dal frontend.
- Proxy arboreo aggiornato alla versione `0.8.0`.

### Versioning

- App aggiornata alla versione `0.4.8` (build 51).
- Dataset visibile aggiornato alla revisione 13.
- Cache offline aggiornata a `qualita-aria-v0.4.8`.

## [0.4.7] — 2026-08-26

### Splash screen A.R.I.A.

- Integrata nell'app principale la splash approvata `A.R.I.A. — Analisi e Rappresentazione degli Indicatori Ambientali` senza ricrearne la grafica.
- Rimossi dall'integrazione mappa simulata, stazioni, controlli di demo, messaggio di rimozione e pulsante `Ripeti`.
- La splash funziona come overlay mentre MapLibre, interfaccia e dati iniziano a caricarsi normalmente.
- Aggiunta visualizzazione una sola volta per sessione tramite `sessionStorage` e chiave `ariaSplashShown`.
- Mantenuti pulsante `Salta`, focus visibile, contenuti accessibili e supporto `prefers-reduced-motion`.
- Aggiunta chiusura idempotente con rimozione effettiva dal DOM, pulizia di timer e listener e timeout di sicurezza.
- Isolati tutti gli stili sotto `#aria-splash` e classi `.aria-splash__*`, senza regole globali per `body`, `button` o `main`.
- Aggiunti alla cache offline esclusivamente `css/aria-splash.css` e `js/aria-splash.js`.
- Conservata `aria-splash/` come demo separata e non attiva.

### Versioning

- Cache aggiornata da `qualita-aria-v0.4.6` a `qualita-aria-v0.4.7`.
- App aggiornata alla versione `0.4.7` (build 50); dataset invariato alla revisione 12.

## [0.4.6] — 2026-08-26

### Documentazione proxy arboreo

- Documentata la procedura sicura per forzare manualmente la scansione degli eventi arborei senza lasciare il token nella cronologia della shell.
- Chiarito che applicazione e Cron Trigger non richiedono il token amministrativo.
- Aggiunte istruzioni per interpretare il risultato della sincronizzazione, verificare l'endpoint pubblico e sostituire un token perso o esposto.

### Versioning

- App aggiornata alla versione `0.4.6` (build 49); dataset invariato alla revisione 12.

## [0.4.5] — 2026-08-26

### Alberi · aggiornamento dinamico

- Aggiunto al Worker Cloudflare un processo pianificato mensile per cercare nuovi eventi nelle fonti ufficiali configurate di Roma Capitale.
- Aggiunto l'archivio strutturato Cloudflare D1 con migrazione SQL, deduplicazione per fonte e storico delle sincronizzazioni.
- Aggiunto l'endpoint pubblico `GET /v1/trees/events` usato dalla PWA.
- Aggiunti gli endpoint amministrativi protetti `POST /v1/trees/refresh` e `POST /v1/trees/review`.
- Gli eventi inequivocabili possono essere confermati automaticamente; pagine multiple o ambigue rimangono `automatic_pending` e sono escluse dai totali.
- Il frontend unisce eventi dinamici e dataset consolidato senza duplicare le pagine già censite.
- Aggiunta nell'interfaccia l'indicazione dell'ultima scansione oppure dell'attivazione del fallback locale.
- `data/trees.json` rimane disponibile per il funzionamento offline e in caso di indisponibilità del proxy.
- Sanitizzati i campi degli eventi dinamici prima dell'inserimento nell'interfaccia.

### Versioning

- Dataset visibile aggiornato alla revisione 12.
- App aggiornata alla versione `0.4.5` (build 48).

## [0.4.4] — 2026-08-26

### Alberi · eventi 2026

- Aggiunto il 2026 tra i periodi arborei selezionabili.
- Inserita una prima raccolta verificata di eventi ufficiali 2026 con luogo, data, quantità, stato e collegamento alla fonte comunale.
- Il totale minimo documentato 2026 include 603 piantumazioni e 19 abbattimenti confermati come eseguiti.
- Per il Municipio III sono distinti 473 alberi già piantati e 231 ancora previsti, evitando di attribuire al saldo l'intero programma di 704 alberi.
- Piantumazioni annunciate, lavori soltanto avviati e abbattimenti programmati sono visibili ma esclusi dal saldo minimo.
- Mantenuta la distinzione tra interventi completati, urgenti eseguiti, programmati e comunicazioni ufficiali non ancora confermate come completate.

### Versioning

- Dataset visibile aggiornato alla revisione 11.
- App aggiornata alla versione `0.4.4` (build 47).

## [0.4.3] — 2026-08-26

### Alberi · periodi e copertura

- Precisato che le statistiche non descrivono stato fitosanitario, vitalità o condizione degli alberi esistenti.
- Rimosso il riuso del totale novembre 2021–dicembre 2025 nelle singole selezioni 2022, 2023, 2024 e 2025.
- Aggiunte selezioni autonome per il bilancio aggregato novembre 2021–dicembre 2025 e per la stagione 2024–marzo 2025.
- Aggiunta una raccolta iniziale di eventi ufficiali datati per il 2023, 2024 e 2025.
- Le quantità annuali ricavate dagli eventi sono denominate `totale minimo documentato` e dichiarate con copertura parziale.
- Eventi programmati, eseguiti, urgenti e con quantità sconosciuta restano distinti; soltanto quantità note ed eventi eseguiti entrano nel minimo documentato.
- `Confronto` consente la lettura affiancata; `Differenza` viene calcolata soltanto tra dati della stessa natura.
- Un bilancio annuale ufficiale non viene confrontato numericamente con una raccolta parziale.

### Versioning

- Dataset arboreo aggiornato allo schema 2.
- App aggiornata alla versione `0.4.3` (build 46).

## [0.4.2] — 2026-08-25

### Alberi come fonte dati

- Spostata `Alberi` dalle modalità al selettore `Fonte dati`.
- Le sole modalità dell'app tornano a essere `Mappa`, `Confronto` e `Differenza` per tutte le fonti.
- `Mappa` mostra il bilancio arboreo dell'anno selezionato oppure il solo periodo aggregato disponibile.
- `Confronto` applica la visualizzazione territoriale alle due mappe e confronta esclusivamente bilanci annuali documentati.
- `Differenza` calcola la variazione del saldo arboreo tra due anni comparabili e colora il territorio in base al miglioramento o peggioramento.
- I totali pluriennali non vengono utilizzati nel confronto o nella differenza fra singoli anni.
- Rimossa automaticamente anche l'eventuale vecchia tab `Alberi` conservata nella cache HTML.

### Versioning

- App aggiornata alla versione `0.4.2` (build 45).

## [0.4.1] — 2026-08-25

### Alberi · visualizzazione territoriale

- Sostituiti i due alberelli comunali con una visualizzazione del bilancio arboreo sulla mappa.
- Il confine amministrativo viene colorato in verde con saldo positivo e in rosso con saldo negativo.
- L'intensità del riempimento rappresenta il peso del saldo rispetto agli interventi complessivi.
- Aggiunto un indicatore circolare proporzionale, diviso tra piantati e tagliati/decrementi, con totale complessivo al centro.
- Il popup riporta piantati, tagliati/decrementi, saldo, periodo, ambito territoriale e fonte ufficiale.
- Aggiunto sotto la mappa il confronto con barre proporzionali e saldo esplicito.
- I totali comunali continuano a essere dichiarati come dati dell'intero Comune e non come posizioni dei singoli alberi.
- Il periodo novembre 2021–dicembre 2025 resta aggregato e non viene attribuito ai singoli anni.

### Versioning

- App aggiornata alla versione `0.4.1` (build 44).

## [0.4.0] — 2026-08-25

### Statistiche arboree

- Aggiunta la modalità `Alberi` con selezione di città e anno sulla mappa MapLibre esistente.
- Introdotti marker arborei a dimensione fissa: verde per le piantumazioni e rosso per abbattimenti o decrementi documentati.
- Aggiunto uno schema dati che distingue evento, stato, periodo, quantità e precisione geografica.
- Prima fonte attiva: Bilancio Arboreo ufficiale di Roma Capitale.
- Inseriti i bilanci comunali 2017, 2018, 2019, 2020 e il dato parziale al 3 settembre 2021.
- Conservato senza ripartizioni stimate il totale aggregato novembre 2021–dicembre 2025.
- I 29.842 elementi del periodo 2021–2025 sono denominati `decrementi`, con 706 schianti indicati separatamente.
- Padova, Bologna e Torino restano non disponibili finché non viene verificata una serie pubblica di eventi utilizzabile.
- Censimenti, posti pianta, potature e manutenzioni non vengono convertiti automaticamente in eventi.

### Versioning

- Avviata la serie `0.4.x`.
- App aggiornata alla versione `0.4.0` (build 43).

## [0.3.9] — 2026-08-25

### Interfaccia

- Rimosso dall'interfaccia il messaggio informativo dedicato alla CO₂.
- Rimosso il relativo riferimento non più utilizzato dal codice frontend.

### Versioning

- App aggiornata alla versione `0.3.9` (build 42).

## [0.3.8] — 2026-08-25

### Temperature · copertura nazionale

- Aggiunto Meteostat come fallback osservativo per le stazioni fisiche non disponibili nel catalogo annuale NOAA/NCEI GSOY.
- Le stazioni Meteostat vengono individuate tramite catalogo NOAA/NCEI GSOD e codici WMO/ICAO.
- Sono accettati soltanto giorni nei quali temperatura media, minima e massima provengono esclusivamente da provider osservativi verificati.
- Esclusi esplicitamente dati modellati, previsioni e interpolazioni.
- Confermata la soglia minima del 75% di copertura annuale.
- ARPA Lazio mantiene la priorità nel Lazio; GSOY mantiene la priorità fuori dal Lazio.
- Nei popup sono ora mostrati, quando disponibili, i codici WMO e ICAO.

### Verifica Bari 2025

- `BARI` (WMO 16270, ICAO LIBD): copertura osservativa 98,9%.
- `GIOIA DEL COLLE` (WMO 16312, ICAO LIBV): copertura osservativa 98,4%.
- Nessun dato modellato accettato nel test del Worker.

### Worker e versioning

- `qualita-aria-temperature-proxy` aggiornato alla versione `0.6.0`.
- App aggiornata alla versione `0.3.8` (build 41).

## [0.3.7] — 2026-08-23

### Interfaccia e mappa

- Rafforzata la rimozione della vecchia tab `Temperatura`: viene eliminata anche se il browser riusa HTML precedente dalla cache.
- Le sole modalità ammesse sono ora `Mappa`, `Confronto` e `Differenza`.
- Confermata la rimozione di cerchi ed etichette numeriche degli inquinanti in tutte le viste, inclusa OpenAQ.
- OpenAQ resta esclusivamente una vista degli inquinanti e non avvia overlay temperatura o celle ERA5-Land.

### Temperature EEA

- Il messaggio senza risultati distingue ora l'assenza di stazioni dall'assenza di una tripla annuale completa MIN / MEDIA / MAX.
- Verificato il caso Firenze 2025: esiste una stazione fisica NOAA/NCEI a Firenze, ma il servizio annuale GSOY non pubblica per essa la tripla completa 2025; l'app non inventa né completa i mesi mancanti con celle modellate.

### Versioning

- App aggiornata alla versione `0.3.7` (build 40).

## [0.3.6] — 2026-08-23

### Mappa mobile

- Rimossi cerchi ed etichette numeriche degli inquinanti da Mappa, Confronto e Differenza.
- Heatmap/superfici degli inquinanti e lista dati restano invariate.
- Nessuna modifica alle funzioni di recupero/calcolo EEA, ARPA Lazio e OpenAQ.

### Temperatura

- Eliminato completamente il tab `Temperatura`.
- Rimosso il relativo selettore MIN / MEDIA / MAX.
- Il layer ERA5-Land dedicato non viene più inizializzato.
- OpenAQ non carica più celle o marker ERA5-Land.

### EEA · stazioni meteorologiche

- Corretto il backend osservazionale 2025 fuori dal Lazio.
- Sostituito il Search API `daily-summaries` con il layer ufficiale NOAA/NCEI Global Summary of the Year.
- I valori annuali sono letti direttamente come TMIN, TAVG e TMAX.
- Sono mostrate solo stazioni fisiche con coordinate reali e tripla annuale completa.
- Nel Lazio resta prioritaria la rete micro-meteorologica ARPA Lazio.
- Nessun fallback ERA5-Land viene usato per EEA.

### Worker

- `qualita-aria-temperature` aggiornato alla versione `0.5.0`.
- Endpoint `/v1/observed` invariato lato frontend.

### Versioning

- Aggiornata l'app a `0.3.6` build `39`.

## [0.3.5] — 2026-08-23

### Separazione fonti inquinante / temperatura

- Il selettore `Fonte inquinante` contiene soltanto EEA, ARPA Lazio e Globale · OpenAQ.
- `Temperatura` è ora una modalità separata e non una fonte inquinante.
- Nessun dataset degli inquinanti viene interrogato per ricavare temperature.
- Ripristinata la visualizzazione dei layer/valori degli inquinanti precedente alla sovrapposizione 0.3.4.
- Le modifiche temperatura agiscono soltanto sull'orchestrazione della mappa e su layer/marker indipendenti.

### ARPA Lazio

- Temperatura esclusivamente dalla rete micro-meteorologica fisica ARPA Lazio.
- Inserite le nove coordinate ufficiali AL001–AL009.
- Il Worker legge i CSV annuali ufficiali ARPA Lazio 2013–2025.
- MIN, MEDIA e MAX sono calcolati come medie annuali rispettivamente delle minime, medie e massime giornaliere.
- Sono visualizzate soltanto serie con copertura almeno del 75%.
- Marker fisso `🌡` alle coordinate reali della stazione.
- Nessuna cella ERA5-Land e nessuna heatmap temperatura nelle viste degli inquinanti.

### EEA

- La temperatura non viene ricavata da EEA.
- Nel Lazio viene data priorità alle stazioni fisiche ARPA Lazio.
- Fuori dalla copertura ARPA viene usato NOAA/NCEI GHCN-Daily, rete globale osservazionale fisica.
- Le stazioni NOAA vengono cercate nella bounding box visibile e devono avere TMIN/TMAX e copertura annuale sufficiente.
- Le stazioni sono rappresentate con marker `🌡` e `Tipo: Misurato`.
- SCIA/ISPRA non viene ancora interrogata automaticamente: nessun endpoint machine-to-machine con condizioni di riuso adatte è stato integrato in questa release.

### Globale · OpenAQ

- La heatmap/superficie OpenAQ resta invariata.
- La temperatura usa ERA5-Land.
- Nelle viste inquinante ERA5-Land è rappresentato soltanto da marker `▦`; non viene sovrapposta una seconda heatmap.
- Popup: `Cella ERA5-Land`, `Tipo: Rielaborazione climatica`, risoluzione circa 9 km.
- Il confronto OpenAQ resta disabilitato; non è stata alterata la logica degli inquinanti basata sugli ultimi dati eterogenei.

### Modalità Temperatura

- Aggiunta tab `Temperatura`.
- Reintrodotta scelta MIN / MEDIA / MAX come valore che colora la superficie ERA5-Land.
- Click sulla cella mostra tutte le tre medie annuali.
- La fonte inquinante resta selezionata ma il relativo controllo è disabilitato nella modalità Temperatura.

### Marker

- Marker temperatura realizzati come elementi HTML a dimensione fissa.
- Nessun cerchio geografico di copertura.
- Nessun marker spostato sul centro città.
- Ordine valori sempre MIN / MEDIA / MAX.

### Worker

- `qualita-aria-temperature` aggiornato alla versione `0.4.0`.
- Nuovo endpoint `/v1/observed`.
- Backend ARPA Lazio + NOAA/NCEI GHCN-Daily per stazioni fisiche.
- ERA5-Land resta confinato alla fonte globale e alla modalità Temperatura.

### Versioning

- Aggiornata l'app a `0.3.5` build `38`.

## [0.3.4] — 2026-08-23

### Temperatura sovrapposta agli inquinanti

- Corretto il ruolo dei pallini nelle mappe EEA, ARPA Lazio e OpenAQ.
- La superficie/sfumatura continua a rappresentare l'inquinante.
- I pallini numerici mostrano ora la temperatura media annua in °C.
- I valori numerici dell'inquinante non vengono più duplicati nei pallini; restano nella superficie e nell'elenco dati.
- Click sul pallino temperatura: MIN, MED e MAX annuali.
- EEA e ARPA usano lo stesso anno selezionato per l'inquinante.
- OpenAQ usa l'ultimo anno completo perché la fonte corrente non espone un anno storico selezionabile.
- Aggiunta legenda esplicita `Pallini: temperatura media annua`.

### Temperature puntuali

- Aggiunto endpoint Worker `/v1/temperature/points`.
- Il nuovo endpoint accetta fino a 40 coordinate in un'unica richiesta batch.
- Le temperature vengono richieste sulle coordinate delle stazioni/valutazioni visualizzate.
- Il pallino resta geograficamente sulla stazione, mentre Open-Meteo seleziona la cella ERA5-Land più vicina.
- Cache Cloudflare di 30 giorni anche per i batch puntuali.
- Aggiunto fallback diretto Open-Meteo anche per le richieste puntuali.

### Fonte Temperatura

- Rimosso il selettore Metrica MIN/MED/MAX.
- La mappa dedicata mostra sempre la temperatura media annua, coerentemente con i pallini sovrapposti agli inquinanti.
- MIN e MAX restano disponibili nel popup e nell'elenco.
- Layout uniformato alle mappe inquinanti: superficie sfumata + pallini numerici.
- Nessuna griglia quadrata visibile.

### Worker

- Aggiornato `qualita-aria-temperature` alla versione `0.3.0`.
- Health check espone `stationOverlay: true` e `maxPointRequests: 40`.

### Versioning

- Aggiornata l'app a `0.3.4` build `37`.

## [0.3.3] — 2026-08-23

### Temperatura · mappa

- Sostituita la visualizzazione a quadrati delle celle ERA5-Land con una superficie termica sfumata.
- I dati non vengono interpolati numericamente: i valori reali restano quelli dei centri cella; la sfumatura riguarda soltanto la resa grafica.
- A zoom elevato vengono mostrati piccoli centri cella e le etichette, così resta visibile la posizione del dato effettivo.
- Popup temperatura aggiornato con MED, MIN e MAX annuali.

### Temperatura · pan e zoom

- Aggiunto `temperatureViewportKey` indipendente dalla chiave generica usata dalle altre fonti.
- Dopo `moveend` l'app attende 2 secondi e confronta la nuova bounding box ERA5-Land con l'ultima realmente renderizzata.
- Se la zona è cambiata viene eseguito un nuovo caricamento e sostituita la superficie termica.
- Corretto l'uso globale di `openaqSuppressMove`: ora può sopprimere refresh soltanto quando la fonte attiva è OpenAQ.
- La diagnostica mostra `phase: viewport-changed`, bbox precedente/nuova e debounce quando lo spostamento attiva un refresh.
- In caso di errore durante il refresh la chiave viene ripristinata, permettendo di ritentare la stessa area.

### Versioning

- Aggiornata l'app a `0.3.3` build `36`.

## [0.3.2] — 2026-08-23

### Temperatura · periodo annuale

- Allineato il modulo alla specifica concordata: MIN, MED e MAX dell'anno selezionato.
- Rimosso il mese dalla vista temperatura.
- MED è la media annua; MIN e MAX sono gli estremi annuali.
- Le tre metriche sono restituite nello stesso payload, quindi cambiare metrica non genera una nuova richiesta.

### ERA5-Land / Open-Meteo

- Il Worker usa le aggregazioni giornaliere `temperature_2m_mean`, `temperature_2m_min` e `temperature_2m_max`.
- Ridotto il volume upstream rispetto al precedente download orario mensile.
- Worker temperatura aggiornato alla versione `0.2.0`.
- Cache Cloudflare annuale di 30 giorni.
- Area massima portata a 8° × 6°.
- Aggiunto fallback diretto a Open-Meteo se il Worker non risponde o restituisce zero celle.
- La diagnostica espone `transport` per distinguere proxy Cloudflare e fallback diretto.

### MapLibre / OpenFreeMap

- Impostato `Noto Sans Regular` sui layer testuali personalizzati.
- Eliminata la richiesta automatica al font stack predefinito `Open Sans Regular, Arial Unicode MS Regular`, che generava i 404 mostrati in console.
- Il messaggio `beforeinstallpromptevent.preventDefault()` resta intenzionale e serve al pulsante personalizzato `Installa app`.

### Diagnostica

- Prima della richiesta temperatura viene mostrato `phase: requesting`, così il cambio fonte è verificabile immediatamente.

### Versioning

- Aggiornata l'app a `0.3.2` build `35`.

## [0.3.1] — 2026-08-23

### Correzioni mappa

- Corretta un'espressione MapLibre non valida nel layer `air-points`: `zoom` era annidato dentro `case`, mentre MapLibre lo consente solo come input diretto di `interpolate` o `step`.
- Corretta la stessa struttura nei layer `air-labels`, `diff-points` e `diff-labels`.
- Il caricamento della mappa non si interrompe più durante `addAirLayers()`, permettendo l'inizializzazione dei layer temperatura.

### Correzioni temperatura

- Inizializzate correttamente `temperatureCache` e `temperatureInflight` nello stato applicativo.
- Gli errori del modulo temperatura aggiornano ora la diagnostica corrente invece di lasciare visibile l'ultima diagnostica EEA.
- In caso di errore temperatura vengono nascosti i layer temperatura e mostrato uno stato vuoto coerente.

### Versioning

- Aggiornata l'app a `0.3.1` build `34`.

## [0.3.0] — 2026-08-23

### Temperatura

- Avviata la serie `0.3.x`, dedicata alle temperature.
- Aggiunta la fonte `Temperatura · ERA5-Land`.
- La temperatura resta separata dalle sorgenti di qualità dell'aria.
- Fonte reale: Copernicus ERA5-Land tramite Open-Meteo Historical Weather API.
- Variabile: temperatura dell'aria a 2 metri.
- Anni disponibili nell'interfaccia: dal 1950 all'ultimo anno completo.
- Aggiunta selezione del mese.
- Aggiunte metriche `Temperatura media`, `Temperatura massima` e `Temperatura minima`.
- La stessa risposta mensile contiene tutte le metriche, quindi cambiare metrica non richiede un nuovo download.
- La vista temperatura usa celle di griglia invece di stazioni, per non confondere dati modellati e misure puntuali.
- Aggiunti popup con media, minima e massima del mese.
- Aggiunta legenda termica `Freddo → Caldo`.
- Confronto e Differenza sono temporaneamente disabilitati nel modulo temperatura; verranno estesi nella serie 0.3.x.
- Gli alberi restano esplicitamente fuori dalla 0.3.x e sono riservati alla futura serie 0.4.x.

### Proxy temperatura

- Aggiunto Worker Cloudflare dedicato `qualita-aria-temperature`.
- Il Worker genera una griglia fino a 25 punti nella bounding box visibile.
- Una singola richiesta batch recupera le temperature orarie ERA5-Land via Open-Meteo.
- Il Worker aggrega i valori in media, minima e massima mensili.
- Cache Cloudflare di 30 giorni per i mesi storici completi.
- Nessuna API key richiesta.
- Aggiunta diagnostica con risoluzione, passo di campionamento, cache edge, durata proxy e durata upstream.

### Navigazione

- Il refresh temperatura usa il debounce condiviso di 2 secondi dopo pan/zoom.
- La vista viene limitata a bounding box di massimo 4° × 4° per evitare richieste eccessive.
- Il modulo parte dalla posizione corrente della mappa e non la ricentra automaticamente dopo il caricamento.

### Versioning

- Aggiornata l'app a `0.3.0` build `33`.

## [0.2.14] — 2026-08-23

### Proxy EEA e prestazioni

- Aggiunto un Worker Cloudflare dedicato `qualita-aria-eea`.
- Le statistiche annuali E1a non vengono più richieste direttamente a Discodata quando il proxy è disponibile.
- Il Worker normalizza le stazioni e memorizza la risposta nella Cache API Cloudflare.
- TTL E1a: 6 ore per l'anno più recente, 30 giorni per gli anni consolidati.
- Anche i risultati vuoti vengono memorizzati, evitando di ripetere query lente prima del fallback UTD.
- Aggiunto endpoint proxy per i metadati `Measurements`, con cache di 24 ore.
- Elenco file E2a/UTD memorizzato per 6 ore.
- File Parquet E2a/UTD memorizzati come binari nella Cache API per 6 ore.
- Il frontend conserva il fallback diretto a Discodata se il nuovo Worker non è raggiungibile.
- La diagnostica EEA espone `edgeCache`, `proxyDurationMs` e `upstreamMs`.

### Correzioni UTD

- Corretto un errore della 0.2.13 nella diagnostica della cache UTD: `fromEntry()` usava una variabile `allRows` non definita.
- Il fallback UTD preferisce il nuovo proxy EEA e mantiene temporaneamente compatibilità con le vecchie route EEA presenti nel Worker OpenAQ.
- I metadati UTD vengono recuperati dal proxy EEA quando disponibile.

### Versioning

- Aggiornata l'app a `0.2.14` build `32`.

## [0.2.13] — 2026-08-23

### Prestazioni EEA

- Aggiunta cache spaziale per le statistiche annuali E1a validate.
- La query Discodata usa una bounding box agganciata a una griglia geografica; piccoli pan nella stessa zona riutilizzano i dati già caricati e filtrano le stazioni localmente.
- La griglia si adatta alla dimensione della viewport: più fine nelle viste cittadine e più ampia nelle viste continentali.
- Ridotte le colonne richieste a `AirQualityStatistics` ai soli campi utilizzati dall'app, diminuendo il payload JSON.
- Richieste EEA validate identiche e simultanee condividono la stessa Promise invece di duplicare la chiamata HTTP.
- Aggiunti `queryBoundingBox`, `spatialGridDegrees`, `cache` e `durationMs` alla diagnostica EEA.

### Prestazioni EEA UTD

- I Parquet E2a/UTD non sono più memorizzati per singola viewport.
- Il dataset preliminare viene elaborato una sola volta per `città + anno + inquinante` durante la sessione.
- Gli spostamenti successivi filtrano localmente le stazioni già elaborate sulla bounding box visibile.
- Anche i metadati EEA dei sampling point sono memorizzati per città, anno e inquinante.
- Richieste UTD simultanee identiche condividono la stessa elaborazione.
- Ridotto il numero massimo di dataset UTD mantenuti in memoria a 20 per contenere l'uso di RAM.

### Versioning

- Aggiornata l'app a `0.2.13` build `31`.

## [0.2.12] — 2026-08-22

### EEA · area visibile

- Il capoluogo selezionato resta il punto di partenza della vista EEA.
- Dopo uno spostamento o uno zoom manuale, EEA ricalcola la query usando la bounding box realmente visibile.
- Il refresh parte solo dopo 2 secondi senza ulteriori movimenti.
- La cache EEA distingue le diverse bounding box visualizzate.
- Cambiando esplicitamente area o città viene azzerato il viewport dinamico e la mappa torna al capoluogo scelto.
- Il fallback preliminare UTD viene filtrato sulla bounding box visibile e non viene attribuito a zone che non contengono più il capoluogo selezionato.

### Refresh mappa

- Introdotto un unico debounce di 2 secondi per pan/zoom su tutte le mappe.
- Rimosso il vecchio refresh OpenAQ a 220 ms, evitando richieste duplicate.
- I movimenti programmati dall'app, come il centraggio su un capoluogo, non generano un secondo download.
- I rendering avviati da uno spostamento manuale non ricentrano automaticamente la mappa.

### EEA UTD / Parquet

- Corretto il caricamento di `hyparquet`: la versione `1.26.0` viene ora importata tramite l'entry ESM jsDelivr `+esm`.
- Migliorata la diagnostica quando la libreria Parquet non può essere caricata.

### Versioning

- Aggiornata l'app a `0.2.12` build `30`.

## [0.2.11] — 2026-08-22

### EEA · dati preliminari UTD

- Aggiunto il fallback ufficiale EEA `E2a / UTD` per l'anno più recente quando la statistica annuale `E1a` validata non è disponibile.
- L'app continua a dare priorità ai dati annuali validati `E1a`.
- Il fallback UTD è attivo inizialmente per le città italiane selezionate nella fonte EEA.
- I file Parquet UTD vengono richiesti tramite il Cloudflare Worker esistente, senza dipendere dal CORS del servizio EEA.
- Aggiunta lettura Parquet nel browser tramite `hyparquet` e `hyparquet-compressors`, con versioni bloccate per supportare i principali codec Parquet.
- Le osservazioni con `Validity` negativa vengono escluse.
- Per ogni sampling point viene selezionata la serie con maggiore copertura tra aggregazione giornaliera, oraria e variabile.
- Una media annuale preliminare viene visualizzata solo con copertura almeno del 75%.
- I sampling point UTD vengono collegati ai metadati ufficiali EEA della tabella `Measurements`.
- I record preliminari sono marcati `◐ Preliminare UTD`; quelli validati `✓ Validato E1a`.
- Popup, elenco stazioni e confronto mantengono visibile lo stato di validazione.

### Proxy Cloudflare

- Aggiunti `/v1/eea/utd/files` e `/v1/eea/utd/file`.
- Il Worker accetta soltanto indici di file restituiti direttamente dall'API EEA, evitando proxy verso URL arbitrari.
- Aggiornato health check Worker alla versione `0.4.0` con `eeaUtd: true`.

### Versioning

- Aggiornata l'app a `0.2.11` build `29`.

## [0.2.10] — 2026-08-22

### EEA

- Corretta la selezione delle città quando la query EEA restituisce zero stazioni.
- La mappa viene centrata immediatamente sulla città selezionata, prima del completamento della query.
- Un risultato EEA con zero righe viene ora trattato come risultato valido e non come errore applicativo.
- Se non esistono statistiche annuali P1Y per la selezione, la UI mostra `—` come media e un messaggio esplicito invece di `0,0 µg/m³`.

### OpenAQ

- Nascosto il selettore ridondante `Periodo / Ultimo dato disponibile`.
- Rimane visibile soltanto il controllo `Recenza` con 7, 15 e 30 giorni.

### Versioning

- Aggiornata l'app a `0.2.10` build `28`.
- Aggiornati service worker e riferimenti cache-busting.
- Aggiornato il README con il comportamento temporale OpenAQ.

## [0.2.9] — 2026-08-22

### EEA · selezione geografica Italia

- La select `Area EEA` contiene ora solo `Italia` ed `Europa`.
- `Italia` è l'area predefinita.
- Quando si seleziona `Italia` compare una seconda select `Città`.
- `Roma` è la città selezionata di default.
- Aggiunto l'elenco locale dei capoluoghi e co-capoluoghi italiani.
- La query Discodata viene limitata a una finestra geografica di circa 40 km attorno alla città selezionata.
- La cache EEA distingue ora anche la città, evitando di riutilizzare risultati di un altro capoluogo.
- Se si seleziona `Europa`, la select `Città` viene nascosta.

### Versioning

- Aggiornata l'app a `0.2.9` build `27`.
- Aggiornati i riferimenti cache-busting di `app.js`, `openaq-world.js`, `version.json` e service worker.
- La patch incorpora anche la correzione `0.2.8` sulla conservazione della posizione della mappa OpenAQ, perché il branch `main` risultava ancora alla `0.2.7`.

## [0.2.8] — 2026-08-22

### OpenAQ

- La mappa mantiene centro, zoom, rotazione e inclinazione quando si cambia inquinante o recenza.
- Entrando in OpenAQ da una vista già sufficientemente ravvicinata, la camera non viene modificata.
- Se lo zoom corrente è inferiore al limite OpenAQ, viene aumentato solo fino al `minZoom` mantenendo invariato il centro.
- Il ripristino della camera sopprime il relativo `moveend`, evitando una seconda chiamata API non necessaria.

## [0.2.7] — 2026-08-22

### Documentazione e versioning

- Riscritto `README.md` come documentazione stabile dell'app, senza note di release.
- Creato `CHANGELOG.md`.
- Aggiornata la versione applicativa a `0.2.7` build `25`.
- Aggiornato il valore di fallback mostrato nel footer.
- Aggiornati cache name e riferimenti versionati del service worker.
- La patch è cumulativa e incorpora anche le modifiche della 0.2.6 che non risultavano pubblicate su `main`.

## [0.2.6] — 2026-08-22

> Patch preparata ma non risultava pubblicata sul branch `main`; le modifiche sono state incorporate nella 0.2.7.

### OpenAQ per area visibile

- Sostituito il caricamento mondiale con richieste basate sulla bounding box visibile.
- Impostato un limite allo zoom-out per evitare richieste che coprano l'intero pianeta.
- Aggiornamento dati OpenAQ su `moveend`.
- Aggiunta recenza selezionabile: 7, 15 o 30 giorni.
- Aggiunta suddivisione automatica delle bounding box troppo dense.
- Aggiunta protezione contro dataset parziali: se l'area resta troppo densa, l'app richiede di aumentare lo zoom.
- Nascosto il controllo mensile per EEA e ARPA finché non viene implementata una vera aggregazione mensile.
- Il controllo temporale OpenAQ viene usato come selettore di recenza.

## [0.2.5] — 2026-08-22

### Mappa

- Riordinate heatmap e marker sotto le etichette geografiche del basemap.
- Rese nuovamente leggibili città, Paesi e strade.
- Aumentato leggermente lo zoom iniziale della vista OpenAQ.

## [0.2.4] — 2026-08-22

### OpenAQ

- Aggiunta la fonte `OpenAQ · Mondo`.
- Aggiunti PM2.5 e PM10 con unità omogenee in µg/m³.
- Mostrati monitor fissi classificati come reference monitor.
- Aggiunto filtro iniziale sui dati recenti.
- Disabilitati temporaneamente Confronto e Differenza per OpenAQ.
- Preparati endpoint proxy per lo storico annuale dei sensori.

## [0.2.3] — 2026-08-22

### Infrastruttura OpenAQ

- Aggiunto client frontend per il proxy OpenAQ.
- Aggiunto Cloudflare Worker con secret `OPENAQ_API_KEY`.
- Aggiunti CORS, allowlist degli endpoint e cache.
- La API key OpenAQ non viene mai salvata nel frontend o nel repository.

## [0.2.2] — 2026-08-22

### Elenco stazioni

- Reso cliccabile l'elenco stazioni.
- Il click centra la mappa sulla stazione selezionata.
- Aggiunto supporto tastiera con Invio e Spazio.
- Il comportamento è compatibile con la modalità Confronto.

## [0.2.1] — 2026-08-22

### Elenco stazioni

- Aggiunta ricerca per nome, codice e Paese.
- Aggiunto autocompletamento.
- Aggiunta paginazione reale a 12 stazioni per pagina.
- La paginazione funziona anche con dataset EEA europei numerosi.

## [0.2.0] — 2026-08-22

### Versioning

- Avviata la serie di versioni `0.2.x`.

## [0.1.16] — 2026-08-22

### EEA

- Estesa la fonte EEA da Roma a Italia ed Europa.
- Aggiunto selettore area EEA.
- Aggiunta paginazione delle query Discodata.
- Migliorata la resa della heatmap a scala europea.

## [0.1.15] — 2026-08-22

### ARPA Lazio

- Aggiunto grafico storico annuale ARPA in modalità Confronto.
- Visualizzati MIN, MED e MAX dal 2013 al 2025.
- Aggiunto caricamento concorrente controllato dei file annuali.

## [0.1.14] — 2026-08-22

### Confronto

- Aggiunti indicatori di andamento: aumento, diminuzione e stabilità.

## [0.1.13] — 2026-08-22

### Confronto

- L'elenco mostra i valori dei due periodi affiancati.
- Gestite le stazioni presenti in un solo periodo tramite valore mancante.

## [0.1.12] — 2026-08-22

### ARPA Lazio

- Stabilizzata la lettura dei file ufficiali CSV/XLSX.
- Corretta la conversione dei valori mancanti per evitare falsi zeri.
- Aggiunto fallback posizionale per MIN, MED e MAX nei fogli XLSX.
- Confermata la distinzione tra valutazione comunale e stazione di misura.
