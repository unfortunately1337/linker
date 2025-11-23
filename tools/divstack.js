const fs = require('fs');
const s = fs.readFileSync('c:/linker/pages/profile.tsx', 'utf8');
const lines = s.split('\n');
const stack = [];
for (let i=0;i<lines.length;i++){
  const l = lines[i];
  // find all opening <div (ignore self-closing)
  const opens = l.match(/<div(\s|>)/g) || [];
  const selfClosed = l.match(/<div[^>]*\/\>/g) || [];
  const effectiveOpens = opens.length - selfClosed.length;
  for (let k=0;k<effectiveOpens;k++) stack.push({line: i+1, text: l.trim()});
  const closes = l.match(/<\/div>/g) || [];
  for (let k=0;k<closes.length;k++) stack.pop();
}
if (stack.length===0) {
  console.log('All <div> tags closed');
} else {
  console.log('Unclosed <div> tags (most recent first):');
  for (let i=stack.length-1;i>=0;i--) console.log(stack[i]);
}
