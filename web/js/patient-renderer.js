// -------------------------------------------------------------------------
// Patient card renderer — "bed tag" cards for the ward board.
// The room number anchors each card; the ECOG bar shows acuity at a glance.
// Every action is a real <button> with an accessible name.
// -------------------------------------------------------------------------

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseMeds(medications) {
    let meds = { regular: '', prn: '' };
    try {
        if (medications && typeof medications === 'object') meds = { ...meds, ...medications };
        else if (typeof medications === 'string' && medications.trim().startsWith('{')) meds = { ...meds, ...JSON.parse(medications) };
        else meds.regular = medications || '';
    } catch (e) {
        meds.regular = medications || '';
    }
    return meds;
}

function isHvcRegistered(p) {
    const list = appData.hvcList || [];
    return list.includes(String(p.code)) || list.includes(String(p.id)) ||
        (p.code && list.includes(String(p.code).replace(/\D/g, '')));
}

const PLAN_ICONS = { medication: 'pills', equipment: 'mask-ventilator', consult: 'user-doctor', note: 'note-sticky' };

function renderPatientsGrid(patients) {
    const grid = document.getElementById('patients-grid');
    grid.innerHTML = '';
    grid.removeAttribute('aria-busy');
    if (!patients || patients.length === 0) return;

    const frag = document.createDocumentFragment();
    patients.forEach((p, index) => {
        frag.appendChild(appData.pharmacyMode ? renderPharmacyCard(p, index) : renderBedCard(p, index));
    });
    grid.appendChild(frag);
}

function bedTagHtml(p, ecog) {
    const room = String(p.room || '').trim();
    const level = ecog === null || isNaN(ecog) ? '' : Math.max(0, Math.min(4, ecog));
    return `
        <div class="bed-tag">
            <span class="bed-room-label">Room</span>
            <span class="bed-room${room.length > 4 ? ' is-long' : ''}">${escHtml(room || '—')}</span>
            <div class="acuity" data-level="${level}" title="${level === '' ? 'ECOG not recorded' : 'ECOG performance status ' + level}">
                <div class="acuity-bar" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
                <span class="acuity-label">ECOG ${level === '' ? '–' : level}</span>
            </div>
        </div>`;
}

function renderBedCard(p, index) {
    const facts = patientFacts(p);
    const selecting = appData.selectionMode;
    const selected = appData.selectedPatientIds && appData.selectedPatientIds.has(String(p.id));
    const name = (p.name || '').trim() || 'Unnamed patient';
    const age = parseInt(p.age, 10);

    const card = document.createElement('article');
    card.className = 'bed';
    card.setAttribute('role', 'listitem');
    card.dataset.id = p.id;
    card.dataset.flagged = String(!!p.is_highlighted);
    card.dataset.selected = String(!!selected);
    card.style.setProperty('--i', Math.min(index, 12));

    // Labs out of range first, then active symptoms
    const labChips = facts.abnormal.map(a => {
        const cls = a.status === 'high' ? 'chip-high' : a.status === 'low' ? 'chip-low' : 'chip-accent';
        const arrow = a.status === 'high' ? '↑' : a.status === 'low' ? '↓' : '';
        const label = a.status === 'custom' ? '' : (a.status === 'high' ? ' high' : ' low');
        return `<span class="chip ${cls} tabular" title="${escHtml(a.key + ' ' + a.value + label)}">${escHtml(a.key)} ${escHtml(a.value)}${arrow ? ` <span aria-hidden="true">${arrow}</span><span class="sr-only">${label}</span>` : ''}</span>`;
    }).join('');
    const symChips = facts.activeSymptoms.map(([k, v]) =>
        `<span class="chip chip-symptom">${escHtml(k)}${v.note && v.note.trim() ? `<span class="chip-note bidi">· ${escHtml(v.note)}</span>` : ''}</span>`).join('');

    const plan = Array.isArray(p.plan) ? p.plan : [];
    const planHtml = plan.slice(0, 3).map((item, i) => {
        const text = item.type === 'medication' && item.action
            ? `<b class="font-semibold">${escHtml(item.action)}:</b> ${escHtml(item.details || '')}`
            : escHtml(item.details || '');
        return `<div class="plan-line">
            <i class="fa-solid fa-${PLAN_ICONS[item.type] || 'circle'}" aria-hidden="true"></i>
            <span class="plan-text bidi">${text}</span>
            ${selecting || window.isHistoryMode ? '' : `<button class="icon-btn icon-btn-sm plan-del" data-plan-index="${i}" aria-label="Remove plan item: ${escHtml(item.details || '')}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`}
        </div>`;
    }).join('') + (plan.length > 3 ? `<div class="plan-line text-slate-500"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span>${plan.length - 3} more in the plan</span></div>` : '');

    const hvc = isHvcRegistered(p);
    const pc = typeof getPortCathRecord === 'function' ? getPortCathRecord(p) : null;
    const pcScheduled = pc && pc.status === 'confirmed' && pc.date;
    const status = [
        hvc ? '<span class="chip chip-ok"><i class="fa-solid fa-house-medical" aria-hidden="true"></i> Home visits</span>' : '',
        pc ? `<span class="chip ${pcScheduled ? 'chip-ok' : 'chip-wait'}"><i class="fa-solid fa-syringe" aria-hidden="true"></i> Port cath ${pcScheduled ? escHtml(pc.date) : 'waiting'}</span>` : '',
    ].join('');

    const hasImages = Array.isArray(p.labImages) && p.labImages.length > 0;
    const action = (cls, icon, label, extra = '') => `<button class="icon-btn ${cls}" aria-label="${escHtml(label)} — ${escHtml(name)}" title="${escHtml(label)}" ${extra}><i class="fa-solid fa-${icon}" aria-hidden="true"></i></button>`;
    const readOnly = !!window.isHistoryMode;

    card.innerHTML = `
        ${bedTagHtml(p, facts.ecog)}
        <div class="bed-body">
            <div class="bed-head">
                <button class="bed-open" data-testid="patient-open" ${selecting ? `aria-pressed="${!!selected}"` : ''}>
                    <span class="bed-name bidi block" dir="auto">${escHtml(name)}</span>
                    <span class="bed-meta">
                        ${p.code ? `<span><span class="sr-only">File number </span>${escHtml(p.code)}</span>` : ''}
                        ${age ? `<span>${age} y</span>` : ''}
                        ${p.room ? `<span class="sr-only">Room ${escHtml(p.room)}</span>` : ''}
                    </span>
                </button>
                ${selecting
                    ? `<span class="bed-check" aria-hidden="true"><i class="fa-solid fa-check text-xs"></i></span>`
                    : `<button class="icon-btn bed-flag" aria-pressed="${!!p.is_highlighted}" aria-label="${p.is_highlighted ? 'Unflag' : 'Flag'} ${escHtml(name)}" title="${p.is_highlighted ? 'Flagged for attention' : 'Flag for attention'}" ${readOnly ? 'disabled' : ''}><i class="fa-solid fa-star" aria-hidden="true"></i></button>`}
            </div>

            ${p.diagnosis || p.treatment ? `<div class="grid gap-1">
                ${p.diagnosis ? `<p class="bed-dx bidi"><span class="bed-label">Dx</span>${escHtml(p.diagnosis)}</p>` : ''}
                ${p.treatment ? `<p class="bed-rx bidi"><span class="bed-label">Rx</span>${escHtml(p.treatment)}</p>` : ''}
            </div>` : ''}

            ${labChips || symChips ? `<div class="bed-chips">${labChips}${symChips}</div>` : ''}
            ${plan.length ? `<div class="bed-plan">${planHtml}</div>` : ''}

            <div class="bed-foot">
                <div class="bed-provider">
                    ${p.provider ? `<span class="bidi"><i class="fa-solid fa-user-doctor text-xs" aria-hidden="true"></i> ${escHtml(p.provider)}</span>` : ''}
                    ${status}
                </div>
                ${selecting || readOnly ? '' : `<div class="bed-actions">
                    ${action('btn-symptoms', 'notes-medical', 'Symptoms')}
                    ${action('btn-plan', 'list-check', 'Plan')}
                    ${action('btn-meds', 'pills', 'Medications')}
                    ${hasImages ? action('btn-view-labs', 'image', 'Latest lab image') : ''}
                    ${!hvc ? action('btn-hvc-add', 'house-medical', 'Register for home visits') : ''}
                    ${!pc ? action('btn-portcath', 'syringe', 'Add to port cath waiting list') : ''}
                </div>`}
            </div>
        </div>`;

    // ---- events
    const open = card.querySelector('.bed-open');
    open.onclick = (e) => {
        e.stopPropagation();
        if (appData.selectionMode) togglePatientSelection(p.id, card);
        else openModal(p);
    };
    const flag = card.querySelector('.bed-flag');
    if (flag) flag.onclick = (e) => toggleHighlight(e, p.id);
    card.querySelectorAll('.plan-del').forEach(b => {
        b.onclick = (e) => deletePlanItem(e, p.id, Number(b.dataset.planIndex));
    });

    if (!selecting && !readOnly) {
        const on = (sel, fn) => { const b = card.querySelector(sel); if (b) b.onclick = (e) => { e.stopPropagation(); fn(); }; };
        on('.btn-meds', () => openMedicationModal(p));
        on('.btn-plan', () => openPlanModal(p));
        on('.btn-symptoms', () => openSymptomsModal(p));
        on('.btn-view-labs', () => {
            const last = p.labImages[p.labImages.length - 1];
            openImageLightbox(driveImageUrl(last));
        });
        on('.btn-hvc-add', () => {
            appData.currentPatient = p;
            appData.pristinePatient = JSON.parse(JSON.stringify(p));
            openHVCModal();
        });
        on('.btn-portcath', async () => {
            if (getPortCathRecord(p)) return;
            const ok = await confirmDialog({ title: 'Add to the port cath waiting list?', message: `${name} will be added to the port cath waiting list.`, confirmLabel: 'Add to list', icon: 'fa-syringe' });
            if (ok) { registerPortCath(p); toast(`${name} added to the port cath waiting list.`, { kind: 'success' }); }
        });
    }
    return card;
}

/** Best display URL for a stored lab image (Drive "uc?export=view" links no longer embed reliably). */
function driveImageUrl(img) {
    if (!img) return '';
    if (img.url && img.url.startsWith('data:')) return img.url;
    const id = img.id || (String(img.url || '').match(/[?&]id=([\w-]+)/) || [])[1];
    if (id && !String(id).startsWith('dev-')) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
    return img.url || '';
}

function renderPharmacyCard(p, index) {
    const meds = parseMeds(p.medications);
    const name = (p.name || '').trim() || 'Unnamed patient';
    const card = document.createElement('article');
    card.className = 'bed bed-pharmacy';
    card.setAttribute('role', 'listitem');
    card.dataset.id = p.id;
    card.style.setProperty('--i', Math.min(index, 12));
    const idReg = `ph-reg-${p.id}`, idPrn = `ph-prn-${p.id}`;
    const facts = patientFacts(p);
    card.innerHTML = `
        ${bedTagHtml(p, facts.ecog)}
        <div class="bed-body">
            <div class="bed-head">
                <button class="bed-open" data-testid="patient-open">
                    <span class="bed-name bidi block" dir="auto">${escHtml(name)}</span>
                    <span class="bed-meta">${p.code ? `<span>${escHtml(p.code)}</span>` : ''}${parseInt(p.age, 10) ? `<span>${parseInt(p.age, 10)} y</span>` : ''}</span>
                </button>
            </div>
            <div class="med-area">
                <label for="${idReg}">Regular <span class="save-flag" data-for="regular" aria-live="polite"></span></label>
                <textarea id="${idReg}" class="med-editor-reg" spellcheck="false" dir="auto" placeholder="Paste regular medications" ${window.isHistoryMode ? 'readonly' : ''}>${escHtml(meds.regular || '')}</textarea>
            </div>
            <div class="med-area">
                <label for="${idPrn}">As needed (PRN) <span class="save-flag" data-for="prn" aria-live="polite"></span></label>
                <textarea id="${idPrn}" class="med-editor-prn" spellcheck="false" dir="auto" placeholder="Paste PRN medications" style="min-height:88px" ${window.isHistoryMode ? 'readonly' : ''}>${escHtml(meds.prn || '')}</textarea>
            </div>
        </div>`;

    card.querySelector('.bed-open').onclick = () => openModal(p);
    const txtReg = card.querySelector('.med-editor-reg');
    const txtPrn = card.querySelector('.med-editor-prn');
    const flagFor = (type) => card.querySelector(`.save-flag[data-for="${type}"]`);
    const timers = {};
    const save = async (type, el) => {
        clearTimeout(timers[type]);
        timers[type] = null;
        const flag = flagFor(type);
        flag.dataset.state = 'saving'; flag.textContent = 'Saving…';
        const ok = await savePharmacyUpdate(p.id, type, el.value);
        flag.dataset.state = ok === false ? 'error' : 'saved';
        flag.textContent = ok === false ? 'Not saved' : 'Saved';
        if (ok !== false) setTimeout(() => { if (flag.dataset.state === 'saved') flag.textContent = ''; }, 2500);
    };
    const later = (type, el) => { clearTimeout(timers[type]); timers[type] = setTimeout(() => save(type, el), 1500); };

    txtReg.addEventListener('paste', (e) => { handleRegularPasteExternal(e); save('regular', txtReg); });
    txtPrn.addEventListener('paste', (e) => { handlePrnPasteExternal(e); save('prn', txtPrn); });
    txtReg.addEventListener('input', () => later('regular', txtReg));
    txtPrn.addEventListener('input', () => later('prn', txtPrn));
    txtReg.addEventListener('blur', () => timers.regular && save('regular', txtReg));
    txtPrn.addEventListener('blur', () => timers.prn && save('prn', txtPrn));
    return card;
}
