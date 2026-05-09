// Spreadsheet formula engine.
// Pure functions: parse formulas into ASTs, build a dependency graph,
// detect cycles, and evaluate cells in topological order.

export const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const MAX_COLS = COL_LABELS.length;
export const MAX_ROWS = 100;

export const ERROR_CIRCULAR = '#CIRCULAR';
export const ERROR_GENERIC = '#ERROR';

export function cellId(col, row) {
  return `${COL_LABELS[col]}${row + 1}`;
}

export function isValidCellId(raw) {
  return /^([A-Z])([1-9]|[1-9]\d|100)$/.test(raw);
}

// --- Tokenizer ---------------------------------------------------------------

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')') {
      tokens.push({ type: c });
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let num = '';
      let sawDot = false;
      while (i < src.length) {
        const ch = src[i];
        if (ch >= '0' && ch <= '9') {
          num += ch;
          i++;
        } else if (ch === '.' && !sawDot) {
          sawDot = true;
          num += ch;
          i++;
        } else {
          break;
        }
      }
      const value = Number(num);
      if (Number.isNaN(value)) {
        throw new Error(`Invalid number: ${num}`);
      }
      tokens.push({ type: 'NUM', value });
      continue;
    }
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
      let ref = '';
      while (i < src.length && /[A-Za-z0-9]/.test(src[i])) {
        ref += src[i];
        i++;
      }
      const upper = ref.toUpperCase();
      const m = /^([A-Z]+)(\d+)$/.exec(upper);
      if (!m) {
        throw new Error(`Invalid identifier: ${ref}`);
      }
      tokens.push({ type: 'REF', raw: upper });
      continue;
    }
    throw new Error(`Unexpected character: '${c}'`);
  }
  return tokens;
}

// --- Parser (recursive descent) ---------------------------------------------
// Grammar:
//   expr   = term  (('+' | '-') term)*
//   term   = factor (('*' | '/') factor)*
//   factor = ('+' | '-') factor | '(' expr ')' | NUM | REF

function parseTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];

  function expectClose() {
    const t = tokens[pos];
    if (!t || t.type !== ')') throw new Error('Missing closing parenthesis');
    pos++;
  }

  function parseExpr() {
    let left = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = tokens[pos++].type;
      const right = parseTerm();
      left = { type: 'binop', op, left, right };
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = tokens[pos++].type;
      const right = parseFactor();
      left = { type: 'binop', op, left, right };
    }
    return left;
  }

  function parseFactor() {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.type === '+' || t.type === '-') {
      pos++;
      return { type: 'unary', op: t.type, expr: parseFactor() };
    }
    if (t.type === '(') {
      pos++;
      const inner = parseExpr();
      expectClose();
      return inner;
    }
    if (t.type === 'NUM') {
      pos++;
      return { type: 'num', value: t.value };
    }
    if (t.type === 'REF') {
      pos++;
      if (!isValidCellId(t.raw)) {
        throw new Error(`Unknown cell reference: ${t.raw}`);
      }
      return { type: 'ref', raw: t.raw };
    }
    throw new Error(`Unexpected token: ${t.type}`);
  }

  if (tokens.length === 0) throw new Error('Empty expression');
  const ast = parseExpr();
  if (pos !== tokens.length) {
    throw new Error('Unexpected trailing tokens');
  }
  return ast;
}

export function parseFormula(formula) {
  // formula must start with '='
  if (typeof formula !== 'string' || !formula.startsWith('=')) {
    throw new Error('Not a formula');
  }
  const body = formula.slice(1);
  const tokens = tokenize(body);
  return parseTokens(tokens);
}

// --- Dependency extraction ---------------------------------------------------

export function extractRefs(ast) {
  const refs = new Set();
  (function walk(n) {
    if (!n) return;
    if (n.type === 'ref') {
      refs.add(n.raw);
    } else if (n.type === 'binop') {
      walk(n.left);
      walk(n.right);
    } else if (n.type === 'unary') {
      walk(n.expr);
    }
  })(ast);
  return refs;
}

// --- Evaluation --------------------------------------------------------------

function evalAst(ast, lookup) {
  switch (ast.type) {
    case 'num':
      return ast.value;
    case 'ref':
      return lookup(ast.raw);
    case 'unary': {
      const v = evalAst(ast.expr, lookup);
      return ast.op === '-' ? -v : +v;
    }
    case 'binop': {
      const l = evalAst(ast.left, lookup);
      const r = evalAst(ast.right, lookup);
      switch (ast.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (r === 0) throw new Error('Division by zero');
          return l / r;
        default:
          throw new Error(`Unknown operator: ${ast.op}`);
      }
    }
    default:
      throw new Error(`Bad AST node: ${ast.type}`);
  }
}

// --- Whole-sheet computation ------------------------------------------------
// Given cells = { id -> rawString }, returns { values, errors, deps }
//   values[id] is either a number (for formula or numeric value cells) or a
//   string (for text value cells). Empty cells are absent.
//   errors[id] is one of ERROR_CIRCULAR or ERROR_GENERIC for cells that failed.
//   deps[id] is the Set of ids the formula at id depends on (only for formulas).

export function computeSheet(cells) {
  const parsed = {}; // id -> { kind, ast?, refs?, raw }
  const deps = {}; // id -> Set<id>
  const values = {};
  const errors = {};

  for (const id of Object.keys(cells)) {
    const raw = cells[id];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    if (typeof raw === 'string' && raw.startsWith('=')) {
      try {
        const ast = parseFormula(raw);
        const refs = extractRefs(ast);
        parsed[id] = { kind: 'formula', ast, refs };
        deps[id] = refs;
      } catch {
        parsed[id] = { kind: 'parseError' };
        errors[id] = ERROR_GENERIC;
      }
    } else {
      parsed[id] = { kind: 'value', raw };
    }
  }

  // Cycle detection on dependency graph (formula nodes only).
  // We mark every cell that participates in a cycle (or transitively depends
  // on a cycle) as #CIRCULAR.
  const inCycle = new Set();
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function dfs(id) {
    if (visited.has(id)) {
      return inCycle.has(id);
    }
    if (visiting.has(id)) {
      // Found a back edge: mark every node from id onward as in a cycle.
      const idx = stack.indexOf(id);
      for (let i = idx; i < stack.length; i++) {
        inCycle.add(stack[i]);
      }
      return true;
    }
    const p = parsed[id];
    if (!p || p.kind !== 'formula') {
      visited.add(id);
      return false;
    }
    visiting.add(id);
    stack.push(id);
    let touchesCycle = false;
    for (const dep of p.refs) {
      if (dfs(dep)) {
        touchesCycle = true;
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    if (touchesCycle) {
      inCycle.add(id);
    }
    return inCycle.has(id);
  }

  for (const id of Object.keys(parsed)) {
    if (!visited.has(id)) {
      dfs(id);
    }
  }

  for (const id of inCycle) {
    errors[id] = ERROR_CIRCULAR;
  }

  // Evaluate non-cycle formulas with memoization. Value cells have already
  // been recorded.
  const computed = {};

  function getValue(id) {
    if (id in computed) return computed[id];
    if (errors[id]) {
      throw new Error(errors[id]);
    }
    const p = parsed[id];
    if (!p) {
      // Empty cell: treat as 0 in numeric context.
      computed[id] = 0;
      return 0;
    }
    if (p.kind === 'value') {
      const n = Number(p.raw);
      if (p.raw !== '' && !Number.isNaN(n)) {
        computed[id] = n;
        return n;
      }
      // Non-numeric text. Returning a string lets callers detect the
      // problem; numeric arithmetic on it will yield NaN.
      computed[id] = p.raw;
      return p.raw;
    }
    if (p.kind === 'parseError') {
      throw new Error(ERROR_GENERIC);
    }
    if (inCycle.has(id)) {
      throw new Error(ERROR_CIRCULAR);
    }
    try {
      const v = evalAst(p.ast, (refId) => {
        const rv = getValue(refId);
        if (typeof rv === 'string') {
          // text used in arithmetic
          throw new Error(ERROR_GENERIC);
        }
        return rv;
      });
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(ERROR_GENERIC);
      }
      computed[id] = v;
      return v;
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const code = msg === ERROR_CIRCULAR ? ERROR_CIRCULAR : ERROR_GENERIC;
      errors[id] = code;
      throw new Error(code, { cause: e });
    }
  }

  for (const id of Object.keys(parsed)) {
    if (errors[id]) continue;
    try {
      getValue(id);
    } catch {
      // error already recorded
    }
  }

  for (const id of Object.keys(computed)) {
    if (!errors[id]) {
      values[id] = computed[id];
    }
  }

  return { values, errors, deps };
}

// --- Display helpers ---------------------------------------------------------

export function displayValue({ values, errors }, id, raw) {
  if (errors[id]) return errors[id];
  if (id in values) {
    const v = values[id];
    if (typeof v === 'number') {
      // Trim long floating-point noise but keep precision.
      if (Number.isInteger(v)) return String(v);
      return String(Number(v.toFixed(10)));
    }
    return v;
  }
  return raw ?? '';
}
