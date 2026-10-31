import test from 'node:test';
import assert from 'node:assert/strict';
import {latvianDayInfo} from '../public/latvian-holidays.js';

test('Latvian fixed public holidays and weekends are non-working days',()=>{
  for(const day of ['01-01','05-01','05-04','06-23','06-24','11-18','12-24','12-25','12-26','12-31']){
    const info=latvianDayInfo(`2026-${day}`);assert.equal(info.nonWorking,true);assert.ok(info.holiday);
  }
  assert.deepEqual(latvianDayInfo('2026-10-31'),{holiday:null,isWeekend:true,nonWorking:true});
  assert.deepEqual(latvianDayInfo('2026-11-11'),{holiday:null,isWeekend:false,nonWorking:false},'A remembrance day is not a public holiday');
});

test('Easter dates, Pentecost and Mothers Day follow each year rather than fixed dates',()=>{
  for(const [key,name] of [['2026-04-03','Lielā Piektdiena'],['2026-04-05','Pirmās Lieldienas'],['2026-04-06','Otrās Lieldienas'],['2026-05-24','Vasarsvētki'],['2026-05-10','Mātes diena'],['2027-03-26','Lielā Piektdiena'],['2027-03-28','Pirmās Lieldienas'],['2027-03-29','Otrās Lieldienas'],['2027-05-16','Vasarsvētki'],['2027-05-09','Mātes diena']]){
    assert.equal(latvianDayInfo(key).holiday,name);
  }
  assert.equal(latvianDayInfo('2026-04-07').nonWorking,false);
});

test('only legally eligible weekend holidays produce a substitute working-day holiday',()=>{
  assert.match(latvianDayInfo('2025-05-05').holiday,/Brīvdiena pēc svētkiem/);
  assert.match(latvianDayInfo('2024-05-06').holiday,/Neatkarības/);
  assert.match(latvianDayInfo('2023-11-20').holiday,/Proklamēšanas/);
  assert.equal(latvianDayInfo('2027-12-27').nonWorking,false,'Christmas has no automatic substitute Monday');
  assert.equal(latvianDayInfo('2022-01-03').nonWorking,false,'New Year has no automatic substitute Monday');
});

test('confirmed festival closing holidays and exceptional holidays are year-specific',()=>{
  for(const key of ['2018-07-08','2023-07-09','2028-07-09'])assert.match(latvianDayInfo(key).holiday,/noslēguma/);
  for(const key of ['2018-07-09','2023-07-10','2028-07-10'])assert.match(latvianDayInfo(key).holiday,/Brīvdiena pēc svētkiem/);
  assert.ok(latvianDayInfo('2018-09-24').holiday);assert.equal(latvianDayInfo('2019-09-24').holiday,null);
  assert.ok(latvianDayInfo('2023-05-29').holiday);assert.equal(latvianDayInfo('2024-05-29').holiday,null);
  assert.equal(latvianDayInfo('2033-07-10').holiday,null,'Do not invent dates for unannounced festivals');
});
