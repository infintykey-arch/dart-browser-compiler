import { node } from './ast.js';
import { tokenize } from './lexer.js';

export class DartParseError extends Error {
  constructor(message, token) { super(`${message} at line ${token.line}, column ${token.column}`); this.name='DartParseError'; this.line=token.line; this.column=token.column; }
}
export class NotImplementedDartFeature extends DartParseError {
  constructor(feature, token) { super(`not implemented: ${feature}`, token); this.name='NotImplementedDartFeature'; }
}

const TYPE_WORDS = new Set(['int','double','num','String','bool','dynamic','Object','List','Map','Set','Iterable','void']);
const ASSIGN = new Set(['=','+=','-=','*=','/=','%=','~/=','??=']);
const PRECEDENCE = new Map([
  ['=',1],['+=',1],['-=',1],['*=',1],['/=',1],['%=',1],['~/=',1],['??=',1],
  ['??',2],['||',3],['&&',4],['==',5],['!=',5],['<',6],['<=',6],['>',6],['>=',6],['is',6],['as',6],
  ['+',7],['-',7],['*',8],['/',8],['%',8],['~/',8]
]);

export class Parser {
  constructor(tokens) { this.tokens=tokens; this.i=0; }
  get current() { return this.tokens[this.i] ?? this.tokens[this.tokens.length-1]; }
  peek(n=1) { return this.tokens[this.i+n] ?? this.tokens[this.tokens.length-1]; }
  at(value) { return this.current.value===value; }
  match(value) { if (this.at(value)) { this.i++; return true; } return false; }
  advance() { const t=this.current; if (t.type!=='EOF') this.i++; return t; }
  fail(message, token=this.current) { throw new DartParseError(message,token); }
  expect(value, message=`Expected '${value}'`) { if (!this.at(value)) this.fail(message); return this.advance(); }
  identifier(message='Expected an identifier') { if (this.current.type!=='IDENT' && this.current.type!=='KEYWORD') this.fail(message); return this.advance(); }
  unsupported(feature, token=this.current) { throw new NotImplementedDartFeature(feature,token); }
  parse() {
    const imports=[], statements=[];
    while (this.current.type!=='EOF') {
      if (this.at('import')) imports.push(this.importDirective());
      else statements.push(this.statement(true));
    }
    return node('Program',{imports,statements});
  }
  importDirective() {
    const start=this.advance();
    if (this.current.type!=='STRING') this.fail('Expected a library URI after import');
    const uriToken=this.advance();
    const uri=uriToken.value.raw;
    while (!this.at(';') && this.current.type!=='EOF') this.advance();
    this.expect(';');
    if (uri==='dart:core') return node('Import',{uri,implicit:true,line:start.line});
    if (uri==='dart:io') return node('Import',{uri,line:start.line});
    this.unsupported(`library import '${uri}'`,start);
  }
  statement(topLevel=false) {
    const t=this.current;
    if (this.at('class') || this.at('mixin') || this.at('enum') || this.at('extension')) this.unsupported(`${t.value} declarations`,t);
    if (this.at('async') || this.at('sync')) this.unsupported('async/sync functions and generators',t);
    if (this.at('await') || this.at('yield')) this.unsupported(t.value,t);
    if (this.match('{')) { const body=[]; while (!this.at('}') && this.current.type!=='EOF') body.push(this.statement(false)); this.expect('}','Expected } to close block'); return node('Block',{body}); }
    if (this.match('if')) { this.expect('('); const test=this.expression(); this.expect(')'); const consequent=this.statement(false); const alternate=this.match('else')?this.statement(false):null; return node('If',{test,consequent,alternate}); }
    if (this.match('while')) { this.expect('('); const test=this.expression(); this.expect(')'); return node('While',{test,body:this.statement(false)}); }
    if (this.match('do')) { const body=this.statement(false); this.expect('while'); this.expect('('); const test=this.expression(); this.expect(')'); this.match(';'); return node('DoWhile',{test,body}); }
    if (this.match('for')) return this.forStatement();
    if (this.match('switch')) return this.switchStatement();
    if (this.match('return')) { const value=this.at(';')?null:this.expression(); this.expect(';'); return node('Return',{value}); }
    if (this.match('break')) { let label=null; if (!this.at(';')) label=this.identifier().value; this.expect(';'); return node('Break',{label}); }
    if (this.match('continue')) { let label=null; if (!this.at(';')) label=this.identifier().value; this.expect(';'); return node('Continue',{label}); }
    if (this.at('try') || this.at('throw') || this.at('rethrow') || this.at('assert')) this.unsupported(`${this.current.value} statements`,this.current);
    if (this.at('late')) this.unsupported('late variable declarations',this.current);
    if (this.isFunctionDeclaration(topLevel)) return this.functionDeclaration();
    if (this.isVariableDeclaration()) { const d=this.variableDeclaration(); this.expect(';'); return d; }
    const expr=this.expression(); this.expect(';'); return node('ExpressionStatement',{expression:expr});
  }
  isVariableDeclaration() {
    const v=this.current.value;
    if (['var','final','const'].includes(v)) return true;
    if (TYPE_WORDS.has(v) && (this.peek().type==='IDENT' || (this.peek().type==='KEYWORD' && this.peek().value==='_'))) return true;
    return false;
  }
  isFunctionDeclaration(topLevel) {
    const v=this.current.value;
    if (TYPE_WORDS.has(v) && (this.peek().type==='IDENT' || this.peek().type==='KEYWORD') && this.peek(2).value==='(') return true;
    if (topLevel && this.current.type==='IDENT' && this.peek().value==='(') return true;
    return false;
  }
  variableDeclaration(inFor=false) {
    let keyword=null, declaredType=null;
    if (['var','final','const'].includes(this.current.value)) keyword=this.advance().value;
    else { declaredType=this.advance().value; }
    const name=this.identifier('Expected a variable name').value;
    let initializer=null;
    if (this.match('=')) initializer=this.expression();
    else if ((keyword==='const' || declaredType && declaredType!=='dynamic') && !inFor) this.fail(`Expected an initializer for ${keyword ?? declaredType}`);
    if (!inFor) return node('VariableDeclaration',{name,keyword,declaredType,initializer});
    return node('VariableDeclaration',{name,keyword,declaredType,initializer});
  }
  functionDeclaration() {
    let returnType=null, name;
    if (TYPE_WORDS.has(this.current.value) && this.peek().value!=='(') { returnType=this.advance().value; name=this.identifier('Expected a function name').value; }
    else name=this.identifier('Expected a function name').value;
    const params=this.parameters();
    let body;
    if (this.match('=>')) { const expression=this.expression(); this.expect(';'); body=node('Block',{body:[node('Return',{value:expression})]}); }
    else body=this.statement(false);
    return node('FunctionDeclaration',{name,returnType,params,body});
  }
  parameters() {
    this.expect('('); const params=[]; let mode='required';
    while (!this.at(')') && this.current.type!=='EOF') {
      if (this.match('[')) { mode='optional'; }
      else if (this.match('{')) { mode='named'; }
      if (this.match('required')) mode='namedRequired';
      let type=null;
      if ((TYPE_WORDS.has(this.current.value) || this.current.type==='IDENT') && (this.peek().type==='IDENT' || this.peek().value==='?')) {
        type=this.advance().value; this.match('?');
      }
      const name=this.identifier('Expected a parameter name').value;
      const defaultValue=this.match('=')?this.expression():null;
      params.push({name,type,mode,defaultValue});
      if (this.match(']') || this.match('}')) { mode='required'; if (this.at(')')) break; }
      if (!this.match(',')) break;
    }
    this.expect(')','Expected ) after parameters'); return params;
  }
  forStatement() {
    this.expect('(');
    let init=null;
    if (!this.at(';')) {
      if (this.isVariableDeclaration()) init=this.variableDeclaration(true);
      else init=this.expression();
    }
    if (this.match('in')) {
      const iterable=this.expression(); this.expect(')'); return node('ForIn',{init,iterable,body:this.statement(false)});
    }
    this.expect(';','Expected ; in for loop');
    const test=this.at(';')?null:this.expression(); this.expect(';','Expected second ; in for loop');
    const update=this.at(')')?null:this.expression(); this.expect(')');
    return node('For',{init,test,update,body:this.statement(false)});
  }
  switchStatement() {
    this.expect('('); const value=this.expression(); this.expect(')'); this.expect('{'); const cases=[];
    while (!this.at('}') && this.current.type!=='EOF') {
      let test;
      if (this.match('case')) { test=this.expression(); this.expect(':'); }
      else if (this.match('default')) { test=null; this.expect(':'); }
      else this.fail('Expected case or default in switch');
      const body=[]; while (!this.at('case') && !this.at('default') && !this.at('}') && this.current.type!=='EOF') body.push(this.statement(false));
      cases.push({test,body});
    }
    this.expect('}'); return node('Switch',{value,cases});
  }
  expression(min=1) {
    let left=this.prefix();
    left=this.postfix(left);
    while (true) {
      if (this.at('?') && min<=2) { this.advance(); const consequent=this.expression(); this.expect(':'); const alternate=this.expression(2); left=node('Conditional',{test:left,consequent,alternate}); continue; }
      const op=this.current.value, prec=PRECEDENCE.get(op);
      if (prec===undefined || prec<min) break;
      this.advance();
      if (op==='is' || op==='as') { const type=this.identifier('Expected a type name').value; left=node(op==='is'?'Is':'As',{value:left,type}); continue; }
      const right=this.expression(ASSIGN.has(op)?prec:prec+1);
      left=ASSIGN.has(op)?node('Assignment',{operator:op,left,right}):node('Binary',{operator:op,left,right});
    }
    return left;
  }
  prefix() {
    const t=this.current;
    if (this.match('!') || this.match('-') || this.match('+') || this.match('~')) return node('Unary',{operator:t.value,argument:this.expression(9)});
    if (this.match('++') || this.match('--')) return node('Update',{operator:t.value,argument:this.expression(9),prefix:true});
    if (this.at('await')) this.unsupported('async/await',t);
    if (this.match('new')) { const expr=this.prefix(); return expr; }
    if (this.match('(')) {
      const start=this.i-1; let depth=1, j=this.i;
      while (j<this.tokens.length && depth) { if (this.tokens[j].value==='(') depth++; else if (this.tokens[j].value===')') depth--; j++; }
      if (depth===0 && this.tokens[j]?.value==='=>') {
        const params=[];
        while (!this.at(')')) { let type=null; if (TYPE_WORDS.has(this.current.value) && this.peek().type==='IDENT') type=this.advance().value; const name=this.identifier().value; params.push({name,type,mode:'required',defaultValue:null}); if (!this.match(',')) break; }
        this.expect(')'); this.expect('=>'); return node('FunctionExpression',{params,body:this.expression(1)});
      }
      const expr=this.expression(); this.expect(')'); return expr;
    }
    if (t.type==='NUMBER') { this.advance(); return node('Literal',{value:t.value.startsWith('0x')||t.value.startsWith('0X')?parseInt(t.value.slice(2),16):Number(t.value),raw:t.value}); }
    if (t.type==='STRING') { this.advance(); return node('StringLiteral',{raw:t.value.raw,quote:t.value.quote,isRaw:t.value.isRaw,triple:t.value.triple,line:t.line}); }
    if (this.match('true')) return node('Literal',{value:true});
    if (this.match('false')) return node('Literal',{value:false});
    if (this.match('null')) return node('Literal',{value:null});
    if (this.current.type==='IDENT' || (this.current.type==='KEYWORD' && ['this','super'].includes(t.value))) { this.advance(); if (t.value==='this'||t.value==='super') this.unsupported(t.value,t); if (this.match('=>')) return node('FunctionExpression',{params:[{name:t.value,type:null,mode:'required',defaultValue:null}],body:this.expression(1)}); return node('Identifier',{name:t.value}); }
    if (this.match('[')) { const elements=[]; while (!this.at(']')&&this.current.type!=='EOF') { elements.push(this.expression()); if (!this.match(',')) break; } this.expect(']'); return node('ListLiteral',{elements}); }
    if (this.match('{')) {
      if (this.match('}')) return node('MapLiteral',{entries:[]});
      const first=this.expression();
      if (this.match(':')) { const entries=[[first,this.expression()]]; while (this.match(',')) { if (this.at('}')) break; const k=this.expression(); this.expect(':'); entries.push([k,this.expression()]); } this.expect('}'); return node('MapLiteral',{entries}); }
      const elements=[first]; while (this.match(',')) { if (this.at('}')) break; elements.push(this.expression()); } this.expect('}'); return node('SetLiteral',{elements});
    }
    if (t.value==='async' || t.value==='sync') this.unsupported('async/sync functions and generators',t);
    if (t.value==='const' || t.value==='final') this.unsupported(`${t.value} collection literals`,t);
    this.fail(`Expected an expression, found '${t.value}'`,t);
  }
  postfix(left) {
    while (true) {
      if (this.match('(')) {
        const args=[], named={};
        while (!this.at(')') && this.current.type!=='EOF') {
          if ((this.current.type==='IDENT'||this.current.type==='KEYWORD') && this.peek().value===':') { const key=this.advance().value; this.advance(); named[key]=this.expression(); }
          else args.push(this.expression());
          if (!this.match(',')) break;
        }
        this.expect(')','Expected ) after arguments'); left=node('Call',{callee:left,args,named}); continue;
      }
      if (this.match('.') || this.match('?.')) { const op=this.tokens[this.i-1].value; const property=this.identifier('Expected a property name').value; left=node('Member',{object:left,property,nullAware:op==='?.'}); continue; }
      if (this.match('[')) { const index=this.expression(); this.expect(']'); left=node('Index',{object:left,index}); continue; }
      if (this.match('++') || this.match('--')) { left=node('Update',{operator:this.tokens[this.i-1].value,argument:left,prefix:false}); continue; }
      if (this.match('!')) { left=node('NonNull',{argument:left}); continue; }
      if (this.at('..')) this.unsupported('cascade expressions',this.current);
      break;
    }
    return left;
  }
}

export function parse(source) { return new Parser(tokenize(source)).parse(); }
