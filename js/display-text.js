// Normalizzazione dei testi di presentazione. Non applicare a URL o identificativi.
function displayText(value){
  let text=String(value??'').normalize('NFC');
  const cp1252='€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
  const continuation='[\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC\\u2013\\u2014\\u2018-\\u201A\\u201C-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]';
  const sequence=new RegExp(`[\\u00C2-\\u00DF]${continuation}|[\\u00E0-\\u00EF]${continuation}{2}|[\\u00F0-\\u00F4]${continuation}{3}`,'gu');
  for(let pass=0;pass<3;pass++){
    const decoded=text.replace(sequence,part=>{
      const bytes=Uint8Array.from([...part].map(character=>{
        const index=cp1252.indexOf(character);
        return index<0?character.charCodeAt(0):index+128
      }));
      try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return part}
    });
    if(decoded===text)break;
    text=decoded
  }
  // U+FFFD ha già perso il byte originale: correggere soltanto nomi noti.
  return text.replace(/(MILANO\s+PASCAL\s+CITT)\uFFFD(\s+STUDI)/giu,
    (_,prefix,suffix)=>`${prefix}${prefix.endsWith('t')?'à':'À'}${suffix}`).normalize('NFC')
}
