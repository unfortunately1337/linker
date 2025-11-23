const fs = require('fs');
const s = fs.readFileSync('c:/linker/pages/profile.tsx', 'utf8');
const pairs = { '(': ')', '{': '}', '[': ']' };
const opens = Object.keys(pairs);
const closes = Object.values(pairs);
const stack = [];
for (let i=0;i<s.length;i++){
  const ch = s[i];
  if (opens.includes(ch)) stack.push({ch, pos: i});
  if (closes.includes(ch)) {
    const expected = stack.pop();
    if (!expected || pairs[expected.ch] !== ch) {
      console.log('Mismatch at pos', i, 'char', ch);
      process.exit(1);
    }
  }
}
if (stack.length) console.log('Unclosed braces remain', stack.slice(-10)); else console.log('All braces balanced');
