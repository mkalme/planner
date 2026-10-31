// Drag feedback is painted over the calendar. Its task boxes stay unchanged until drop.
export function installTaskDrag({root,getTask,getGroup,renderCard,onStart,onDragState,onDrop,formatDate,sectionLabels={complete:'Complete',open:'Up next'}}){
  let dragId=null,dropIntent=null,originOverlay=null;
  const source=()=>dragId?root.querySelector(`[data-task-id="${CSS.escape(dragId)}"]`):null;
  const sectionOf=task=>task.status==='complete'?'complete':'open';
  const groupFor=(date,section)=>getGroup(date).filter(task=>sectionOf(task)===section);
  function place(node,rect){
    node.style.left=`${rect.left}px`;node.style.top=`${rect.top}px`;node.style.width=`${rect.width}px`;
  }
  function positionOrigin(){
    const card=source();if(!card||!originOverlay)return;
    const rect=card.getBoundingClientRect();place(originOverlay,rect);originOverlay.style.height=`${rect.height}px`;
  }
  function clearPreview(){
    root.querySelectorAll('.drag-placeholder,.drag-date-preview').forEach(node=>node.remove());
    root.querySelectorAll('.drop-target,.overlay-drop-section,.at-origin').forEach(node=>node.classList.remove('drop-target','overlay-drop-section','at-origin'));
    if(originOverlay){originOverlay.hidden=false;positionOrigin();}
    dropIntent=null;
  }
  function endDrag(){
    clearPreview();originOverlay?.remove();originOverlay=null;
    root.querySelectorAll('.is-dragging').forEach(card=>card.classList.remove('is-dragging'));
    document.body.classList.remove('drag-active');dragId=null;onDragState(null);
  }
  function resolveDrop(event){
    const dateTarget=event.target.closest('[data-drop-date]');if(!dateTarget)return null;
    const task=getTask(dragId);if(!task)return null;
    const date=dateTarget.dataset.dropDate,explicit=event.target.closest('[data-drop-section]');
    const section=explicit?.dataset.dropSection||sectionOf(task);
    const container=explicit||dateTarget.querySelector(`[data-drop-section="${section}"]`);
    if(!container)return {date,section,beforeId:null,container:null,dateTarget};
    const cards=[...container.children].filter(card=>card.dataset.taskId&&card.dataset.taskId!==dragId);
    const before=cards.find(card=>{const rect=card.getBoundingClientRect();return event.clientY<rect.top+rect.height/2;});
    // A month can have further tasks behind its “more” link. Insert after the visible
    // cards rather than expanding the cell while the pointer is still held down.
    let beforeId=before?.dataset.taskId||null;
    if(!before&&cards.length){
      const group=groupFor(date,section).filter(task=>task.id!==dragId);
      beforeId=group[group.findIndex(task=>task.id===cards.at(-1).dataset.taskId)+1]?.id||null;
    }
    return {date,section,beforeId,container,dateTarget};
  }
  function positionCard(ghost,intent,sameOrigin){
    const card=source();
    if(sameOrigin){place(ghost,card.getBoundingClientRect());return;}
    const cards=[...intent.container.children].filter(node=>node.dataset.taskId&&node.dataset.taskId!==dragId);
    const before=cards.find(node=>node.dataset.taskId===intent.beforeId);
    const reference=before||cards.at(-1);
    let rect,top;
    if(reference){
      rect=reference.getBoundingClientRect();
      top=before?rect.top:rect.bottom+parseFloat(getComputedStyle(reference).marginBottom||0);
    }else{
      rect=intent.container.getBoundingClientRect();
      if(!rect.width)rect=intent.container.parentElement.getBoundingClientRect();
      top=rect.top;
    }
    // Project the final slot for a move further down the same group, without moving it.
    if(intent.container===card.parentElement){
      const original=card.getBoundingClientRect();
      if(top>original.top+1)top-=original.height+parseFloat(getComputedStyle(card).marginBottom||0);
    }
    place(ghost,{left:rect.left,top,width:rect.width});
  }
  function showPreview(intent){
    clearPreview();dropIntent=intent;
    const task=getTask(dragId),card=source();if(!task||!card)return;
    const group=groupFor(task.date,sectionOf(task));
    const nextId=group[group.findIndex(task=>task.id===dragId)+1]?.id||null;
    const sameOrigin=intent.container===card.parentElement&&intent.date===task.date&&intent.section===sectionOf(task)&&intent.beforeId===nextId;
    card.classList.toggle('at-origin',sameOrigin);originOverlay.hidden=sameOrigin;
    const preview={...task,date:intent.date,status:intent.section==='complete'?'complete':task.status==='complete'?'new':task.status};
    const temp=document.createElement('div');temp.innerHTML=renderCard(preview,intent.container?intent.container.dataset.compact==='true':true);
    const ghost=temp.firstElementChild;ghost.classList.add('drag-placeholder');
    for(const attr of ['data-task-id','data-task-date','draggable'])ghost.removeAttribute(attr);
    ghost.setAttribute('aria-hidden','true');ghost.inert=true;
    ghost.querySelectorAll('[data-action]').forEach(node=>{node.removeAttribute('data-action');node.setAttribute('tabindex','-1');});
    if(intent.container){
      intent.container.classList.add('overlay-drop-section');intent.container.append(ghost);
      positionCard(ghost,intent,sameOrigin);
    }else{
      const tray=document.createElement('div');tray.className='drag-date-preview';
      const caption=document.createElement('span');caption.textContent=`${formatDate(intent.date)} · ${sectionLabels[intent.section]}`;
      tray.append(caption,ghost);root.append(tray);
      const rect=intent.dateTarget.getBoundingClientRect();
      tray.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-218))}px`;
      tray.style.top=`${Math.max(8,Math.min(rect.bottom+7,innerHeight-tray.offsetHeight-8))}px`;
      intent.dateTarget.classList.add('drop-target');
    }
  }
  root.addEventListener('dragstart',event=>{
    const card=event.target.closest('[data-task-id]');if(!card)return;
    onStart();dragId=card.dataset.taskId;onDragState(dragId);
    event.dataTransfer.setData('text/plain',dragId);event.dataTransfer.effectAllowed='move';
    requestAnimationFrame(()=>{if(dragId){
      card.classList.add('is-dragging');document.body.classList.add('drag-active');
      originOverlay=document.createElement('div');originOverlay.className='drag-origin-overlay';
      originOverlay.setAttribute('aria-hidden','true');originOverlay.inert=true;root.append(originOverlay);positionOrigin();
      const task=getTask(dragId),section=sectionOf(task),group=groupFor(task.date,section);
      showPreview({date:task.date,section,beforeId:group[group.findIndex(item=>item.id===dragId)+1]?.id||null,container:card.parentElement,dateTarget:card.parentElement});
    }});
  });
  function hover(event){
    if(!dragId)return;const intent=resolveDrop(event);
    if(!intent){clearPreview();return;}
    event.preventDefault();event.dataTransfer.dropEffect='move';showPreview(intent);
  }
  root.addEventListener('dragover',hover);root.addEventListener('dragenter',hover);
  root.addEventListener('dragleave',event=>{
    if(event.relatedTarget&&root.contains(event.relatedTarget))return;
    const rect=root.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)clearPreview();
  });
  root.addEventListener('drop',event=>{
    if(!dragId)return;const intent=resolveDrop(event)||dropIntent;if(!intent){endDrag();return;}
    event.preventDefault();const id=dragId;endDrag();onDrop(intent,id);
  });
  root.addEventListener('dragend',endDrag);
  function refresh(){if(!dragId)return;positionOrigin();if(dropIntent)showPreview({...dropIntent});}
  window.addEventListener('scroll',refresh,{capture:true,passive:true});window.addEventListener('resize',refresh);
}
