import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parse } from '../src/parser.js';
import { Interpreter } from '../src/interpreter.js';
import { VirtualFile, VirtualDirectory } from '../src/virtual_fs.js';

class MemoryFs {
  constructor(){this.entries=new Map([['/',{path:'/',type:'directory',content:''}]]);}
  normalize(p){return '/'+String(p).replaceAll('\\','/').split('/').filter(x=>x&&x!=='.').join('/');}
  parent(p){const x=this.normalize(p).split('/').filter(Boolean);x.pop();return '/'+x.join('/');}
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

test('all 21 curated Dart examples parse and execute in the advertised subset',async()=>{
  const base=new URL('../examples/',import.meta.url);
  const files=(await readdir(base)).filter(x=>x.endsWith('.dart')).sort();
  assert.equal(files.length,21);
  for(const file of files){
    const source=await readFile(new URL(file,base),'utf8');
    const program=parse(source);const output=[];
    const vfs=program.imports.some(x=>x.uri==='dart:io')?new MemoryFs():null;
    await new Interpreter({write:s=>output.push(s),vfs}).run(program);
    assert.ok(output.length>0,`${file} should print output`);
  }
});
