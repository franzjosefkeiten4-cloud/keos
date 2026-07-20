const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const esprima = require('esprima');
const babelParser = require('@babel/parser');

const filePath = path.resolve('public/app.js');
const src = fs.readFileSync(filePath, 'utf8');
const lines = src.split(/\r?\n/);
const R0 = 1380;
const R1 = 1450;

function parseAcorn(code){
  try {
    const ast = acorn.parse(code, { ecmaVersion:'latest', sourceType:'module', locations:true });
    return { ok:true, ast };
  } catch (e) {
    return { ok:false, err:{ parser:'acorn', name:e.name, message:e.message, line:e.loc?.line, column:e.loc?.column } };
  }
}

function parseEsprima(code){
  try {
    const ast = esprima.parseModule(code, { loc:true, tolerant:false });
    return { ok:true, ast };
  } catch (e) {
    return { ok:false, err:{ parser:'esprima', name:e.name, message:e.description || e.message, line:e.lineNumber, column:e.column } };
  }
}

function parseBabel(code){
  try {
    const ast = babelParser.parse(code, { sourceType:'module', errorRecovery:false });
    return { ok:true, ast };
  } catch (e) {
    const loc = e.loc || {};
    return { ok:false, err:{ parser:'babel', name:e.name, message:e.message, line:loc.line, column:loc.column } };
  }
}

function findNodesInRange(node, start, end, out){
  if (!node || typeof node !== 'object') return;
  if (node.loc && node.loc.start && node.loc.end) {
    if (node.loc.start.line <= end && node.loc.end.line >= start) {
      out.push({ type: node.type, start: node.loc.start, end: node.loc.end });
    }
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) findNodesInRange(c, start, end, out);
    } else if (v && typeof v === 'object' && v.type) {
      findNodesInRange(v, start, end, out);
    }
  }
}

function lineCodepoints(str){
  const arr = [];
  for (let i=0;i<str.length;i++){
    const cp = str.codePointAt(i);
    const hex = cp.toString(16).toUpperCase().padStart(4,'0');
    arr.push({ col:i+1, cp:`U+${hex}`, ch:String.fromCodePoint(cp) });
    if (cp > 0xFFFF) i++;
  }
  return arr;
}

function suspiciousInRange(start,end){
  const zeroWidth = new Set([0x200B,0x200C,0x200D,0x2060,0xFEFF]);
  const curly = new Set([0x2018,0x2019,0x201C,0x201D]);
  const dashes = new Set([0x2010,0x2011,0x2012,0x2013,0x2014,0x2212]);
  const out = [];
  for (let ln=start; ln<=end; ln++){
    const t = lines[ln-1] || '';
    for (let i=0;i<t.length;i++){
      const cp = t.codePointAt(i);
      if (zeroWidth.has(cp) || curly.has(cp) || dashes.has(cp)) {
        out.push({ line:ln, col:i+1, cp:`U+${cp.toString(16).toUpperCase().padStart(4,'0')}`, ch:String.fromCodePoint(cp) });
      }
      if (cp > 0xFFFF) i++;
    }
  }
  return out;
}

function lexicalScanWholeFile(){
  const issues = [];
  const stack = [];
  let inStr = null;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  let line = 1, col = 1;
  for (let i=0;i<src.length;i++){
    const ch = src[i];
    const next = src[i+1] || '';

    if (ch === '\n') {
      line++; col = 1; inLineComment = false; escaped = false; continue;
    }
    if (inLineComment) { col++; continue; }
    if (inBlockComment) {
      if (ch==='*' && next=== '/') { inBlockComment = false; i++; col+=2; continue; }
      col++; continue;
    }

    if (!inStr && !inTemplate) {
      if (ch==='/' && next==='/') { inLineComment = true; i++; col+=2; continue; }
      if (ch==='/' && next==='*') { inBlockComment = true; i++; col+=2; continue; }
    }

    if (inStr) {
      if (!escaped && ch===inStr) inStr = null;
      escaped = !escaped && ch==='\\';
      col++; continue;
    }

    if (inTemplate) {
      if (!escaped && ch==='`') inTemplate = false;
      escaped = !escaped && ch==='\\';
      col++; continue;
    }

    if (ch==='"' || ch==="'") { inStr = ch; escaped = false; col++; continue; }
    if (ch==='`') { inTemplate = true; escaped = false; col++; continue; }

    if (ch==='{' || ch==='(' || ch==='[') stack.push({ ch, line, col });
    if (ch==='}' || ch===')' || ch===']') {
      const last = stack.pop();
      const ok = last && ((last.ch==='{'&&ch==='}')||(last.ch==='('&&ch===')')||(last.ch==='['&&ch===']'));
      if (!ok) issues.push({ type:'mismatch', line, col, got:ch, last:last?.ch || null });
    }

    col++;
  }

  if (inStr) issues.push({ type:'unclosed_string', quote:inStr });
  if (inTemplate) issues.push({ type:'unclosed_template' });
  if (inBlockComment) issues.push({ type:'unclosed_block_comment' });
  for (const s of stack) issues.push({ type:'unclosed_opener', token:s.ch, line:s.line, col:s.col });
  return issues;
}

function incrementalWrapped(start,end){
  const out = [];
  let firstFail = null;
  for (let ln=start; ln<=end; ln++){
    const chunk = lines.slice(start-1, ln).join('\n');
    const code = `async function __diag__(){\n${chunk}\n}`;
    const p = parseAcorn(code);
    if (p.ok) {
      out.push({ line:ln, ok:true });
    } else {
      out.push({ line:ln, ok:false, err:p.err });
      if (!firstFail) firstFail = out[out.length-1];
    }
  }
  return { out, firstFail };
}

function context(line, radius=2){
  const s = Math.max(1, line-radius);
  const e = Math.min(lines.length, line+radius);
  const arr=[];
  for(let i=s;i<=e;i++) arr.push(`${String(i).padStart(5,' ')}: ${lines[i-1]}`);
  return arr.join('\n');
}

const ac = parseAcorn(src);
const es = parseEsprima(src);
const bb = parseBabel(src);

const report = [];
report.push('AST DIAGNOSE V2');
report.push(`File: ${filePath}`);
report.push(`Total lines: ${lines.length}`);
report.push('');
report.push('A) Parser comparison');
for (const r of [ac, es, bb]) {
  if (r.ok) {
    report.push(`${r.ast ? (r===ac?'acorn':r===es?'esprima':'babel') : 'parser'}: OK`);
  } else {
    report.push(`${r.err.parser}: FAIL ${r.err.name}: ${r.err.message} @ ${r.err.line}:${r.err.column}`);
    if (r.err.line) report.push(context(r.err.line, 3));
  }
}
report.push('');

if (ac.ok) {
  const nodes = [];
  findNodesInRange(ac.ast, R0, R1, nodes);
  report.push('B) AST nodes intersecting lines 1380-1450 (acorn)');
  report.push(`Intersecting node count: ${nodes.length}`);
  const top = nodes.slice(0, 80);
  for (const n of top) {
    report.push(`${n.type} ${n.start.line}:${n.start.column} -> ${n.end.line}:${n.end.column}`);
  }
  if (nodes.length > top.length) report.push(`... (${nodes.length - top.length} more)`);

  const targetLine = 1431;
  const targetColZero = 30; // 31 in 1-based
  let containing = [];
  for (const n of nodes) {
    const startsBefore = (n.start.line < targetLine) || (n.start.line === targetLine && n.start.column <= targetColZero);
    const endsAfter = (n.end.line > targetLine) || (n.end.line === targetLine && n.end.column >= targetColZero);
    if (startsBefore && endsAfter) containing.push(n);
  }
  containing = containing.sort((a,b)=> ((a.end.line-a.start.line)*1000 + (a.end.column-a.start.column)) - ((b.end.line-b.start.line)*1000 + (b.end.column-b.start.column)));
  report.push('');
  report.push('Nodes containing position 1431:31:');
  for (const c of containing.slice(0,20)) {
    report.push(`${c.type} ${c.start.line}:${c.start.column} -> ${c.end.line}:${c.end.column}`);
  }
}
report.push('');

report.push('C) Unicode inspection 1380-1450');
const suspicious = suspiciousInRange(R0,R1);
report.push(`Suspicious chars found: ${suspicious.length}`);
for (const s of suspicious) {
  report.push(`Line ${s.line} Col ${s.col}: ${s.cp} ${JSON.stringify(s.ch)}`);
}
for (let ln=R0; ln<=R1; ln++) {
  const t = lines[ln-1] || '';
  report.push(`Line ${ln} JSON.stringify: ${JSON.stringify(t)}`);
  for (const cp of lineCodepoints(t)) {
    report.push(`  ${cp.col}: ${cp.cp} ${JSON.stringify(cp.ch)}`);
  }
  if (t.length === 0) report.push('  (empty)');
}
report.push('');

report.push('D) Structural checks requested');
const lexicalIssues = lexicalScanWholeFile();
report.push(`Whole-file lexical issues: ${lexicalIssues.length}`);
for (const i of lexicalIssues) report.push(JSON.stringify(i));

const doubleComma = [];
const doubleColon = [];
const returnLines = [];
const awaitLines = [];
const asyncLines = [];
for (let ln=R0; ln<=R1; ln++) {
  const t = lines[ln-1] || '';
  const compact = t.replace(/\s+/g,'');
  if (compact.includes(',,')) doubleComma.push(ln);
  if (compact.includes('::')) doubleColon.push(ln);
  if (/\breturn\b/.test(t)) returnLines.push(ln);
  if (/\bawait\b/.test(t)) awaitLines.push(ln);
  if (/\basync\b/.test(t)) asyncLines.push(ln);
}
report.push(`Double commas in 1380-1450: ${JSON.stringify(doubleComma)}`);
report.push(`Double colons in 1380-1450: ${JSON.stringify(doubleColon)}`);
report.push(`return lines in 1380-1450: ${JSON.stringify(returnLines)}`);
report.push(`await lines in 1380-1450: ${JSON.stringify(awaitLines)}`);
report.push(`async lines in 1380-1450: ${JSON.stringify(asyncLines)}`);

report.push('');
report.push('E) Incremental append test 1380..1450 (wrapped)');
const inc = incrementalWrapped(R0,R1);
for (const step of inc.out) {
  if (step.ok) report.push(`Line ${step.line}: OK`);
  else report.push(`Line ${step.line}: FAIL ${step.err.message} @ ${step.err.line}:${step.err.column}`);
}
if (inc.firstFail) {
  report.push(`First failure step: ${inc.firstFail.line}`);
  report.push(`First failure detail: ${inc.firstFail.err.message} @ ${inc.firstFail.err.line}:${inc.firstFail.err.column}`);
}
report.push('');

const tline = lines[1431-1] || '';
const c31 = tline[30] || '';
report.push('F) Exact 1431:31');
report.push(`Line 1431: ${tline}`);
report.push(`Char[31]: ${JSON.stringify(c31)} U+${(c31 ? c31.codePointAt(0).toString(16).toUpperCase().padStart(4,'0') : 'N/A')}`);
report.push(`Context 1428-1434:\n${context(1431,3)}`);

const out = path.resolve('scripts/ast-diagnose-report-v2.txt');
fs.writeFileSync(out, report.join('\n'), 'utf8');
console.log(`Wrote report: ${out}`);

console.log('SUMMARY');
console.log(`acorn: ${ac.ok ? 'OK' : 'FAIL'}`);
console.log(`esprima: ${es.ok ? 'OK' : 'FAIL'}`);
console.log(`babel: ${bb.ok ? 'OK' : 'FAIL'}`);
console.log(`Suspicious chars: ${suspicious.length}`);
console.log(`Whole-file lexical issues: ${lexicalIssues.length}`);
if (inc.firstFail) console.log(`Incremental first fail step: ${inc.firstFail.line} (${inc.firstFail.err.message} @ ${inc.firstFail.err.line}:${inc.firstFail.err.column})`);
else console.log('Incremental: all steps OK');
