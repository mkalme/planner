import test from 'node:test';
import assert from 'node:assert/strict';
import {classicTaskColors,generateDayTaskHue,TASK_COLOR_HUES,TASK_PALETTE,getTaskColor,withStableTaskColors} from '../public/retro/1990s-colors.js';
import {dateKey,fromKey,addDays,weekStart,monthDays,shiftPeriod,sortTasks,moveTask,updateTask,isMissed,seedTasks,validateTask,loadTasks,randomHue,createTask,addTaskComment} from '../public/planner.js';
const make=(id,date='2026-10-31',order=0,status='new')=>({id,date,order,status,title:id,description:'A task',priority:'normal',hue:140,comments:[]});
test('calendar dates cross month, leap-year, and week boundaries without UTC offsets',()=>{
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(addDays('2028-02-28',1),'2028-02-29');
  assert.equal(weekStart('2026-11-01'),'2026-10-26');
  assert.equal(dateKey(fromKey('2026-10-31')),'2026-10-31');
  assert.equal(monthDays(2026,1).length,35);
  assert.equal(monthDays(2026,1)[0],'2026-01-26');
  assert.equal(shiftPeriod('2026-01-31','month',1),'2026-02-28');
  assert.equal(shiftPeriod('2028-02-29','year',1),'2029-02-28');
});
test('reordering tasks preserves the requested order and the completed group',()=>{
  const tasks=[make('A','2026-10-31',0),make('B','2026-10-31',1),make('C','2026-10-31',2),make('done','2026-10-31',9,'complete')];
  moveTask(tasks,'C','2026-10-31','A');
  assert.deepEqual(sortTasks(tasks).map(t=>t.id),['done','C','A','B']);
  moveTask(tasks,'C','2026-10-31');
  assert.deepEqual(sortTasks(tasks).map(t=>t.id),['done','A','B','C']);
  assert.equal(moveTask(tasks,'C','2026-10-31','C'),false);
});
test('moving tasks between dates keeps status, comments, and destination order',()=>{
  const a=make('A','2026-10-31',0,'progress');a.comments=[{status:'progress',comment:'Started',at:'2026-10-31T12:00:00Z'}];
  const tasks=[a,make('B','2026-11-01',0),make('C','2026-11-01',1)];
  moveTask(tasks,'A','2026-11-01','C');
  assert.equal(a.date,'2026-11-01');assert.equal(a.status,'progress');assert.equal(a.comments[0].comment,'Started');
  assert.deepEqual(sortTasks(tasks.filter(t=>t.date==='2026-11-01')).map(t=>t.id),['B','A','C']);
});
test('status and priority updates generate activity while user comments are optional',()=>{
  const task=make('A'),tasks=[task];
  updateTask(tasks,'A',{status:'progress'},'   ','2026-10-31T12:00:00Z');
  assert.equal(task.comments[0].comment,'Status changed from New to In progress.');
  updateTask(tasks,'A',{status:'complete',priority:'high'},' Finished. ','2026-10-31T13:00:00Z');
  assert.deepEqual(task.comments.map(comment=>comment.kind),['status','status','priority','comment']);
  assert.equal(task.comments[2].comment,'Priority changed from Normal to High.');
  assert.equal(task.comments[3].comment,'Finished.');
  updateTask(tasks,'A',{status:'complete',priority:'high',title:'Renamed'});
  assert.equal(task.comments.length,4,'Unchanged status and priority must not create duplicates');
});
test('comments form a persistent chain independently of task changes and retain legacy notes',()=>{
  const task=make('A'),tasks=[task];
  task.comments.push({status:'new',comment:'A legacy note.',at:'2026-10-31T10:00:00Z'});
  addTaskComment(tasks,'A','First reply.','2026-10-31T11:00:00Z');
  addTaskComment(tasks,'A','Second reply.','2026-10-31T12:00:00Z');
  addTaskComment(tasks,'A','   ');
  assert.deepEqual(task.comments.map(comment=>comment.comment),['A legacy note.','First reply.','Second reply.']);
  const loaded=loadTasks({getItem:()=>JSON.stringify(tasks)},'2026-10-31');
  assert.deepEqual(loaded.tasks[0].comments,task.comments);
});
test('dropping into complete and back into open changes status and logs each transition once',()=>{
  const task=make('A'),tasks=[task,make('done','2026-10-31',0,'complete')];
  moveTask(tasks,'A','2026-10-31','done','complete');
  assert.equal(task.status,'complete');assert.equal(task.comments.length,1);
  assert.deepEqual(sortTasks(tasks).map(task=>task.id),['A','done']);
  moveTask(tasks,'A','2026-11-01',null,'complete');assert.equal(task.comments.length,1);
  moveTask(tasks,'A','2026-11-01',null,'open');
  assert.equal(task.status,'new');assert.equal(task.comments.length,2);
  assert.equal(task.comments[1].comment,'Status changed from Complete to New.');
});
test('task creation accepts optional comments and records initial status and priority choices',()=>{
  const tasks=[];
  const task=createTask(tasks,{title:'New task',description:'',date:'2026-10-31',hue:120,status:'progress',priority:'high'});
  assert.deepEqual(task.comments.map(comment=>comment.kind),['status','priority']);
  assert.ok(validateTask(task));
  const before=JSON.stringify(tasks);
  assert.throws(()=>updateTask(tasks,task.id,{title:' ',priority:'low'}),/title/);
  assert.equal(JSON.stringify(tasks),before,'Invalid edits must not modify task fields or history');
  assert.throws(()=>createTask(tasks,{title:'',date:'2026-10-31',hue:120}),/title/);
  assert.equal(tasks.length,1);
});
test('past unfinished tasks are missed while complete and canceled tasks are not',()=>{
  assert.equal(isMissed(make('a','2026-10-30'), '2026-10-31'),true);
  assert.equal(isMissed(make('a','2026-10-31'), '2026-10-31'),false);
  assert.equal(isMissed(make('a','2026-10-30',0,'complete'),'2026-10-31'),false);
  assert.equal(isMissed(make('a','2026-10-30',0,'canceled'),'2026-10-31'),false);
});
test('saved empty planners stay empty and malformed data degrades to valid samples',()=>{
  assert.deepEqual(loadTasks({getItem:()=> '[]'},'2026-10-31').tasks,[]);
  const invalid=loadTasks({getItem:()=> '{broken'},'2026-10-31');assert.equal(invalid.warning,true);
  assert.ok(invalid.tasks.every(validateTask));
  assert.ok(seedTasks('2026-12-31').every(validateTask));
});
test('saved tasks keep their exact colors even when the same day has duplicate hues',()=>{
  const tasks=[make('A'),make('B'),make('C')];
  const loaded=loadTasks({getItem:()=>JSON.stringify(tasks)},'2026-10-31');
  assert.deepEqual(loaded.tasks,tasks);
  assert.equal(loaded.warning,false);
});
test('moving, reordering, date edits and status or priority changes never recolor any task',()=>{
  const tasks=[make('A'),make('B','2026-11-01'),make('C','2026-11-01',1)];
  const colors=()=>Object.fromEntries(tasks.map(task=>[task.id,task.hue]));
  const original=colors();
  moveTask(tasks,'A','2026-11-01','B');assert.deepEqual(colors(),original);
  moveTask(tasks,'A','2026-11-01',null,'complete');assert.deepEqual(colors(),original);
  moveTask(tasks,'A','2026-11-01','C','open');assert.deepEqual(colors(),original);
  updateTask(tasks,'A',{date:'2026-11-02',priority:'high'});assert.deepEqual(colors(),original);
  updateTask(tasks,'A',{status:'canceled'});assert.deepEqual(colors(),original);
});
test('creating tasks allows matching random colors without changing existing tasks',t=>{
  t.mock.method(Math,'random',()=>0.4);
  const tasks=[{...make('existing'),hue:144}];
  for(let i=0;i<12;i++)createTask(tasks,{title:`Task ${i}`,description:'',date:'2026-10-31'});
  assert.ok(tasks.every(task=>task.hue===144));
  assert.ok(tasks.every(validateTask));
});
test('explicit color changes update only the chosen task and survive reload',()=>{
  const tasks=[make('A'),make('B')];
  updateTask(tasks,'A',{hue:141});
  assert.deepEqual(tasks.map(task=>task.hue),[141,140]);
  const loaded=loadTasks({getItem:()=>JSON.stringify(tasks)},'2026-10-31');
  assert.deepEqual(loaded.tasks.map(task=>task.hue),[141,140]);
  for(const previous of [0,140,359,143.5]){
    const next=randomHue(previous);assert.ok(Number.isInteger(next)&&next>=0&&next<360);assert.notEqual(next,previous);
  }
});
test('automatic retro colors prefer an unused visible color on the chosen day',()=>{
  const tasks=TASK_COLOR_HUES.slice(0,-1).map((hue,i)=>({...make(String(i)),hue:hue+.01,color:TASK_PALETTE[i],status:i%2?'complete':'new'}));
  const snapshot=structuredClone(tasks),hue=generateDayTaskHue(tasks,'2026-10-31');
  assert.equal(classicTaskColors(hue).background,classicTaskColors(TASK_COLOR_HUES.at(-1)).background);
  assert.deepEqual(tasks,snapshot,'Choosing a color never recolors existing tasks, including completed ones');
});
test('when all retro colors are used, color generation falls back to random palette choices',t=>{
  const tasks=TASK_COLOR_HUES.map((hue,i)=>({...make(String(i)),hue,color:TASK_PALETTE[i]}));
  t.mock.method(Math,'random',()=>0);assert.equal(generateDayTaskHue(tasks,'2026-10-31'),TASK_COLOR_HUES[0]);
  t.mock.method(Math,'random',()=>0.999);assert.equal(generateDayTaskHue(tasks,'2026-10-31'),TASK_COLOR_HUES.at(-1));
});
test('tasks on another day do not reserve colors',t=>{
  t.mock.method(Math,'random',()=>0);
  const tasks=[{...make('other','2026-11-01'),hue:0}];
  assert.equal(generateDayTaskHue(tasks,'2026-10-31'),TASK_COLOR_HUES[0]);
});
test('regeneration avoids the previous visible color and prefers unused colors before random fallback',t=>{
  t.mock.method(Math,'random',()=>0);
  const tasks=[{...make('edit'),hue:TASK_COLOR_HUES[0],color:TASK_PALETTE[0]},{...make('other'),hue:TASK_COLOR_HUES[1],color:TASK_PALETTE[1]}];
  assert.equal(generateDayTaskHue(tasks,'2026-10-31',{excludeTaskId:'edit',previousHue:TASK_COLOR_HUES[0]}),TASK_COLOR_HUES[2]);
  const full=TASK_COLOR_HUES.map((hue,i)=>({...make(String(i)),hue,color:TASK_PALETTE[i]}));
  const next=generateDayTaskHue(full,'2026-10-31',{previousHue:TASK_COLOR_HUES[0]});
  assert.notEqual(classicTaskColors(next).background,classicTaskColors(TASK_COLOR_HUES[0]).background);
});
test('8-bit task colors are distinct RGB332 shades visible on white with readable button symbols',()=>{
  const redGreen=new Set(Array.from({length:8},(_,i)=>Math.round(i*255/7))),blue=new Set([0,85,170,255]),seen=new Set();
  const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
  assert.equal(TASK_COLOR_HUES.length,32);assert.equal(new Set(TASK_PALETTE).size,32);
  for(const hue of TASK_COLOR_HUES){
    const color=classicTaskColors(hue),[r,g,b]=color.background.slice(1).match(/../g).map(value=>parseInt(value,16));
    assert.ok(redGreen.has(r)&&redGreen.has(g)&&blue.has(b));assert.equal(seen.has(color.background),false);seen.add(color.background);
    const luminance=.2126*linear(r/255)+.7152*linear(g/255)+.0722*linear(b/255);
    assert.ok(luminance>=.16,'Exclude the previous dark shades');
    assert.ok(1.05/(luminance+.05)>=1.4,'Keep brighter task bands visible on white');
    const inkContrast=color.ink==='#000'?(luminance+.05)/.05:1.05/(luminance+.05);
    assert.ok(inkContrast>=4.5,'Regenerate symbol contrasts with its color button');
    assert.equal(color.completed,`hsl(from ${color.background} h s calc(l + (100 - l) * .7))`);
  }
});
test('legacy colors are restored and frozen independently of the new palette',()=>{
  const legacy=[{...make('original'),hue:140},{...make('expanded'),hue:360/117*.5}];
  const snapshot=structuredClone(legacy),pinned=withStableTaskColors(legacy);
  assert.deepEqual(pinned.map(task=>task.color),['#66ff66','#920000']);
  assert.deepEqual(legacy,snapshot,'Pinning legacy colors does not mutate the downloaded document');
  assert.deepEqual(withStableTaskColors(pinned),pinned,'Migration is idempotent');
  for(const hue of TASK_COLOR_HUES)assert.equal(classicTaskColors(hue,pinned[0].color).background,'#66ff66','Saved color overrides palette slot');
});
test('explicit colors survive moves, edits, reloads and validation',()=>{
  const tasks=[{...make('A'),color:'#ffcc00'},make('B','2026-11-01')];
  moveTask(tasks,'A','2026-11-01');updateTask(tasks,'A',{title:'Updated',status:'complete',hue:0});
  assert.equal(getTaskColor(tasks[0]),'#ffcc00');
  const loaded=loadTasks({getItem:()=>JSON.stringify(tasks)},'2026-10-31');assert.equal(getTaskColor(loaded.tasks[0]),'#ffcc00');
  const snapshot=structuredClone(tasks);
  assert.throws(()=>updateTask(tasks,'A',{color:'red;display:none'}),/color/);assert.deepEqual(tasks,snapshot);
  assert.equal(validateTask({...tasks[0],color:'#bad'}),false);
});
