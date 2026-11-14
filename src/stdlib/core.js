export function dartString(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(dartString).join(', ')}]`;
  if (value instanceof Set) return `{${[...value].map(dartString).join(', ')}}`;
  if (value instanceof Map) return `{${[...value].map(([k,v]) => `${dartString(k)}: ${dartString(v)}`).join(', ')}}`;
  if (value?.__dartFile) return `File: '${value.path}'`;
  if (value?.__dartDirectory) return `Directory: '${value.path}'`;
  if (value?.__dartFunction) return 'Closure';
  return String(value);
}

export function decodeDartString(raw) {
  let out = '';
  for (let i=0; i<raw.length; i++) {
    const c=raw[i];
    if (c !== '\\') { out += c; continue; }
    const n=raw[++i];
    if (n === undefined) throw new Error('FormatException: trailing escape in string.');
    const simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','\\':'\\','\'':"'",'"':'"','$':'$'};
    if (Object.hasOwn(simple,n)) { out += simple[n]; continue; }
    if (n==='x') { const h=raw.slice(i+1,i+3); if(!/^[0-9a-fA-F]{2}$/.test(h)) throw new Error('FormatException: malformed hexadecimal escape.'); out+=String.fromCharCode(parseInt(h,16)); i+=2; continue; }
    if (n==='u') {
      if (raw[i+1]==='{') { const end=raw.indexOf('}',i+2); if(end<0) throw new Error('FormatException: malformed Unicode escape.'); const cp=parseInt(raw.slice(i+2,end),16); if(!Number.isInteger(cp)||cp>0x10ffff)throw new Error('FormatException: invalid Unicode code point.'); out+=String.fromCodePoint(cp); i=end; continue; }
      const h=raw.slice(i+1,i+5); if(!/^[0-9a-fA-F]{4}$/.test(h)) throw new Error('FormatException: malformed Unicode escape.'); out+=String.fromCharCode(parseInt(h,16)); i+=4; continue;
    }
    if (n==='\n') continue;
    throw new Error(`FormatException: unsupported escape sequence \\${n}.`);
  }
  return out;
}
