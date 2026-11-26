(()=>{
  'use strict';
  const labels={alerts:'Allerte',snow:'Neve',weather:'Meteo',air:'Qualità dell’aria',trees:'Alberi',fires:'Incendi',earthquakes:'Terremoti'};
  const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v));
  const fmt=v=>num(v)===null?'non disponibile':Number(v).toLocaleString('it-IT',{maximumFractionDigits:1});
  function localEvent(city,category,id,date,title,detail,source,url,status='Previsione modellistica'){
    return {id:`diary-${category}-${id}`,category,date,end:date,title,detail,source,url,status,lat:Number(city.lat),lon:Number(city.lon),distance:0,locationNote:'Riferimento: località scelta; non posizione di un evento osservato.'};
  }
  function weatherEvents(payload,city){
    const d=payload?.daily;if(!Array.isArray(d?.time))throw Error('Previsioni meteo senza giornate disponibili');
    const events=[];
    d.time.forEach((date,i)=>{if(!validDay(date))return;
      const code=num(d.weather_code?.[i]),min=num(d.temperature_2m_min?.[i]),max=num(d.temperature_2m_max?.[i]),snow=num(d.snowfall_sum?.[i]);
      if(code!==null||min!==null||max!==null)events.push(localEvent(city,'weather',date,date,`${WeatherForecast.condition(code)[1]} · ${city.name}`,`Minima ${fmt(min)} °C · massima ${fmt(max)} °C · precipitazioni ${fmt(d.precipitation_sum?.[i])} mm · vento massimo ${fmt(d.wind_speed_10m_max?.[i])} km/h`, 'Open-Meteo','https://open-meteo.com/'));
      if(snow!==null&&payload.daily_units?.snowfall_sum==='cm')events.push(localEvent(city,'snow',date,date,`${snow>0?'Neve prevista':'Nessuna neve prevista'} · ${city.name}`,`Neve totale giornaliera ${fmt(snow)} cm; per oggi include le ore trascorse.`, 'Open-Meteo','https://open-meteo.com/'));
    });return events;
  }
  function airEvents(payload,city){
    const events=[];events.missing=[];
    for(const pollutant of ['PM10','PM2.5','NO2','O3','SO2','CO']){
      let forecast;try{forecast=AirQualityForecast.aggregateForecast(payload,pollutant)}catch{events.missing.push(pollutant);continue}
      for(const d of forecast.days)events.push(localEvent(city,'air',`${pollutant}-${d.date}`,d.date,`${forecast.label} · ${city.name}`,`Media prevista ${fmt(d.mean)} ${forecast.unit} · massimo ${fmt(d.max)} ${forecast.unit}. Non è una misura di stazione.`, 'CAMS / Open-Meteo','https://open-meteo.com/en/docs/air-quality-api'));
    }if(!events.length)throw Error('Previsioni aria senza dati utilizzabili');return events;
  }
  function alertEvents(data,city,now=Date.now()){
    if(!data||data.stale)return[];const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date(now));
    const events=[];const names={idraulico:'Rischio idraulico',temporali:'Temporali',idrogeologico:'Rischio idrogeologico'};
    for(const p of data.current||[])if(validDay(p.date)&&p.date>=today)for(const [z,zone] of (p.zones||[]).entries())for(const risk of zone.risks||[]){
      events.push({...localEvent(city,'alerts',`${p.date}-${z}-${risk.type}`,p.date,`${names[risk.type]||risk.type} · ${zone.name}`,risk.text,'Protezione Civile',data.url,'Valutazione ufficiale'),locationNote:`Zona di allerta: ${zone.name}; il punto indica la località consultata.`});
    }return events;
  }
  function snowWarningEvents(data,now=Date.now()){
    if(!data||data.stale||!Number.isFinite(Date.parse(data.updated))||now-Date.parse(data.updated)>6*3600000||Date.parse(data.updated)>now+300000)return[];
    const rows=(data.warnings||[]).filter(w=>Number.isFinite(Date.parse(w.onset))&&Date.parse(w.expires)>now&&Date.parse(w.expires)>Date.parse(w.onset));
    return [...new Map(rows.map(w=>{const e={id:`diary-snow-warning-${w.area}-${w.onset}-${w.expires}-${w.level}`,category:'snow',date:w.onset,end:w.expires,title:`Neve/ghiaccio · ${w.area}`,detail:`Allerta ${w.level}. Area regionale del feed italiano: verificare il territorio interessato sulla fonte.`,status:'Avviso ufficiale',source:'MeteoAlarm / EUMETNET',url:'https://meteoalarm.org?region=IT',lat:null,lon:null,distance:null,scope:'regional',locationNote:'Avviso regionale italiano, incluso senza filtro di distanza; non localizzato sulla mappa.'};return[e.id,e]})).values()];
  }
  function fireUrl(city){
    const lat=Number(city.lat),lon=Number(city.lon),dy=200/111.2,dx=Math.min(180,dy/Math.max(.05,Math.cos(lat*Math.PI/180)));
    const bbox=[Math.max(-180,lon-dx),Math.max(-90,lat-dy),Math.min(180,lon+dx),Math.min(90,lat+dy)];
    const url=new URL(Environment.latestFireUrl());url.searchParams.set('version','1.0.0');url.searchParams.set('maxFeatures','500');url.searchParams.set('bbox',bbox.join(','));return url.href;
  }
  function fireEvents(payload,city){
    if(!Array.isArray(payload?.features))throw Error('Catalogo incendi non valido');
    return payload.features.flatMap(f=>{try{const e=Environment.fireEvent({features:[f]});return e?[{...e,distance:Environment.distance(city,e)}]:[]}catch{return[]}});
  }
  globalThis.EnvironmentDiary={labels,weatherEvents,airEvents,alertEvents,snowWarningEvents,fireUrl,fireEvents};
})();
