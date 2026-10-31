import {startCloudPlanner} from '../cloud-ui.js';
import {installTaskDrag} from '../drag-preview.js';
import {classicTaskColors,generateDayTaskHue} from '../retro/1990s-colors.js';
import {latvianDayInfo} from '../latvian-holidays.js';
import {STORAGE_KEY,STATUSES,PRIORITIES,dateKey,fromKey,addDays,weekStart,monthDays,shiftPeriod,createTask,addTaskComment,isMissed,sortTasks,loadTasks,moveTask,updateTask,activityText} from './planner.js';

const root=document.querySelector('#app');
const headerObserver=new ResizeObserver(positionSidebarEdge);
const studyTitle='Mans plānotājs';
let today=dateKey(new Date()), selected=today;
let view='week';
let tasks=[], editing=null, draftHue=140, draftColorChosen=false, dragId=null, toastTimer, quickTrigger=null, editorCommentsChanged=false;
let cloud;
const expandedMonthDates=new Set();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(key,options)=>fromKey(key).toLocaleDateString('lv-LV',options);
const weekdays=['Pr','Ot','Tr','Ce','Pk','Se','Sv'];
const calendarClass=key=>{const day=latvianDayInfo(key);return `${day.nonWorking?'is-nonworking':''} ${day.holiday?'is-holiday':''}`;};
const calendarLabel=key=>{const day=latvianDayInfo(key);return day.holiday||(day.isWeekend?'Brīvdiena':'Darbdiena');};
const icon=(name)=>{
  const paths={plus:'M12 5v14M5 12h14',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',grip:'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',arrow:'M7 17 17 7M7 7h10v10',up:'m7 14 5-5 5 5',down:'m7 10 5 5 5-5',board:'M4 4h6v16H4zM14 4h6v10h-6z',list:'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',calendar:'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',moon:'M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',shuffle:'m4 6 4 0 8 12h4M16 6h4l-4 0L8 18H4M17 3l3 3-3 3M17 15l3 3-3 3'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${paths[name]?`<path d="${paths[name]}"/>`:''}</svg>`;
};
const button=(action,label,svg,extra='')=>`<button type="button" class="icon-btn" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${icon(svg)}</button>`;
const onDate=key=>sortTasks(tasks.filter(t=>t.date===key));
const activeOnDate=key=>tasks.filter(t=>t.date===key&&!['complete','canceled'].includes(t.status)).length;
function save(){cloud.save(tasks);return false;}
function toast(message) {
  const node=document.querySelector('#toast'); node.textContent=message;node.classList.add('shown');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('shown'),5000);
}
function dateTitle() {
  if(view==='day') return fmt(selected,{weekday:'long',day:'numeric',month:'long'});
  if(view==='month') return fmt(selected,{month:'long',year:'numeric'});
  if(view==='year') return String(fromKey(selected).getFullYear());
  const start=weekStart(selected), end=addDays(start,6);
  return fromKey(start).getMonth()===fromKey(end).getMonth()?`${fromKey(start).getDate()}.–${fromKey(end).getDate()}. ${fmt(end,{month:'long'})} ${fromKey(end).getFullYear()}`:`${fmt(start,{day:'numeric',month:'short'})} – ${fmt(end,{day:'numeric',month:'short'})} ${fromKey(end).getFullYear()}`;
}
function miniCalendar(key,yearMode=false) {
  const date=fromKey(key),m=date.getMonth(),year=date.getFullYear();
  const days=monthDays(year,m);
  return `<div class="mini-calendar ${yearMode?'year-mini':''}"><div class="mini-heading">${yearMode?`<button class="month-name" data-action="month" data-date="${year}-${String(m+1).padStart(2,'0')}-01">${fmt(key,{month:'long'})} ${icon('arrow')}</button>`:`<span>${fmt(key,{month:'long',year:'numeric'})}</span><div>${button('mini-prev','Iepriekšējais mēnesis','left')}${button('mini-next','Nākamais mēnesis','right')}</div>`}</div><div class="mini-grid">${weekdays.map(w=>`<span class="mini-weekday">${w}</span>`).join('')}${days.map(k=>{
    if(fromKey(k).getMonth()!==m)return '<span class="mini-blank"></span>';
    const dayTasks=onDate(k),complete=dayTasks.filter(t=>t.status==='complete').length;
    return `<button type="button" class="mini-date ${calendarClass(k)} ${k===today?'is-today':''} ${k===selected?'is-selected':''} ${dayTasks.length?'has-tasks':''}" data-action="${yearMode?'select-year-day':'day'}" data-date="${k}" data-drop-date="${k}" title="${esc(fmt(k,{day:'numeric',month:'long'}))}: ${esc(calendarLabel(k))}; uzdevumi: ${dayTasks.length}; pabeigti: ${complete}" ${k===today?'aria-current="date"':''}><span>${fromKey(k).getDate()}</span><i class="mini-dot ${complete===dayTasks.length?'all-complete':''}"></i></button>`;
  }).join('')}</div></div>`;
}
function sidebar() {
  const daily=onDate(today),done=daily.filter(t=>t.status==='complete').length;
  return `<aside class="sidebar"><a href="./" class="wordmark" aria-label="Uzdevumu plānotājs"><span class="brand-mark">st.</span> still</a>${miniCalendar(selected)}<div class="sidebar-bottom"><div class="progress-label"><span>Šodien pabeigti</span><b>${done}<span> / ${daily.length}</span></b></div><div class="progress-line"><i style="width:${daily.length?done/daily.length*100:0}%"></i></div></div></aside>`;
}
function render() {
  const accountBar=document.querySelector('#account');
  const privacy=document.querySelector('#privacy');
  root.innerHTML=`<div class="app-shell">${sidebar()}<main class="planner-main"><header class="planner-header"><h1>${studyTitle}</h1><div class="header-actions"><button class="primary-btn" data-action="new">${icon('plus')} Jauns uzdevums</button></div></header><div class="planner-toolbar"><div class="date-controls"><h2>${dateTitle()}</h2><div class="date-arrows">${button('prev','Iepriekšējais periods','left')}${button('next','Nākamais periods','right')}</div><button class="today-btn" data-action="today">Šodien</button></div><nav class="view-switch" aria-label="Kalendāra skats">${['day','week','month','year'].map(v=>`<button data-action="view" data-view="${v}" ${view===v?'aria-current="true"':''}>${({day:'Diena',week:'Nedēļa',month:'Mēnesis',year:'Gads'})[v]}</button>`).join('')}</nav></div><div id="planner-content" class="view-${view}">${renderView()}</div></main></div><dialog id="task-dialog" aria-labelledby="dialog-heading"></dialog><div id="quick-status" class="quick-status" popover="auto" role="menu" aria-label="Uzdevuma statuss"></div><div id="toast" role="status" aria-live="polite"></div>`;
  if(accountBar)root.querySelector('.header-actions').prepend(accountBar);
  if(privacy)root.querySelector('.sidebar').append(privacy);
  const content=root.querySelector('#planner-content');content.tabIndex=0;content.setAttribute('aria-label','Kalendāra uzdevumi');
  headerObserver.disconnect();headerObserver.observe(root.querySelector('.planner-header'));
  requestAnimationFrame(positionSidebarEdge);
}
function positionSidebarEdge(){
  const sidebar=root.querySelector('.sidebar');
  if(sidebar)sidebar.style.setProperty('--header-height',`${root.querySelector('.planner-header').getBoundingClientRect().height}px`);
}
window.addEventListener('resize',positionSidebarEdge);
function taskColorStyle(hue){
  const base=`--task-hue:${hue}`;
  if(document.documentElement.dataset.era!=='1990s')return base;
  const colors=classicTaskColors(hue);
  return `${base};--classic-color:${colors.background};--classic-complete:${colors.completed};--classic-ink:${colors.ink}`;
}
function taskCard(task,compact=false) {
  const past=isMissed(task,today),muted=task.status==='complete'||task.status==='canceled'||past;
  const status=STATUSES[task.status];
  return `<article class="task-card ${compact?'compact':''} ${muted?'is-muted':''} ${past?'is-missed':''} ${task.status==='complete'?'is-complete':''} ${task.status==='canceled'?'is-canceled':''}" style="${taskColorStyle(task.hue)}" draggable="true" data-task-id="${esc(task.id)}" data-task-date="${task.date}" aria-label="${esc(task.title)}, ${status}${past?', nepaveikts':''}">
    <div class="task-leading"><button class="task-state state-${task.status}" data-action="status" data-id="${esc(task.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Mainīt statusu: ${esc(task.title)}" title="${status} — mainīt statusu">${task.status==='complete'?icon('check'):task.status==='canceled'?icon('close'):task.status==='progress'?'<span></span>':''}</button></div>
    <button class="task-content" data-action="edit" data-id="${esc(task.id)}"><span class="task-title">${esc(task.title)}</span>${!compact?`<span class="task-description">${esc(task.description)}</span>`:''}<span class="task-meta">${task.priority==='high'?'<span class="priority-high">Augsta</span>':task.priority==='low'?'<span class="priority-low">Zema</span>':'<span>Parasta</span>'}<span class="task-status">${past?'Nepaveikts':status}</span>${task.comments.length?`<span class="comment-count">Ieraksti: ${task.comments.length}</span>`:''}</span></button>
    <div class="task-order">${button('order-up','Pārvietot augstāk','up',`data-id="${esc(task.id)}"`)}${button('order-down','Pārvietot zemāk','down',`data-id="${esc(task.id)}"`)}<span class="drag-handle" title="Vilkt, lai pārvietotu">${icon('grip')}</span></div>
  </article>`;
}
function taskStack(key,compact=false,limit=Infinity) {
  const items=onDate(key),completed=items.filter(task=>task.status==='complete'),rest=items.filter(task=>task.status!=='complete');
  const visible=items.slice(0,limit),visibleDone=visible.filter(task=>task.status==='complete'),visibleRest=visible.filter(task=>task.status!=='complete');
  return `<div class="completed-stack ${completed.length?'':'empty-completed'}" data-drop-date="${key}" data-drop-section="complete" data-compact="${compact}" aria-label="Pabeigtie uzdevumi: ${key}">
    <div class="stack-caption ${compact?'compact-caption':''}">${icon('check')} <span>Pabeigtie</span></div>
    ${visibleDone.map(task=>taskCard(task,compact)).join('')}<div class="complete-drop-hint">Nometiet šeit, lai pabeigtu</div>
  </div>
  <div class="task-divider ${completed.length&&rest.length?'':'empty-divider'}"><span>DARĀMIE</span></div>
  <div class="open-stack" data-drop-date="${key}" data-drop-section="open" data-compact="${compact}" aria-label="Darāmie uzdevumi: ${key}">${visibleRest.map(task=>taskCard(task,compact)).join('')}</div>
  ${items.length>limit?`<button class="more-tasks" data-action="day" data-date="${key}">Vēl ${items.length-limit}</button>`:''}
  ${!items.length?`<div class="empty-day"><span>Nav uzdevumu</span><button data-action="new" data-date="${key}">${icon('plus')} Pievienot uzdevumu</button></div>`:''}`;
}

function weekStrip() {
  const start=weekStart(selected);
  return `<div class="week-strip" aria-label="Izvēlieties dienu vai nometiet uzdevumu">${Array.from({length:7},(_,i)=>{
    const key=addDays(start,i);return `<button class="strip-day ${calendarClass(key)} ${key===selected?'is-selected':''} ${key===today?'is-today':''}" data-action="day" data-date="${key}" data-drop-date="${key}" title="${esc(calendarLabel(key))}"><span>${weekdays[i]}</span><b>${fromKey(key).getDate()}</b><small>Vēl: ${activeOnDate(key)}</small></button>`;
  }).join('')}</div>`;
}
function renderView() {
  if(view==='day') return `${weekStrip()}<div class="day-layout"><section class="daily-list ${calendarClass(selected)}" data-drop-date="${selected}" title="${esc(calendarLabel(selected))}" aria-label="Uzdevumi: ${esc(fmt(selected,{day:'numeric',month:'long'}))}; ${esc(calendarLabel(selected))}"><div class="daily-heading"><div><span class="eyebrow">${selected===today?'ŠODIEN':fmt(selected,{weekday:'long'}).toUpperCase()}</span><h3>${selected===today?'Uzdevumi':fmt(selected,{day:'numeric',month:'long'})}</h3></div><span>Vēl jāpaveic: ${activeOnDate(selected)}</span></div>${taskStack(selected)}<button class="add-task-line" data-action="new" data-date="${selected}">${icon('plus')} Pievienot dienas uzdevumu</button></section></div>`;
  if(view==='week') {
    const start=weekStart(selected);
    return `<div class="week-grid">${Array.from({length:7},(_,i)=>{
      const key=addDays(start,i);return `<section class="day-column ${calendarClass(key)} ${key===today?'is-today':''} ${key<today?'is-past':''}" data-drop-date="${key}" aria-label="${esc(fmt(key,{weekday:'long',day:'numeric',month:'long'}))}; ${esc(calendarLabel(key))}"><header class="column-heading" title="${esc(calendarLabel(key))}"><button data-action="day" data-date="${key}"><span>${weekdays[i]}</span><b>${fromKey(key).getDate()}</b></button>${key===today?'<span class="today-marker">ŠODIEN</span>':`<span class="column-count">${onDate(key).length}</span>`}</header><div class="column-tasks">${taskStack(key,true)}</div><button class="column-add" data-action="new" data-date="${key}" aria-label="Pievienot uzdevumu: ${esc(fmt(key,{weekday:'long'}))}">${icon('plus')}<span>Pievienot uzdevumu</span></button></section>`;
    }).join('')}</div>`;
  }
  if(view==='month') {
    const date=fromKey(selected),m=date.getMonth();
    return `<div class="month-weekdays">${weekdays.map(w=>`<span>${w}</span>`).join('')}</div><div class="month-grid">${monthDays(date.getFullYear(),m).map(key=>`<section class="month-cell ${calendarClass(key)} ${fromKey(key).getMonth()!==m?'outside-month':''} ${key===today?'is-today':''}" data-drop-date="${key}" title="${esc(calendarLabel(key))}" aria-label="${esc(fmt(key,{day:'numeric',month:'long'}))}; ${esc(calendarLabel(key))}"><header><button class="month-day-number" data-action="day" data-date="${key}" ${key===today?'aria-current="date"':''}>${fromKey(key).getDate()}${key===today?'<small>Šodien</small>':''}</button><button class="month-add icon-btn" data-action="new" data-date="${key}" title="Pievienot uzdevumu" aria-label="Pievienot uzdevumu: ${esc(fmt(key,{day:'numeric',month:'long'}))}">${icon('plus')}</button></header><div class="month-tasks">${taskStack(key,true,expandedMonthDates.has(key)?Infinity:3)}</div></section>`).join('')}</div>`;
  }
  const year=fromKey(selected).getFullYear();
  return `<div class="year-layout"><div class="year-grid">${Array.from({length:12},(_,m)=>miniCalendar(dateKey(new Date(year,m,1,12)),true)).join('')}</div><aside class="year-focus" data-drop-date="${selected}"><div class="eyebrow">IZVĒLĒTĀ DIENA</div><h3>${fmt(selected,{day:'numeric',month:'long'})}</h3><p class="year-help">Izvēlieties datumu, lai apskatītu uzdevumus.<br>Uzdevumu var pārvilkt uz citu dienu.</p>${taskStack(selected,true)}<button class="add-task-line" data-action="new" data-date="${selected}">${icon('plus')} Pievienot uzdevumu</button></aside></div>`;
}
function activityList(task) {
  if(!task?.comments.length)return '<p class="no-activity">Vēl nav ierakstu.</p>';
  return task.comments.map(entry=>{
    const automatic=entry.kind==='status'||entry.kind==='priority';
    const date=new Date(entry.at);
    const time=Number.isNaN(date.getTime())?'':date.toLocaleString('lv-LV',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const label=automatic?(entry.kind==='status'?'Statuss':'Prioritāte'):'Jūs';
    return `<article class="activity-entry ${automatic?'automatic-entry':'user-entry'}"><div><b>${label}</b><time datetime="${esc(entry.at)}">${esc(time)}</time></div><p>${esc(activityText(entry))}</p></article>`;
  }).join('');
}
function scrollActivity() {
  const list=document.querySelector('#activity-list');if(list)list.scrollTop=list.scrollHeight;
}
function openEditor(id=null,key=selected) {
  closeQuickStatus();
  editing=id;editorCommentsChanged=false;const task=id?tasks.find(task=>task.id===id):null;
  if(id&&!task)return;
  draftHue=task?.hue??generateDayTaskHue(tasks,key);draftColorChosen=false;
  const dialog=document.querySelector('#task-dialog');
  dialog.innerHTML=`<form id="task-form">
    <header class="dialog-header"><h2 id="dialog-heading">${task?'Rediģēt uzdevumu':'Jauns uzdevums'}</h2><div class="dialog-tools"><button class="task-color-button" data-action="color" type="button" style="${taskColorStyle(draftHue)}" title="Ģenerēt citu uzdevuma krāsu" aria-label="Ģenerēt citu uzdevuma krāsu"><span aria-hidden="true">↻</span></button>${button('close-dialog','Aizvērt uzdevumu','close')}</div></header>
    <div class="field"><label for="task-title">Nosaukums</label><input id="task-title" name="title" placeholder="Uzdevuma nosaukums" value="${esc(task?.title||'')}" maxlength="120" required autocomplete="off"></div>
    <div class="field"><label for="task-description">Apraksts <span>nav obligāti</span></label><textarea id="task-description" name="description" placeholder="Papildu informācija" rows="5" maxlength="3000">${esc(task?.description||'')}</textarea></div>
    <div class="task-options"><div class="field"><label for="task-date">Datums</label><input id="task-date" name="date" type="date" lang="lv" value="${task?.date||key}" min="1900-01-01" max="9999-12-31" required></div><div class="field"><label for="task-status">Statuss</label><select id="task-status" name="status">${Object.entries(STATUSES).map(([value,label])=>`<option value="${value}" ${(task?.status||'new')===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label for="task-priority">Prioritāte</label><select id="task-priority" name="priority">${Object.entries(PRIORITIES).map(([value,label])=>`<option value="${value}" ${(task?.priority||'normal')===value?'selected':''}>${label}</option>`).join('')}</select></div></div>
    <section class="task-history"><h3>Vēsture un komentāri <span id="activity-count">${task?.comments.length||0}</span></h3><div id="activity-list" role="log" aria-label="Uzdevuma vēsture un komentāri">${activityList(task)}</div><div class="comment-compose"><textarea id="task-comment" name="comment" rows="1" placeholder="Pievienot komentāru (nav obligāti)" aria-label="Komentārs (nav obligāti)" maxlength="2000"></textarea>${task?'<button type="button" class="secondary-btn" data-action="post-comment">Pievienot</button>':''}</div></section>
    <p id="form-error" role="alert"></p>
    <footer class="dialog-footer">${task?'<button type="button" class="delete-btn" data-action="delete">Dzēst</button>':'<span></span>'}<div><button type="button" class="secondary-btn" data-action="close-dialog">Atcelt</button><button class="primary-btn" type="submit">${task?'Saglabāt':'Pievienot uzdevumu'}</button></div></footer>
  </form>`;
  dialog.showModal();scrollActivity();document.querySelector('#task-title').focus();
}
function closeEditor(refresh=true) {
  const id=editing;document.querySelector('#task-dialog').close();editing=null;
  if(editorCommentsChanged&&refresh){render();root.querySelector(`[data-task-id="${CSS.escape(id)}"] [data-action="edit"]`)?.focus();}
  editorCommentsChanged=false;
}
function closeQuickStatus(restoreFocus=false) {
  const popup=document.querySelector('#quick-status');
  if(popup?.matches(':popover-open'))popup.hidePopover();
  if(quickTrigger){quickTrigger.setAttribute('aria-expanded','false');if(restoreFocus)quickTrigger.focus();}
  quickTrigger=null;
}
function openQuickStatus(id,trigger) {
  closeQuickStatus();
  const task=tasks.find(task=>task.id===id);if(!task)return;
  const popup=document.querySelector('#quick-status');
  popup.innerHTML=`<div class="quick-status-heading">Statuss<span>${esc(task.title)}</span></div>${Object.entries(STATUSES).map(([value,label])=>`<button type="button" role="menuitemradio" aria-checked="${task.status===value}" data-action="quick-status" data-id="${esc(id)}" data-status="${value}"><span class="task-state state-${value}">${value==='complete'?icon('check'):value==='canceled'?icon('close'):value==='progress'?'<span></span>':''}</span><span>${label}</span>${task.status===value?icon('check'):''}</button>`).join('')}`;
  const rect=trigger.getBoundingClientRect();
  popup.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-208))}px`;
  popup.style.top=`${rect.bottom+7}px`;
  popup.showPopover();
  const bounds=popup.getBoundingClientRect();
  if(bounds.bottom>innerHeight-8)popup.style.top=`${Math.max(8,rect.top-bounds.height-7)}px`;
  quickTrigger=trigger;trigger.setAttribute('aria-expanded','true');
  popup.querySelector(`[data-status="${task.status}"]`).focus();
}

root.addEventListener('click',event=>{
  const element=event.target.closest('[data-action]');if(!element)return;
  const action=element.dataset.action,key=element.dataset.date;
  if(action==='new')return openEditor(null,key||selected);
  if(action==='edit')return openEditor(element.dataset.id);
  if(action==='status')return openQuickStatus(element.dataset.id,element);
  if(action==='quick-status'){
    const id=element.dataset.id;updateTask(tasks,id,{status:element.dataset.status});closeQuickStatus();render();
    if(save())toast(`Statuss: ${STATUSES[element.dataset.status]}.`);
    root.querySelector(`[data-task-id="${CSS.escape(id)}"] [data-action="status"]`)?.focus();return;
  }
  if(action==='close-dialog')return closeEditor();
  if(action==='color'){
    draftHue=generateDayTaskHue(tasks,document.querySelector('#task-date').value,{excludeTaskId:editing,previousHue:draftHue});
    draftColorChosen=true;element.style.cssText=taskColorStyle(draftHue);return;
  }
  if(action==='post-comment'){
    const input=document.querySelector('#task-comment');if(!input.value.trim())return input.focus();
    const task=addTaskComment(tasks,editing,input.value);input.value='';editorCommentsChanged=true;
    document.querySelector('#activity-list').innerHTML=activityList(task);document.querySelector('#activity-count').textContent=task.comments.length;
    scrollActivity();save();input.focus();return;
  }
  if(action==='delete'){
    const removed=tasks.find(task=>task.id===editing);if(!window.confirm(`Dzēst uzdevumu “${removed.title}”?`))return;
    tasks=tasks.filter(task=>task.id!==editing);closeEditor(false);render();if(save())toast('Uzdevums izdzēsts.');return;
  }
  if(action==='order-up'||action==='order-down'){
    const task=tasks.find(task=>task.id===element.dataset.id),group=onDate(task.date).filter(other=>(other.status==='complete')===(task.status==='complete'));
    const index=group.findIndex(other=>other.id===task.id),other=index+(action==='order-up'?-1:1);
    if(other<0||other>=group.length)return toast(action==='order-up'?'Uzdevums jau ir pirmais šajā grupā.':'Uzdevums jau ir pēdējais šajā grupā.');
    [group[index],group[other]]=[group[other],group[index]];group.forEach((task,index)=>task.order=index);
    closeQuickStatus();render();if(save())toast('Uzdevumu secība mainīta.');root.querySelector(`[data-task-id="${CSS.escape(task.id)}"] [data-action="${action}"]`)?.focus();return;
  }
  closeQuickStatus();
  if(action==='view')view=element.dataset.view;
  if(action==='day'){selected=key;view='day';}
  if(action==='select-year-day')selected=key;
  if(action==='month'){selected=key;view='month';}
  if(action==='prev'||action==='next')selected=shiftPeriod(selected,view,action==='next'?1:-1);
  if(action==='mini-prev'||action==='mini-next')selected=shiftPeriod(selected,'month',action==='mini-next'?1:-1);
  if(action==='today')selected=today;
  render();
});
root.addEventListener('keydown',event=>{
  const popup=event.target.closest('#quick-status');if(!popup)return;
  const options=[...popup.querySelectorAll('[role="menuitemradio"]')],index=options.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next].focus();
  }
  if(event.key==='Escape'){event.preventDefault();closeQuickStatus(true);}
});
root.addEventListener('invalid',event=>{
  event.target.setCustomValidity(event.target.id==='task-title'?'Ierakstiet uzdevuma nosaukumu.':event.target.id==='task-date'?'Izvēlieties derīgu datumu.':'Aizpildiet šo lauku.');
},true);
root.addEventListener('input',event=>{if(event.target.setCustomValidity)event.target.setCustomValidity('');});
root.addEventListener('change',event=>{
  if(event.target.id==='task-date'&&!editing&&!draftColorChosen&&event.target.validity.valid){
    draftHue=generateDayTaskHue(tasks,event.target.value);
    document.querySelector('.task-color-button').style.cssText=taskColorStyle(draftHue);
  }
});
root.addEventListener('submit',event=>{
  if(event.target.id!=='task-form')return;event.preventDefault();
  const data=new FormData(event.target),fields={title:data.get('title').trim(),description:data.get('description').trim(),date:data.get('date'),priority:data.get('priority'),status:data.get('status'),hue:draftHue};
  try{
    if(editing)updateTask(tasks,editing,fields,data.get('comment'));
    else createTask(tasks,fields,data.get('comment'));
    const wasEditing=!!editing;closeEditor(false);render();if(save())toast(wasEditing?'Izmaiņas saglabātas.':'Uzdevums pievienots.');
  }catch(error){document.querySelector('#form-error').textContent=error.message;}
});

// Overlays leave every task box and calendar row unchanged during a drag.
installTaskDrag({
  root,getTask:id=>tasks.find(task=>task.id===id),getGroup:onDate,renderCard:taskCard,
  onStart:closeQuickStatus,onDragState:id=>{dragId=id;},
  formatDate:date=>fmt(date,{day:'numeric',month:'long'}),
  sectionLabels:{complete:'Pabeigtie',open:'Darāmie'},
  onDrop(intent,id){
    const moved=moveTask(tasks,id,intent.date,intent.beforeId,intent.section);
    if(!intent.container&&(view==='day'||view==='year'))selected=intent.date;
    if(moved){
      if(view==='month')expandedMonthDates.add(intent.date);
      render();if(save())toast(intent.section==='complete'?'Uzdevums pārvietots pie pabeigtajiem.':`Uzdevums pārvietots uz ${fmt(intent.date,{day:'numeric',month:'long'})}.`);
    }
  }
});
root.addEventListener('cancel',event=>{if(event.target.id==='task-dialog'){event.preventDefault();closeEditor();}},true);
root.addEventListener('click',event=>{
  const dialog=event.target;if(dialog.id==='task-dialog'){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeEditor();}
});
window.addEventListener('scroll',()=>closeQuickStatus(),{capture:true,passive:true});
window.addEventListener('resize',()=>closeQuickStatus());
root.addEventListener('toggle',event=>{if(event.target.id==='quick-status'&&event.newState==='closed')quickTrigger?.setAttribute('aria-expanded','false');},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;const newToday=dateKey(new Date());if(newToday!==today){today=newToday;if(!document.querySelector('#task-dialog')?.open&&!dragId){closeQuickStatus();render();}}});
render();
cloud=startCloudPlanner({root,getTasks:()=>tasks,isBusy:()=>!!editing||!!dragId,setTasks:value=>{tasks=value;if(!document.querySelector('#task-dialog')?.open){closeQuickStatus();render();}},notify:toast});
