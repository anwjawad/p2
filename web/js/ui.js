// --------------------------------------------------------------------------
// ui.js — app shell and ward board (v2 redesign)
// Owns: boot, view routing, sidebar + ward chips, search, census, empty states,
// selection / bulk actions, ward management, new patient, sheet decoration.
// Data, saving and modal logic stay in main.js; this file only drives the UI.
// --------------------------------------------------------------------------

// ------------------------------------------------------------------ helpers
function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Search-friendly text: lower case, no Arabic diacritics, unified alef/ya/ta marbuta. */
function normalizeSearch(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[ً-ٰٟـ]/g, '')
        .replace(/[آأإ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .trim();
}

function formatDateLong(d) {
    const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d);
    if (isNaN(date)) return String(d);
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelative(d) {
    const date = new Date(d);
    if (isNaN(date)) return '';
    const mins = Math.round((Date.now() - date) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function parseMaybeJSON(v, fallback) {
    if (v && typeof v === 'object') return v;
    if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch (e) { /* plain text */ } }
    return fallback;
}

/** Clinical summary of one patient, used by the card, the sheet and the census. */
function patientFacts(p) {
    const labs = parseMaybeJSON(p.labs, {}) || {};
    const symptoms = parseMaybeJSON(p.symptoms, {}) || {};
    const abnormal = [];
    Object.entries(labs).forEach(([k, v]) => {
        const value = v && typeof v === 'object' ? v.value : v;
        if (value === '' || value === null || value === undefined) return;
        const status = appData.ranges[k] ? checkLabStatus(k, parseFloat(value)) : 'custom';
        if (status !== 'normal') abnormal.push({ key: k, value, status });
    });
    const ecog = symptoms.ECOG && symptoms.ECOG.active && symptoms.ECOG.value !== null && symptoms.ECOG.value !== undefined && symptoms.ECOG.value !== ''
        ? Number(symptoms.ECOG.value) : null;
    const activeSymptoms = Object.entries(symptoms).filter(([k, v]) => v && v.active === true && k !== 'ECOG');
    return { labs, symptoms, abnormal, ecog, activeSymptoms };
}

// --------------------------------------------------------------- routing
const VIEWS = { board: 'patient-grid-container', notes: 'notes-view', analytics: 'analytics-view', portcath: 'cath-studio-view' };
let currentView = 'board';

function showView(name) {
    currentView = name;
    Object.entries(VIEWS).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', key !== name);
    });
    setNavCurrent(name);
    toggleSidebar(false);
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    const titles = { notes: 'Notes', analytics: 'Analytics', portcath: 'Port cath list' };
    setTopbarTitle(name === 'board' ? (appData.currentWard || 'Ward board') : titles[name]);
}

function setNavCurrent(name) {
    document.querySelectorAll('[data-nav]').forEach(b => {
        if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
}

function setTopbarTitle(t) {
    const el = document.getElementById('topbar-title');
    if (el) el.textContent = t;
}

function showBoard() {
    showView('board');
    refreshBoard();
}

function openAnalyticsView() {
    showView('analytics');
    generateUnitAnalytics();
}
function closeAnalyticsView() { showBoard(); }

async function openCathStudioView() {
    showView('portcath');
    try {
        // ~110 KB of Port Cath code and styles, only downloaded when this view is used
        await Promise.all([loadLocalAsset('css/cath-studio.css'), loadLocalAsset('js/cath-studio.js')]);
    } catch (e) {
        toast(e.message, { kind: 'error' });
        return;
    }
    if (currentView !== 'portcath') return;
    if (typeof renderPortCathStudio === 'function') renderPortCathStudio();
    // Re-fetch so a visit before the boot fetch resolves still gets fresh data.
    if (typeof fetchPortCathList === 'function') fetchPortCathList();
}
function closeCathStudioView() { showBoard(); }

// --------------------------------------------------------------- drawer
function toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuBtn = document.getElementById('btn-menu');
    const open = typeof force === 'boolean' ? force : !sidebar.classList.contains('is-open');
    const isDrawer = window.matchMedia('(max-width: 860px)').matches;
    sidebar.classList.toggle('is-open', open && isDrawer);
    overlay.hidden = !(open && isDrawer);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open && isDrawer));
    if (open && isDrawer) {
        Modals.lockScroll();
        sidebar._locked = true;
        setTimeout(() => (sidebar.querySelector('.ward-item[aria-current="true"]') || sidebar.querySelector('button')).focus(), 50);
    } else if (sidebar._locked) {
        Modals.unlockScroll();
        sidebar._locked = false;
    }
}
document.addEventListener('keydown', (e) => {
    const sb = document.getElementById('sidebar');
    if (e.key === 'Escape' && sb && sb.classList.contains('is-open')) { toggleSidebar(false); document.getElementById('btn-menu').focus(); }
});

function focusSearch() {
    if (window.matchMedia('(max-width: 860px)').matches) toggleSidebar(true);
    setTimeout(() => {
        const input = document.getElementById('search-input');
        input.focus();
        input.select();
    }, 60);
}

// ---------------------------------------------------------------- search
function setupSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    const run = () => {
        const q = normalizeSearch(input.value);
        if (!q) { refreshBoard(); return; }
        if (currentView !== 'board') showView('board');
        const hits = appData.patients.filter(p => [p.name, p.code, p.diagnosis, p.room, p.provider, p.ward]
            .some(v => normalizeSearch(v).includes(q)));
        document.getElementById('current-ward-title').textContent = `Search: “${input.value.trim()}”`;
        setTopbarTitle('Search');
        renderWardsSidebar();
        renderPatientsGrid(hits);
        updateCensus(hits, true);
        if (!hits.length) renderEmptyBoard('no-results', input.value.trim());
    };
    input.addEventListener('input', debounce(run, 120));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; run(); }
        if (e.key === 'Enter') {
            toggleSidebar(false);
            const first = document.querySelector('[data-testid="patient-open"]');
            if (first) first.focus();
        }
    });
}

function clearSearch() {
    const input = document.getElementById('search-input');
    if (input && input.value) input.value = '';
}

// ------------------------------------------------------------------ wards
const WARD_COLORS = {
    slate: 'rgb(var(--neutral-400))', blue: 'rgb(var(--accent-500))', teal: 'rgb(var(--accent-500))',
    red: 'rgb(var(--critical-500))', rose: 'rgb(var(--critical-400))', green: 'rgb(var(--positive-500))',
    purple: 'rgb(var(--plum-500))', orange: 'rgb(var(--warning-500))', amber: 'rgb(var(--warning-400))',
};

function visibleSections() {
    return appData.sections.filter(s => s.name !== 'TRASH' && (s.isPersistent || (appData.wards[s.name] || []).length > 0));
}

function renderWardsSidebar() {
    const list = document.getElementById('wards-list');
    const chips = document.getElementById('ward-chips');
    const searching = !!(document.getElementById('search-input') || {}).value;
    list.innerHTML = '';
    if (chips) chips.innerHTML = '';

    const sections = visibleSections();
    if (!sections.length) {
        list.innerHTML = '<li class="px-3 py-2 text-sm text-slate-500">No wards yet. Add one with +.</li>';
    }
    sections.forEach(section => {
        const name = section.name;
        const count = (appData.wards[name] || []).length;
        const current = !searching && !window.isHistoryMode && appData.currentWard === name;

        const li = document.createElement('li');
        li.className = 'ward-row';
        li.innerHTML = `
            <button class="ward-item" ${current ? 'aria-current="true"' : ''}>
                <span class="ward-dot" style="background:${WARD_COLORS[section.color] || WARD_COLORS.slate}" aria-hidden="true"></span>
                <span class="ward-name bidi"></span>
                <span class="ward-count" aria-label="${count} patients">${count}</span>
            </button>
            <button class="ward-menu icon-btn icon-btn-sm" title="Remove ward"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>`;
        li.querySelector('.ward-name').textContent = name;
        li.querySelector('.ward-menu').setAttribute('aria-label', `Remove ward ${name}`);
        li.querySelector('.ward-item').onclick = () => openWard(name);
        li.querySelector('.ward-menu').onclick = (e) => { e.stopPropagation(); deleteWard(name); };
        list.appendChild(li);

        if (chips) {
            const chip = document.createElement('button');
            chip.className = 'ward-chip';
            if (current) chip.setAttribute('aria-current', 'true');
            chip.innerHTML = `<span class="bidi"></span><span class="n">${count}</span>`;
            chip.firstElementChild.textContent = name;
            chip.onclick = () => openWard(name);
            chips.appendChild(chip);
        }
    });
    const active = chips && chips.querySelector('[aria-current="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function openWard(name) {
    if (window.isHistoryMode) exitHistoryMode();
    clearSearch();
    showView('board');
    selectWard(name);
    const main = document.getElementById('main-content');
    if (main) main.focus({ preventScroll: true });
}

function selectWard(wardName) {
    // Selection belongs to one ward: clear it on a ward switch, keep it when the same ward re-renders.
    if (appData.selectionMode && wardName !== appData.currentWard) { appData.selectedPatientIds.clear(); updateFloatingActionBar(); }
    appData.currentWard = wardName;
    document.getElementById('current-ward-title').textContent = wardName;
    if (currentView === 'board') setTopbarTitle(wardName);
    renderWardsSidebar();
    const patients = sortPatients(appData.wards[wardName] || []);
    renderPatientsGrid(patients);
    updateCensus(patients);
    if (!patients.length) renderEmptyBoard('empty-ward', wardName);
}

/** Order the board like a ward round: by room number, then name. */
function sortPatients(list) {
    const room = p => String(p.room || '').trim().toUpperCase();
    return [...list].sort((a, b) => {
        const ra = room(a), rb = room(b);
        if (!ra !== !rb) return ra ? -1 : 1; // patients without a room go last
        return ra.localeCompare(rb, undefined, { numeric: true }) || String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function refreshBoard() {
    const input = document.getElementById('search-input');
    if (window.isHistoryMode) { renderPatientsGrid(appData.patients); updateCensus(appData.patients); return; }
    if (input && input.value.trim()) { input.dispatchEvent(new Event('input')); return; }
    if (appData.currentWard) selectWard(appData.currentWard);
}

function updateCensus(patients, isSearch) {
    const el = document.getElementById('ward-census');
    if (!el) return;
    let flagged = 0, abnormal = 0, poor = 0;
    patients.forEach(p => {
        const f = patientFacts(p);
        if (p.is_highlighted) flagged++;
        if (f.abnormal.some(a => a.status !== 'custom')) abnormal++;
        if (f.ecog !== null && f.ecog >= 3) poor++;
    });
    const n = patients.length;
    const parts = [`<span><b id="patient-count">${n}</b> ${n === 1 ? 'patient' : 'patients'}${isSearch ? ' found' : ''}</span>`];
    if (flagged) parts.push(`<span class="flagged"><b>${flagged}</b> flagged</span>`);
    if (poor) parts.push(`<span><b>${poor}</b> with ECOG 3–4</span>`);
    if (abnormal) parts.push(`<span class="alert"><b>${abnormal}</b> with abnormal labs</span>`);
    el.innerHTML = parts.join('');
}

function renderEmptyBoard(kind, detail) {
    const grid = document.getElementById('patients-grid');
    const map = {
        'no-wards': { icon: 'fa-hospital', title: 'Set up your wards', text: 'Wards group the patients you see on rounds. Add the standard wards, or create your own.', actions: '<button class="btn btn-primary" onclick="quickAddStandardSections()">Add standard wards</button><button class="btn btn-secondary" onclick="addNewWard()">New ward</button>' },
        'empty-ward': { icon: 'fa-bed', title: `No patients in ${escHtml(detail || 'this ward')}`, text: 'Add a patient, import a list from Excel, or move patients here from another ward with Select.', actions: '<button class="btn btn-primary" onclick="openNewPatientModal()"><i class="fa-solid fa-plus" aria-hidden="true"></i> New patient</button><button class="btn btn-secondary" onclick="openImportModal()">Import list</button>' },
        'no-results': { icon: 'fa-magnifying-glass', title: 'No patient matches your search', text: `Nothing found for “${escHtml(detail)}”. Search covers name, file number, diagnosis, room, doctor and ward.`, actions: '<button class="btn btn-secondary" onclick="clearSearch(); refreshBoard()">Clear search</button>' },
        'error': { icon: 'fa-plug-circle-exclamation', title: "Couldn't load the board", text: `${escHtml(detail || 'The server did not respond.')} Check the connection, then try again.`, actions: '<button class="btn btn-primary" onclick="fetchData()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Try again</button>' },
    };
    const m = map[kind];
    if (!m) return;
    grid.innerHTML = `<div class="empty" role="${kind === 'error' ? 'alert' : 'status'}">
        <div class="empty-icon"><i class="fa-solid ${m.icon}" aria-hidden="true"></i></div>
        <h2>${m.title}</h2><p>${m.text}</p><div class="flex flex-wrap gap-2 justify-center">${m.actions}</div></div>`;
    if (kind === 'error' || kind === 'no-wards') {
        document.getElementById('current-ward-title').textContent = kind === 'error' ? 'Ward board' : 'Welcome';
        updateCensus([]);
    }
}

async function deleteWard(wardName) {
    const n = (appData.wards[wardName] || []).length;
    const ok = await confirmDialog({
        title: `Remove the ward “${wardName}”?`,
        message: n ? `Its ${n} ${n === 1 ? 'patient moves' : 'patients move'} to Unassigned. No patient data is deleted.` : 'The ward has no patients.',
        confirmLabel: 'Remove ward', danger: true,
    });
    if (!ok) return;
    const updates = {};
    (appData.wards[wardName] || []).forEach(p => { p.ward = 'Unassigned'; updates[p.id] = { ward: 'Unassigned' }; });
    appData.sections = appData.sections.filter(s => s.name !== wardName);
    saveMetadata();
    if (Object.keys(updates).length) syncBatchUpdate(updates);
    rebuildWardsMap();
    if (appData.currentWard === wardName) {
        const next = visibleSections()[0];
        appData.currentWard = next ? next.name : null;
    }
    renderWardsSidebar();
    if (appData.currentWard) selectWard(appData.currentWard); else renderEmptyBoard('no-wards');
    toast(`Ward “${wardName}” removed.`, { kind: 'success' });
}

function quickAddStandardSections() {
    const standards = [
        { name: 'Medical', color: 'blue', icon: 'stethoscope' },
        { name: 'Surgical', color: 'green', icon: 'bandage' },
        { name: 'Hematology', color: 'purple', icon: 'flask' },
        { name: 'ICU', color: 'orange', icon: 'heart-pulse' },
        { name: 'Treatment Room', color: 'slate', icon: 'bed-pulse' },
    ];
    // Only add what is missing; never reset wards the team already customised.
    const missing = standards.filter(s => !appData.sections.some(x => x.name === s.name));
    if (!missing.length) { toast('All standard wards are already on the list.', { kind: 'info' }); return; }
    missing.forEach(s => { appData.sections.push({ id: s.name, ...s, isPersistent: true }); appData.wards[s.name] = appData.wards[s.name] || []; });
    saveMetadata();
    renderWardsSidebar();
    if (!appData.currentWard) selectWard(missing[0].name);
    toast(`Added ${missing.map(s => s.name).join(', ')}.`, { kind: 'success' });
}

// ------------------------------------------------------------ highlights
function toggleHighlight(e, id) {
    if (e) e.stopPropagation();
    const p = appData.patients.find(pt => String(pt.id) === String(id));
    if (!p) return;
    p.is_highlighted = !p.is_highlighted;
    refreshBoard();
    syncBatchUpdate({ [p.id]: { is_highlighted: p.is_highlighted } });
    const btn = document.querySelector(`.bed[data-id="${CSS.escape(String(id))}"] .bed-flag`);
    if (btn) btn.focus();
}

// --------------------------------------------------------- board modes
function togglePharmacyMode() {
    appData.pharmacyMode = !appData.pharmacyMode;
    if (appData.selectionMode) toggleSelectionMode();
    document.getElementById('btn-pharmacy-mode').setAttribute('aria-pressed', String(appData.pharmacyMode));
    document.getElementById('btn-rounds-mode').setAttribute('aria-pressed', String(!appData.pharmacyMode));
    refreshBoard();
}

function toggleSelectionMode() {
    if (window.isHistoryMode) { toast('Past rounds are read-only.', { kind: 'info' }); return; }
    appData.selectionMode = !appData.selectionMode;
    appData.selectedPatientIds.clear();
    if (appData.selectionMode && appData.pharmacyMode) togglePharmacyMode();
    const btn = document.getElementById('btn-select-mode');
    btn.setAttribute('aria-pressed', String(appData.selectionMode));
    btn.querySelector('span').textContent = appData.selectionMode ? 'Done' : 'Select';
    updateFloatingActionBar();
    refreshBoard();
    if (appData.selectionMode) toast('Tap patients to select them, then move or remove.', { kind: 'info', timeout: 2500 });
}

function updateFloatingActionBar() {
    const bar = document.getElementById('floating-action-bar');
    const count = appData.selectedPatientIds.size;
    document.getElementById('selected-count').textContent = count;
    bar.classList.toggle('is-visible', appData.selectionMode && count > 0);
}

function togglePatientSelection(id, card) {
    id = String(id);
    const sel = appData.selectedPatientIds;
    sel.has(id) ? sel.delete(id) : sel.add(id);
    if (card) {
        card.dataset.selected = String(sel.has(id));
        const b = card.querySelector('[data-testid="patient-open"]');
        if (b) b.setAttribute('aria-pressed', String(sel.has(id)));
    }
    updateFloatingActionBar();
}

function selectedPatients() {
    return appData.patients.filter(p => appData.selectedPatientIds.has(String(p.id)));
}

async function executeBulkMove() {
    const pts = selectedPatients();
    if (!pts.length) return;
    const options = visibleSections().filter(s => s.name !== appData.currentWard).map(s => ({ value: s.name, label: s.name }));
    if (!options.length) { toast('Create another ward first.', { kind: 'info' }); return; }
    const target = await confirmDialog({
        title: `Move ${pts.length} ${pts.length === 1 ? 'patient' : 'patients'}`,
        message: pts.map(p => p.name).join(', '),
        options, optionsLabel: 'Move to ward', confirmLabel: 'Move', icon: 'fa-right-left',
    });
    if (!target) return;
    const updates = {};
    const previous = {};
    pts.forEach(p => { previous[p.id] = p.ward; p.ward = target; updates[p.id] = { ward: target }; });
    rebuildWardsMap();
    toggleSelectionMode();
    selectWard(target);
    syncBatchUpdate(updates);
    toast(`Moved ${pts.length} to ${target}.`, { kind: 'success', action: { label: 'Undo', onClick: () => restoreWards(previous) } });
}

async function executeBulkDelete() {
    const pts = selectedPatients();
    if (!pts.length) return;
    const ok = await confirmDialog({
        title: `Remove ${pts.length} ${pts.length === 1 ? 'patient' : 'patients'} from the board?`,
        message: pts.map(p => p.name).join(', ') + '\n\nThey are hidden from the board and kept in the spreadsheet (ward = TRASH), so nothing is permanently deleted.',
        confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    const updates = {};
    const previous = {};
    pts.forEach(p => { previous[p.id] = p.ward; updates[p.id] = { ward: 'TRASH' }; p.ward = 'TRASH'; });
    appData.trash = (appData.trash || []).concat(pts);
    appData.patients = appData.patients.filter(p => p.ward !== 'TRASH');
    rebuildWardsMap();
    toggleSelectionMode();
    syncBatchUpdate(updates);
    toast(`Removed ${pts.length} from the board.`, { kind: 'success', action: { label: 'Undo', onClick: () => restoreWards(previous) } });
}

/** Undo for move/remove: put each patient back in the ward it came from. */
function restoreWards(previous) {
    const updates = {};
    Object.entries(previous).forEach(([id, ward]) => {
        let p = appData.patients.find(x => String(x.id) === id);
        if (!p && appData.trash) {
            p = appData.trash.find(x => String(x.id) === id);
            if (p) { appData.trash = appData.trash.filter(x => x !== p); appData.patients.push(p); }
        }
        if (p) { p.ward = ward; updates[id] = { ward }; }
    });
    rebuildWardsMap();
    syncBatchUpdate(updates);
    refreshBoard();
    toast('Restored.', { kind: 'success' });
}

// ----------------------------------------------------------- new patient
function openNewPatientModal() {
    if (window.isHistoryMode) { toast('Past rounds are read-only. Go back to today to add patients.', { kind: 'info' }); return; }
    const ward = appData.currentWard || (visibleSections()[0] || {}).name || 'Unassigned';
    const p = {
        id: Date.now().toString(),
        _isNew: true,
        name: '', code: '', age: '', room: '', ward,
        diagnosis: '', provider: '', treatment: '', notes: '',
        medications: '', labs: {}, symptoms: {}, plan: [],
        last_updated: new Date().toISOString(),
    };
    appData.patients.push(p);
    rebuildWardsMap();
    showView('board');
    clearSearch();
    selectWard(ward);
    openModal(p);
    setTimeout(() => document.getElementById('modal-patient-name').focus(), 320);
}

/** A new patient closed without a name was never saved: drop it from the board. */
function discardIfEmptyNew(p) {
    if (!p || !p._isNew || (p.name || '').trim()) return false;
    appData.patients = appData.patients.filter(x => x !== p);
    rebuildWardsMap();
    return true;
}

// ---------------------------------------------------------- patient sheet
function decoratePatientSheet(p) {
    const f = patientFacts(p);
    const ward = document.getElementById('modal-ward-label');
    if (ward) {
        ward.innerHTML = '<i class="fa-solid fa-hospital text-xs" aria-hidden="true"></i> <span class="bidi"></span>';
        ward.lastElementChild.textContent = p.ward || 'Unassigned';
    }
    const labsSub = document.getElementById('tile-labs-sub');
    if (labsSub) labsSub.textContent = f.abnormal.length ? `${f.abnormal.length} out of range` : Object.keys(f.labs).length ? 'All in range' : 'No values yet';
    const symSub = document.getElementById('tile-sym-sub');
    if (symSub) symSub.textContent = [f.ecog !== null ? `ECOG ${f.ecog}` : '', f.activeSymptoms.length ? `${f.activeSymptoms.length} active` : ''].filter(Boolean).join(', ') || 'Not assessed';
    const planSub = document.getElementById('tile-plan-sub');
    if (planSub) planSub.textContent = (p.plan || []).length ? `${p.plan.length} item${p.plan.length > 1 ? 's' : ''}` : 'No items';
    renderSheetPlan(p);
    const dl = document.getElementById('provider-options');
    if (dl) {
        const providers = [...new Set(appData.patients.map(x => (x.provider || '').trim()).filter(Boolean))].sort();
        dl.innerHTML = providers.map(v => `<option value="${escHtml(v)}">`).join('');
    }
}

const PLAN_TYPE_LABELS = { medication: 'Medication', equipment: 'Equipment', consult: 'Consult', note: 'Note' };
function renderSheetPlan(p) {
    const section = document.getElementById('modal-plan-section');
    const list = document.getElementById('modal-plan-list');
    if (!section || !list) return;
    const plan = Array.isArray(p.plan) ? p.plan : [];
    section.classList.toggle('hidden', !plan.length);
    list.innerHTML = '';
    plan.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'sheet-plan-item';
        row.innerHTML = `<i class="fa-solid fa-${PLAN_ICONS[item.type] || 'circle'}" aria-hidden="true"></i>
            <span class="plan-text"><span class="plan-type"></span><span class="bidi"></span></span>
            ${window.isHistoryMode ? '' : '<button class="icon-btn icon-btn-sm" type="button"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>'}`;
        row.querySelector('.plan-type').textContent = (PLAN_TYPE_LABELS[item.type] || 'Item') + (item.action ? ' · ' + item.action : '');
        row.querySelector('.bidi').textContent = item.details || '';
        const del = row.querySelector('button');
        if (del) {
            del.setAttribute('aria-label', 'Remove plan item: ' + (item.details || ''));
            del.onclick = async (e) => { await deletePlanItem(e, p.id, i); decoratePatientSheet(p); };
        }
        list.appendChild(row);
    });
}

// ---------------------------------------------------------- analytics theme
function applyChartTheme() {
    if (!window.Chart) return;
    const css = getComputedStyle(document.documentElement);
    const rgb = (v) => `rgb(${css.getPropertyValue(v).trim()})`;
    Chart.defaults.font.family = "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif";
    Chart.defaults.color = rgb('--neutral-600');
    Chart.defaults.borderColor = rgb('--neutral-200');
    window.CHART_PALETTE = ['--accent-600', '--plum-500', '--warning-500', '--critical-500', '--positive-600', '--accent-300', '--plum-300', '--warning-300'].map(rgb);
}
document.addEventListener('themechange', () => {
    if (currentView === 'analytics' && typeof generateUnitAnalytics === 'function') generateUnitAnalytics();
});

// ------------------------------------------------------------------ boot
function initApp() {
    setupSearch();
    setNavCurrent('board');
    fetchData();
    window.addEventListener('resize', debounce(() => {
        if (!window.matchMedia('(max-width: 860px)').matches) toggleSidebar(false);
    }, 150));
    // Refresh when the tab comes back after a while (another colleague may have edited).
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { hiddenAt = Date.now(); return; }
        const openSheet = !document.getElementById('patient-modal').classList.contains('hidden');
        if (hiddenAt && Date.now() - hiddenAt > 5 * 60000 && !openSheet && !window.isHistoryMode && appData.loaded) fetchData({ silent: true });
    });
}
document.addEventListener('DOMContentLoaded', initApp);
