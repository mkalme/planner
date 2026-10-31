// A fixed web-safe display palette. It never modifies a task's saved hue.
const palette=[
  {background:'#ff6666'},
  {background:'#ffcc00'},
  {background:'#ffff00'},
  {background:'#66ff66'},
  {background:'#00ffff'},
  {background:'#99ccff'},
  {background:'#cc99ff'},
  {background:'#ff99ff'}
];
// Sixteen indexed colors: eight retro task fills and eight pale completion fills.
// A small fixed palette suits an 8-bit display without changing stored task hues.
const indexedPalette=[
  {background:'#ff6666',completed:'#ffd1d1'},
  {background:'#ff9900',completed:'#ffe0b3'},
  {background:'#ffff66',completed:'#ffffd1'},
  {background:'#66ff66',completed:'#d1ffd1'},
  {background:'#66ffff',completed:'#d1ffff'},
  {background:'#6699ff',completed:'#d1e0ff'},
  {background:'#cc99ff',completed:'#f0e0ff'},
  {background:'#ff99cc',completed:'#ffe0f0'}
];
export function classicTaskColors(hue,indexed=false){
  const normalized=((hue%360)+360)%360;
  const index=Math.floor(((normalized+22.5)%360)/45);
  if(indexed)return indexedPalette[index];
  const {background}=palette[index];
  // Lift only HSL lightness, preserving each palette color's hue and saturation.
  return {background,completed:`hsl(from ${background} h s calc(l + (100 - l) * .7))`};
}
export function generateDayTaskHue(tasks,date,{excludeTaskId=null,previousHue=null}={}){
  const used=new Set(tasks.filter(task=>task.date===date&&task.id!==excludeTaskId).map(task=>classicTaskColors(task.hue).background));
  const previous=previousHue===null?null:classicTaskColors(previousHue).background;
  const choices=palette.map((_,index)=>index*45).filter(hue=>classicTaskColors(hue).background!==previous);
  const available=choices.filter(hue=>!used.has(classicTaskColors(hue).background));
  const candidates=available.length?available:choices;
  return candidates[Math.floor(Math.random()*candidates.length)];
}
