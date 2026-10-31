import {validateTask} from './planner.js';
export const VERSION=1;
export function validateDocument(value){
  if(!value||value.schemaVersion!==VERSION||!Array.isArray(value.tasks)||value.tasks.length>100000||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt)))throw new Error('Nederīgs vai neatbalstīts plānotāja datu fails.');
  const ids=new Set();
  for(const t of value.tasks){
    if(!validateTask(t)||!t.id||ids.has(t.id)||!t.title.trim()||t.title.length>120||t.description.length>3000||t.hue<0||t.hue>=360||!Number.isInteger(t.order)||t.comments.some(c=>c.comment.length>2000||!Number.isFinite(Date.parse(c.at))))throw new Error('Failā ir nederīgi vai atkārtoti uzdevumi.');
    ids.add(t.id);
  }
  return structuredClone(value);
}
export function documentFor(tasks){return validateDocument({schemaVersion:VERSION,updatedAt:new Date().toISOString(),writeId:crypto.randomUUID(),tasks});}
export function importDocument(text){
  if(text.length>10*1024*1024)throw new Error('Fails ir pārāk liels (maksimums 10 MB).');
  let value;try{value=JSON.parse(text);}catch{throw new Error('Fails nav derīgs JSON dokuments.');}
  return validateDocument(Array.isArray(value)?{schemaVersion:VERSION,updatedAt:new Date().toISOString(),tasks:value}:value);
}
