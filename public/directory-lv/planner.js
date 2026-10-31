import * as model from '../planner.js';
export * from '../planner.js';
export const STORAGE_KEY='still-1990s-directory-compact-planner-v1';
export const STATUSES={new:'Jauns',progress:'Iesākts',complete:'Pabeigts',canceled:'Atcelts'};
export const PRIORITIES={low:'Zema',normal:'Parasta',high:'Augsta'};
const samples=[
  ['Plan the week','Pick a few things that matter.','Saplānot nedēļu','Izvēlēties šīs nedēļas svarīgākos darbus.'],
  ['Read a chapter','A little space for a good book.','Izlasīt grāmatas nodaļu','Turpināt iesākto grāmatu.'],
  ['Tidy the workspace','Clear the desk. Clear the mind.','Sakārtot darba vietu','Sakārtot galdu un nolikt lietas savās vietās.'],
  ['Sort the photos','Keep the ones worth keeping.','Sakārtot fotogrāfijas','Atlasīt un saglabāt labākās fotogrāfijas.'],
  ['Take a long walk','A familiar route, a slower pace.','Doties garākā pastaigā','Izvēlēties pastaigas maršrutu.'],
  ['Pick up groceries','Something fresh for the weekend.','Nopirkt pārtiku','Sagādāt pārtiku nedēļas nogalei.'],
  ['Make room for nothing','Leave a little of the day unplanned.','Atvēlēt laiku atpūtai','Atstāt dienā brīvu laiku.'],
  ['Work on the side project','One small step is enough.','Turpināt personīgo projektu','Paveikt nākamo projekta darbu.'],
  ['A slow start','Coffee, a clear desk, and a little quiet.','Sagatavoties dienai','Sakārtot darba vietu un pārskatīt ieceres.'],
  ['Make a plan for today','A few things. In a sensible order.','Saplānot šodienu','Sakārtot dienas uzdevumus vēlamajā secībā.'],
  ['Work on the side project','Give the first idea a little room to grow.','Turpināt personīgo projektu','Izstrādāt iesākto ideju.'],
  ['Get outside for a while','Take the long way. Leave the headphones.','Iziet pastaigā','Atvēlēt laiku pastaigai svaigā gaisā.'],
  ['Read a few pages','Pick up where you left off.','Izlasīt dažas lappuses','Turpināt lasīšanu no iepriekšējās vietas.'],
  ['Catch up with a friend','Send that message you’ve been meaning to.','Sazināties ar draugu','Uzrakstīt ziņu un sarunāt tikšanos.'],
  ['Finish the reading list','A few recommendations to come back to.','Pabeigt lasāmo grāmatu sarakstu','Papildināt sarakstu ar ieteiktajām grāmatām.'],
  ['Book a small weekend trip','Find somewhere with a good walking trail.','Ieplānot nedēļas nogales braucienu','Atrast galamērķi ar pastaigu taku.'],
  ['Review the month','What felt good? What can wait?','Izvērtēt mēnesi','Pārskatīt paveikto un atlikušos darbus.']
];
const seedNotes={
  'Done. A good way to start the day.':'Uzdevums pabeigts.',
  'Made a start. Picking this up again later.':'Uzdevums iesākts. Turpināšu vēlāk.',
  'Plans changed; letting this one go.':'Plāni mainījušies. Uzdevums atcelts.'
};
const errors={
  'Task not found.':'Uzdevums nav atrasts.',
  'Give your task a title.':'Ierakstiet uzdevuma nosaukumu.',
  'Choose a valid day.':'Izvēlieties derīgu datumu.',
  'Choose a valid status and priority.':'Izvēlieties derīgu statusu un prioritāti.',
  'Choose a valid color.':'Izvēlieties derīgu krāsu.'
};
export function activityText(entry){
  if(entry.kind==='status'&&STATUSES[entry.from]&&STATUSES[entry.to])return `Statuss mainīts no “${STATUSES[entry.from]}” uz “${STATUSES[entry.to]}”.`;
  if(entry.kind==='priority'&&PRIORITIES[entry.from]&&PRIORITIES[entry.to])return `Prioritāte mainīta no “${PRIORITIES[entry.from]}” uz “${PRIORITIES[entry.to]}”.`;
  if(!entry.kind&&seedNotes[entry.comment])return seedNotes[entry.comment];
  return entry.comment;
}
function localized(operation,tasks){
  try{
    const result=operation();
    for(const task of tasks)for(const entry of task.comments)if(entry.kind==='status'||entry.kind==='priority')entry.comment=activityText(entry);
    return result;
  }catch(error){throw new Error(errors[error.message]||'Izmaiņas neizdevās saglabāt.');}
}
export function loadTasks(storage,today){
  const result=model.loadTasks({getItem:()=>storage.getItem(STORAGE_KEY)},today);
  for(const task of result.tasks){
    const sample=samples.find(([title,description])=>task.title===title&&task.description===description);
    if(sample){task.title=sample[2];task.description=sample[3];}
  }
  return result;
}
export function createTask(tasks,...args){return localized(()=>model.createTask(tasks,...args),tasks);}
export function updateTask(tasks,...args){return localized(()=>model.updateTask(tasks,...args),tasks);}
export function moveTask(tasks,...args){return localized(()=>model.moveTask(tasks,...args),tasks);}
export function addTaskComment(tasks,...args){return localized(()=>model.addTaskComment(tasks,...args),tasks);}
