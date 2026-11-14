import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { Interpreter } from './interpreter.js';
import { VirtualFileSystem } from './virtual_fs.js';

const editor=document.querySelector('#source');
const gutter=document.querySelector('#gutter');
const output=document.querySelector('#output');
const astView=document.querySelector('#ast');
const status=document.querySelector('#status');
const runButton=document.querySelector('#run');
const examples=document.querySelector('#examples');
const defaultCode=`import 'dart:io';

void main() {
  final file = File('hello.txt');
  file.writeAsStringSync('Hello from Dart in the browser!');
  stdout.writeln(file.readAsStringSync());
}
`;

function updateGutter(errorLine=null){
  const count=editor.value.split('\n').length;
  gutter.innerHTML=Array.from({length:count},(_,i)=>`<span class="line-number ${i+1===errorLine?'error-line':''}">${i+1}</span>`).join('\n');
  gutter.scrollTop=editor.scrollTop;
}
function setStatus(text,kind='ready'){status.textContent=text;status.className=`status ${kind}`;}
function showError(error){
  const line=error.line??error.token?.line??null;
  updateGutter(line);
  output.textContent=`${error.name??'Error'}: ${error.message??String(error)}`;
  setStatus(line?`Error · line ${line}`:'Error','error');
  document.querySelector('[data-tab="output"]').click();
}
async function run(){
  runButton.disabled=true;output.textContent='';updateGutter();setStatus('Tokenizing…','busy');
  try{
    const tokens=tokenize(editor.value);
    const program=parse(editor.value);
    astView.textContent=JSON.stringify(program,null,2);
    setStatus(`Running · ${tokens.length-1} tokens`,'busy');
    const vfs=program.imports.some(x=>x.uri==='dart:io')?new VirtualFileSystem():null;
    let text='';
    const interpreter=new Interpreter({write:value=>{text+=value;output.textContent=text;output.scrollTop=output.scrollHeight;},readLine:()=>window.prompt('Dart stdin.readLineSync()'),vfs});
    await interpreter.run(program);
    if(!text)output.textContent='(program completed with no output)';
    setStatus('Completed','success');
  }catch(error){showError(error);}
  finally{runButton.disabled=false;}
}

editor.value=defaultCode;updateGutter();
editor.addEventListener('input',()=>updateGutter());
editor.addEventListener('scroll',()=>{gutter.scrollTop=editor.scrollTop;});
editor.addEventListener('keydown',event=>{
  if(event.key==='Tab'){event.preventDefault();const a=editor.selectionStart,b=editor.selectionEnd;editor.setRangeText('  ',a,b,'end');updateGutter();}
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}
});
runButton.addEventListener('click',run);
for(const tab of document.querySelectorAll('.tab'))tab.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab));
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===tab.dataset.tab));
});
examples.addEventListener('change',async()=>{
  const path=examples.value;if(!path)return;
  try{const response=await fetch(path);if(!response.ok)throw new Error(`HTTP ${response.status}`);editor.value=await response.text();updateGutter();setStatus('Example loaded','ready');}
  catch(e){setStatus(`Could not load example: ${e.message}`,'error');}
});
try{
  const response=await fetch('./examples/manifest.json');if(!response.ok)throw new Error('Examples unavailable');
  const list=await response.json();
  for(const item of list){const option=document.createElement('option');option.value=`./examples/${item.file}`;option.textContent=item.title;examples.append(option);}
}catch{const option=document.createElement('option');option.value='';option.textContent='Examples load when hosted over HTTP(S)';examples.append(option);}
