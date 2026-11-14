import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, NotImplementedDartFeature } from '../src/parser.js';

test('parses basic function, variables, closure, branch and loop nodes',()=>{
  const ast=parse(`void main() { var x = 1; var f = (n) => n + x; if (f(2) > 2) { print(f(3)); } for (var i = 0; i < 2; i++) { print(i); } }`);
  assert.equal(ast.type,'Program');
  assert.equal(ast.statements[0].type,'FunctionDeclaration');
  assert.equal(ast.statements[0].body.body[0].type,'VariableDeclaration');
  assert.equal(ast.statements[0].body.body[1].initializer.type,'FunctionExpression');
  assert.equal(ast.statements[0].body.body[2].type,'If');
  assert.equal(ast.statements[0].body.body[3].type,'For');
});

test('recognizes dart:io and reports other libraries explicitly',()=>{
  assert.equal(parse("import 'dart:io'; void main() {} ").imports[0].uri,'dart:io');
  assert.throws(()=>parse("import 'dart:math'; void main() {}"),/not implemented: library import 'dart:math'/);
});

test('rejects class declarations as not implemented',()=>{
  assert.throws(()=>parse('class A {} void main() {}'),e=>e instanceof NotImplementedDartFeature&&/class declarations/.test(e.message));
});

test('reports a syntax error with line and column',()=>{
  assert.throws(()=>parse('void main() {\n  var x = ;\n}'),/line 2, column/);
});
