// Lint for real bugs (undefined names, duplicates, unreachable code), not style.
// The browser scripts are classic scripts sharing globals, so cross-file
// function names are declared as globals here instead of flagged.
import js from '@eslint/js';
import globals from 'globals';

const appGlobals = Object.fromEntries([
  'appData', 'GAS_API_URL', 'fetchData', 'rebuildWardsMap', 'saveMetadata', 'syncBatchUpdate', 'GasApiAvailable',
  'openModal', 'closeModal', 'triggerSave', 'saveToBackend', 'saveNow', 'checkLabStatus', 'savePharmacyUpdate',
  'handleRegularPasteExternal', 'handlePrnPasteExternal', 'openMedicationModal', 'openPlanModal', 'openSymptomsModal',
  'openLabsModal', 'openImageLightbox', 'openHVCModal', 'getPortCathRecord', 'registerPortCath', 'fetchPortCathList',
  'renderPortCathStudio', 'portCathList', 'portCathSessionConfig', 'portCathActionHistory', 'PORTCATH_API_URL', 'PORTCATH_API_KEY',
  'deletePlanItem', 'generateUnitAnalytics', 'exitHistoryMode', 'isHistoryMode', 'openPatientHistory', 'openImportModal',
  'openNotesView', 'renderNotesView', 'openNoteEditor', 'escHtml', 'renderPatientsGrid', 'patientFacts', 'parseMaybeJSON',
  'PLAN_ICONS', 'refreshBoard', 'updateCensus', 'renderEmptyBoard', 'decoratePatientSheet', 'discardIfEmptyNew', 'showBoard',
  'showView', 'selectWard', 'renderWardsSidebar', 'toggleSelectionMode', 'togglePharmacyMode', 'togglePatientSelection',
  'updateFloatingActionBar', 'toggleHighlight', 'normalizeSearch', 'formatRelative', 'formatDateLong', 'driveImageUrl',
  'applyChartTheme', 'closeSettingsModal', 'addNewWard', 'quickAddStandardSections', 'confirmDialog', 'promptDialog', 'toast',
  'apiPost', 'loadLib', 'sortPatients', 'loadLocalAsset', 'Modals', 'Auth', 'Sync', 'Chart', 'XLSX', 'Papa', 'syncAfterChange', 'pcsNormalizeDateField', 'pcsDayName', 'openAddModal', 'openEditPatient', 'saveToLocalStorage',
  'showToast', 'updateDateDropdown', 'renderDashboard', 'renderCalendar', 'uploadFileToBackend',
].map(n => [n, 'writable']));

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', '.lighthouse/**', 'web/css/**'] },
  js.configs.recommended,
  {
    files: ['web/js/**/*.js', 'web/sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...globals.serviceworker, ...appGlobals } },
    rules: {
      'no-unused-vars': 'off',       // functions are called from inline onclick handlers
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
    },
  },
  {
    files: ['backend/**/*.gs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { SpreadsheetApp: 'readonly', DriveApp: 'readonly', PropertiesService: 'readonly', LockService: 'readonly', ContentService: 'readonly', UrlFetchApp: 'readonly', Utilities: 'readonly', Session: 'readonly', ScriptApp: 'readonly', console: 'readonly' } },
    rules: { 'no-unused-vars': 'off', 'no-empty': 'off' },
  },
  {
    files: ['dev/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
