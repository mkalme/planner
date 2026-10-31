// A fixed 32-color indexed palette, starting with the prototype's original eight
// swatches. Tasks save the hex value so palette edits cannot reassign their color.
export const TASK_PALETTE=Object.freeze([
  '#ff6666','#ffcc00','#ffff00','#66ff66','#00ffff','#99ccff','#cc99ff','#ff99ff',
  '#3ddfb4','#dbdb55','#e98fad','#92ffaa','#49dbff','#a5ff2e','#ff9329','#97dc5c',
  '#ffb399','#18ffcc','#40ff8a','#92ffff','#ffb655','#ffff55','#d1ff16','#9b9bff',
  '#64e08e','#5bc5dc','#ff7393','#ff87d1','#b6ff55','#83ff46','#70ccff','#6dffaa'
]);
const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const luminanceOf=hex=>{const [r,g,b]=hex.slice(1).match(/../g).map(value=>linear(parseInt(value,16)/255));return .2126*r+.7152*g+.0722*b;};
const validColor=color=>typeof color==='string'&&/^#[a-f0-9]{6}$/i.test(color);
const normalize=hue=>((hue%360)+360)%360;
const brightnessAnchors=[[0,.7],[48,.5],[60,.5],[120,.7],[180,.5],[210,.8],[270,.8],[300,.8],[360,.7]];
export function prototypeBrightnessColor(hex){
  let color=hex.toLowerCase();
  // Keep the saved hue and saturation; use the prototype's lightness for its hue.
  // The small rounding margin makes the result stable when saved and loaded again.
  for(let attempt=0;attempt<4;attempt++){
    const [r,g,b]=color.slice(1).match(/../g).map(value=>parseInt(value,16)/255);
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,lightness=(max+min)/2;
    if(!delta)return color;
    const saturation=delta/(1-Math.abs(2*lightness-1));
    const hue=(max===r?(g-b)/delta+(g<b?6:0):max===g?(b-r)/delta+2:(r-g)/delta+4)*60;
    const end=brightnessAnchors.findIndex(([angle])=>angle>hue),[h0,l0]=brightnessAnchors[end-1],[h1,l1]=brightnessAnchors[end];
    const target=l0+(l1-l0)*(hue-h0)/(h1-h0);
    if(lightness>=target-1/255)return color;
    const next=Math.min(1,target+1/255),chroma=(1-Math.abs(2*next-1))*saturation,x=chroma*(1-Math.abs((hue/60)%2-1)),m=next-chroma/2;
    const channels=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
    color=`#${channels.map(value=>Math.round((value+m)*255).toString(16).padStart(2,'0')).join('')}`;
  }
  return color;
}

// Frozen compatibility mappings for tasks created before explicit colors existed.
const legacyEight=['#ff6666','#ffcc00','#ffff00','#66ff66','#00ffff','#99ccff','#cc99ff','#ff99ff'];
const legacyExpanded=Array.from({length:256},(_,code)=>{
  const rgb=[Math.round((code>>5&7)*255/7),Math.round((code>>2&7)*255/7),(code&3)*85];
  const [r,g,b]=rgb.map(value=>value/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  const luminance=.2126*linear(r)+.7152*linear(g)+.0722*linear(b);
  const hue=delta===0?0:((max===r?(g-b)/delta+(g<b?6:0):max===g?(b-r)/delta+2:(r-g)/delta+4)*60);
  return {background:`#${rgb.map(value=>value.toString(16).padStart(2,'0')).join('')}`,luminance,hue,saturation:max===0?0:delta/max};
}).filter(color=>color.saturation>=.35&&color.luminance>=.045&&1.05/(color.luminance+.05)>=3)
  .sort((a,b)=>a.hue-b.hue||a.luminance-b.luminance);

export const TASK_COLOR_HUES=Object.freeze(TASK_PALETTE.map((_,index)=>(index+.5)*360/TASK_PALETTE.length));
export function classicTaskColors(hue,savedColor=null){
  const base=validColor(savedColor)?savedColor.toLowerCase():TASK_PALETTE[Math.floor(normalize(hue)*TASK_PALETTE.length/360)];
  const background=prototypeBrightnessColor(base);
  const luminance=luminanceOf(background);
  // Completion lifts HSL lightness only, preserving the selected hue and saturation.
  return {background,completed:`hsl(from ${background} h s calc(l + (100 - l) * .7))`,ink:luminance>.179?'#000':'#fff'};
}
export function getTaskColor(task){
  if(validColor(task.color))return task.color.toLowerCase();
  const hue=normalize(task.hue),expandedSlot=hue*legacyExpanded.length/360-.5;
  // Fractional representatives identify the expanded release. Integer values are
  // ambiguous, so preserve the earlier eight-color meaning used by older tasks.
  if(!Number.isInteger(hue)&&Math.abs(expandedSlot-Math.round(expandedSlot))<1e-8)return legacyExpanded[Math.round(expandedSlot)].background;
  return legacyEight[Math.floor(((hue+22.5)%360)/45)];
}
export const withStableTaskColors=tasks=>tasks.map(task=>({...task,color:getTaskColor(task)}));
export function generateDayTaskHue(tasks,date,{excludeTaskId=null,previousHue=null,previousColor=null}={}){
  const used=new Set(tasks.filter(task=>task.date===date&&task.id!==excludeTaskId).map(task=>prototypeBrightnessColor(getTaskColor(task))));
  const previous=validColor(previousColor)?prototypeBrightnessColor(previousColor):previousHue===null?null:classicTaskColors(previousHue).background;
  const choices=TASK_COLOR_HUES.filter(hue=>classicTaskColors(hue).background!==previous);
  const available=choices.filter(hue=>!used.has(classicTaskColors(hue).background));
  const candidates=available.length?available:choices;
  return candidates[Math.floor(Math.random()*candidates.length)];
}
