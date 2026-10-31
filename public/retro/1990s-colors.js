// RGB332: three bits of red, three of green and two of blue, for 256 colors.
// Keep colorful shades that stand out against white without becoming nearly black.
const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
const palette=Array.from({length:256},(_,code)=>{
  const rgb=[Math.round((code>>5&7)*255/7),Math.round((code>>2&7)*255/7),(code&3)*85];
  const [r,g,b]=rgb.map(value=>value/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  const luminance=.2126*linear(r)+.7152*linear(g)+.0722*linear(b);
  const hue=delta===0?0:((max===r?(g-b)/delta+(g<b?6:0):max===g?(b-r)/delta+2:(r-g)/delta+4)*60);
  return {background:`#${rgb.map(value=>value.toString(16).padStart(2,'0')).join('')}`,luminance,hue,saturation:max===0?0:delta/max};
}).filter(color=>color.saturation>=.35&&color.luminance>=.045&&1.05/(color.luminance+.05)>=3)
  .sort((a,b)=>a.hue-b.hue||a.luminance-b.luminance);

// Stable representatives of the palette slots within the existing saved hue field.
export const TASK_COLOR_HUES=Object.freeze(palette.map((_,index)=>(index+.5)*360/palette.length));
export function classicTaskColors(hue){
  const normalized=((hue%360)+360)%360,index=Math.floor(normalized*palette.length/360);
  const {background,luminance}=palette[index];
  // Completion lifts HSL lightness only, preserving the selected hue and saturation.
  return {background,completed:`hsl(from ${background} h s calc(l + (100 - l) * .7))`,ink:luminance>.179?'#000':'#fff'};
}
export function generateDayTaskHue(tasks,date,{excludeTaskId=null,previousHue=null}={}){
  const used=new Set(tasks.filter(task=>task.date===date&&task.id!==excludeTaskId).map(task=>classicTaskColors(task.hue).background));
  const previous=previousHue===null?null:classicTaskColors(previousHue).background;
  const choices=TASK_COLOR_HUES.filter(hue=>classicTaskColors(hue).background!==previous);
  const available=choices.filter(hue=>!used.has(classicTaskColors(hue).background));
  const candidates=available.length?available:choices;
  return candidates[Math.floor(Math.random()*candidates.length)];
}
