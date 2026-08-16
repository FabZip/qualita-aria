# Qualità dell'aria

PWA mobile per esplorare e confrontare la qualità dell'aria nel tempo.

## v0.1.5

### Cartografia
- basemap cambiata da Liberty a **OpenFreeMap Positron**
- cartografia neutra, quasi monocromatica, per aumentare il contrasto dei dati ambientali
- punti, interpolazioni e differenze rimangono colorati

### EEA
- dati reali EEA Discodata invariati
- valori numerici sempre visibili sui marker
- heatmap resa più ampia e leggibile attorno alle stazioni reali
- non vengono aggiunte stazioni o misure sintetiche
- dove la rete di misura è rada, la copertura visiva rimane necessariamente meno dettagliata

### ARPA Lazio
- corretto endpoint Data API: `/it/api/3/action/datastore_search`
- mantenuto JSONP, come documentato da Open Data Lazio
- eliminata la dipendenza dal servizio ATAC per il perimetro
- il dato comunale viene associato al vero limite amministrativo del Comune di Roma
  (ISTAT 058091), caricato in WGS84 dal progetto geojson-italy
- il poligono ha estensione geografica reale e quindi **non cambia dimensione geografica
  quando si effettua zoom**
- il valore MED resta mostrato al centro; MIN/MAX rimangono nel dettaglio

### Nota metodologica
EEA è una rete di punti di misura. Una heatmap più estesa migliora la leggibilità, ma non
trasforma EEA in un modello continuo. Per una superficie geografica continua la fonte
prevista è CAMS.

ARPA Lazio, nel dataset Standard comunali, fornisce invece una valutazione a livello
comunale: colorare il confine di Roma indica l'ambito territoriale a cui si riferisce il
dato, non che la concentrazione sia identica in ogni punto del Comune.
