// --------------------------------------------------------------------------
// core.js — app-wide infrastructure, loaded before every other script.
//   • API transport: access token, timeouts, sync status, session expiry
//   • Toasts (also replace window.alert) and accessible dialogs
//   • Modal manager: focus, Escape, scroll lock, phone bottom sheets
//   • Connection banner, lazy third-party libraries, appearance settings
// --------------------------------------------------------------------------
(function () {
    'use strict';

    const CFG = window.APP_CONFIG || {};
    const APP_VERSION = '2.0.0';
    window.APP_VERSION = APP_VERSION;

    // ---------------------------------------------------------------- utils
    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    window.escHtml = window.escHtml || esc;

    const store = {
        get(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
        set(k, v, persistent = true) {
            try { (persistent ? localStorage : sessionStorage).setItem(k, v); } catch { /* private mode */ }
        },
        del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } },
    };
    window.appStore = store;

    // -------------------------------------------------------------- toasts
    const ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    function toast(message, opts = {}) {
        const region = document.getElementById('toast-region');
        if (!region) return;
        const kind = opts.kind || 'info';
        const el = document.createElement('div');
        el.className = 'toast';
        el.dataset.kind = kind;
        el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        el.innerHTML = `<i class="fa-solid ${ICONS[kind] || ICONS.info}" aria-hidden="true"></i>
            <div class="toast-msg"></div>
            ${opts.action ? '<button class="toast-action" type="button"></button>' : ''}
            <button class="toast-close" type="button" aria-label="Dismiss"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
        el.querySelector('.toast-msg').textContent = String(message);
        let timer;
        const close = () => {
            clearTimeout(timer);
            el.classList.add('is-leaving');
            setTimeout(() => el.remove(), 200);
        };
        if (opts.action) {
            const b = el.querySelector('.toast-action');
            b.textContent = opts.action.label;
            b.onclick = () => { close(); opts.action.onClick(); };
        }
        el.querySelector('.toast-close').onclick = close;
        region.appendChild(el);
        while (region.children.length > 4) region.firstElementChild.remove();
        const timeout = opts.timeout ?? (kind === 'error' ? 8000 : opts.action ? 7000 : 3500);
        if (timeout > 0) timer = setTimeout(close, timeout);
        return close;
    }
    window.toast = toast;

    // Legacy code calls alert() in ~45 places. Show those as non-blocking toasts.
    window.alert = function (msg) {
        const text = String(msg == null ? '' : msg).replace(/^(?:\s|✅|❌|⚠️?)+/u, '');
        const isError = /error|fail|could not|couldn't|invalid|not found|please/i.test(text);
        toast(text, { kind: isError ? 'error' : 'success' });
    };

    // ------------------------------------------------------------- dialogs
    /**
     * Accessible replacement for confirm()/prompt().
     * confirmDialog({ title, message, confirmLabel, cancelLabel, danger, requireText, input, options })
     * Resolves true/false, or the entered text / chosen option value (null when cancelled).
     */
    function confirmDialog(opts = {}) {
        return new Promise((resolve) => {
            const prevFocus = document.activeElement;
            const root = document.createElement('div');
            root.className = 'dialog-root';
            const id = 'dlg-' + Math.random().toString(36).slice(2);
            const hasInput = opts.input || opts.requireText;
            root.innerHTML = `
                <div class="dlg-backdrop"></div>
                <form class="dialog dlg-panel" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-m" novalidate>
                    <div class="dialog-icon ${opts.danger ? '' : 'is-info'}" aria-hidden="true"><i class="fa-solid ${opts.icon || (opts.danger ? 'fa-triangle-exclamation' : 'fa-circle-question')}"></i></div>
                    <h2 id="${id}-t"></h2>
                    <p id="${id}-m"></p>
                    ${opts.options ? `<div class="field"><label class="field-label" for="${id}-s">${esc(opts.optionsLabel || 'Choose')}</label><select class="select" id="${id}-s">${opts.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>` : ''}
                    ${hasInput ? `<div class="field"><label class="field-label" for="${id}-i"></label><input class="input" id="${id}-i" autocomplete="off" dir="auto"><p class="field-error" id="${id}-e"></p></div>` : ''}
                    <div class="dialog-actions">
                        <button type="button" class="btn btn-ghost" data-act="cancel"></button>
                        <button type="submit" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-act="ok"></button>
                    </div>
                </form>`;
            root.querySelector(`#${id}-t`).textContent = opts.title || 'Are you sure?';
            root.querySelector(`#${id}-m`).textContent = opts.message || '';
            root.querySelector('[data-act=cancel]').textContent = opts.cancelLabel || 'Cancel';
            root.querySelector('[data-act=ok]').textContent = opts.confirmLabel || 'Confirm';
            const input = root.querySelector(`#${id}-i`);
            const select = root.querySelector(`#${id}-s`);
            if (input) {
                root.querySelector(`label[for="${id}-i"]`).textContent = opts.requireText
                    ? `Type ${opts.requireText} to confirm` : (opts.inputLabel || 'Value');
                input.value = opts.defaultValue || '';
                if (opts.placeholder) input.placeholder = opts.placeholder;
            }
            const done = (val) => {
                document.removeEventListener('keydown', onKey, true);
                root.remove();
                Modals.unlockScroll();
                if (prevFocus && prevFocus.focus) prevFocus.focus();
                resolve(val);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(hasInput || select ? null : false); }
                if (e.key === 'Tab') Modals.trapTab(e, root.querySelector('form'));
            };
            root.querySelector('[data-act=cancel]').onclick = () => done(hasInput || select ? null : false);
            root.querySelector('.dlg-backdrop').onclick = () => done(hasInput || select ? null : false);
            root.querySelector('form').onsubmit = (e) => {
                e.preventDefault();
                if (opts.requireText) {
                    if (input.value.trim() !== opts.requireText) {
                        root.querySelector(`#${id}-e`).textContent = `Type ${opts.requireText} exactly to continue.`;
                        input.setAttribute('aria-invalid', 'true');
                        input.focus();
                        return;
                    }
                    return done(true);
                }
                if (select) return done(select.value);
                if (input) {
                    const v = input.value.trim();
                    if (opts.required && !v) {
                        root.querySelector(`#${id}-e`).textContent = 'This field is required.';
                        input.focus();
                        return;
                    }
                    return done(v);
                }
                done(true);
            };
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(root);
            Modals.lockScroll();
            (input || select || root.querySelector(opts.danger ? '[data-act=cancel]' : '[data-act=ok]')).focus();
        });
    }
    window.confirmDialog = confirmDialog;
    window.promptDialog = (opts) => confirmDialog({ input: true, confirmLabel: 'Save', ...opts });

    // ------------------------------------------------------- modal manager
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const Modals = {
        stack: [],
        locks: 0,
        lockScroll() { if (this.locks++ === 0) document.documentElement.style.overflow = 'hidden'; },
        unlockScroll() { this.locks = Math.max(0, this.locks - 1); if (this.locks === 0) document.documentElement.style.overflow = ''; },
        trapTab(e, container) {
            const items = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        },
        isOpen(el) { return !el.classList.contains('hidden') && !el.hidden; },
        decorate(root) {
            if (root.dataset.dlgReady) return;
            root.dataset.dlgReady = '1';
            root.classList.add('dlg-root');
            if (root.hasAttribute('data-sheet')) root.classList.add('is-sheet');
            const kids = [...root.children];
            const backdrop = kids.find(k => k.matches('.absolute.inset-0, .fixed.inset-0') && k.children.length === 0);
            if (backdrop) backdrop.classList.add('dlg-backdrop');
            const panel = kids.find(k => k !== backdrop && k.tagName !== 'SCRIPT') || root;
            if (!root.hasAttribute('data-sheet')) panel.classList.add('dlg-panel');
            if (!root.getAttribute('role')) root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            if (!root.getAttribute('aria-labelledby') && !root.getAttribute('aria-label')) {
                const h = panel.querySelector('h1,h2,h3');
                if (h) { h.id = h.id || root.id + '-title'; root.setAttribute('aria-labelledby', h.id); }
            }
            root._panel = panel;
            root._backdrop = backdrop;
        },
        onOpen(root) {
            this.decorate(root);
            if (this.stack.includes(root)) return;
            root._prevFocus = document.activeElement;
            this.stack.push(root);
            this.lockScroll();
            // Fields may hold Arabic or English: let the browser pick direction per field.
            root.querySelectorAll('input[type=text]:not([dir]),input:not([type]):not([dir]),textarea:not([dir])')
                .forEach(el => el.setAttribute('dir', 'auto'));
            requestAnimationFrame(() => {
                if (root.contains(document.activeElement)) return;
                const target = root.querySelector('[autofocus]') || root.querySelector('[data-close], button[aria-label^="Close"]') || root._panel.querySelector(FOCUSABLE);
                if (target) target.focus({ preventScroll: true });
            });
        },
        onClose(root) {
            const i = this.stack.indexOf(root);
            if (i === -1) return;
            this.stack.splice(i, 1);
            this.unlockScroll();
            const prev = root._prevFocus;
            if (prev && document.contains(prev) && prev.focus) prev.focus({ preventScroll: true });
        },
        closeTop() {
            const root = this.stack[this.stack.length - 1];
            if (!root) return false;
            const closer = root._backdrop && root._backdrop.onclick ? root._backdrop
                : root.querySelector('[data-close], button[aria-label^="Close" i], button[onclick^="close"]');
            if (closer) { closer.click(); return true; }
            root.classList.add('hidden');
            return true;
        },
        watch() {
            const roots = document.querySelectorAll('body > div.fixed.inset-0[id], body > div[id$="-modal"]');
            const mo = new MutationObserver((muts) => {
                muts.forEach(m => {
                    const el = m.target;
                    this.isOpen(el) ? this.onOpen(el) : this.onClose(el);
                });
            });
            roots.forEach(r => {
                if (r.id === 'lock-screen') return;
                mo.observe(r, { attributes: true, attributeFilter: ['class', 'hidden'] });
                this.decorate(r);
            });
            // Modals that legacy code creates later (lightbox, calculators)
            new MutationObserver((muts) => muts.forEach(m => m.addedNodes.forEach(n => {
                if (n.nodeType === 1 && n.matches('div.fixed.inset-0[id]')) {
                    mo.observe(n, { attributes: true, attributeFilter: ['class', 'hidden'] });
                    if (this.isOpen(n)) this.onOpen(n);
                }
            }))).observe(document.body, { childList: true });
        },
    };
    window.Modals = Modals;

    document.addEventListener('keydown', (e) => {
        const top = Modals.stack[Modals.stack.length - 1];
        if (e.key === 'Escape' && top) {
            e.preventDefault();
            Modals.closeTop();
            return;
        }
        if (e.key === 'Tab' && top) { Modals.trapTab(e, top._panel || top); return; }
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
        if (typing || e.ctrlKey || e.metaKey || e.altKey || top) return;
        if (e.key === '/') { e.preventDefault(); window.focusSearch && window.focusSearch(); }
        if (e.key === 'n' && window.openNewPatientModal) { e.preventDefault(); window.openNewPatientModal(); }
    });

    // ------------------------------------------------------------ auth
    const TOKEN_KEY = 'app_access_token';
    const Auth = {
        get token() { return store.get(TOKEN_KEY); },
        save(token, remember) { store.del(TOKEN_KEY); store.set(TOKEN_KEY, token, remember); },
        clear() { store.del(TOKEN_KEY); },
        _waiters: [],
        /** Show the lock screen; resolves once a valid code was entered. */
        require(reason) {
            const lock = document.getElementById('lock-screen');
            if (!lock) return Promise.reject(new Error('No lock screen'));
            const err = document.getElementById('lock-error');
            if (reason === 'expired') {
                document.getElementById('lock-title').textContent = 'Your session ended';
                document.getElementById('lock-text').textContent = 'The access code changed or was signed out. Enter the current code to continue; unsaved edits stay on this screen.';
            }
            if (lock.hidden) {
                lock.hidden = false;
                Modals.lockScroll();
                setTimeout(() => document.getElementById('lock-code').focus(), 30);
            }
            err.textContent = reason === 'invalid' ? 'That code is not correct.' : '';
            return new Promise(res => this._waiters.push(res));
        },
        _resolve() {
            const lock = document.getElementById('lock-screen');
            if (!lock.hidden) { lock.hidden = true; Modals.unlockScroll(); }
            this._waiters.splice(0).forEach(r => r());
        },
    };
    window.Auth = Auth;
    window.signOut = async function () {
        const ok = await confirmDialog({ title: 'Sign out on this device?', message: 'You will need the access code to open the board again.', confirmLabel: 'Sign out' });
        if (!ok) return;
        Auth.clear();
        location.reload();
    };

    // ------------------------------------------------------- sync status
    const Sync = {
        pending: 0,
        set(state, text) {
            const pill = document.getElementById('sync-pill');
            const t = document.getElementById('sync-text');
            if (!pill || !t) return;
            pill.dataset.state = state;
            t.textContent = text;
        },
        start() { this.pending++; this.set('saving', 'Saving…'); },
        ok() {
            this.pending = Math.max(0, this.pending - 1);
            if (!this.pending) this.set('idle', 'All changes saved · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        },
        fail(msg) {
            this.pending = Math.max(0, this.pending - 1);
            this.set('error', 'Not saved — check connection');
            toast(msg ? `Couldn't save: ${msg}` : "Couldn't save the last change. Check the connection and try again.", { kind: 'error' });
        },
    };
    window.Sync = Sync;

    // ------------------------------------------------- API transport layer
    // All calls to the Apps Script backend go through window.fetch. Wrapping it
    // here adds the access token, a timeout, status and expiry handling to every
    // existing call site without rewriting each one.
    const READ_ACTIONS = new Set(['get_all', 'verify_access', 'get_history_index', 'get_history_dates', 'get_history_data',
        'get_patient_history', 'get_analytics', 'get_files', 'generate_plan', 'generate_summary', 'generate_suggestions']);
    const nativeFetch = window.fetch.bind(window);
    const isMainApi = (url) => !!CFG.API_URL && String(url).split('?')[0] === CFG.API_URL.split('?')[0];

    window.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;
        if (!isMainApi(url)) return nativeFetch(input, init);

        let action = 'get_all';
        let body = init.body;
        if (typeof body === 'string') {
            try {
                const obj = JSON.parse(body);
                action = obj.action || 'update';
                if (Auth.token) obj.token = Auth.token;
                body = JSON.stringify(obj);
            } catch { /* not JSON: send as is */ }
        }
        const isWrite = (init.method || 'GET').toUpperCase() === 'POST' && !READ_ACTIONS.has(action);
        if (isWrite && window.isHistoryMode) {
            toast('Past rounds are read-only. Go back to today to make changes.', { kind: 'info' });
            return new Response(JSON.stringify({ error: 'Archive is read-only' }), { headers: { 'Content-Type': 'application/json' } });
        }

        const ctrl = new AbortController();
        const timeoutMs = action.startsWith('generate') ? 60000 : action === 'upload_image' ? 90000 : 30000;
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        if (isWrite) Sync.start();
        let res;
        try {
            res = await nativeFetch(url, {
                ...init,
                body,
                mode: 'cors', // never 'no-cors': we need to read errors
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
                signal: init.signal || ctrl.signal,
            });
        } catch (e) {
            clearTimeout(timer);
            if (isWrite) Sync.fail(navigator.onLine ? 'the server did not respond' : 'you are offline');
            else Net.flag();
            throw e;
        }
        clearTimeout(timer);
        res.clone().json().then(json => {
            if (json && json.error === 'UNAUTHORIZED') {
                if (isWrite) Sync.pending = Math.max(0, Sync.pending - 1);
                Auth.require(Auth.token ? 'expired' : undefined);
                return;
            }
            if (isWrite) json && json.error ? Sync.fail(json.error) : Sync.ok();
        }).catch(() => { if (isWrite) Sync.fail('unexpected response from the server'); });
        return res;
    };

    /** Convenience: POST an action to the main backend and return parsed JSON (throws on error). */
    window.apiPost = async function (payload) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await window.fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
            const json = await res.json();
            if (json && json.error === 'UNAUTHORIZED') { await Auth.require(Auth.token ? 'expired' : undefined); continue; }
            if (json && json.error) throw new Error(json.error);
            return json;
        }
        throw new Error('Not authorised');
    };

    async function submitLock(e) {
        e.preventDefault();
        const input = document.getElementById('lock-code');
        const btn = document.getElementById('lock-submit');
        const err = document.getElementById('lock-error');
        const code = input.value.trim();
        if (!code) { err.textContent = 'Enter the access code.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        btn.disabled = true; btn.textContent = 'Checking…'; err.textContent = '';
        try {
            const res = await nativeFetch(CFG.API_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'verify_access', token: code }) });
            const json = await res.json();
            if (json.error === 'UNAUTHORIZED') {
                err.textContent = 'That code is not correct.';
                input.setAttribute('aria-invalid', 'true');
                input.select();
            } else {
                input.removeAttribute('aria-invalid');
                Auth.save(code, document.getElementById('lock-remember').checked);
                input.value = '';
                Auth._resolve();
            }
        } catch {
            err.textContent = 'Could not reach the server. Check the connection and try again.';
        } finally {
            btn.disabled = false; btn.textContent = 'Open ward board';
        }
    }

    // ------------------------------------------------------------ network
    const Net = {
        show(text) { const b = document.getElementById('net-banner'); if (b) { b.textContent = text; b.hidden = false; } },
        hide() { const b = document.getElementById('net-banner'); if (b) b.hidden = true; },
        flag() { if (!navigator.onLine) this.show('You are offline. Changes will not be saved until the connection returns.'); },
    };
    window.addEventListener('offline', () => { Net.flag(); Sync.set('offline', 'Offline'); });
    window.addEventListener('online', () => { Net.hide(); Sync.set('idle', 'Back online'); toast('Connection restored.', { kind: 'success' }); });

    // --------------------------------------------------- lazy libraries
    const LIBS = {
        xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        papa: 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
        chart: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    };
    const libPromises = {};
    window.loadLib = function (name) {
        if (!libPromises[name]) {
            libPromises[name] = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = LIBS[name];
                s.async = true;
                s.crossOrigin = 'anonymous';
                s.referrerPolicy = 'no-referrer';
                s.onload = resolve;
                s.onerror = () => { delete libPromises[name]; reject(new Error(`Could not load the ${name} library. Check the connection.`)); };
                document.head.appendChild(s);
            });
        }
        return libPromises[name];
    };

    /** Load one of the app's own files on demand (the build fingerprints these paths). */
    const localAssets = {};
    window.loadLocalAsset = function (path) {
        if (!localAssets[path]) {
            localAssets[path] = new Promise((resolve, reject) => {
                const isCss = path.endsWith('.css') || path.includes('.css?');
                const el = document.createElement(isCss ? 'link' : 'script');
                if (isCss) { el.rel = 'stylesheet'; el.href = path; } else { el.src = path; el.async = false; }
                el.onload = resolve;
                el.onerror = () => { delete localAssets[path]; el.remove(); reject(new Error('Could not load part of the app. Check the connection and try again.')); };
                document.head.appendChild(el);
            });
        }
        return localAssets[path];
    };

    // ------------------------------------------------- appearance settings
    const root = document.documentElement;
    const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    function syncThemeColor() {
        const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && mqDark.matches);
        document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#0f1110' : '#f3f5f4'));
    }
    window.isDarkTheme = () => root.dataset.theme === 'dark' || (!root.dataset.theme && mqDark.matches);
    window.setTheme = function (mode) {
        if (mode === 'light' || mode === 'dark') { root.dataset.theme = mode; store.set('app_theme', mode); }
        else { delete root.dataset.theme; store.del('app_theme'); }
        syncThemeColor();
        window.updateSettingsUI();
        document.dispatchEvent(new CustomEvent('themechange'));
    };
    mqDark.addEventListener('change', () => { syncThemeColor(); document.dispatchEvent(new CustomEvent('themechange')); });
    window.setDensity = function (d) { root.dataset.density = d; store.set('app_density', d); window.updateSettingsUI(); };
    window.toggleAnimations = function () {
        const off = root.dataset.motion !== 'off';
        if (off) root.dataset.motion = 'off'; else delete root.dataset.motion;
        store.set('app_animations', off ? 'false' : 'true');
        window.updateSettingsUI();
    };
    window.updateSettingsUI = function () {
        const theme = root.dataset.theme || 'system';
        document.querySelectorAll('.theme-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === theme)));
        document.querySelectorAll('.density-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.density === (root.dataset.density || 'comfortable'))));
        const anim = document.getElementById('btn-anim-toggle');
        if (anim) anim.checked = root.dataset.motion !== 'off';
        const so = document.getElementById('btn-sign-out');
        if (so) so.hidden = !Auth.token;
        const v = document.getElementById('settings-version');
        if (v) v.textContent = `Version ${APP_VERSION}${CFG.ENV === 'development' ? ' · local development backend' : ''}`;
    };
    window.openSettingsModal = function () { document.getElementById('settings-modal').classList.remove('hidden'); window.updateSettingsUI(); };
    window.closeSettingsModal = function () { document.getElementById('settings-modal').classList.add('hidden'); };

    // ------------------------------------------------------------- boot
    document.addEventListener('DOMContentLoaded', () => {
        syncThemeColor();
        Modals.watch();
        const form = document.getElementById('lock-form');
        if (form) form.addEventListener('submit', submitLock);
        if (!navigator.onLine) Net.flag();
        const d = document.getElementById('brand-date');
        if (d) d.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        if ('serviceWorker' in navigator && CFG.ENV === 'production' && location.protocol === 'https:') {
            navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
        }
    });
})();
