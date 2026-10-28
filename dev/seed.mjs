// Fictional demo data for local development and tests. No real patients.
const HEADERS = [
  'id', 'name', 'code', 'ward', 'room', 'age',
  'diagnosis', 'provider', 'treatment', 'medications',
  'notes', 'symptoms', 'labs', 'history_symptoms',
  'history_labs', 'last_updated', 'plan', 'is_highlighted',
  'labImages',
];

const day = 86400000;
const now = Date.UTC(2026, 9, 28, 8, 0, 0);

const patients = [
  { name: 'Layla Haddad', code: 'PAT10421', ward: 'Oncology A', room: '204', age: 67, diagnosis: 'Metastatic pancreatic adenocarcinoma', provider: 'Dr. Nasser', treatment: 'Palliative chemotherapy — paused', meds: { regular: 'Morphine SR 30mg PO BID\nLactulose 15ml PO BID\nPantoprazole 40mg PO OD', prn: 'Morphine IR 10mg PO q4h PRN\nMetoclopramide 10mg IV TID PRN' }, symptoms: { Pain: { active: true, note: '6/10 epigastric' }, Nausea: { active: true, note: '' }, ECOG: { active: true, value: 3 } }, labs: { Na: { value: '131' }, Alb: { value: '2.6' }, CRP: { value: '84' } }, plan: [{ type: 'medication', action: 'Increase', details: 'Morphine SR to 45mg BID' }, { type: 'consult', details: 'Dietitian review' }], hi: true },
  { name: 'محمود عبد الرحمن', code: 'PAT10433', ward: 'Oncology A', room: '206', age: 58, diagnosis: 'Non-small cell lung cancer, stage IV', provider: 'Dr. Salem', treatment: 'Immunotherapy cycle 4', meds: { regular: 'Dexamethasone 4mg PO OD\nOmeprazole 20mg PO OD', prn: 'Paracetamol 1g PO q6h PRN' }, symptoms: { Dyspnea: { active: true, note: 'on exertion' }, Cough: { active: true, note: '' }, ECOG: { active: true, value: 2 } }, labs: { HGB: { value: '9.8' }, WBC: { value: '12.4' } }, plan: [{ type: 'equipment', details: 'Home oxygen concentrator' }] },
  { name: 'Sara Mansour', code: 'PAT10450', ward: 'Oncology A', room: '208', age: 44, diagnosis: 'Breast cancer with bone metastases', provider: 'Dr. Nasser', treatment: 'Zoledronic acid monthly', meds: { regular: 'Oxycodone 10mg PO BID\nSenna 2 tabs PO HS', prn: '' }, symptoms: { Pain: { active: true, note: 'right hip' }, ECOG: { active: true, value: 1 } }, labs: { Ca: { value: '10.9' }, ALP: { value: '212' } }, plan: [] },
  { name: 'Yousef Khalil', code: 'PAT10467', ward: 'Oncology A', room: '210', age: 73, diagnosis: 'Hepatocellular carcinoma', provider: 'Dr. Salem', treatment: 'Best supportive care', meds: { regular: 'Spironolactone 100mg PO OD\nFurosemide 40mg PO OD', prn: 'Haloperidol 0.5mg SC PRN agitation' }, symptoms: { Ascites: { active: true, note: 'tense' }, Fatigue: { active: true, note: '' }, ECOG: { active: true, value: 4 } }, labs: { Tb: { value: '4.2' }, Alb: { value: '2.1' }, PLT: { value: '88' } }, plan: [{ type: 'note', details: 'Family meeting tomorrow 11:00' }, { type: 'consult', details: 'IR for paracentesis' }] },
  { name: 'Rania Odeh', code: 'PAT10472', ward: 'Internal Medicine', room: '115', age: 81, diagnosis: 'End-stage heart failure (EF 15%)', provider: 'Dr. Haddad', treatment: 'Diuretics, comfort focus', meds: { regular: 'Furosemide 80mg IV BID\nBisoprolol 2.5mg PO OD', prn: 'Morphine 2.5mg SC q4h PRN dyspnea' }, symptoms: { Dyspnea: { active: true, note: 'at rest' }, Edema: { active: true, note: 'bilateral LL' }, ECOG: { active: true, value: 4 } }, labs: { K: { value: '5.6' }, SCr: { value: '2.3' }, BUN: { value: '48' } }, plan: [] },
  { name: 'Omar Barghouti', code: 'PAT10488', ward: 'Internal Medicine', room: '118', age: 62, diagnosis: 'Advanced COPD, GOLD 4', provider: 'Dr. Haddad', treatment: 'Bronchodilators, NIV at night', meds: { regular: 'Tiotropium 18mcg inh OD\nBudesonide/formoterol 2 puffs BID', prn: 'Salbutamol nebs q4h PRN' }, symptoms: { Dyspnea: { active: true, note: '' }, Anxiety: { active: true, note: 'nocturnal' } }, labs: {}, plan: [{ type: 'medication', action: 'Start', details: 'Lorazepam 0.5mg SL PRN' }] },
  { name: 'Hana Saleh', code: 'PAT10495', ward: 'Internal Medicine', room: '121', age: 55, diagnosis: 'Ovarian cancer with malignant bowel obstruction', provider: 'Dr. Nasser', treatment: 'NGT decompression', meds: { regular: 'Octreotide 100mcg SC TID\nDexamethasone 8mg IV OD', prn: 'Hyoscine butylbromide 20mg SC PRN' }, symptoms: { Nausea: { active: true, note: 'vomiting x3' }, Pain: { active: true, note: 'colicky' }, ECOG: { active: true, value: 3 } }, labs: { K: { value: '3.1' }, Mg: { value: '1.5' } }, plan: [] },
  { name: 'Khaled Nasser', code: 'PAT10503', ward: 'Surgery', room: '302', age: 69, diagnosis: 'Colorectal cancer, liver metastases', provider: 'Dr. Salem', treatment: 'Post-op day 3, stoma', meds: { regular: 'Paracetamol 1g IV q6h\nEnoxaparin 40mg SC OD', prn: 'Tramadol 50mg PO q8h PRN' }, symptoms: { Pain: { active: true, note: 'wound 3/10' } }, labs: { HGB: { value: '10.2' }, CRP: { value: '45' } }, plan: [{ type: 'consult', details: 'Stoma nurse teaching' }] },
  { name: 'Noor Al-Masri', code: 'PAT10519', ward: 'Surgery', room: '305', age: 38, diagnosis: 'Gastric cancer, peritoneal carcinomatosis', provider: 'Dr. Haddad', treatment: 'TPN', meds: { regular: 'Fentanyl patch 25mcg/h q72h', prn: 'Ondansetron 4mg IV PRN' }, symptoms: { Fatigue: { active: true, note: '' }, Anorexia: { active: true, note: '' }, ECOG: { active: true, value: 2 } }, labs: { Alb: { value: '2.4' }, Na: { value: '133' } }, plan: [] },
];

export function seedSheets() {
  const rows = patients.map((p, i) => {
    const obj = {
      id: String(1761600000000 + i * 7919),
      name: p.name, code: p.code, ward: p.ward, room: p.room, age: p.age,
      diagnosis: p.diagnosis, provider: p.provider, treatment: p.treatment,
      medications: JSON.stringify(p.meds), notes: '',
      symptoms: JSON.stringify(p.symptoms), labs: JSON.stringify(p.labs),
      history_symptoms: '', history_labs: '',
      last_updated: new Date(now - i * 3600000).toISOString(),
      plan: JSON.stringify(p.plan), is_highlighted: p.hi ? true : '',
      labImages: '',
    };
    return HEADERS.map(h => obj[h]);
  });

  // Two archived days so History / Analytics have something to show.
  const histHeaders = ['Date', 'Archive_Timestamp', ...HEADERS];
  const history = [histHeaders];
  [2, 1].forEach(back => {
    const d = new Date(now - back * day);
    rows.slice(0, 7 - back).forEach(r => history.push([d, d.toISOString(), ...r]));
  });

  const sections = [
    { id: 'Oncology A', name: 'Oncology A', color: 'teal', icon: 'ribbon', isPersistent: true },
    { id: 'Internal Medicine', name: 'Internal Medicine', color: 'blue', icon: 'stethoscope', isPersistent: true },
    { id: 'Surgery', name: 'Surgery', color: 'amber', icon: 'user-doctor', isPersistent: true },
    { id: 'Home Care', name: 'Home Care', color: 'rose', icon: 'house-medical', isPersistent: true },
  ];

  const notes = [
    ['id', 'title', 'type', 'content', 'date', 'updatedAt'],
    ['note-1', 'Weekly MDT', 'meeting', '<p>Discuss Layla H. symptom control and family meeting plan.</p>', '2026-10-27', '2026-10-27T10:00:00.000Z'],
    ['note-2', 'Opioid conversion reminder', 'clinical', '<p>Check renal function before morphine titration.</p>', '2026-10-26', '2026-10-26T09:00:00.000Z'],
  ];

  return {
    Patients: [HEADERS, ...rows],
    History_Log: history,
    Metadata: [['sections'], [JSON.stringify(sections)]],
    Notes: notes,
  };
}

export const HVC_SEED = [{ 'Pt file Num.': '10433', Name: 'محمود عبد الرحمن' }];
export const PORTCATH_SEED = [
  { id: 'pc-1', name: 'Sara Mansour', fileNumber: 'PAT10450', date: '2026-11-03', day: 'Tuesday', weight: 61, notes: '', status: 'confirmed', phone: '0590000000' },
];
