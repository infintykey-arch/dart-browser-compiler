const DB_NAME='dart-browser-compiler-vfs-v1';
const STORE='entries';

export function normalizePath(input) {
  const parts=[];
  for (const bit of String(input).replaceAll('\\','/').split('/')) {
    if (!bit || bit==='.') continue;
    if (bit==='..') { if (parts.length) parts.pop(); continue; }
    parts.push(bit);
  }
  return '/' + parts.join('/');
}

export class VirtualFileSystem {
  constructor({indexedDB=globalThis.indexedDB}={}) {
    this.indexedDB=indexedDB;
    this.entries=new Map([['/',{path:'/',type:'directory',content:''}]]);
    this.db=null;
    this.readyPromise=this.open();
  }
  async open() {
    if (!this.indexedDB) throw new Error('not implemented: IndexedDB is unavailable; virtual files cannot be persisted in this browser.');
    this.db=await new Promise((resolve,reject)=>{
      const request=this.indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'path'});};
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    });
    const rows=await new Promise((resolve,reject)=>{const tx=this.db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    this.entries=new Map([['/',{path:'/',type:'directory',content:''}],...rows.map(x=>[x.path,x])]);
    return this;
  }
  ensureReady() { if (!this.db) throw new Error('Virtual file system is not ready. Wait for IndexedDB initialization before running.'); }
  persist(entry) {
    this.ensureReady();
    const tx=this.db.transaction(STORE,'readwrite');
    if(entry) tx.objectStore(STORE).put(entry); else tx.objectStore(STORE).clear();
    tx.onerror=()=>console.error('Virtual file system persistence failed:',tx.error);
  }
  require(path,type=null) {
    const p=normalizePath(path), entry=this.entries.get(p);
    if (!entry || (type && entry.type!==type)) throw new Error(`FileSystemException: No such ${type==='file'?'file':'file system entity'}: ${p}`);
    return entry;
  }
  parent(path) { const p=normalizePath(path); return p==='/'?'/':p.slice(0,p.lastIndexOf('/'))||'/'; }
  makeDirectory(path,recursive=false) {
    this.ensureReady(); const p=normalizePath(path);
    if (this.entries.has(p)) return this.entries.get(p);
    const parent=this.parent(p);
    if (!this.entries.has(parent)) { if (!recursive) throw new Error(`FileSystemException: Parent directory does not exist: ${parent}`); this.makeDirectory(parent,true); }
    else if (this.entries.get(parent).type!=='directory') throw new Error(`FileSystemException: Parent is not a directory: ${parent}`);
    const entry={path:p,type:'directory',content:''}; this.entries.set(p,entry); this.persist(entry); return entry;
  }
  createFile(path,recursive=false,exclusive=false) {
    this.ensureReady(); const p=normalizePath(path);
    if(this.entries.has(p)){if(exclusive)throw new Error(`FileSystemException: File already exists: ${p}`);return this.entries.get(p);}
    const parent=this.parent(p); if(!this.entries.has(parent)){if(!recursive)throw new Error(`FileSystemException: Parent directory does not exist: ${parent}`);this.makeDirectory(parent,true);}
    if(this.entries.get(parent).type!=='directory')throw new Error(`FileSystemException: Parent is not a directory: ${parent}`);
    const entry={path:p,type:'file',content:''};this.entries.set(p,entry);this.persist(entry);return entry;
  }
  read(path) { return this.require(path,'file').content; }
  write(path,content,{append=false,flush=true}={}) {
    this.ensureReady(); const p=normalizePath(path); if(!this.entries.has(p))this.createFile(p,true);
    const old=this.require(p,'file'); const entry={...old,content:append?old.content+String(content):String(content)};this.entries.set(p,entry);this.persist(entry);return entry;
  }
  exists(path) { const entry=this.entries.get(normalizePath(path));return !!entry; }
  delete(path,{recursive=false}={}) {
    this.ensureReady();const p=normalizePath(path);const entry=this.entries.get(p);if(!entry)throw new Error(`FileSystemException: No such file or directory: ${p}`);
    const children=[...this.entries.keys()].filter(k=>k!==p&&k.startsWith(p==='/'?'/':p+'/'));
    if(entry.type==='directory'&&children.length&&!recursive)throw new Error(`FileSystemException: Directory not empty: ${p}`);
    const remove=entry.type==='directory'&&recursive?[p,...children]:[p];
    for(const k of remove)this.entries.delete(k);
    const tx=this.db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);for(const k of remove)store.delete(k);
  }
  copy(from,to) { const source=this.require(from,'file');const target=normalizePath(to);if(this.entries.has(target))throw new Error(`FileSystemException: Destination already exists: ${target}`);this.createFile(target,true);return this.write(target,source.content); }
  rename(from,to) {
    const old=normalizePath(from), target=normalizePath(to), entry=this.require(old);if(this.entries.has(target))throw new Error(`FileSystemException: Destination already exists: ${target}`);
    if(entry.type==='file'){this.createFile(target,true);this.write(target,entry.content);this.delete(old);return target;}
    this.makeDirectory(target,true);const descendants=[...this.entries.values()].filter(x=>x.path.startsWith(old+'/'));
    for(const child of descendants){const newPath=target+child.path.slice(old.length);const clone={...child,path:newPath};this.entries.set(newPath,clone);this.persist(clone);this.entries.delete(child.path);}
    this.delete(old,{recursive:true});return target;
  }
  list(path,{recursive=false}={}) {
    const p=normalizePath(path);this.require(p,'directory');
    const children=[...this.entries.values()].filter(e=>e.path!==p&&e.path.startsWith(p==='/'?'/':p+'/')&&(recursive||!e.path.slice((p==='/'?0:p.length+1)).includes('/')));
    return children.sort((a,b)=>a.path.localeCompare(b.path));
  }
  file(path) { return new VirtualFile(this,path); }
  directory(path) { return new VirtualDirectory(this,path); }
}

export class VirtualFile {
  constructor(fs,path) { this.fs=fs;this.path=String(path);this.__dartFile=true; }
  readAsStringSync() { return this.fs.read(this.path); }
  readAsLinesSync() { const s=this.readAsStringSync();const lines=s.split(/\r?\n/);if(s.endsWith('\n')||s.endsWith('\r'))lines.pop();return lines; }
  writeAsStringSync(contents,{mode='write'}={}) { this.fs.write(this.path,String(contents),{append:mode==='append'});return this; }
  existsSync() { return this.fs.exists(this.path)&&this.fs.entries.get(normalizePath(this.path)).type==='file'; }
  createSync({recursive=false,exclusive=false}={}) { this.fs.createFile(this.path,recursive,exclusive);return this; }
  deleteSync({recursive=false}={}) { this.fs.delete(this.path,{recursive});return this; }
  copySync(newPath) { this.fs.copy(this.path,newPath);return this.fs.file(newPath); }
  renameSync(newPath) { this.fs.rename(this.path,newPath);this.path=String(newPath);return this; }
  async readAsString() { return this.readAsStringSync(); }
  async readAsLines() { return this.readAsLinesSync(); }
  async writeAsString(contents,options={}) { this.writeAsStringSync(contents,options);return this; }
  async exists() { return this.existsSync(); }
  async create(options={}) { this.createSync(options);return this; }
  async delete(options={}) { this.deleteSync(options);return this; }
  async copy(newPath) { return this.copySync(newPath); }
  async rename(newPath) { return this.renameSync(newPath); }
}

export class VirtualDirectory {
  constructor(fs,path) { this.fs=fs;this.path=String(path);this.__dartDirectory=true; }
  existsSync() { return this.fs.exists(this.path)&&this.fs.entries.get(normalizePath(this.path)).type==='directory'; }
  createSync({recursive=false}={}) { this.fs.makeDirectory(this.path,recursive);return this; }
  deleteSync({recursive=false}={}) { this.fs.delete(this.path,{recursive});return this; }
  listSync({recursive=false}={}) { return this.fs.list(this.path,{recursive}).map(e=>e.type==='file'?this.fs.file(e.path):this.fs.directory(e.path)); }
  async exists() { return this.existsSync(); }
  async create(options={}) { this.createSync(options);return this; }
  async delete(options={}) { this.deleteSync(options);return this; }
  list() { throw new Error('UnsupportedError: not implemented: Directory.list() returns Stream<FileSystemEntity>; stream semantics are not implemented. Use Directory.listSync() in this subset.'); }
}
