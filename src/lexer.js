const KEYWORDS = new Set([
  'abstract','as','assert','async','await','break','case','catch','class','const','continue',
  'default','deferred','do','else','enum','extends','extension','external','factory','false',
  'final','finally','for','Function','get','if','implements','import','in','interface','is',
  'late','library','mixin','new','null','on','operator','part','required','rethrow','return',
  'sealed','set','static','super','switch','sync','this','throw','true','try','typedef','var',
  'void','while','with','yield'
]);
const OPERATORS = ['>>>=','>>>','...','?..','??=','<<=','>>=','~/=','=>','?.','??','==','!=','<=','>=','++','--','+=','-=','*=','/=','%=','~/','&&','||','<<','>>','&=','|=','^=','..','?.'];

export class DartLexError extends Error {
  constructor(message, line, column) { super(`${message} at line ${line}, column ${column}`); this.name = 'DartLexError'; this.line = line; this.column = column; }
}

export function tokenize(source) {
  const tokens = [];
  let i = 0, line = 1, column = 1;
  const peek = (n=0) => source[i+n] ?? '\0';
  const advance = () => { const c = source[i++]; if (c === '\n') { line++; column = 1; } else column++; return c; };
  const add = (type, value, start, startLine, startColumn) => tokens.push({type, value, start, end:i, line:startLine, column:startColumn});
  while (i < source.length) {
    const c = peek();
    if (/\s/.test(c)) { advance(); continue; }
    if (c === '/' && peek(1) === '/') { while (i < source.length && peek() !== '\n') advance(); continue; }
    if (c === '/' && peek(1) === '*') {
      const sl=line, sc=column; advance(); advance(); let depth=1;
      while (i < source.length && depth) {
        if (peek()==='/' && peek(1)==='*') { advance(); advance(); depth++; }
        else if (peek()==='*' && peek(1)==='/') { advance(); advance(); depth--; }
        else advance();
      }
      if (depth) throw new DartLexError('Unterminated block comment', sl, sc);
      continue;
    }
    const start=i, sl=line, sc=column;
    if (c === 'r' && (peek(1)==='\'' || peek(1)==='"')) {
      advance(); const quote=advance(); let raw='';
      while (i < source.length && peek() !== quote) raw += advance();
      if (i >= source.length) throw new DartLexError('Unterminated raw string', sl, sc);
      advance(); add('STRING', {raw, quote, isRaw:true}, start, sl, sc); continue;
    }
    if (c === '\'' || c === '"') {
      const quote=advance(); let raw='', triple=false;
      if (peek()===quote && peek(1)===quote) { advance(); advance(); triple=true; }
      let closed=false;
      while (i < source.length) {
        if (triple && peek()===quote && peek(1)===quote && peek(2)===quote) { advance(); advance(); advance(); closed=true; break; }
        if (!triple && peek()===quote) { advance(); closed=true; break; }
        if (!triple && peek()==='\n') throw new DartLexError('Unterminated string literal', sl, sc);
        if (peek()==='\\') { raw += advance(); if (i < source.length) raw += advance(); }
        else raw += advance();
      }
      if (!closed) throw new DartLexError('Unterminated string literal', sl, sc);
      add('STRING', {raw, quote, isRaw:false, triple}, start, sl, sc); continue;
    }
    if (/[0-9]/.test(c)) {
      let text='';
      if (c==='0' && (peek(1)==='x' || peek(1)==='X')) { text+=advance()+advance(); while (/[0-9a-fA-F_]/.test(peek())) text+=advance(); }
      else {
        while (/[0-9_]/.test(peek())) text+=advance();
        if (peek()==='.' && /[0-9]/.test(peek(1))) { text+=advance(); while (/[0-9_]/.test(peek())) text+=advance(); }
        if (peek()==='e' || peek()==='E') { text+=advance(); if (peek()==='+'||peek()==='-') text+=advance(); if (!/[0-9]/.test(peek())) throw new DartLexError('Malformed exponent', sl, sc); while (/[0-9_]/.test(peek())) text+=advance(); }
      }
      add('NUMBER', text.replaceAll('_',''), start, sl, sc); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let text=''; while (/[A-Za-z0-9_$]/.test(peek())) text+=advance();
      add(KEYWORDS.has(text) ? 'KEYWORD' : 'IDENT', text, start, sl, sc); continue;
    }
    let matched=null;
    for (const op of OPERATORS) if (source.startsWith(op,i)) { matched=op; break; }
    if (matched) { for (let n=0;n<matched.length;n++) advance(); add('OP', matched, start, sl, sc); continue; }
    if ('{}()[];,.?:+-*/%~!<>=&|^'.includes(c)) { advance(); add('PUNCT', c, start, sl, sc); continue; }
    throw new DartLexError(`Unexpected character ${JSON.stringify(c)}`, sl, sc);
  }
  tokens.push({type:'EOF', value:'<eof>', start:i, end:i, line, column});
  return tokens;
}
