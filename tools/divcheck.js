const fs = require('fs');
const path = 'c:/linker/pages/profile.tsx';
const s = fs.readFileSync(path,'utf8');
const lines = s.split('\n');
let depth = 0;
for (let i=0;i<lines.length;i++){
  const l = lines[i];
  // Count <div occurrences not including self-closing
  const opens = (l.match(/<div(\s|>)/g) || []).length - (l.match(/<div[^>]*\/\>/g) || []).length;
  const closes = (l.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (opens - closes !== 0) console.log(`${i+1}: opens=${opens}, closes=${closes}  ${l.trim()}`);
}
console.log('final depth', depth);
