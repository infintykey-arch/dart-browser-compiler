import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

test('tokenizes comments, keywords, identifiers, numbers, strings and operators',()=>{
  const tokens=tokenize("// c\nvoid main() { var n = 12; print('ok'); }");
  assert.deepEqual(tokens.filter(t=>t.type!=='EOF').map(t=>t.type==='STRING'?t.value.raw:t.value),['void','main','(',')','{','var','n','=','12',';','print','(','ok',')',';','}']);
});

test('reports line and column for an unterminated string',()=>{
  assert.throws(()=>tokenize("void main() {\n print('oops);\n}"),/Unterminated string literal at line 2, column 8/);
});
