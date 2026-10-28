// Runs the real backend (backend/Code.gs) inside Node with in-memory fakes of
// the Google Apps Script services it uses (SpreadsheetApp, DriveApp, ...).
// Used by the local dev server and by the backend tests, so both exercise the
// exact code that is deployed to Apps Script — no re-implementation.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CODE_GS_PATH = path.join(ROOT, 'backend', 'Code.gs');

// ---------- Fake Spreadsheet ----------
class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) {
      throw new Error(`Invalid range r${row} c${col} ${numRows}x${numCols}`);
    }
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = (this.sheet.rows[this.row - 1 + r] || [])[this.col - 1 + c];
        line.push(v === undefined || v === null ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some(l => l.length !== this.numCols)) {
      throw new Error(`setValues dimension mismatch: expected ${this.numRows}x${this.numCols}`);
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet._set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet._set(this.row, this.col, v); return this; }
  clearContent() {
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, '');
    return this;
  }
}

// Like Google Sheets, numeric-looking text is stored (and read back) as a number.
const coerce = v => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16 ? Number(v) : v);

class FakeSheet {
  constructor(name, rows = []) { this.name = name; this.rows = rows.map(l => l.map(coerce)); }
  getName() { return this.name; }
  _set(r, c, v) {
    v = coerce(v);
    while (this.rows.length < r) this.rows.push([]);
    const line = this.rows[r - 1];
    while (line.length < c) line.push('');
    line[c - 1] = v;
  }
  // Apps Script ignores trailing empty rows/cols when computing the data range.
  getLastRow() {
    for (let r = this.rows.length; r > 0; r--) {
      if (this.rows[r - 1].some(v => v !== '' && v !== null && v !== undefined)) return r;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.rows.forEach(line => {
      for (let c = line.length; c > max; c--) {
        if (line[c - 1] !== '' && line[c - 1] !== null && line[c - 1] !== undefined) { max = c; break; }
      }
    });
    return max;
  }
  getDataRange() {
    const r = Math.max(this.getLastRow(), 1), c = Math.max(this.getLastColumn(), 1);
    return new FakeRange(this, 1, 1, r, c);
  }
  getRange(row, col, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols); }
  appendRow(values) { this.rows.splice(this.getLastRow(), this.rows.length, [...values]); return this; }
  clear() { this.rows = []; return this; }
  insertColumnAfter() { return this; }
}

class FakeSpreadsheet {
  constructor(sheets = {}) {
    this.sheets = new Map(Object.entries(sheets).map(([n, rows]) => [n, new FakeSheet(n, rows)]));
  }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.set(n, s); return s; }
  toJSON() {
    const o = {};
    this.sheets.forEach((s, n) => { o[n] = s.rows.map(l => l.map(v => v instanceof Date ? { $date: v.toISOString() } : v)); });
    return o;
  }
  static fromJSON(o) {
    const rev = {};
    Object.entries(o || {}).forEach(([n, rows]) => {
      rev[n] = rows.map(l => l.map(v => (v && typeof v === 'object' && v.$date) ? new Date(v.$date) : v));
    });
    return new FakeSpreadsheet(rev);
  }
}

// ---------- Fake Drive ----------
function makeDrive(uploadDir) {
  let counter = 0;
  const folders = new Map();
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const makeFile = (blob) => {
    const id = 'dev-file-' + Date.now() + '-' + (++counter);
    if (uploadDir) {
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, id), blob.bytes);
    }
    return {
      getId: () => id, getName: () => blob.name, setSharing() {}, setTrashed() {},
      getUrl: () => '/dev-uploads/' + id, getMimeType: () => blob.contentType,
      getSize: () => blob.bytes.length, getLastUpdated: () => new Date(),
    };
  };
  const makeFolder = (name) => {
    const files = [];
    return { name, files, setSharing() {}, createFile(blob) { const f = makeFile(blob); files.push(f); return f; }, getFiles: () => iter(files) };
  };
  return {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
    Permission: { VIEW: 'VIEW', EDIT: 'EDIT' },
    getFoldersByName(n) { return iter(folders.has(n) ? [folders.get(n)] : []); },
    createFolder(n) { const f = makeFolder(n); folders.set(n, f); return f; },
    getFolderById(id) { if (!folders.has(id)) throw new Error('Folder not found: ' + id); return folders.get(id); },
    getRootFolder() { return makeFolder('root'); },
    createFile(name, content) { return makeFile({ name, bytes: Buffer.from(String(content)), contentType: 'text/plain' }); },
    getFiles() { return iter([]); },
  };
}

// Canned AI replies so the AI features can be exercised offline.
function fakeGemini(prompt) {
  let text;
  if (/categorize them into a JSON object/.test(prompt)) {
    text = JSON.stringify({ analgesics: ['Morphine 10mg PO q4h'], antiemetics: ['Metoclopramide 10mg TID'], anxiolytics: [], sleep: [], anticoagulants: [], others: ['Lactulose 15ml BID'] });
  } else if (/clinical summary/.test(prompt)) {
    text = '**One-liner:** Demo summary generated by the local AI stub.\n\n- Symptoms reviewed\n- Medications reviewed';
  } else {
    text = '- Demo suggestion 1 (local AI stub)\n- Demo suggestion 2 (local AI stub)';
  }
  const body = JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });
  return { getResponseCode: () => 200, getContentText: () => body };
}

/**
 * Create an isolated backend instance.
 * @param {object} opts
 * @param {object} [opts.sheets] initial sheet rows, e.g. { Patients: [[...headers], [...row]] }
 * @param {object} [opts.properties] script properties (e.g. { APP_ACCESS_CODE: '...' })
 * @param {string} [opts.uploadDir] where fake Drive uploads are written
 */
export function createBackend({ sheets = {}, properties = {}, uploadDir } = {}) {
  const ss = sheets instanceof FakeSpreadsheet ? sheets : new FakeSpreadsheet(sheets);
  const props = { ...properties };
  const aiPrompts = []; // every prompt sent to the (fake) AI provider, for assertions
  const context = {
    console: { log() {}, warn() {}, error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (content) => ({ content, mime: 'text/plain', setMimeType(m) { this.mime = m; return this; }, getContent() { return this.content; } }),
    },
    DriveApp: makeDrive(uploadDir),
    Utilities: {
      base64Decode: s => Buffer.from(s, 'base64'),
      newBlob: (bytes, contentType, name) => ({ bytes: Buffer.from(bytes), contentType, name }),
      formatDate: d => new Date(d).toISOString().slice(0, 10),
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        if (!String(url).includes('generativelanguage')) return { getResponseCode: () => 200, getContentText: () => '' };
        const prompt = JSON.parse(opts.payload).contents[0].parts[0].text;
        aiPrompts.push(prompt);
        return fakeGemini(prompt);
      },
    },
    Session: { getScriptTimeZone: () => 'UTC' },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(CODE_GS_PATH, 'utf8'), context, { filename: 'Code.gs' });

  const parse = out => JSON.parse(out.getContent());
  return {
    spreadsheet: ss,
    properties: props,
    aiPrompts,
    get(params = {}) { return parse(context.doGet({ parameter: params, parameters: {} })); },
    post(body) { return parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) }, parameter: {} })); },
    call(fnName, ...args) { return context[fnName](...args); },
  };
}

export { FakeSpreadsheet };
