export function installIo(env,{write,readLine,getVfs,exit}) {
  env.define('stdout',{
    write:(args)=>{write(args.length?dartText(args[0]):'');return null;},
    writeln:(args)=>{write((args.length?dartText(args[0]):'')+'\n');return null;}
  },false);
  env.define('stdin',{readLineSync:()=>{
    if(readLine)return readLine();
    if(typeof globalThis.prompt==='function')return globalThis.prompt('Dart stdin.readLineSync()')??null;
    throw new Error('UnsupportedError: not implemented: stdin.readLineSync() without a browser prompt provider.');
  }},false);
  env.define('File',(args)=>getVfs().file(expectPath(args[0],'File')),false);
  env.define('Directory',(args)=>getVfs().directory(expectPath(args[0],'Directory')),false);
  env.define('Platform',{operatingSystem:'browser',isBrowser:true,environment:new Map(),pathSeparator:'/',lineTerminator:'\n'},false);
  env.define('exit',(args)=>exit(args[0]??0),false);
  for(const name of ['Link','Process','Socket','ServerSocket','RawSocket','RawServerSocket','HttpServer','WebSocket','RawDatagramSocket','HttpClient','RandomAccessFile','IOSink']) {
    env.define(name,()=>{throw new Error(`UnsupportedError: not implemented: ${name} from dart:io; browser restrictions prevent this operation.`);},false);
  }
}
function expectPath(value,kind) { if(typeof value!=='string')throw new Error(`ArgumentError: ${kind} path must be a String.`);return value; }
function dartText(value) {
  if(value===null||value===undefined)return 'null';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  if(Array.isArray(value))return `[${value.map(dartText).join(', ')}]`;
  if(value instanceof Map)return `{${[...value].map(([k,v])=>`${dartText(k)}: ${dartText(v)}`).join(', ')}}`;
  if(value instanceof Set)return `{${[...value].map(dartText).join(', ')}}`;
  return String(value);
}
