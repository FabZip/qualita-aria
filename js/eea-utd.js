(() => {
  'use strict';

  const HYPARQUET_URL='https://cdn.jsdelivr.net/npm/hyparquet@1.26.0/+esm';
  const HYPARQUET_COMPRESSORS_URL='https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm';
  const UTD_MIN_YEAR=2025;
  const UTD_MIN_COVERAGE=75;
  const UTD_MAX_FILES=60;

  state.eeaUtdCache=state.eeaUtdCache||new Map();
  let hyparquetPromise=null;
  let compressorsPromise=null;

  const baseFetchEeaRows=fetchEeaRows;
  const baseSourceNotice=sourceNotice;

  function isEeaCityScope(){
    if(source()!=='eea'||eeaScope()!=='italy')return false;

    const scope=currentEeaScope();

    // Il servizio UTD viene interrogato per città. Dopo un pan lo usiamo
    // soltanto finché il capoluogo selezionato resta dentro il viewport;
    // fuori da quell'area evitiamo di attribuire dati UTD della città sbagliata.
    return scope.kind!=='viewport'||scope.selectedCityInsideViewport===true
  }

  async function loadHyparquet(){
    try{
      if(!hyparquetPromise)hyparquetPromise=import(HYPARQUET_URL);
      if(!compressorsPromise)compressorsPromise=import(HYPARQUET_COMPRESSORS_URL);

      const[parquet,compressorModule]=await Promise.all([
        hyparquetPromise,
        compressorsPromise
      ]);

      if(typeof parquet?.parquetReadObjects!=='function'){
        throw new Error('parquetReadObjects non esportata dal modulo hyparquet')
      }

      return{parquet,compressors:compressorModule.compressors}
    }catch(err){
      hyparquetPromise=null;
      compressorsPromise=null;
      throw new Error(`Libreria Parquet non disponibile: ${err.message||err}`)
    }
  }

  function normalizeId(value){
    return String(value??'')
      .trim()
      .replace(/\/+$/,'')
      .toLowerCase()
  }

  function identifierKeys(value){
    const raw=String(value??'').trim();
    if(!raw)return[];

    const values=new Set([raw]);
    try{values.add(decodeURIComponent(raw))}catch{}

    for(const item of [...values]){
      const clean=item.replace(/\/+$/,'');
      values.add(clean);
      const slash=clean.split('/').pop();
      const hash=clean.split('#').pop();
      if(slash)values.add(slash);
      if(hash)values.add(hash)
    }

    return[...values].map(normalizeId).filter(Boolean)
  }

  function vocabularyCode(value){
    if(value===null||value===undefined||value==='')return null;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value==='bigint')return Number(value);

    const raw=String(value).trim();
    if(/^-?\d+$/.test(raw))return Number(raw);
    const match=raw.match(/(?:^|\/)(-?\d+)\/?$/);
    return match?Number(match[1]):null
  }

  function parseTime(value){
    if(value instanceof Date)return value.getTime();

    if(typeof value==='bigint'){
      const abs=value<0n?-value:value;
      if(abs>100000000000000000n)return Number(value/1000000n); // ns -> ms
      if(abs>100000000000000n)return Number(value/1000n);       // µs -> ms
      if(abs>100000000000n)return Number(value);                // ms
      return Number(value*1000n)                                // s -> ms
    }

    if(typeof value==='number'&&Number.isFinite(value)){
      const abs=Math.abs(value);
      if(abs>1e17)return value/1e6;
      if(abs>1e14)return value/1e3;
      if(abs>1e11)return value;
      if(abs>1e9)return value*1000
    }

    const parsed=Date.parse(String(value??''));
    return Number.isFinite(parsed)?parsed:null
  }

  function aggKind(value){
    const raw=normalizeText(value).replace(/\s+/g,'');
    if(!raw)return'var';
    if(raw.includes('p1d')||raw.includes('day')||raw.includes('daily'))return'day';
    if(raw.includes('p1h')||raw.includes('hour')||raw.includes('hourly'))return'hour';
    return'var'
  }

  function unitFactor(value){
    const raw=String(value??'')
      .toLowerCase()
      .replaceAll('μ','u')
      .replaceAll('µ','u');

    if(raw.includes('mg'))return 1000;
    if(raw.includes('ng'))return .001;
    if(raw.includes('ug')||raw.includes('microgram')||!raw)return 1;
    return null
  }

  function isValidObservation(row){
    const code=vocabularyCode(row?.Validity);
    return code===null||code>0
  }

  function daysInYear(year){
    return new Date(Date.UTC(Number(year)+1,0,1))-new Date(Date.UTC(Number(year),0,1))
  }

  function expectedCount(year,kind){
    const days=daysInYear(year)/86400000;
    if(kind==='day')return days;
    if(kind==='hour')return days*24;
    return null
  }

  function timestampKey(ms,kind){
    const iso=new Date(ms).toISOString();
    if(kind==='day')return iso.slice(0,10);
    if(kind==='hour')return iso.slice(0,13);
    return iso
  }

  function pollutantMatchesMetadata(row,pollutant){
    const code=String(POLLUTANTS[pollutant]?.eeaCode??'');
    const label=normalizeText(pollutant).replace('₂','2');

    return[row?.AirPollutantCode,row?.AirPollutant]
      .some(value=>{
        const raw=String(value??'');
        const normalized=normalizeText(raw).replace('₂','2');
        return raw===code||
          raw.endsWith(`/${code}`)||
          raw.includes(`/pollutant/${code}`)||
          normalized.includes(label)
      })
  }

  function metadataSql(year,pollutant){
    const scope=currentEeaScope();
    const[minLon,minLat,maxLon,maxLat]=scope.bbox;
    const y=String(year).replace(/\D/g,'');
    const previous=String(Math.max(2013,Number(y)-1));

    return`
SELECT
  AirPollutant,
  AirPollutantCode,
  AirQualityStation,
  AirQualityStationEoICode,
  AQStationName,
  AirQualityStationArea,
  AirQualityStationType,
  CountryCode,
  Latitude,
  Longitude,
  ReportingYear,
  SampleId
FROM [AirQualityDataFlows].[latest].[Measurements]
WHERE CountryCode='IT'
  AND Latitude BETWEEN ${minLat} AND ${maxLat}
  AND Longitude BETWEEN ${minLon} AND ${maxLon}
  AND (ReportingYear='${y}' OR ReportingYear='${previous}')
`.trim()
  }

  async function fetchMetadata(year,pollutant){
    const paged=await fetchDiscodataPages(metadataSql(year,pollutant),{
      pageSize:1000,
      maxPages:5
    });

    const filtered=paged.rows.filter(row=>pollutantMatchesMetadata(row,pollutant));
    const bySample=new Map();

    // Prefer metadata from the requested year when duplicated.
    filtered.sort((a,b)=>Number(b.ReportingYear||0)-Number(a.ReportingYear||0));

    for(const row of filtered){
      for(const key of identifierKeys(row.SampleId)){
        if(!bySample.has(key))bySample.set(key,row)
      }
    }

    return{
      bySample,
      rows:filtered,
      pages:paged.pages,
      truncated:paged.truncated
    }
  }

  function addObservation(groups,row,year){
    if(!isValidObservation(row))return false;

    const ms=parseTime(row.Start??row.End);
    if(ms===null||new Date(ms).getUTCFullYear()!==Number(year))return false;

    const rawValue=Number(row.Value);
    if(!Number.isFinite(rawValue)||rawValue<0)return false;

    const factor=unitFactor(row.Unit);
    if(factor===null)return false;

    const sample=String(row.Samplingpoint??'').trim();
    if(!sample)return false;

    const kind=aggKind(row.AggType);
    const key=`${sample}\u0000${kind}`;

    if(!groups.has(key)){
      groups.set(key,{
        sample,
        kind,
        values:new Map(),
        verification:new Map(),
        unit:String(row.Unit??'')
      })
    }

    const group=groups.get(key);
    const timeKey=timestampKey(ms,kind);
    group.values.set(timeKey,rawValue*factor);

    const verification=vocabularyCode(row.Verification);
    if(verification!==null){
      group.verification.set(
        verification,
        (group.verification.get(verification)||0)+1
      )
    }
    return true
  }

  function groupCandidate(group,year){
    const values=[...group.values.values()];
    if(!values.length)return null;

    const expected=expectedCount(year,group.kind);
    const coverage=expected
      ?Math.min(100,values.length/expected*100)
      :null;

    return{
      sample:group.sample,
      kind:group.kind,
      count:values.length,
      coverage,
      value:values.reduce((sum,value)=>sum+value,0)/values.length,
      verification:[...group.verification.entries()]
        .sort((a,b)=>b[1]-a[1])[0]?.[0]??null
    }
  }

  function selectBestCandidates(groups,year){
    const bySample=new Map();

    for(const group of groups.values()){
      const candidate=groupCandidate(group,year);
      if(!candidate)continue;

      const current=bySample.get(candidate.sample);
      const score=(candidate.coverage??0)+(candidate.kind==='day'?.2:candidate.kind==='hour'?.1:0);
      const currentScore=current
        ?(current.coverage??0)+(current.kind==='day'?.2:current.kind==='hour'?.1:0)
        :-1;

      if(!current||score>currentScore)bySample.set(candidate.sample,candidate)
    }

    return[...bySample.values()]
  }

  function metadataForSample(bySample,sample){
    for(const key of identifierKeys(sample)){
      if(bySample.has(key))return bySample.get(key)
    }
    return null
  }

  function verificationLabel(code){
    if(code===1)return'UTD · verificato nel flusso preliminare';
    if(code===2)return'UTD · preliminarmente verificato';
    if(code===3)return'UTD · non verificato';
    return'UTD · stato di verifica non dichiarato'
  }

  async function mapLimit(items,limit,fn){
    const results=new Array(items.length);
    let next=0;

    async function worker(){
      while(true){
        const index=next++;
        if(index>=items.length)return;
        results[index]=await fn(items[index],index)
      }
    }

    await Promise.all(
      Array.from({length:Math.min(limit,items.length)},()=>worker())
    );
    return results
  }

  async function fetchUtdRows(year,pollutant){
    const scope=currentEeaScope();
    const cacheKey=`${eeaScopeKey()}:${year}:${pollutant}:utd`;

    if(state.eeaUtdCache.has(cacheKey)){
      const cached=state.eeaUtdCache.get(cacheKey);
      diagnostics({...cached.diagnostic,cache:'memory'});
      return cached.rows
    }

    if(!globalThis.QualitaAriaOpenAQProxy?.eeaUtdFiles){
      throw new Error('Client proxy EEA UTD non disponibile.')
    }

    const city=scope.cityLabel;
    const[fileResponse,metadata,parquetTools]=await Promise.all([
      QualitaAriaOpenAQProxy.eeaUtdFiles({
        country:'IT',
        city,
        pollutant
      }),
      fetchMetadata(year,pollutant),
      loadHyparquet()
    ]);

    const files=(fileResponse.data?.files||[]).slice(0,UTD_MAX_FILES);
    if(!files.length){
      const diagnostic={
        source:'EEA Air Quality Download Service',
        flow:'E2a/UTD',
        dataStatus:'preliminary',
        scope:scope.label,
        year,pollutant,
        city,
        parquetFiles:0,
        metadataRows:metadata.rows.length,
        note:'Nessun file UTD restituito dal servizio EEA.'
      };
      diagnostics(diagnostic);
      state.eeaUtdCache.set(cacheKey,{rows:[],diagnostic});
      return[]
    }

    const groups=new Map();
    let parquetRows=0;
    let acceptedRows=0;
    const fileErrors=[];

    await mapLimit(files,3,async file=>{
      try{
        const response=await QualitaAriaOpenAQProxy.eeaUtdFile({
          country:'IT',
          city,
          pollutant,
          index:file.index
        });

        const rows=await parquetTools.parquet.parquetReadObjects({
          file:response.data,
          compressors:parquetTools.compressors
        });
        parquetRows+=rows.length;

        for(const row of rows){
          if(addObservation(groups,row,year))acceptedRows++
        }
      }catch(err){
        fileErrors.push({
          index:file.index,
          name:file.name,
          error:String(err.message||err)
        })
      }
    });

    const candidates=selectBestCandidates(groups,year);
    const unmatched=[];
    let lowCoverageSkipped=0;
    const bestStation=new Map();

    for(const candidate of candidates){
      const meta=metadataForSample(metadata.bySample,candidate.sample);
      if(!meta){
        unmatched.push(candidate.sample);
        continue
      }

      if(candidate.coverage!==null&&candidate.coverage<UTD_MIN_COVERAGE){
        lowCoverageSkipped++;
        continue
      }

      const lat=parseNumber(meta.Latitude);
      const lon=parseNumber(meta.Longitude);
      if(lat===null||lon===null)continue;

      const stationId=String(
        meta.AirQualityStationEoICode||
        meta.AirQualityStation||
        candidate.sample
      ).trim();

      const row={
        id:stationId,
        name:String(meta.AQStationName||meta.AirQualityStation||stationId),
        country:String(meta.CountryCode||'IT').trim(),
        lat,lon,
        value:+candidate.value.toFixed(2),
        coverage:candidate.coverage===null?null:+candidate.coverage.toFixed(1),
        verification:verificationLabel(candidate.verification),
        area:String(meta.AirQualityStationArea||''),
        stationType:String(meta.AirQualityStationType||''),
        kind:'station',
        provider:'EEA · UTD/E2a',
        dataStatus:'preliminary',
        statusLabel:'◐ Preliminare UTD',
        sourceFlow:'E2a/UTD',
        aggregation:candidate.kind,
        samplePoint:candidate.sample,
        observations:candidate.count
      };

      const current=bestStation.get(stationId);
      if(!current||(row.coverage??0)>(current.coverage??0)){
        bestStation.set(stationId,row)
      }
    }

    const[minLon,minLat,maxLon,maxLat]=scope.bbox;
    const rows=[...bestStation.values()]
      .filter(row=>
        row.lon>=minLon&&row.lon<=maxLon&&
        row.lat>=minLat&&row.lat<=maxLat
      )
      .sort((a,b)=>a.name.localeCompare(b.name,'it'));

    const diagnostic={
      source:'EEA Air Quality Download Service',
      flow:'E2a/UTD',
      dataStatus:'preliminary',
      scope:scope.label,
      boundingBox:scope.bbox,
      city,
      year,pollutant,
      datasetId:1,
      parquetFilesReturned:fileResponse.data?.meta?.count??files.length,
      parquetFilesProcessed:files.length,
      parquetFilesLimited:(fileResponse.data?.meta?.count??0)>files.length,
      parquetRows,
      acceptedObservationRows:acceptedRows,
      samplingPoints:candidates.length,
      metadataRows:metadata.rows.length,
      metadataPages:metadata.pages,
      metadataTruncated:metadata.truncated,
      stationsUsed:rows.length,
      lowCoverageSkipped,
      minimumCoverage:UTD_MIN_COVERAGE,
      unmatchedSamplingPoints:unmatched.slice(0,20),
      fileErrors:fileErrors.slice(0,10),
      note:'Media annuale preliminare calcolata da osservazioni E2a/UTD valide. Preferenza automatica per la serie con maggiore copertura; soglia minima 75%.'
    };

    diagnostics(diagnostic);
    state.eeaUtdCache.set(cacheKey,{rows,diagnostic});
    while(state.eeaUtdCache.size>40){
      const first=state.eeaUtdCache.keys().next().value;
      state.eeaUtdCache.delete(first)
    }
    return rows
  }

  fetchEeaRows=async function(year,pollutant){
    const validated=await baseFetchEeaRows(year,pollutant);

    if(validated.length){
      const rows=validated.map(row=>({
        ...row,
        dataStatus:'validated',
        statusLabel:'✓ Validato E1a',
        sourceFlow:'E1a'
      }));
      diagnostics({
        ...state.diagnostics,
        dataStatus:'validated',
        flow:'E1a'
      });
      return rows
    }

    if(Number(year)<UTD_MIN_YEAR||!isEeaCityScope()){
      return validated
    }

    try{
      return await fetchUtdRows(year,pollutant)
    }catch(err){
      diagnostics({
        ...state.diagnostics,
        validatedRows:0,
        utdFallback:true,
        utdError:String(err.message||err)
      });
      throw new Error(`EEA: dati validati assenti; fallback UTD non riuscito (${err.message||err}).`)
    }
  };

  sourceNotice=function(rows){
    if(source()!=='eea')return baseSourceNotice(rows);

    if(rows.some(row=>row.dataStatus==='preliminary')){
      return`EEA · ${currentEeaScope().label} · ◐ dati preliminari UTD/E2a`
    }

    if(rows.some(row=>row.dataStatus==='validated')){
      return`EEA · ${currentEeaScope().label} · ✓ dati validati E1a`
    }

    if(Number($('yearSelect')?.value)>=UTD_MIN_YEAR&&isEeaCityScope()){
      return`EEA · ${currentEeaScope().label} · nessun dato validato o UTD utilizzabile`
    }

    return baseSourceNotice(rows)
  };

  SOURCE_INFO.eea.hint='EEA usa prima le statistiche annuali validate E1a. Per l’anno più recente, quando il dato validato manca, può usare il flusso preliminare E2a/UTD nell’area del capoluogo selezionato. Dopo uno spostamento della mappa il refresh parte dopo 2 secondi e i risultati vengono filtrati sulla zona visibile.';

  globalThis.QualitaAriaEEAUTD={
    fetchUtdRows,
    loadHyparquet
  }
})();
