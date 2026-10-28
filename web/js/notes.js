// ----- MEETING NOTES & STUDY MODULE -----

// Ensure appData.notes exists
if (!appData.notes) {
    appData.notes = [];
}

let currentEditingNoteId = null;

function openNotesView() {
    showView('notes');
    renderNotesView();
}

function renderNotesView() {
    const grid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('notes-empty-state');
    const searchTerm = normalizeSearch(document.getElementById('notes-search').value);
    const filterType = document.getElementById('notes-filter-type').value;

    grid.innerHTML = '';

    const filteredNotes = appData.notes.filter(note => {
        const matchesSearch = !searchTerm || normalizeSearch(note.title).includes(searchTerm) ||
            normalizeSearch(note.content).includes(searchTerm);
        const matchesType = filterType === 'all' || note.type === filterType;
        return matchesSearch && matchesType;
    });

    if (filteredNotes.length === 0) {
        emptyState.classList.remove('hidden');
        grid.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    grid.classList.remove('hidden');

    // Sort by Date Descending
    filteredNotes.sort((a, b) => new Date(b.date) - new Date(a.date));

    filteredNotes.forEach(note => {
        const card = createNoteCard(note);
        grid.appendChild(card);
    });
}

const NOTE_TYPES = {
    meeting: { label: 'Meeting', cls: 'chip-accent' },
    study: { label: 'Study', cls: 'chip-symptom' },
    pearl: { label: 'Clinical pearl', cls: 'chip-wait' },
    guideline: { label: 'Guideline', cls: 'chip-ok' },
};

function createNoteCard(note) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'panel text-start w-full grid gap-2 hover:border-slate-300 transition-colors cursor-pointer';
    card.onclick = () => openNoteEditor(note.id);

    const tmp = document.createElement('div');
    tmp.innerHTML = note.content || '';
    const img = tmp.querySelector('img');
    const text = (tmp.textContent || '').trim();
    const type = NOTE_TYPES[note.type] || { label: note.type ? note.type.charAt(0).toUpperCase() + note.type.slice(1) : 'Note', cls: '' };
    const date = note.date ? new Date(note.date) : null;

    card.innerHTML = `
        ${img ? `<span class="block h-32 -mx-[18px] -mt-[18px] mb-1 overflow-hidden rounded-t-[15px] bg-slate-100"><img alt="" class="w-full h-full object-cover" loading="lazy"></span>` : ''}
        <span class="font-semibold text-slate-900 leading-snug bidi" dir="auto"></span>
        <span class="text-sm text-slate-600 line-clamp-3 bidi" dir="auto"></span>
        <span class="flex justify-between items-center gap-2 mt-1">
            <span class="chip ${type.cls}">${escHtml(type.label)}</span>
            <span class="text-xs text-slate-500 tabular">${date && !isNaN(date) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
        </span>`;
    if (img) card.querySelector('img').src = img.getAttribute('src');
    const spans = card.querySelectorAll('.bidi');
    spans[0].textContent = note.title || 'Untitled note';
    spans[1].textContent = text ? (text.length > 160 ? text.slice(0, 160) + '…' : text) : 'No text';
    return card;
}

function openNoteEditor(noteId = null) {
    currentEditingNoteId = noteId;
    const modal = document.getElementById('note-editor-modal');
    const titleInput = document.getElementById('note-title-input');
    const typeSelect = document.getElementById('note-type-select');
    const contentEditor = document.getElementById('note-content-editor');
    const dateDisplay = document.getElementById('note-date-display');
    const btnDelete = document.getElementById('btn-delete-note');

    if (noteId) {
        // Edit Mode
        const note = appData.notes.find(n => n.id === noteId);
        if (!note) return; // Should not happen

        titleInput.value = note.title;
        typeSelect.value = note.type;
        contentEditor.innerHTML = note.content;
        dateDisplay.innerText = new Date(note.date).toLocaleDateString();
        btnDelete.classList.remove('hidden');
    } else {
        // New Mode
        titleInput.value = '';
        typeSelect.value = 'study'; // Default
        contentEditor.innerHTML = '';
        dateDisplay.innerText = new Date().toLocaleDateString();
        btnDelete.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function closeNoteEditor() {
    document.getElementById('note-editor-modal').classList.add('hidden');
    currentEditingNoteId = null;
}

function saveNote() {
    const title = document.getElementById('note-title-input').value;
    const type = document.getElementById('note-type-select').value;
    const content = document.getElementById('note-content-editor').innerHTML;

    // Basic Validation
    if (!title.trim() && !content.trim()) {
        closeNoteEditor(); // Just close if empty
        return;
    }

    if (currentEditingNoteId) {
        // Update
        const index = appData.notes.findIndex(n => n.id === currentEditingNoteId);
        if (index !== -1) {
            appData.notes[index] = {
                ...appData.notes[index],
                title,
                type,
                content,
                updatedAt: new Date().toISOString()
            };
        }
    } else {
        // Create
        const newNote = {
            id: Date.now().toString(),
            title: title || 'Untitled Note',
            type,
            content,
            date: new Date().toISOString(),
            images: [],
            updatedAt: new Date().toISOString()
        };
        appData.notes.push(newNote);
    }

    closeNoteEditor();
    renderNotesView();
    // Async Sync
    syncNotesToBackend();
}

async function deleteCurrentNote() {
    if (!currentEditingNoteId) return;

    if (await confirmDialog({ title: 'Delete this note?', message: 'The note is deleted for the whole team.', confirmLabel: 'Delete note', danger: true })) {
        appData.notes = appData.notes.filter(n => n.id !== currentEditingNoteId);
        renderNotesView();
        closeNoteEditor();
        syncNotesToBackend();
    }
}

// --- SYNC & IMAGE LOGIC ---

async function syncNotesToBackend() {
    const status = document.getElementById('notes-sync-status');
    if (status) status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Saving notes…';

    // 1. Process Images in all notes
    // We need to find any base64 images, upload them, and replace with URL
    // This ensures lightweight JSON for the sheet

    let changesMade = false;

    for (let note of appData.notes) {
        if (note.content.includes('data:image')) {
            // Parse Content
            const div = document.createElement('div');
            div.innerHTML = note.content;
            const imgs = div.querySelectorAll('img');

            for (let img of imgs) {
                if (img.src.startsWith('data:image')) {
                    // Convert to File
                    const file = dataURLtoFile(img.src, `note_img_${Date.now()}.png`);

                    // Upload (Reusing main.js function if available, else standard fetch)
                    try {
                        let url = null;
                        if (typeof uploadFileToBackend === 'function') {
                            // uploadFileToBackend (main.js) resolves with the full
                            // backend response { status, url, fileId, name } - unwrap .url.
                            const uploadResult = await uploadFileToBackend(file);
                            url = uploadResult && uploadResult.url;
                        } else {
                            console.warn("Upload function missing");
                        }

                        if (url) {
                            img.src = url;
                            changesMade = true;
                        }
                    } catch (e) {
                        console.error("Image Upload Failed", e);
                    }
                }
            }

            if (changesMade) {
                note.content = div.innerHTML;
                note.updatedAt = new Date().toISOString();
            }
        }
    }

    // 2. Save Notes Data (cors, so a failed save is reported instead of silently lost)
    try {
        const json = await apiPost({ action: 'save_notes', notes: appData.notes });
        if (status) status.innerHTML = `<i class="fa-solid fa-check text-green-600" aria-hidden="true"></i> ${json.count} notes saved`;
        setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } catch (e) {
        console.error("Note Sync Failed", e);
        if (status) status.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-600" aria-hidden="true"></i> Notes not saved';
        toast("Couldn't save notes: " + e.message, { kind: 'error' });
    }
}

// Helper: Base64 to File
function dataURLtoFile(dataurl, filename) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

// Image Paste Handler
function handleNoteImagePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let blob = null;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
            blob = items[i].getAsFile();
            break;
        }
    }

    if (blob) {
        e.preventDefault(); // Prevent default paste behavior

        const reader = new FileReader();
        reader.onload = function (event) {
            const base64 = event.target.result;
            // Insert Image HTML at cursor
            document.execCommand('insertHTML', false, `
                <br>
                <img src="${base64}" class="max-w-full rounded-lg shadow-sm my-2 border border-slate-200">
                <br>
            `);
        };
        reader.readAsDataURL(blob);
    }
}

// Add event listeners for Search
document.getElementById('notes-search')?.addEventListener('input', renderNotesView);

// Export to Global Scope
window.openNotesView = openNotesView;
window.renderNotesView = renderNotesView;
window.createNoteCard = createNoteCard;
window.openNoteEditor = openNoteEditor;
window.closeNoteEditor = closeNoteEditor;
window.saveNote = saveNote;
window.deleteCurrentNote = deleteCurrentNote;
window.handleNoteImagePaste = handleNoteImagePaste;
window.syncNotesToBackend = syncNotesToBackend;
