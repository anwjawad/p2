// Backend tests: run the real backend/Code.gs against in-memory Sheets/Drive fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../../dev/gas-sandbox.mjs';
import { seedSheets } from '../../dev/seed.mjs';

const fresh = (opts = {}) => createBackend({ sheets: seedSheets(), ...opts });

test('get_all returns patients, metadata and notes', () => {
  const api = fresh();
  const out = api.post({ action: 'get_all' });
  assert.equal(out.patients.length, 9);
  assert.ok(Array.isArray(out.metadata.sections));
  assert.equal(out.notes.length, 2);
  // JSON columns are parsed for the client
  assert.equal(typeof out.patients[0].symptoms, 'object');
});

test('doGet keeps the V6 response shape (plus notes)', () => {
  const out = fresh().get();
  assert.ok(Array.isArray(out.patients));
  assert.ok(out.metadata);
  assert.ok(Array.isArray(out.notes));
});

test('single update edits only the sent fields and can clear a field', () => {
  const api = fresh();
  const id = String(api.post({ action: 'get_all' }).patients[0].id); // Sheets returns numeric ids as numbers
  api.post({ id, diagnosis: '' , room: '999' });
  const p = api.post({ action: 'get_all' }).patients.find(x => String(x.id) === id);
  assert.equal(p.diagnosis, '');
  assert.equal(String(p.room), '999');
  assert.equal(p.name, 'Layla Haddad');
});

test('single update creates a new row with every field sent', () => {
  const api = fresh();
  api.post({ id: 'new-1', name: 'Test Person', ward: 'Surgery', room: '1', code: 'T1', age: 50, symptoms: { Pain: { active: true } } });
  const p = api.post({ action: 'get_all' }).patients.find(x => String(x.id) === 'new-1');
  assert.equal(p.ward, 'Surgery');
  assert.deepEqual(p.symptoms, { Pain: { active: true } });
});

test('batch_update moves patients and soft-deletes to TRASH', () => {
  const api = fresh();
  const [a, b] = api.post({ action: 'get_all' }).patients;
  const res = api.post({ action: 'batch_update', updates: { [a.id]: { ward: 'TRASH' }, [b.id]: { ward: 'Surgery' } } });
  assert.equal(res.changed, true);
  const after = api.post({ action: 'get_all' }).patients;
  assert.equal(after.find(x => String(x.id) === String(a.id)).ward, 'TRASH');
  assert.equal(after.find(x => String(x.id) === String(b.id)).ward, 'Surgery');
});

test('notes round-trip: saved notes come back on the next load', () => {
  const api = fresh();
  const notes = api.post({ action: 'get_all' }).notes;
  notes.push({ id: 'n3', title: 'Handover', type: 'clinical', content: '<p>x</p>', date: '2026-10-28', updatedAt: '2026-10-28T08:00:00Z' });
  assert.equal(api.post({ action: 'save_notes', notes }).count, 3);
  const loaded = api.post({ action: 'get_all' }).notes;
  assert.deepEqual(loaded.map(n => n.id), ['note-1', 'note-2', 'n3']);
});

test('save_notes rejects a non-array payload instead of wiping the sheet', () => {
  const api = fresh();
  const out = api.post({ action: 'save_notes', notes: null });
  assert.match(out.error, /array/);
  assert.equal(api.post({ action: 'get_all' }).notes.length, 2);
});

test('metadata save merges keys', () => {
  const api = fresh();
  api.post({ action: 'save_metadata', metadata: { theme: 'x' } });
  const meta = api.post({ action: 'get_all' }).metadata;
  assert.equal(meta.theme, 'x');
  assert.ok(Array.isArray(meta.sections));
});

test('reset_day archives every patient, then clears the board', () => {
  const api = fresh();
  const before = api.post({ action: 'get_history_dates' }).dates.length;
  const res = api.post({ action: 'reset_day' });
  assert.equal(res.archived_count, 9);
  assert.equal(api.post({ action: 'get_all' }).patients.length, 0);
  const dates = api.post({ action: 'get_history_dates' }).dates;
  assert.equal(dates.length, before + 1);
  const today = dates.sort().at(-1);
  const day = api.post({ action: 'get_history_data', date: today });
  assert.equal(day.patients.length, 9);
});

test('reset_day on an empty board does not throw', () => {
  const api = fresh();
  api.post({ action: 'reset_day' });
  const again = api.post({ action: 'reset_day' });
  assert.equal(again.status, 'success');
});

test('patient history finds archived rows by code', () => {
  const api = fresh();
  const out = api.post({ action: 'get_patient_history', code: 'PAT10421' });
  assert.equal(out.status, 'success');
  assert.equal(out.history.length, 2);
});

test('history index lists archived ids and codes', () => {
  const out = fresh().post({ action: 'get_history_index' });
  assert.ok(out.codes.includes('PAT10421'));
});

test('analytics aggregates census from the history log', () => {
  const out = fresh().post({ action: 'get_analytics' });
  assert.equal(out.status, 'success');
  assert.equal(out.dates.length, 2);
  assert.deepEqual(out.census, [5, 6]);
});

test('image upload stores a file and returns its id', () => {
  const out = fresh().post({ action: 'upload_image', image: 'data:image/png;base64,iVBORw0KGgo=', filename: 'a.png' });
  assert.equal(out.status, 'success');
  assert.ok(out.fileId);
});

test('AI prompts do not include the patient name', () => {
  const api = fresh();
  const patient = { name: 'Layla Haddad', age: 67, diagnosis: 'Pancreatic cancer', symptoms: {}, labs: {}, medications: 'Morphine' };
  assert.equal(api.post({ action: 'generate_summary', patient }).status, 'success');
  assert.equal(api.post({ action: 'generate_suggestions', patient }).status, 'success');
  assert.equal(api.aiPrompts.length, 2);
  api.aiPrompts.forEach(p => {
    assert.ok(!p.includes('Layla'), 'name leaked to AI prompt');
    assert.ok(p.includes('Pancreatic cancer'));
  });
});

test('errors do not leak stack traces', () => {
  const out = fresh().post('{not json');
  assert.ok(out.error);
  assert.equal(out.stack, undefined);
});

// ---- Access code (optional protection) ----
test('without APP_ACCESS_CODE the API stays open (V6 compatible)', () => {
  const api = fresh();
  assert.equal(api.post({ action: 'verify_access' }).protected, false);
  assert.ok(api.get().patients);
});

test('with APP_ACCESS_CODE every read and write requires the code', () => {
  const api = fresh({ properties: { APP_ACCESS_CODE: 's3cret-code' } });
  assert.equal(api.get().error, 'UNAUTHORIZED');
  assert.equal(api.post({ action: 'get_all' }).error, 'UNAUTHORIZED');
  assert.equal(api.post({ action: 'get_all', token: 'wrong-code!' }).error, 'UNAUTHORIZED');
  assert.equal(api.post({ id: 'x', name: 'hack' }).error, 'UNAUTHORIZED');
  assert.equal(api.post({ action: 'reset_day' }).error, 'UNAUTHORIZED');
  // nothing was written by the rejected calls
  const ok = api.post({ action: 'get_all', token: 's3cret-code' });
  assert.equal(ok.patients.length, 9);
  assert.equal(api.get({ token: 's3cret-code' }).patients.length, 9);
});

test('the access token is never stored as a patient field', () => {
  const api = fresh({ properties: { APP_ACCESS_CODE: 'abc' } });
  api.post({ id: 'n-1', name: 'A', ward: 'Surgery', token: 'abc' });
  const sheet = api.spreadsheet.getSheetByName('Patients');
  const headers = sheet.getDataRange().getValues()[0];
  assert.ok(!headers.includes('token'));
});
