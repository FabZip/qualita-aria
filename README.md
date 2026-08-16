# Qualità dell'aria

PWA mobile per esplorare e confrontare la qualità dell'aria nel tempo.

## v0.1.2

- prima integrazione con **dati reali EEA**
- statistiche annuali delle stazioni EEA nell'area di Roma (2013-2025)
- PM2.5, PM10 e NO₂
- valori numerici ripristinati direttamente nei marker sulla mappa
- heatmap/interpolazione grafica basata sui valori delle stazioni
- modalità Mappa, Confronto Swipe e Differenza
- filtro minimo di copertura annuale quando disponibile (75%)
- cache-busting degli asset v0.1.2
- PWA e service worker aggiornati

### Nota sulla heatmap

La zona colorata è un'interpolazione grafica realizzata dal frontend a partire dai punti di misura visualizzati. Non deve essere interpretata come una superficie modellistica ufficiale EEA/CAMS.

### Periodicità

La fonte EEA implementata in questa versione usa il servizio ufficiale delle **statistiche annuali**. Per questo il selettore del mese è disabilitato quando EEA è selezionata.

La prossima fonte prevista è **ARPA Lazio**, che pubblica dati elementari e anche elaborazioni standard con medie giornaliere, mensili e annuali.
