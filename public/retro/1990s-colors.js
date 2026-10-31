// A fixed selection of 32 brighter, distinct RGB332 swatches. Tasks save the hex
// value itself so future palette changes cannot reinterpret their saved colors.
export const TASK_PALETTE=Object.freeze([
  '#ff2455','#ff6d55','#ff4900','#ff9200','#ffb655','#dbb600','#dbdb00','#b6db55',
  '#92db00','#24db55','#6db655','#6ddbaa','#24dbaa','#49b6aa','#00dbff','#49dbff',
  '#00b6ff','#2492ff','#006dff','#92b6ff','#6d92ff','#926dff','#b692ff','#b600ff',
  '#db6dff','#ff00ff','#ff6dff','#ff92aa','#ff49aa','#ff00aa','#db49aa','#b66daa'
]);
const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const luminanceOf=hex=>{const [r,g,b]=hex.slice(1).match(/../g).map(value=>linear(parseInt(value,16)/255));return .2126*r+.7152*g+.0722*b;};
const validColor=color=>typeof color==='string'&&/^#[a-f0-9]{6}$/i.test(color);
const normalize=hue=>((hue%360)+360)%360;

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
  const background=validColor(savedColor)?savedColor.toLowerCase():TASK_PALETTE[Math.floor(normalize(hue)*TASK_PALETTE.length/360)];
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
  const used=new Set(tasks.filter(task=>task.date===date&&task.id!==excludeTaskId).map(getTaskColor));
  const previous=validColor(previousColor)?previousColor.toLowerCase():previousHue===null?null:classicTaskColors(previousHue).background;
  const choices=TASK_COLOR_HUES.filter(hue=>classicTaskColors(hue).background!==previous);
  const available=choices.filter(hue=>!used.has(classicTaskColors(hue).background));
  const candidates=available.length?available:choices;
  return candidates[Math.floor(Math.random()*candidates.length)];
}
