const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const filePath = path.resolve('public/app.js');
const src = fs.readFileSync(filePath, 'utf8');
const lines = src.split(/\r?\n/);

function parseWithAcorn(code, sourceType = 'module') {
  try {
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType,
      locations: true,
      allowAwaitOutsideFunction: false
    });
    return { ok: true, ast };
  } catch (err) {
    return {
      ok: false,
      error: {
        name: err.name,
        message: err.message,
        pos: err.pos,
        loc: err.loc
      }
    };
  }
}

function contextAround(lineNo, radius = 2) {
  const start = Math.max(1, lineNo - radius);
  const end = Math.min(lines.length, lineNo + radius);
  const out = [];
  for (let i = start; i <= end; i++) {
    out.push(`${String(i).padStart(5, ' ')}: ${lines[i - 1]}`);
  }
  return out.join('\n');
}

function lineCodepoints(line) {
  const cps = [];
  for (let i = 0; i < line.length; i++) {
    const cp = line.codePointAt(i);
    const hex = cp.toString(16).toUpperCase().padStart(4, '0');
    const ch = String.fromCodePoint(cp);
    cps.push(`${String(i + 1).padStart(3, ' ')}: U+${hex} (${JSON.stringify(ch)})`);
    if (cp > 0xFFFF) i++;
  }
  return cps;
}

function scanSuspiciousChars(rangeStart, rangeEnd) {
  const findings = [];
  const zeroWidth = new Set([0x200B,0x200C,0x200D,0x2060,0xFEFF]);
  const curly = new Set([0x2018,0x2019,0x201C,0x201D]);
  const dashes = new Set([0x2010,0x2011,0x2012,0x2013,0x2014,0x2212]);
  for (let ln = rangeStart; ln <= rangeEnd; ln++) {
    const line = lines[ln - 1] ?? '';
    for (let i = 0; i < line.length; i++) {
      const cp = line.codePointAt(i);
      if (zeroWidth.has(cp) || curly.has(cp) || dashes.has(cp)) {
        findings.push({ line: ln, col: i + 1, cp: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, ch: String.fromCodePoint(cp) });
      }
      if (cp > 0xFFFF) i++;
    }
  }
  return findings;
}

function structuralScan(rangeStart, rangeEnd) {
  const subset = lines.slice(rangeStart - 1, rangeEnd).join('\n');
  const stack = [];
  const issues = [];
  let inStr = null;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0, line = rangeStart, col = 1; i < subset.length; i++) {
    const ch = subset[i];
    const next = subset[i + 1] || '';

    if (ch === '\n') {
      line++;
      col = 1;
      inLineComment = false;
      escaped = false;
      continue;
    }

    if (inLineComment) { col++; continue; }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; col += 2; continue; }
      col++; continue;
    }

    if (!inStr && !inTemplate) {
      if (ch === '/' && next === '/') { inLineComment = true; i++; col += 2; continue; }
      if (ch === '/' && next === '*') { inBlockComment = true; i++; col += 2; continue; }
    }

    if (inStr) {
      if (!escaped && ch === inStr) inStr = null;
      escaped = !escaped && ch === '\\';
      col++;
      continue;
    }

    if (inTemplate) {
      if (!escaped && ch === '`') inTemplate = false;
      escaped = !escaped && ch === '\\';
      col++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch;
      escaped = false;
      col++;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      escaped = false;
      col++;
      continue;
    }

    if (ch === '{' || ch === '(' || ch === '[') {
      stack.push({ ch, line, col });
    } else if (ch === '}' || ch === ')' || ch === ']') {
      const last = stack.pop();
      const match = last && ((last.ch === '{' && ch === '}') || (last.ch === '(' && ch === ')') || (last.ch === '[' && ch === ']'));
      if (!match) {
        issues.push({ type: 'mismatch_closer', line, col, token: ch, opener: last ? last.ch : null, openerLine: last?.line ?? null, openerCol: last?.col ?? null });
      }
    }

    col++;
  }

  if (inStr) issues.push({ type: 'unclosed_string', quote: inStr });
  if (inTemplate) issues.push({ type: 'unclosed_template_literal' });
  if (inBlockComment) issues.push({ type: 'unclosed_block_comment' });
  for (const opener of stack) {
    issues.push({ type: 'unclosed_opener', token: opener.ch, line: opener.line, col: opener.col });
  }

  const ddCommas = [];
  const ddColons = [];
  for (let ln = rangeStart; ln <= rangeEnd; ln++) {
    const t = (lines[ln - 1] || '').replace(/\s+/g, '');
    if (t.includes(',,') || t.includes(',,')) ddCommas.push(ln);
    if (t.includes('::')) ddColons.push(ln);
  }

  return { issues, ddCommas, ddColons };
}

function firstFailureByAppending(rangeStart, rangeEnd) {
  const prefix = lines.slice(0, rangeStart - 1).join('\n');
  const suffix = lines.slice(rangeEnd).join('\n');
  const results = [];

  for (let ln = rangeStart; ln <= rangeEnd; ln++) {
    const mid = lines.slice(rangeStart - 1, ln).join('\n');
    const candidate = [prefix, mid, suffix].join('\n');
    const p = parseWithAcorn(candidate, 'module');
    if (p.ok) {
      results.push({ line: ln, ok: true });
    } else {
      results.push({ line: ln, ok: false, error: p.error });
      break;
    }
  }
  return results;
}

const report = [];
report.push('AST DIAGNOSE REPORT');
report.push(`File: ${filePath}`);
report.push(`Total lines: ${lines.length}`);
report.push('');

// Node check-like parse via Acorn
const fullParse = parseWithAcorn(src, 'module');
report.push('1) Full AST parse with Acorn');
if (fullParse.ok) {
  report.push('Result: OK');
  report.push(`Program body nodes: ${fullParse.ast.body.length}`);
} else {
  report.push('Result: FAIL');
  report.push(`Name: ${fullParse.error.name}`);
  report.push(`Message: ${fullParse.error.message}`);
  report.push(`Line: ${fullParse.error.loc?.line}`);
  report.push(`Column: ${fullParse.error.loc?.column}`);
  if (fullParse.error.loc?.line) {
    report.push('Context:');
    report.push(contextAround(fullParse.error.loc.line, 3));
  }
}
report.push('');

// Focus parse in 1380-1450 as standalone wrapped block
const focusStart = 1380;
const focusEnd = 1450;
const focusCode = lines.slice(focusStart - 1, focusEnd).join('\n');
const wrappedFocus = `async function __focus_wrapper__(){\n${focusCode}\n}`;
const focusParse = parseWithAcorn(wrappedFocus, 'script');
report.push('2) Focus range parse (1380-1450) wrapped in async function');
if (focusParse.ok) {
  report.push('Result: OK');
} else {
  report.push('Result: FAIL');
  report.push(`Name: ${focusParse.error.name}`);
  report.push(`Message: ${focusParse.error.message}`);
  report.push(`Line: ${focusParse.error.loc?.line}`);
  report.push(`Column: ${focusParse.error.loc?.column}`);
}
report.push('');

// Character inspection
report.push('3) Character inspection lines 1380-1450');
const suspicious = scanSuspiciousChars(focusStart, focusEnd);
report.push(`Suspicious unicode count: ${suspicious.length}`);
for (const s of suspicious) {
  report.push(`Line ${s.line}, Col ${s.col}, ${s.cp}, char=${JSON.stringify(s.ch)}`);
}
report.push('');

// Include JSON.stringify and code points for each line in range
for (let ln = focusStart; ln <= focusEnd; ln++) {
  const line = lines[ln - 1] ?? '';
  report.push(`Line ${ln} JSON.stringify: ${JSON.stringify(line)}`);
  const cps = lineCodepoints(line);
  if (cps.length === 0) {
    report.push('  (empty line)');
  } else {
    for (const cp of cps) report.push(`  ${cp}`);
  }
}
report.push('');

// Structural scan
const structure = structuralScan(focusStart, focusEnd);
report.push('4) Structural scan lines 1380-1450');
report.push(`Bracket/string/comment issues: ${structure.issues.length}`);
for (const i of structure.issues) report.push(JSON.stringify(i));
report.push(`Double commas lines: ${JSON.stringify(structure.ddCommas)}`);
report.push(`Double colons lines: ${JSON.stringify(structure.ddColons)}`);

const returnAwaitCheck = [];
for (let ln = focusStart; ln <= focusEnd; ln++) {
  const t = lines[ln - 1] || '';
  if (/\breturn\b/.test(t) || /\bawait\b/.test(t) || /\basync\b/.test(t)) {
    returnAwaitCheck.push({ line: ln, text: t.trim() });
  }
}
report.push('Return/await/async occurrences in range:');
for (const r of returnAwaitCheck) report.push(`Line ${r.line}: ${r.text}`);
report.push('');

// Incremental append test
report.push('5) Incremental append parse test (keeping file prefix+suffix fixed, growing 1380..N)');
const incr = firstFailureByAppending(focusStart, focusEnd);
for (const step of incr) {
  if (step.ok) report.push(`Line ${step.line}: OK`);
  else {
    report.push(`Line ${step.line}: FAIL`);
    report.push(`  ${step.error.name}: ${step.error.message}`);
    report.push(`  At line ${step.error.loc?.line}, column ${step.error.loc?.column}`);
  }
}
report.push('');

// Specific target location
const targetLine = 1431;
const target = lines[targetLine - 1] || '';
report.push('6) Target position detail 1431:31');
report.push(`Line 1431: ${target}`);
const col = 31;
const chAt = target[col - 1] ?? '';
const cpAt = chAt ? `U+${chAt.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}` : 'N/A';
report.push(`Char at 1431:31 => ${JSON.stringify(chAt)} ${cpAt}`);
report.push(`Index preview: ${JSON.stringify(target.slice(Math.max(0,col-8), col+8))}`);

const outPath = path.resolve('scripts/ast-diagnose-report.txt');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, report.join('\n'), 'utf8');
console.log(`Wrote report: ${outPath}`);

// Also print concise summary to stdout
console.log('SUMMARY');
console.log(`Full parse: ${fullParse.ok ? 'OK' : 'FAIL'}`);
console.log(`Focus parse: ${focusParse.ok ? 'OK' : 'FAIL'}`);
console.log(`Suspicious unicode: ${suspicious.length}`);
console.log(`Structural issues: ${structure.issues.length}`);
if (incr.length > 0) {
  const last = incr[incr.length - 1];
  if (last.ok) console.log(`Incremental result: all steps ${focusStart}-${focusEnd} OK`);
  else console.log(`Incremental first fail at step line ${last.line}; parser loc ${last.error.loc?.line}:${last.error.loc?.column}`);
}
