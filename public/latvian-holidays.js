import {dateKey,fromKey,addDays} from './planner.js';

// Current statutory rules, checked 2026-10-31:
// https://likumi.lv/ta/id/72608-par-svetku-atceres-un-atzimejamam-dienam
// Confirmed Song and Dance Festival closing dates, not a guessed five-year schedule:
// https://www.km.gov.lv/lv/jaunums/biletes-uz-dziesmu-un-deju-svetkiem-saks-tirgot-3-marta-0
// https://likumi.lv/ta/id/330067-par-xxvii-visparejo-latviesu-dziesmu-un-xvii-deju-svetku-norises-laiku
// https://likumi.lv/ta/id/367734-par-xxviii-visparejo-latviesu-dziesmu-un-xviii-deju-svetku-norises-laiku
const festivalClosings={2018:'07-08',2023:'07-09',2028:'07-09'},cache=new Map();
function easterSunday(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
  return dateKey(new Date(year,Math.floor(n/31)-1,n%31+1,12));
}
const weekend=key=>[0,6].includes(fromKey(key).getDay());
function holidaysForYear(year){
  if(cache.has(year))return cache.get(year);
  const days=new Map(),add=(key,label)=>days.set(key,days.has(key)?`${days.get(key)}; ${label}`:label);
  for(const [day,label] of [
    ['01-01','Jaungada diena'],['05-01','Darba svētki; Latvijas Republikas Satversmes sapulces sasaukšanas diena'],
    ['05-04','Latvijas Republikas Neatkarības atjaunošanas diena'],['06-23','Līgo diena'],['06-24','Jāņu diena'],
    ['11-18','Latvijas Republikas Proklamēšanas diena'],['12-24','Ziemassvētku vakars'],['12-25','Pirmie Ziemassvētki'],
    ['12-26','Otrie Ziemassvētki'],['12-31','Vecgada diena']
  ])add(`${year}-${day}`,label);
  const easter=easterSunday(year);
  add(addDays(easter,-2),'Lielā Piektdiena');add(easter,'Pirmās Lieldienas');add(addDays(easter,1),'Otrās Lieldienas');add(addDays(easter,49),'Vasarsvētki');
  add(dateKey(new Date(year,4,8+(7-new Date(year,4,1,12).getDay())%7,12)),'Mātes diena');
  if(year===2018)add('2018-09-24','Pāvesta Franciska pastorālās vizītes diena');
  if(year===2023)add('2023-05-29','Latvijas hokeja izlases bronzas medaļas svētku diena');
  if(festivalClosings[year])add(`${year}-${festivalClosings[year]}`,'Vispārējo latviešu Dziesmu un deju svētku noslēguma diena');
  const observed=year>=2007?[`${year}-05-04`,`${year}-11-18`]:[];
  if(festivalClosings[year])observed.push(`${year}-${festivalClosings[year]}`);
  for(const key of observed){
    if(!weekend(key))continue;
    let next=addDays(key,1);while(weekend(next)||days.has(next))next=addDays(next,1);
    add(next,`Brīvdiena pēc svētkiem: ${days.get(key)}`);
  }
  cache.set(year,days);return days;
}
export function latvianDayInfo(key){
  const holiday=holidaysForYear(fromKey(key).getFullYear()).get(key)||null,isWeekend=weekend(key);
  return {holiday,isWeekend,nonWorking:isWeekend||!!holiday};
}
