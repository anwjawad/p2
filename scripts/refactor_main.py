"""One-off refactor of web/js/main.js for the v2 redesign (kept for review).

Moves shell/board UI functions to js/ui.js (deleted here), removes duplicate
definitions, fixes mojibake, and applies targeted bug fixes. Every replacement
asserts that its anchor exists exactly once so nothing changes silently.
"""
import pathlib, re, sys

P = pathlib.Path(__file__).resolve().parents[1] / 'web' / 'js' / 'main.js'
s = P.read_text(encoding='utf-8')


def fix_mojibake(text):
    out = []
    for line in text.split('\n'):
        if any(c in line for c in ('â', 'Ã', 'ï¸')):
            try:
                line = line.encode('cp1252').decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
        out.append(line)
    return '\n'.join(out)


def func_span(text, name, nth=0):
    """Return (start, end) of the nth top-level `function name(` / `async function name(` block."""
    pat = re.compile(r'^(async\s+)?function\s+' + re.escape(name) + r'\s*\(', re.M)
    m = list(pat.finditer(text))
    if len(m) <= nth:
        raise SystemExit(f'function {name} #{nth} not found')
    start = m[nth].start()
    i = text.index('{', start)
    depth = 0
    in_str = None
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c == '/' and text[i + 1] == '/':
            i = text.index('\n', i)
            continue
        elif c == '/' and text[i + 1] == '*':
            i = text.index('*/', i) + 2
            continue
        elif c in '"\'`':
            in_str = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(text) and text[end] in '\r\n':
                    end += 1
                return start, end
        i += 1
    raise SystemExit(f'unbalanced {name}')


def remove_func(name, nth=0):
    global s
    a, b = func_span(s, name, nth)
    s = s[:a] + s[b:]


def replace_func(name, new_src, nth=0):
    global s
    a, b = func_span(s, name, nth)
    s = s[:a] + new_src.strip('\n') + '\n\n' + s[b:]


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit(f'anchor found {n}x (expected {count}): {old[:80]!r}')
    s = s.replace(old, new)


s = s.replace('\r\n', '\n')
s = fix_mojibake(s)

# ---------------------------------------------------------------- config
rep('''// TODO: Update this URL with your deployed Web App URL
var GAS_API_URL = "https://script.google.com/macros/s/AKfycbxJ0bG4MEptJCL_4057PM1UkFXrVSp5Vyydrq4ZvAUzGt3-gqyGq4aV1UhRpi90tszK/exec";''',
    '''// Backend URLs live in js/config.js (window.APP_CONFIG).
var GAS_API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';''')
s = s.replace('GAS_API_URL.includes("Paste_Your")', '!GAS_API_URL')
rep('''const HVC_API_URL = "https://script.google.com/macros/s/AKfycbzKCvkaQ8sDBoYCTWd9K4Rt9L4MPK3p1llGZwDT5nd5E33NeRen1l973EtFQyI42FvQ/exec";
const PE_API_URL = "https://script.google.com/macros/s/AKfycbwjwZcOtRy0SmgBZABxPVDE30NHD2y_Tfu8py5P_VmETiPZz07QHleM7vTQYWyaZQB2/exec";
const PORTCATH_API_URL = "https://script.google.com/macros/s/AKfycbyxuzwed0kHqZ3jPJKWKemX0huzKOFvm-1nooaTlo3NwEePG-ElI_9xkADLjTk-R6bK/exec";
const PORTCATH_API_KEY = "medsched-2026-key-abc123";''',
    '''const HVC_API_URL = (window.APP_CONFIG || {}).HVC_API_URL || '';
const PE_API_URL = (window.APP_CONFIG || {}).PE_API_URL || '';
const PORTCATH_API_URL = (window.APP_CONFIG || {}).PORTCATH_API_URL || '';
const PORTCATH_API_KEY = (window.APP_CONFIG || {}).PORTCATH_API_KEY || '';''')

# ------------------------------------------- functions now living in ui.js / core.js
for name in ['setupSearch', 'openNewPatientModal', 'toggleSidebar', 'loadMockData',
             'renderWardsSidebar', 'deleteWard', 'togglePharmacyMode', 'toggleSelectionMode',
             'updateFloatingActionBar', 'togglePatientSelection', 'executeBulkMove',
             'executeBulkDelete', 'selectWard', 'toggleHighlight',
             'openSettingsModal', 'closeSettingsModal', 'updateSettingsUI', 'setTheme', 'applyTheme',
             'setAccent', 'applyAccent', 'toggleAnimations', 'applyAnimations', 'getThemeIcon',
             'setDesign', 'applyDesign',
             'openAnalyticsView', 'closeAnalyticsView', 'openCathStudioView', 'closeCathStudioView']:
    remove_func(name)
# duplicates: the second definitions won at runtime
remove_func('quickAddStandardSections', 0)
remove_func('quickAddStandardSections', 0)   # both replaced by ui.js (non-destructive version)
remove_func('showPlanDetail', 0)             # first copy was dead (shadowed by the later one)

rep('''// Settings & Theming Logic
const currentSettings = {
    theme: localStorage.getItem('app_theme') || 'light',
    accent: localStorage.getItem('app_accent') || 'blue',
    design: localStorage.getItem('app_design') || 'default',
    animations: localStorage.getItem('app_animations') !== 'false'
};

// Init Settings
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentSettings.theme);
    applyAccent(currentSettings.accent);
    applyDesign(currentSettings.design);
    applyAnimations(currentSettings.animations);
});
''', '// Appearance settings: see js/core.js\n')
s = re.sub(r"// --- 5 Immersive Design System Logic ---\n\n// Icon Mappings for Themes\nconst THEME_ICONS = \{.*?\n\};\n", '', s, flags=re.S)

rep('''document.addEventListener('DOMContentLoaded', () => {
    if (!GAS_API_URL) {
        alert("Please paste your Google Web App URL in main.js file!");
        loadMockData();
    } else {
        fetchData();
    }
    setupSearch();
});''', '''// Boot: see js/ui.js (initApp)''')

# ------------------------------------------------------------- fetchData
replace_func('fetchData', r'''
async function fetchData(options = {}) {
    const grid = document.getElementById('patients-grid');
    if (grid && !options.silent) grid.setAttribute('aria-busy', 'true');
    try {
        if (!GAS_API_URL) throw new Error('No backend configured. Set API_URL in js/config.js.');
        const json = await apiPost({ action: 'get_all' });

        let patients = [];
        let metadata = {};
        if (Array.isArray(json)) {
            patients = json;
        } else {
            patients = json.patients || [];
            metadata = json.metadata || {};
        }

        patients.forEach(p => {
            // Sheets returns numeric-looking ids as numbers; the UI compares ids as strings.
            p.id = String(p.id);
            if (p.plan && typeof p.plan === 'string') {
                try { p.plan = JSON.parse(p.plan); } catch (e) { p.plan = []; }
            }
            if (!Array.isArray(p.plan)) p.plan = [];
            if (typeof p.labImages === 'string') {
                try { p.labImages = p.labImages ? JSON.parse(p.labImages) : []; } catch (e) { p.labImages = []; }
            }
            p.is_highlighted = p.is_highlighted === true || p.is_highlighted === 'TRUE' || p.is_highlighted === 'true';
        });

        // Soft-deleted rows stay in the sheet (ward = TRASH) but never reach the board.
        appData.trash = patients.filter(p => p.ward === 'TRASH');
        appData.patients = patients.filter(p => p.id && p.id !== 'undefined' && p.ward !== 'TRASH');

        if (Array.isArray(json.notes)) appData.notes = json.notes;

        if (metadata.sections) {
            try {
                appData.sections = typeof metadata.sections === 'string' ? JSON.parse(metadata.sections) : metadata.sections;
            } catch (e) {
                console.warn('Failed to parse sections metadata', e);
                appData.sections = [];
            }
        } else {
            const rawWards = [...new Set(appData.patients.map(p => p.ward))].filter(w => w);
            appData.sections = rawWards.map(w => ({ id: w, name: w, color: 'slate', icon: 'hospital', isPersistent: false }));
        }
        appData.sections = appData.sections.filter(sec => sec && sec.name && sec.name !== 'TRASH');

        rebuildWardsMap();
        renderWardsSidebar();

        const wardKeys = Object.keys(appData.wards);
        if (appData.currentWard && wardKeys.includes(appData.currentWard)) {
            selectWard(appData.currentWard);
        } else {
            const populatedWard = wardKeys.find(key => appData.wards[key] && appData.wards[key].length > 0);
            const target = populatedWard || wardKeys[0];
            if (target) selectWard(target);
            else renderEmptyBoard('no-wards');
        }
        if (typeof renderNotesView === 'function' && !document.getElementById('notes-view').classList.contains('hidden')) renderNotesView();
        if (window.Sync) Sync.set('idle', 'Up to date · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        appData.loaded = true;

        if (!options.silent) {
            fetchHVCPatients();
            fetchPortCathList();
        }
    } catch (e) {
        console.error('Failed to load data', e);
        document.getElementById('patient-count').innerText = '–';
        if (!appData.loaded) renderEmptyBoard('error', e.message);
        else toast('Could not refresh the board: ' + e.message, { kind: 'error' });
        if (window.Sync) Sync.set('error', 'Could not load data');
    } finally {
        if (grid) grid.removeAttribute('aria-busy');
    }
}
''')

rep('''            // Basic Normalization
            if (!p.ward) p.ward = "Unassigned";''', '''            if (!p.ward) p.ward = "Unassigned";
            if (p.ward === 'TRASH') return;''')

# ---------------------------------------------------------- batch update
rep('''        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-check text-green-500 mr-1"></i> All changes saved';

    } catch (e) {
        console.error("Batch update failed", e);
        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-500 mr-1"></i> Save failed — retry';
    }''', '''        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-check text-green-600" aria-hidden="true"></i> Saved';
        return true;

    } catch (e) {
        console.error("Batch update failed", e);
        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-600" aria-hidden="true"></i> Not saved';
        return false;
    }''')

# ------------------------------------------------------------ openModal
rep('''    document.getElementById('inp-notes').value = patient.notes || '';
    document.getElementById('inp-notes').value = patient.notes || '';''', '''    document.getElementById('inp-notes').value = patient.notes || '';
    if (typeof decoratePatientSheet === 'function') decoratePatientSheet(patient);''')
rep('''    // Smart Paste for Regular Meds
    document.getElementById('inp-medications-regular').addEventListener('paste', handleRegularPaste);
    // Smart Paste for PRN Meds
    document.getElementById('inp-medications-prn').addEventListener('paste', handlePrnPaste);''', '''    // Smart paste (property assignment, so reopening the sheet never stacks handlers)
    document.getElementById('inp-medications-regular').onpaste = handleRegularPaste;
    document.getElementById('inp-medications-prn').onpaste = handlePrnPaste;
    const st = document.getElementById('save-status');
    if (st) st.innerHTML = patient._isNew ? '<i class="fa-solid fa-pen" aria-hidden="true"></i> New patient, not saved yet' : '<i class="fa-solid fa-check text-green-600" aria-hidden="true"></i> Saved';
    document.getElementById('last-edited').innerText = patient.last_updated ? 'Updated ' + formatRelative(patient.last_updated) : '';''')

replace_func('closeModal', r'''
function closeModal() {
    const modal = document.getElementById('patient-modal');
    const panel = document.getElementById('modal-panel');
    // Flush a pending autosave now, while currentPatient still points at this patient.
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        saveToBackend();
    }
    panel.classList.add('translate-x-full');
    setTimeout(() => {
        modal.classList.add('hidden');
        if (appData.currentWard && !document.getElementById('search-input').value) renderPatientsGrid(appData.wards[appData.currentWard]);
        else if (typeof refreshBoard === 'function') refreshBoard();
    }, 280);
}
''')

# ------------------------------------------------------------- triggerSave
rep('''            appData.currentPatient.name = document.getElementById('modal-patient-name').value || appData.currentPatient.name;
            appData.currentPatient.code = document.getElementById('modal-patient-code').value || appData.currentPatient.code;
            appData.currentPatient.age = document.getElementById('modal-patient-age').value || appData.currentPatient.age;
            appData.currentPatient.room = document.getElementById('modal-patient-room').value || appData.currentPatient.room;

            appData.currentPatient.diagnosis = document.getElementById('inp-diagnosis').value || appData.currentPatient.diagnosis;
            appData.currentPatient.provider = document.getElementById('inp-provider').value || appData.currentPatient.provider;
            appData.currentPatient.treatment = document.getElementById('inp-treatment').value || appData.currentPatient.treatment;''',
    '''            // A cleared field must save as empty (it used to silently keep the old value).
            // Only the name is required; an empty name keeps the previous one.
            const val = (id) => document.getElementById(id).value;
            appData.currentPatient.name = val('modal-patient-name').trim() || appData.currentPatient.name;
            appData.currentPatient.code = val('modal-patient-code').trim();
            appData.currentPatient.age = val('modal-patient-age');
            appData.currentPatient.room = val('modal-patient-room').trim();

            appData.currentPatient.diagnosis = val('inp-diagnosis');
            appData.currentPatient.provider = val('inp-provider');
            appData.currentPatient.treatment = val('inp-treatment');''')
rep('''            appData.currentPatient.notes = document.getElementById('inp-notes').value || appData.currentPatient.notes;''',
    '''            appData.currentPatient.notes = val('inp-notes');
            appData.currentPatient.last_updated = new Date().toISOString();''')
rep('''    const status = document.getElementById('save-status');
    status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-blue-500 mr-1"></i> Saving...';''', '''    const status = document.getElementById('save-status');
    status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Saving…';''')

# ----------------------------------------------------------- saveToBackend
rep('''        // Delta Update Logic - Fixes Concurrency
        const payload = { id: appData.currentPatient.id };
        let hasChanges = false;

        for (const key in appData.currentPatient) {''', '''        // Delta Update Logic - Fixes Concurrency.
        // A brand-new patient has no row yet, so its first save sends every field.
        const isNew = !!appData.currentPatient._isNew;
        const payload = { id: appData.currentPatient.id };
        let hasChanges = isNew;

        for (const key in appData.currentPatient) {
            if (key.startsWith('_')) continue; // client-only flags
            if (isNew) { payload[key] = appData.currentPatient[key]; continue; }''')
rep('''        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const json = await res.json().catch(() => ({}));
        if (json.error) throw new Error(json.error);

        // Update pristine state only after confirmed save
        appData.pristinePatient = JSON.parse(JSON.stringify(appData.currentPatient));

        const status = document.getElementById('save-status');
        status.innerHTML = '<i class="fa-solid fa-check text-green-500 mr-1"></i> Saved';
        document.getElementById('last-edited').innerText = 'Last saved: ' + new Date().toLocaleTimeString();

    } catch (e) {
        console.error("Save failed", e);
        document.getElementById('save-status').innerText = 'Save Failed!';
    }''', '''        const saving = appData.currentPatient;
        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const json = await res.json().catch(() => ({}));
        if (json.error) throw new Error(json.error);

        delete saving._isNew;
        // Update pristine state only after confirmed save (and only if still the open patient)
        if (appData.currentPatient === saving) {
            appData.pristinePatient = JSON.parse(JSON.stringify(saving));
            const status = document.getElementById('save-status');
            status.innerHTML = '<i class="fa-solid fa-check text-green-600" aria-hidden="true"></i> Saved';
            document.getElementById('last-edited').innerText = 'Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

    } catch (e) {
        console.error("Save failed", e);
        document.getElementById('save-status').innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-600" aria-hidden="true"></i> Not saved — <button class="underline font-semibold" onclick="triggerSave()">retry</button>';
    }''')

# --------------------------------------------------------------- daily reset
replace_func('triggerDailyReset', r'''
async function triggerDailyReset() {
    const count = appData.patients.length;
    const ok = await confirmDialog({
        title: 'Archive today and start a new day?',
        message: `All ${count} patients on the board are copied to Past rounds, then the board is emptied for tomorrow's list. Wards are kept.\n\nThe board cannot be restored from the app afterwards; the archived copy stays available in Past rounds.`,
        confirmLabel: 'Archive and clear board',
        danger: true,
        requireText: 'NEW DAY'
    });
    if (!ok) return;

    const btn = document.getElementById('btn-daily-reset');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Archiving…';
    btn.disabled = true;

    try {
        const json = await apiPost({ action: 'reset_day' });
        if (json.status !== 'success') throw new Error(json.message || 'Unknown error');
        closeSettingsModal();
        toast(`New day started. ${json.archived_count || 0} patients archived to Past rounds.`, { kind: 'success' });
        await fetchData({ silent: true });
    } catch (e) {
        toast("Couldn't start a new day: " + e.message, { kind: 'error' });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
''')

# ---------------------------------------------------------- summaries (confirm → dialog)
rep('''function handleManualSummary() {
    if (!confirm("Insert Manual Summary? This will prepend to Clinical Notes.")) return;''', '''async function handleManualSummary() {
    if (!(await confirmDialog({ title: 'Add a text summary to the handover notes?', message: 'A summary of diagnosis, symptoms, labs and medications is added at the top of the notes.', confirmLabel: 'Add summary' }))) return;''')
rep('''async function handleStandaloneSummary() {
    if (!confirm("Generate AI Summary? This will overwrite/prepend to Clinical Notes.")) return;''', '''async function handleStandaloneSummary() {
    if (!(await confirmDialog({ title: 'Write an AI summary?', message: 'The AI summary is added at the top of the handover notes. The patient name is not sent to the AI service. Review it before relying on it.', confirmLabel: 'Write summary', icon: 'fa-wand-magic-sparkles' }))) return;''')
rep('''            setTimeout(() => {
                if (confirm('Insert Patient Summary details for this consult?')) {''', '''            setTimeout(async () => {
                if (await confirmDialog({ title: 'Start the consult with a patient summary?', message: 'Diagnosis, symptoms, labs and medications are filled in for you to edit.', confirmLabel: 'Insert summary', cancelLabel: 'Write from scratch' })) {''')

# --------------------------------------------------------------- plan delete
rep('''function deletePlanItem(event, patientId, index) {''', '''async function deletePlanItem(event, patientId, index) {''')
rep('''    const patient = appData.patients.find(p => p.id === patientId);
    if (!patient || !patient.plan) return;

    if (!confirm("Delete this plan item?")) return;

    // Remove item
    patient.plan.splice(index, 1);

    // Save and Re-render
    if (typeof triggerSave === 'function') triggerSave();
    if (typeof renderPatientsGrid === 'function') renderPatientsGrid(appData.patients);''', '''    const patient = appData.patients.find(p => String(p.id) === String(patientId));
    if (!patient || !patient.plan) return;

    const item = patient.plan[index];
    if (!(await confirmDialog({ title: 'Remove this plan item?', message: item ? (item.action ? item.action + ': ' : '') + (item.details || '') : '', confirmLabel: 'Remove', danger: true }))) return;

    patient.plan.splice(index, 1);
    syncBatchUpdate({ [patient.id]: { plan: patient.plan } });
    if (typeof refreshBoard === 'function') refreshBoard();''')

# ------------------------------------------------------------- history mode
rep('''let isHistoryMode = false;''', '''var isHistoryMode = false; // var: read by core.js through window.isHistoryMode''')
rep('''function loadHistoryDate(date) {
    if (!confirm(`Enter Read-Only Archive Mode for ${date}?`)) return;
''', '''function loadHistoryDate(date) {''')
rep('''        realAppData = JSON.parse(JSON.stringify(appData));''', '''        realAppData = { patients: appData.patients, wards: appData.wards, currentWard: appData.currentWard };''')
replace_func('enterHistoryMode', r'''
function enterHistoryMode(archivedPatients, date) {
    isHistoryMode = true;
    archivedPatients.forEach(p => { p.id = String(p.id); if (!Array.isArray(p.plan)) p.plan = []; });
    appData.patients = archivedPatients;
    appData.selectedPatientIds = new Set();
    if (appData.selectionMode) toggleSelectionMode();

    document.body.classList.add('is-archive');
    document.getElementById('archive-banner').hidden = false;
    document.getElementById('archive-date-display').textContent = formatDateLong(date);
    showBoard();
    document.getElementById('current-ward-title').textContent = 'Round of ' + formatDateLong(date);
    renderPatientsGrid(appData.patients);
    updateCensus(appData.patients);
}
''')
replace_func('exitHistoryMode', r'''
function exitHistoryMode() {
    if (!isHistoryMode || !realAppData) return;
    appData.patients = realAppData.patients;
    appData.wards = realAppData.wards;
    appData.currentWard = realAppData.currentWard;
    appData.selectedPatientIds = new Set();
    isHistoryMode = false;
    realAppData = null;

    document.body.classList.remove('is-archive');
    document.getElementById('archive-banner').hidden = true;
    if (appData.currentWard) selectWard(appData.currentWard);
}
''')
rep('''// Override Save Check
const originalTriggerSave = window.triggerSave;
window.triggerSave = function () {
    if (isHistoryMode) {
        console.warn("Save blocked: History Mode Active");
        // Optional: toast notification "Read Only Mode"
        return;
    }
    if (originalTriggerSave) originalTriggerSave();
};
''', '''// Writes while viewing an archive are blocked centrally in core.js (fetch wrapper).
''')

# ------------------------------------------------------- smart copy / images
rep('''        btn.onclick = () => {
            // Flash effect''', '''        btn.onclick = async () => {
            // Flash effect''')
rep('''            if (input.value && !confirm(`Replace current text with historical data?\\n\\n"${val}"`)) return;''',
    '''            if (input.value && !(await confirmDialog({ title: 'Replace with the previous round?', message: val, confirmLabel: 'Replace' }))) return;''')
rep('''    btn.onclick = () => {
        if (input.value && !confirm("Replace current medications with historical list?")) return;''', '''    btn.onclick = async () => {
        if (input.value && !(await confirmDialog({ title: 'Replace the medication list?', message: 'The list from the previous round replaces what is in this field now.', confirmLabel: 'Replace' }))) return;''')
rep('''            card.querySelector('.btn-delete-img').onclick = (e) => {
                e.stopPropagation();
                if (confirm("Remove this image?")) {''', '''            card.querySelector('.btn-delete-img').onclick = async (e) => {
                e.stopPropagation();
                if (await confirmDialog({ title: 'Remove this image?', message: 'The image is removed from this patient. The file stays in Google Drive.', confirmLabel: 'Remove', danger: true })) {''')

# ------------------------------------------------------- connection check
replace_func('testHistoryConnection', r'''
async function testHistoryConnection() {
    const t0 = performance.now();
    try {
        const json = await apiPost({ action: 'verify_access' });
        const ms = Math.round(performance.now() - t0);
        const idx = await apiPost({ action: 'get_history_index' });
        toast(`Connected to the backend in ${ms} ms. ${idx.codes ? idx.codes.length : 0} patients have past rounds.${json.protected ? ' Access code protection is on.' : ' Access code protection is OFF.'}`, { kind: json.protected ? 'success' : 'info', timeout: 9000 });
    } catch (e) {
        toast('Connection check failed: ' + e.message, { kind: 'error' });
    }
}
''')

# ------------------------------------------------------- lazy libraries
rep('''async function handleFileSelect(event) {''', '''async function handleFileSelect(event) {
    try { await Promise.all([loadLib('papa'), loadLib('xlsx')]); }
    catch (e) { toast(e.message, { kind: 'error' }); return; }''')
rep('''function handlePaste() {''', '''async function handlePaste() {
    try { await loadLib('papa'); } catch (e) { toast(e.message, { kind: 'error' }); return; }''')
rep('''async function generateUnitAnalytics() {''', '''async function generateUnitAnalytics() {
    try { await loadLib('chart'); } catch (e) { toast(e.message, { kind: 'error' }); return; }
    if (typeof applyChartTheme === 'function') applyChartTheme();''')

P.write_text(s, encoding='utf-8')
print('main.js refactored:', len(s.splitlines()), 'lines')
