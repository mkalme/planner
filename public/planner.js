export const STORAGE_KEY = 'still-planner-v1';
export const STATUSES = {new:'New',progress:'In progress',complete:'Complete',canceled:'Canceled'};
export const PRIORITIES = {low:'Low',normal:'Normal',high:'High'};
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const fromKey = key => { const [y,m,d]=key.split('-').map(Number); return new Date(y,m-1,d,12); };
export function addDays(key, count) { const d=fromKey(key); d.setDate(d.getDate()+count); return dateKey(d); }
export function weekStart(key) { const d=fromKey(key); return addDays(key,-((d.getDay()+6)%7)); }
export function monthDays(year, month) {
  const first=dateKey(new Date(year,month,1,12));
  const start=weekStart(first);
  const count=Math.ceil((((fromKey(first).getDay()+6)%7)+new Date(year,month+1,0).getDate())/7)*7;
  return Array.from({length:count},(_,i)=>addDays(start,i));
}
export function shiftPeriod(key, view, direction) {
  if(view==='day') return addDays(key,direction);
  if(view==='week') return addDays(key,7*direction);
  const d=fromKey(key), day=d.getDate(); d.setDate(1);
  if(view==='year') d.setFullYear(d.getFullYear()+direction); else d.setMonth(d.getMonth()+direction);
  d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
  return dateKey(d);
}
export function randomHue(previousHue=null) {
  const exclude=Number.isInteger(previousHue)&&previousHue>=0&&previousHue<360;
  const hue=Math.floor(Math.random()*(exclude?359:360));
  return exclude&&hue>=previousHue?hue+1:hue;
}
export function uid() { return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export const isMissed = (task,today) => task.date<today && !['complete','canceled'].includes(task.status);
export function sortTasks(tasks) {
  return [...tasks].sort((a,b)=>(a.status==='complete'?0:1)-(b.status==='complete'?0:1)||a.order-b.order||a.id.localeCompare(b.id));
}
export function seedTasks(today) {
  const start=weekStart(today), tasks=[];
  const add=(date,title,description,status='new',priority='normal',hue=140)=>{
    tasks.push({id:uid(),date,title,description,status,priority,hue,order:tasks.filter(t=>t.date===date).length,comments:status==='new'?[]:[{status,comment:status==='complete'?'Done. A good way to start the day.':status==='progress'?'Made a start. Picking this up again later.':'Plans changed; letting this one go.',at:new Date().toISOString()}]});
  };
  [['Plan the week','Pick a few things that matter.',135],['Read a chapter','A little space for a good book.',218],['Tidy the workspace','Clear the desk. Clear the mind.',35],['Sort the photos','Keep the ones worth keeping.',287],['Take a long walk','A familiar route, a slower pace.',150],['Pick up groceries','Something fresh for the weekend.',30],['Make room for nothing','Leave a little of the day unplanned.',215]].forEach(([title,desc,hue],i)=>{
    const date=addDays(start,i); if(date===today) return;
    add(date,title,desc,date<today?(i%2===0?'complete':'new'):'new','normal',hue);
    if(i===1||i===3) add(date,'Work on the side project','One small step is enough.',date<today?'progress':'new','high',235);
  });
  add(today,'A slow start','Coffee, a clear desk, and a little quiet.','complete','low',30);
  add(today,'Make a plan for today','A few things. In a sensible order.','complete','normal',130);
  add(today,'Work on the side project','Give the first idea a little room to grow.','progress','high',143);
  add(today,'Get outside for a while','Take the long way. Leave the headphones.','new','normal',35);
  add(today,'Read a few pages','Pick up where you left off.','new','low',216);
  add(today,'Catch up with a friend','Send that message you’ve been meaning to.','new','normal',295);
  add(addDays(today,-1),'Finish the reading list','A few recommendations to come back to.','new','low',215);
  add(addDays(today,3),'Book a small weekend trip','Find somewhere with a good walking trail.','new','normal',28);
  add(addDays(today,9),'Review the month','What felt good? What can wait?','new','normal',142);
  return tasks;
}
export function validateTask(task) {
  return task && typeof task.id==='string' && typeof task.title==='string' && typeof task.description==='string' && /^\d{4}-\d{2}-\d{2}$/.test(task.date) && dateKey(fromKey(task.date))===task.date && Object.hasOwn(STATUSES,task.status) && Object.hasOwn(PRIORITIES,task.priority) && Number.isFinite(task.hue) && Number.isFinite(task.order) && Array.isArray(task.comments) && task.comments.every(c=>c && Object.hasOwn(STATUSES,c.status) && typeof c.comment==='string' && typeof c.at==='string' && (!c.kind||['status','priority','comment'].includes(c.kind)));
}
export function loadTasks(storage,today) {
  try {
    const raw=storage.getItem(STORAGE_KEY);
    if(raw!==null) { const data=JSON.parse(raw); if(Array.isArray(data)&&data.every(validateTask)) return {tasks:data,warning:false}; return {tasks:seedTasks(today),warning:true}; }
  } catch { return {tasks:seedTasks(today),warning:true}; }
  return {tasks:seedTasks(today),warning:false,fresh:true};
}
export function moveTask(tasks,id,date,beforeId=null,section=null) {
  const task=tasks.find(t=>t.id===id); if(!task) return false;
  const before=tasks.find(t=>t.id===beforeId && t.date===date);
  if(before?.id===id) return false;
  const oldDate=task.date;
  if(section==='complete'&&task.status!=='complete')updateTask(tasks,id,{status:'complete'});
  if(section==='open'&&task.status==='complete')updateTask(tasks,id,{status:'new'});
  const sameGroup=t=>(t.status==='complete')===(task.status==='complete');
  const group=sortTasks(tasks.filter(t=>t.date===date&&t.id!==id&&sameGroup(t)));
  const index=before&&sameGroup(before)?group.findIndex(t=>t.id===before.id):-1;
  group.splice(index<0?group.length:index,0,task); task.date=date;
  group.forEach((t,i)=>t.order=i);
  if(oldDate!==date) {
    sortTasks(tasks.filter(t=>t.date===oldDate&&t.id!==id)).forEach((t,i)=>t.order=i);
  }
  return true;
}
export function addTaskComment(tasks,id,comment,now=new Date().toISOString()) {
  const task=tasks.find(task=>task.id===id);
  if(!task)throw new Error('Task not found.');
  if(comment?.trim())task.comments.push({kind:'comment',status:task.status,comment:comment.trim(),at:now});
  return task;
}
export function createTask(tasks,fields,comment='',now=new Date().toISOString()) {
  const task={id:uid(),title:'',description:'',date:fields.date,status:'new',priority:'normal',hue:fields.hue??randomHue(),order:0,comments:[]};
  updateTask([task],task.id,fields,comment,now);
  task.order=Math.max(-1,...tasks.filter(other=>other.date===task.date&&(other.status==='complete')===(task.status==='complete')).map(other=>other.order))+1;
  tasks.push(task);
  return task;
}
export function updateTask(tasks,id,fields,comment='',now=new Date().toISOString()) {
  const task=tasks.find(t=>t.id===id);
  if(!task) throw new Error('Task not found.');
  const next=Object.fromEntries(['title','description','date','status','priority','hue'].map(key=>[key,fields[key]??task[key]]));
  if(!next.title?.trim())throw new Error('Give your task a title.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(next.date)||dateKey(fromKey(next.date))!==next.date)throw new Error('Choose a valid day.');
  if(!Object.hasOwn(STATUSES,next.status)||!Object.hasOwn(PRIORITIES,next.priority))throw new Error('Choose a valid status and priority.');
  if(!Number.isFinite(next.hue))throw new Error('Choose a valid color.');
  const oldDate=task.date,oldStatus=task.status,oldPriority=task.priority;
  Object.assign(task,next,{title:next.title.trim()});
  if(oldStatus!==task.status)task.comments.push({kind:'status',status:task.status,from:oldStatus,to:task.status,comment:`Status changed from ${STATUSES[oldStatus]} to ${STATUSES[task.status]}.`,at:now});
  if(oldPriority!==task.priority)task.comments.push({kind:'priority',status:task.status,from:oldPriority,to:task.priority,comment:`Priority changed from ${PRIORITIES[oldPriority]} to ${PRIORITIES[task.priority]}.`,at:now});
  addTaskComment(tasks,id,comment,now);
  if(oldDate!==task.date||(oldStatus==='complete')!==(task.status==='complete')) {task.order=Math.max(-1,...tasks.filter(t=>t.date===task.date&&t.id!==id&&(t.status==='complete')===(task.status==='complete')).map(t=>t.order))+1;}
  return task;
}
