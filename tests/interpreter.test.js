import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { Interpreter } from '../src/interpreter.js';
import { VirtualFile, VirtualDirectory } from '../src/virtual_fs.js';

async function execute(source,{vfs=null,readLine=null}={}){
  const output=[];const result=await new Interpreter({write:s=>output.push(s),vfs,readLine}).run(parse(source));return {text:output.join(''),result};
}

class MemoryFs {
  constructor(){this.entries=new Map([['/',{path:'/',type:'directory',content:''}]]);}
  parent(p){const x=p.replaceAll('\\','/').split('/').filter(Boolean);x.pop();return '/'+x.join('/');}
  normalize(p){return '/'+String(p).replaceAll('\\','/').split('/').filter(x=>x&&x!=='.').join('/');}
  makeDirectory(path,recursive=false){const p=this.normalize(path);if(this.entries.has(p))return this.entries.get(p);const parent=this.parent(p);if(!this.entries.has(parent)){if(!recursive)throw Error('missing parent');this.makeDirectory(parent,true);}const e={path:p,type:'directory',content:''};this.entries.set(p,e);return e;}
  createFile(path,recursive=false){const p=this.normalize(path);if(this.entries.has(p))return this.entries.get(p);const parent=this.parent(p);if(!this.entries.has(parent)){if(!recursive)throw Error('missing parent');this.makeDirectory(parent,true);}const e={path:p,type:'file',content:''};this.entries.set(p,e);return e;}
  read(path){const e=this.entries.get(this.normalize(path));if(!e||e.type!=='file')throw Error('missing file');return e.content;}
  write(path,content,{append=false}={}){const p=this.normalize(path);if(!this.entries.has(p))this.createFile(p,true);const e=this.entries.get(p);e.content=append?e.content+String(content):String(content);return e;}
  exists(path){return this.entries.has(this.normalize(path));}
  delete(path,{recursive=false}={}){const p=this.normalize(path);const kids=[...this.entries.keys()].filter(k=>k.startsWith(p+'/'));if(kids.length&&!recursive)throw Error('not empty');for(const k of [...kids,p])this.entries.delete(k);}
  copy(from,to){this.createFile(to,true);this.write(to,this.read(from));}
  rename(from,to){const e=this.entries.get(this.normalize(from));if(e.type==='file'){this.createFile(to,true);this.write(to,e.content);this.delete(from);}else this.makeDirectory(to,true);}
  list(path,{recursive=false}={}){const p=this.normalize(path);return [...this.entries.values()].filter(e=>e.path.startsWith(p==='/'?'/':p+'/')&&e.path!==p&&(recursive||!e.path.slice(p.length+1).includes('/')));}
  file(p){return new VirtualFile(this,p);}
  directory(p){return new VirtualDirectory(this,p);}
}

test('runs basic values, arithmetic, interpolation, branches and loops',async()=>{
  const {text}=await execute(`void main(){ var name='Ada'; var sum=0; for(var i=1;i<=3;i++){sum+=i;} if(sum==6){print('Hi $name: $sum');} }`);
  assert.equal(text,'Hi Ada: 6\n');
});

test('runs recursive functions, closures and list methods',async()=>{
  const {text}=await execute(`int f(int n){if(n<=1)return 1;return n*f(n-1);} void main(){var k=2;var scale=(x)=>x*k;var a=[scale(f(4))];a.add(3);print(a.join(','));}`);
  assert.equal(text,'48,3\n');
});

test('supports map, set, switch, for-in and stdout output',async()=>{
  const {text}=await execute(`import 'dart:io'; void main(){var m={'x':4};var s={2,2,3};switch(m['x']){case 4:stdout.write('ok:');break;default:print('bad');}for(final n in s){stdout.writeln(n);}}`,{vfs:new MemoryFs()});
  assert.equal(text,'ok:2\n3\n');
});

test('emulates a limited synchronous dart:io file workflow',async()=>{
  const source=`import 'dart:io'; void main(){final f=File('a.txt');f.writeAsStringSync('one\\ntwo');print(f.readAsStringSync());print(f.readAsLinesSync().length);print(f.existsSync());}`;
  const {text}=await execute(source,{vfs:new MemoryFs()});
  assert.equal(text,'one\ntwo\n2\ntrue\n');
});

test('reports unsupported async/await explicitly',()=>{
  assert.throws(()=>parse('void main() async { await Future.value(1); }'),/not implemented: async\/sync functions and generators/);
});
