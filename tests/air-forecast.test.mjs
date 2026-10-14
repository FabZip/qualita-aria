import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context=vm.createContext({
  URL,
  URLSearchParams,
  Date,
  console,
  setTimeout,
  clearTimeout,
  Response
});

vm.runInContext(
  fs.readFileSync(path.join(root,'js/air-forecast.js'),'utf8'),
  context
);

const forecast=context.AirQualityForecast;
assert.ok(forecast);
assert.deepEqual(
  [...Object.keys(forecast.POLLUTANTS)],
  ['PM10','PM2.5','CO','SO2','O3','NO2']
);

const url=new URL(forecast.buildUrl({lat:41.9028,lon:12.4964}));
assert.equal(url.hostname,'air-quality-api.open-meteo.com');
assert.equal(url.searchParams.get('forecast_days'),'5');
for(const variable of Object.values(forecast.POLLUTANTS).flatMap(item=>[
  item.variable,item.aqiVariable
])){
  assert.ok(url.searchParams.get('hourly').split(',').includes(variable),variable)
}

const times=[];
for(const date of ['2026-10-14','2026-10-15']){
  for(let hour=0;hour<24;hour+=1){
    times.push(`${date}T${String(hour).padStart(2,'0')}:00`)
  }
}
const values=times.map((_,index)=>index%24);
const europeanAqi=times.map((_,index)=>{
  const hour=index%24;
  if(hour<6)return 10;
  if(hour<12)return 30;
  if(hour<18)return 50;
  return 70
});
const payload={
  latitude:41.9,
  longitude:12.5,
  timezone:'Europe/Rome',
  timezone_abbreviation:'CEST',
  hourly_units:{pm10:'μg/m³',carbon_monoxide:'μg/m³'},
  hourly:{
    time:times,
    pm10:values,
    european_aqi_pm10:europeanAqi,
    carbon_monoxide:times.map(()=>900),
    us_aqi_carbon_monoxide:times.map(()=>75)
  }
};

const pm10=forecast.aggregateForecast(payload,'PM10');
assert.equal(pm10.days.length,2);
assert.equal(pm10.unit,'µg/m³');
assert.equal(pm10.days[0].mean,11.5);
assert.equal(pm10.days[0].max,23);
assert.deepEqual(
  Array.from(pm10.days[0].periods,value=>value.value),
  [2.5,8.5,14.5,20.5]
);
assert.deepEqual(
  Array.from(pm10.days[0].periods,value=>value.quality.label),
  ['Ottima','Buona','Moderata','Scarsa']
);
assert.equal(pm10.days[0].quality.label,'Scarsa');

const co=forecast.aggregateForecast(payload,'CO');
assert.equal(co.days[0].mean,900);
assert.equal(co.days[0].quality.scale,'us');
assert.equal(co.days[0].quality.label,'Buona');

assert.equal(forecast.qualityFromAqi(101,'eu').label,'Pessima');
assert.equal(forecast.qualityFromAqi(301,'us').label,'Pessima');
assert.equal(forecast.qualityFromAqi(null,'eu'),null);

let requests=0;
const fetchImpl=async()=>{
  requests+=1;
  return Response.json(payload)
};
forecast.clearCache();
await forecast.fetchForecast({lat:41.9028,lon:12.4964},{fetchImpl});
await forecast.fetchForecast({lat:41.9028,lon:12.4964},{fetchImpl});
assert.equal(requests,1);

console.log('air-forecast: ok');
