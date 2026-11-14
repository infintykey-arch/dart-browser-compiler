import { VirtualFileSystem } from './virtual_fs.js';
import { dartString, decodeDartString } from './stdlib/core.js';
import { installIo } from './stdlib/io.js';

export class DartRuntimeError extends Error {
  constructor(message, node=null) { const where=node?.line?` at line ${node.line}`:''; super(`${message}${where}`); this.name='DartRuntimeError'; this.line=node?.line??null; }
}
class ReturnSignal { constructor(value){this.value=value;} }
class BreakSignal {}
class ContinueSignal {}
class ExitSignal { constructor(code){this.code=code;} }
class DartFunction { constructor(node,closure){this.node=node;this.closure=closure;} }

class Environment {
  constructor(parent=null){this.parent=parent;this.bindings=new Map();}
  define(name,value,mutable=true){this.bindings.set(name,{value,mutable});return value;}
  find(name){if(this.bindings.has(name))return this.bindings.get(name);if(this.parent)return this.parent.find(name);throw new DartRuntimeError("Undefined name '"+name+"'.");}
  get(name){return this.find(name).value;}
  assign(name,value){const b=this.find(name);if(!b.mutable)throw new DartRuntimeError(`UnsupportedError: cannot assign to final or const variable '${name}'.`);b.value=value;return value;}
}
const notImplemented = (name) => { throw new DartRuntimeError(`UnsupportedError: not implemented: ${name}`); };
const show = dartString;
const isNumeric = x => typeof x==='number' && Number.isFinite(x);
const requireBool = (v,node) => {if(typeof v!=='boolean')throw new DartRuntimeError('TypeError: condition must have type bool.',node);return v;};

export class Interpreter {
  constructor({write=()=>{},readLine=null,vfs=null,maxSteps=200000}={}) {
    this.write=write; this.readLine=readLine; this.vfs=vfs; this.maxSteps=maxSteps; this.steps=0; this.ioEnabled=false; this.env=null;
  }
  tick(node){this.steps++;if(this.steps>this.maxSteps)throw new DartRuntimeError(`UnsupportedError: execution stopped after ${this.maxSteps} steps to keep the browser responsive.`,node);}
  async run(program) {
    this.steps=0;this.ioEnabled=program.imports.some(x=>x.uri==='dart:io');
    this.vfs=this.vfs??(this.ioEnabled?new VirtualFileSystem():null);
    if(this.ioEnabled&&this.vfs?.readyPromise)await this.vfs.readyPromise;
    const global=new Environment();this.env=global;
    this.installBuiltins(global);
    for(const s of program.statements) if(s.type==='FunctionDeclaration') global.define(s.name,new DartFunction(s,global),false);
    for(const s of program.statements) if(s.type!=='FunctionDeclaration') this.execute(s,global);
    if(!global.bindings.has('main'))throw new DartRuntimeError("No top-level 'main' function was found.");
    try { const result=this.call(global.get('main'),[],{},program); if(result&&typeof result.then==='function') await result; }
    catch(e){if(e instanceof ExitSignal){this.write(`\n[Program exited with code ${e.code}]\n`);return {exitCode:e.code};}throw e;}
    return {exitCode:0};
  }
  installBuiltins(env) {
    env.define('print',(args)=>{this.write(show(args[0])+'\n');return null;},false);
    env.define('identical',(args)=>args[0]===args[1],false);
    if(this.ioEnabled) installIo(env,{write:this.write,readLine:this.readLine,getVfs:()=>this.requireVfs(),exit:(code)=>{throw new ExitSignal(code);}});
    for(const name of ['Random','Point','Rectangle','DateTime','Duration','StringBuffer','RegExp','Uri','Completer','Future','Stream','StreamController','Timer','Queue','HashMap','HashSet','SplayTreeMap','SplayTreeSet','Uint8List','Int32List','Float64List','ByteData','jsonEncode','jsonDecode','utf8','base64']) {
      if(!env.bindings.has(name))env.define(name,()=>notImplemented(`${name} (library implementation)`),false);
    }
  }
  requireVfs(){if(!this.vfs)throw new DartRuntimeError('UnsupportedError: not implemented: dart:io File/Directory requires importing dart:io and an IndexedDB-backed browser context.');return this.vfs;}
  execute(stmt,env) {
    this.tick(stmt);
    switch(stmt.type){
      case 'Program': return;
      case 'Import': return;
      case 'Block': {const local=new Environment(env);for(const s of stmt.body)this.execute(s,local);return;}
      case 'VariableDeclaration': {const value=stmt.initializer?this.evaluate(stmt.initializer,env):null;env.define(stmt.name,value,!['final','const'].includes(stmt.keyword));return;}
      case 'FunctionDeclaration': return;
      case 'ExpressionStatement': this.evaluate(stmt.expression,env);return;
      case 'If': if(requireBool(this.evaluate(stmt.test,env),stmt.test))this.execute(stmt.consequent,env);else if(stmt.alternate)this.execute(stmt.alternate,env);return;
      case 'While': {let n=0;while(requireBool(this.evaluate(stmt.test,env),stmt.test)){if(++n>this.maxSteps)throw new DartRuntimeError('UnsupportedError: loop iteration limit exceeded.',stmt);try{this.execute(stmt.body,env);}catch(e){if(e instanceof BreakSignal)break;if(e instanceof ContinueSignal)continue;throw e;}}return;}
      case 'DoWhile': {let n=0;do{if(++n>this.maxSteps)throw new DartRuntimeError('UnsupportedError: loop iteration limit exceeded.',stmt);try{this.execute(stmt.body,env);}catch(e){if(e instanceof BreakSignal)break;if(e instanceof ContinueSignal){}else throw e;}}while(requireBool(this.evaluate(stmt.test,env),stmt.test));return;}
      case 'For': {const scope=new Environment(env);if(stmt.init)this.execute(stmt.init,scope);let n=0;while(!stmt.test||requireBool(this.evaluate(stmt.test,scope),stmt.test)){if(++n>this.maxSteps)throw new DartRuntimeError('UnsupportedError: loop iteration limit exceeded.',stmt);try{this.execute(stmt.body,scope);}catch(e){if(e instanceof BreakSignal)break;if(!(e instanceof ContinueSignal))throw e;}if(stmt.update)this.evaluate(stmt.update,scope);}return;}
      case 'ForIn': {const scope=new Environment(env);if(!stmt.init||stmt.init.type!=='VariableDeclaration')throw new DartRuntimeError('UnsupportedError: for-in requires a declared loop variable in this subset.',stmt);const iterable=this.evaluate(stmt.iterable,scope);if(!isIterable(iterable))throw new DartRuntimeError('TypeError: value is not Iterable.',stmt);scope.define(stmt.init.name,null,!['final','const'].includes(stmt.init.keyword));let n=0;for(const item of iterable){if(++n>this.maxSteps)throw new DartRuntimeError('UnsupportedError: loop iteration limit exceeded.',stmt);scope.bindings.get(stmt.init.name).value=item;try{this.execute(stmt.body,scope);}catch(e){if(e instanceof BreakSignal)break;if(!(e instanceof ContinueSignal))throw e;}}return;}
      case 'Switch': {const val=this.evaluate(stmt.value,env);let chosen=null;for(const c of stmt.cases)if(c.test&&this.evaluate(c.test,env)===val){chosen=c;break;}if(!chosen)chosen=stmt.cases.find(c=>c.test===null)||null;if(chosen){try{for(const s of chosen.body)this.execute(s,env);}catch(e){if(!(e instanceof BreakSignal))throw e;}}return;}
      case 'Return': throw new ReturnSignal(stmt.value?this.evaluate(stmt.value,env):null);
      case 'Break': if(stmt.label)notImplemented('labeled break');throw new BreakSignal();
      case 'Continue': if(stmt.label)notImplemented('labeled continue');throw new ContinueSignal();
      default: throw new DartRuntimeError(`UnsupportedError: not implemented: statement ${stmt.type}.`,stmt);
    }
  }
  evaluate(expr,env) {
    this.tick(expr);
    switch(expr.type){
      case 'Literal':return expr.value;
      case 'StringLiteral':return this.stringValue(expr,env);
      case 'Identifier':return env.get(expr.name);
      case 'ListLiteral':return expr.elements.map(e=>this.evaluate(e,env));
      case 'SetLiteral':return new Set(expr.elements.map(e=>this.evaluate(e,env)));
      case 'MapLiteral':return new Map(expr.entries.map(([k,v])=>[this.evaluate(k,env),this.evaluate(v,env)]));
      case 'FunctionExpression':return new DartFunction({name:'<closure>',params:expr.params,body:expr.body.type==='Block'?expr.body:{type:'Block',body:[{type:'Return',value:expr.body}] }},env);
      case 'Unary':{const v=this.evaluate(expr.argument,env);if(expr.operator==='!')return !requireBool(v,expr);if(expr.operator==='-'&&isNumeric(v))return -v;if(expr.operator==='+'&&isNumeric(v))return +v;if(expr.operator==='~'&&Number.isInteger(v))return ~v;throw new DartRuntimeError(`TypeError: operator ${expr.operator} is not defined for this value.`,expr);}
      case 'NonNull':{const v=this.evaluate(expr.argument,env);if(v===null)throw new DartRuntimeError('Null check operator used on a null value.',expr);return v;}
      case 'Member':{const obj=this.evaluate(expr.object,env);if(obj===null&&expr.nullAware)return null;if(obj===null)throw new DartRuntimeError(`NoSuchMethodError: tried to access '${expr.property}' on null.`,expr);return this.member(obj,expr.property,expr);}
      case 'Index':{const obj=this.evaluate(expr.object,env),idx=this.evaluate(expr.index,env);if(Array.isArray(obj)||typeof obj==='string')return obj[idx];if(obj instanceof Map)return obj.get(idx)??null;throw new DartRuntimeError('NoSuchMethodError: indexed value is not indexable.',expr);}
      case 'Call':{const callee=this.evaluate(expr.callee,env),args=expr.args.map(a=>this.evaluate(a,env)),named=Object.fromEntries(Object.entries(expr.named).map(([k,v])=>[k,this.evaluate(v,env)]));return this.call(callee,args,named,expr);}
      case 'Assignment':return this.assign(expr,env);
      case 'Update':return this.update(expr,env);
      case 'Conditional':return requireBool(this.evaluate(expr.test,env),expr.test)?this.evaluate(expr.consequent,env):this.evaluate(expr.alternate,env);
      case 'Is':return this.isType(this.evaluate(expr.value,env),expr.type);
      case 'As':{const value=this.evaluate(expr.value,env);if(!this.isType(value,expr.type))throw new DartRuntimeError(`TypeError: value cannot be cast to ${expr.type}.`,expr);return value;}
      case 'Binary':return this.binary(expr,env);
      default:throw new DartRuntimeError(`UnsupportedError: not implemented: expression ${expr.type}.`,expr);
    }
  }
  stringValue(expr,env){
    let value=expr.raw;
    if(!expr.isRaw)value=decodeDartString(value);
    if(expr.isRaw)return value;
    return value.replace(/\$(\w+)|\$\{([^}]+)\}/g,(match,id,braced)=>{
      const name=(id??braced).trim();
      if(!/^[A-Za-z_$][\w$]*$/.test(name))throw new DartRuntimeError(`UnsupportedError: not implemented: string interpolation expression '${name}'.`,expr);
      return show(env.get(name));
    });
  }
  call(callee,args,named,node){
    if(callee instanceof DartFunction){const fn=callee.node, local=new Environment(callee.closure);let pos=0;
      for(const p of fn.params??[]){let v;if(p.mode==='named'||p.mode==='namedRequired'){v=Object.hasOwn(named,p.name)?named[p.name]:p.defaultValue?this.evaluate(p.defaultValue,callee.closure):null;if(p.mode==='namedRequired'&&!Object.hasOwn(named,p.name))throw new DartRuntimeError(`NoSuchMethodError: missing required named argument '${p.name}'.`,node);}
        else {v=pos<args.length?args[pos++]:p.defaultValue?this.evaluate(p.defaultValue,callee.closure):null;if(p.mode==='required'&&v===null&&p.defaultValue===null)throw new DartRuntimeError(`NoSuchMethodError: missing argument '${p.name}'.`,node);}
        local.define(p.name,v,false);
      }
      try{this.execute(fn.body,local);}catch(e){if(e instanceof ReturnSignal)return e.value;throw e;}return null;
    }
    if(typeof callee==='function')return callee(args,named,node);
    throw new DartRuntimeError('NoSuchMethodError: value is not callable.',node);
  }
  binary(expr,env){
    const op=expr.operator,left=this.evaluate(expr.left,env);
    if(op==='&&')return requireBool(left,expr.left)?requireBool(this.evaluate(expr.right,env),expr.right):false;
    if(op==='||')return requireBool(left,expr.left)?true:requireBool(this.evaluate(expr.right,env),expr.right);
    if(op==='??')return left===null?this.evaluate(expr.right,env):left;
    const right=this.evaluate(expr.right,env);
    switch(op){
      case '==':return left===right;case '!=':return left!==right;
      case '+':if(typeof left==='string'&&typeof right==='string')return left+right;if(isNumeric(left)&&isNumeric(right))return left+right;throw new DartRuntimeError('TypeError: + requires two numbers or two strings.',expr);
      case '-':case '*':case '/':case '%':case '~/':if(!isNumeric(left)||!isNumeric(right))throw new DartRuntimeError(`TypeError: ${op} requires numbers.`,expr);if((op==='/'||op==='~/')&&right===0)throw new DartRuntimeError('IntegerDivisionByZeroException: division by zero.',expr);if(op==='-')return left-right;if(op==='*')return left*right;if(op==='/')return left/right;if(op==='%')return left%right;return Math.trunc(left/right);
      case '<':case '<=':case '>':case '>=':if(typeof left!==typeof right||!['number','string'].includes(typeof left))throw new DartRuntimeError(`TypeError: ${op} operands must both be numbers or strings.`,expr);return op==='<'?left<right:op==='<='?left<=right:op==='>'?left>right:left>=right;
      default:throw new DartRuntimeError(`UnsupportedError: not implemented: operator ${op}.`,expr);
    }
  }
  assign(expr,env){const op=expr.operator;let old;
    if(expr.left.type==='Identifier'){old=env.get(expr.left.name);const v=this.assignmentValue(op,old,this.evaluate(expr.right,env),expr);return env.assign(expr.left.name,v);}
    if(expr.left.type==='Member'){const obj=this.evaluate(expr.left.object,env);old=this.member(obj,expr.left.property,expr.left);const value=this.assignmentValue(op,old,this.evaluate(expr.right,env),expr);if(obj instanceof Map)obj.set(expr.left.property,value);else if(Array.isArray(obj))obj[expr.left.property]=value;else throw new DartRuntimeError('UnsupportedError: property assignment is not implemented for this value.',expr);return value;}
    if(expr.left.type==='Index'){const obj=this.evaluate(expr.left.object,env),index=this.evaluate(expr.left.index,env);old=obj instanceof Map?obj.get(index):obj[index];const value=this.assignmentValue(op,old,this.evaluate(expr.right,env),expr);if(obj instanceof Map)obj.set(index,value);else if(Array.isArray(obj))obj[index]=value;else throw new DartRuntimeError('UnsupportedError: indexed assignment is not implemented for this value.',expr);return value;}
    throw new DartRuntimeError('UnsupportedError: invalid assignment target.',expr);
  }
  assignmentValue(op,old,right,node){if(op==='=')return right;if(op==='??=')return old===null?right:old;return this.binary({operator:op.slice(0,-1),left:{type:'Literal',value:old},right:{type:'Literal',value:right}},this.env);}
  update(expr,env){const ref=expr.argument;if(ref.type!=='Identifier')throw new DartRuntimeError('UnsupportedError: increment/decrement is implemented only for variables.',expr);const old=env.get(ref.name);if(!isNumeric(old))throw new DartRuntimeError('TypeError: ++/-- requires a number.',expr);env.assign(ref.name,old+(expr.operator==='++'?1:-1));return expr.prefix?old+(expr.operator==='++'?1:-1):old;}
  isType(value,type){switch(type){case 'dynamic':case 'Object':return value!==null;case 'int':return Number.isInteger(value);case 'double':return typeof value==='number'&&!Number.isInteger(value);case 'num':return typeof value==='number';case 'String':return typeof value==='string';case 'bool':return typeof value==='boolean';case 'List':return Array.isArray(value);case 'Map':return value instanceof Map;case 'Set':return value instanceof Set;default:return false;}}
  member(obj,name,node){
    if(obj instanceof Map){if(name==='length')return obj.size;if(name==='isEmpty')return obj.size===0;if(name==='isNotEmpty')return obj.size!==0;if(name==='keys')return [...obj.keys()];if(name==='values')return [...obj.values()];
      const methods={containsKey:([k])=>obj.has(k),containsValue:([v])=>[...obj.values()].some(x=>x===v),remove:([k])=>obj.has(k)?(obj.delete(k),true):false,clear:()=>obj.clear(),toString:()=>show(obj)};if(methods[name])return methods[name];return obj.has(name)?obj.get(name):null;}
    if(Array.isArray(obj)){const methods={add:([v])=>(obj.push(v),null),addAll:([v])=>{for(const x of v)obj.push(x);return null;},remove:([v])=>{const i=obj.indexOf(v);if(i<0)return false;obj.splice(i,1);return true;},removeAt:([i])=>obj.splice(i,1)[0],clear:()=>{obj.length=0;return null;},contains:([v])=>obj.includes(v),indexOf:([v])=>obj.indexOf(v),join:([sep=','])=>obj.map(show).join(sep),toList:()=>[...obj],toSet:()=>new Set(obj),sublist:([a,b=obj.length])=>obj.slice(a,b),forEach:([f])=>{for(const x of obj)this.call(f,[x],{},node);},map:([f])=>obj.map(x=>this.call(f,[x],{},node)),where:([f])=>obj.filter(x=>requireBool(this.call(f,[x],{},node),node)),toString:()=>show(obj)};
      if(name==='length')return obj.length;if(name==='isEmpty')return obj.length===0;if(name==='isNotEmpty')return obj.length!==0;if(name==='first')return obj[0]??null;if(name==='last')return obj[obj.length-1]??null;if(methods[name])return methods[name];return null;}
    if(obj instanceof Set){const methods={add:([v])=>(obj.add(v),true),remove:([v])=>obj.delete(v),contains:([v])=>obj.has(v),toList:()=>[...obj],clear:()=>obj.clear(),toString:()=>show(obj)};if(name==='length')return obj.size;if(name==='isEmpty')return obj.size===0;if(name==='isNotEmpty')return obj.size!==0;if(methods[name])return methods[name];return null;}
    if(typeof obj==='string'){const methods={contains:([s])=>obj.includes(s),startsWith:([s])=>obj.startsWith(s),endsWith:([s])=>obj.endsWith(s),toLowerCase:()=>obj.toLowerCase(),toUpperCase:()=>obj.toUpperCase(),trim:()=>obj.trim(),substring:([a,b=obj.length])=>{if(a<0||b<0||a>obj.length||b>obj.length)throw new RangeError('RangeError: invalid substring range');return obj.slice(a,b);},split:([s])=>obj.split(s),indexOf:([s])=>obj.indexOf(s),replaceAll:([a,b])=>obj.split(a).join(b),toString:()=>obj};if(name==='length')return [...obj].length;if(name==='isEmpty')return obj.length===0;if(methods[name])return methods[name];return null;}
    if(obj?.__dartFile||obj?.__dartDirectory){const value=obj[name];if(value!==undefined)return (args)=>value.apply(obj,args);if(name==='path')return obj.path;}
    if(obj&&Object.hasOwn(obj,name))return obj[name];
    throw new DartRuntimeError(`NoSuchMethodError: '${name}' is not implemented on ${typeof obj}.`,node);
  }
}
function isIterable(value){return Array.isArray(value)||typeof value==='string'||value instanceof Set||value instanceof Map;}


export async function interpret(program,options={}){return new Interpreter(options).run(program);}
