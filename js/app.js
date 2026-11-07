/* ================================================================
   Cardiogenic Shock Registry — single-file offline app (ES5 only)
   Storage: localStorage · Optional: Firestore REST sync
   ================================================================ */
(function(){
'use strict';

var LS_KEY = 'csreg_v1';
var SESS_KEY = 'csreg_auth';
var DB = { patients: [], settings: { user: 'MK', pass: 'MK', fbProject: '', fbKey: '', fbCol: 'cs_patients', lastSync: '' } };
var VIEW = 'dash', CUR = null, CURSEC = 0, SAVE_T = null, DIRTY = false;
var LISTQ = '', LISTF = 'all', STATG = 'death';

/* ---------- helpers ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ if(s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function num(x){ if(x === '' || x === null || x === undefined) return null; var n = Number(x); return isNaN(n) ? null : n; }
function yes(x){ return x === 'Yes'; }
function no(x){ return x === 'No'; }
function filled(x){ return !(x === '' || x === null || x === undefined); }
function r1(x){ return Math.round(x * 10) / 10; }
function r2(x){ return Math.round(x * 100) / 100; }
function pad(n, w){ var s = String(n); while(s.length < (w || 3)) s = '0' + s; return s; }
function uid(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function ext(a, b){ if(b){ for(var k in b){ if(b.hasOwnProperty(k)) a[k] = b[k]; } } return a; }
function pdate(s){ if(!s) return null; var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s)); if(!m) return null; return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)); }
function days(a, b){ var x = pdate(a), y = pdate(b); if(!x || !y) return null; var d = (y - x) / 86400000; return d < 0 ? null : r1(d); }
function toast(msg){ var t = $('toast'); t.textContent = msg; t.className = 'show'; clearTimeout(toast._t); toast._t = setTimeout(function(){ t.className = ''; }, 2600); }
function closest(el, attr){ while(el && el !== document){ if(el.getAttribute && el.getAttribute(attr) !== null) return el; el = el.parentNode; } return null; }
function pct(a, b){ return b ? Math.round(a / b * 1000) / 10 : 0; }

/* ---------- schema builders ---------- */
function N(k,l,u,o){ return ext({k:k,l:l,ty:'num',u:u||''}, o); }
function T(k,l,o){ return ext({k:k,l:l,ty:'text'}, o); }
function DT(k,l,o){ return ext({k:k,l:l,ty:'dt'}, o); }
function YN(k,l,o){ return ext({k:k,l:l,ty:'yn'}, o); }
function SEL(k,l,opts,o){ return ext({k:k,l:l,ty:'sel',opts:opts}, o); }
function C(k,l,u,ct,o){ return ext({k:k,l:l,ty:'calc',u:u||'',ct:ct||'num'}, o); }
function TA(k,l,o){ return ext({k:k,l:l,ty:'ta'}, o); }
function H(l){ return {ty:'h', l:l}; }
function sh(k, val){ return function(v){ return v[k] === val; }; }

var AET = ['AMI-CS','ADHF – de novo','ADHF – acute-on-chronic','Myocarditis','Takotsubo','Valvular','Arrhythmic','Post-cardiotomy','Isolated RV failure','Other'];
var PHASE = ['Pre-Hajj','Hajj days','Post-Hajj','Outside Hajj season'];

var SECTIONS = [
 {id:'demo', t:'Demographics', f:[
   H('Identification'),
   T('studyId','Study ID',{req:1, hint:'Auto-generated; editable'}),
   T('mrn','MRN',{hint:'Optional — leave blank for de-identified datasets'}),
   T('initials','Initials'),
   N('age','Age','years',{min:14,max:110}),
   SEL('sex','Sex',['Male','Female']),
   T('nationality','Nationality'),
   H('Hajj context'),
   SEL('hajjStatus','Pilgrim status',['Pilgrim – international','Pilgrim – domestic','Non-pilgrim resident','Healthcare / Hajj worker']),
   N('hajjYear','Hajj season (Hijri year)','AH',{min:1400,max:1500}),
   DT('admDate','Admission date/time',{req:1}),
   C('hijriAdm','Admission date (Umm al-Qura)','', 'txt'),
   C('hajjPhaseAuto','Hajj phase — auto','', 'cat', {hint:'Pre: Dhul-Qa\'dah–7 Dhul-Hijjah · Hajj: 8–13 · Post: 14 Dhul-Hijjah–15 Muharram'}),
   SEL('hajjPhase','Hajj phase — confirmed',PHASE,{hint:'Leave blank to use the auto value in analyses'}),
   N('ambientTemp','Ambient max temperature (day of admission)','°C',{min:10,max:60}),
   H('Anthropometrics'),
   N('weight','Weight','kg',{min:25,max:250}),
   N('height','Height','cm',{min:120,max:220}),
   C('bmi','BMI','kg/m²'),
   H('Risk factors & comorbidities'),
   SEL('smoking','Smoking',['Never','Former','Current']),
   YN('htn','Hypertension'), YN('dm','Diabetes mellitus'), YN('dyslip','Dyslipidaemia'),
   YN('ckd','Chronic kidney disease'), YN('dialysis','On chronic dialysis',{show:sh('ckd','Yes')}),
   YN('priorMI','Prior MI'), YN('priorPCI','Prior PCI'), YN('priorCABG','Prior CABG'),
   YN('priorHF','Known heart failure'), N('baseEF','Baseline LVEF (if known)','%',{min:5,max:80,show:sh('priorHF','Yes')}),
   YN('af','Atrial fibrillation'), YN('priorStroke','Prior stroke / TIA'),
   YN('pad','Peripheral arterial disease'), YN('copd','COPD / chronic lung disease'), YN('malig','Active malignancy')
 ]},
 {id:'pres', t:'Presentation', f:[
   H('Timing & route'),
   DT('onset','Symptom onset'),
   DT('fmc','First medical contact'),
   SEL('route','Route of arrival',['Direct to ED','Hajj field hospital / medical post','Inter-hospital transfer','In-hospital onset','Red Crescent / EMS']),
   YN('heatIllness','Heat exhaustion / heat stroke at presentation'),
   YN('dehydration','Clinical dehydration / volume depletion'),
   H('Haemodynamics at shock diagnosis'),
   N('sbp','Systolic BP','mmHg',{min:30,max:250}),
   N('dbp','Diastolic BP','mmHg',{min:10,max:150}),
   C('map','Mean arterial pressure','mmHg'),
   N('hr','Heart rate','bpm',{min:20,max:250}),
   N('rr','Respiratory rate','/min',{min:4,max:70}),
   N('spo2','SpO₂','%',{min:40,max:100}),
   N('temp','Temperature','°C',{min:30,max:44}),
   C('shockIndex','Shock index (HR/SBP)',''),
   H('Hypoperfusion'),
   N('gcs','GCS','/15',{min:3,max:15}),
   YN('confusion','Confusion / altered mentation'),
   YN('coldExt','Cold / clammy extremities'),
   YN('mottling','Skin mottling'),
   YN('oliguria','Oliguria (<0.5 mL/kg/h)'),
   SEL('killip','Killip class',['I','II','III','IV']),
   H('Cardiac arrest & ventilation'),
   YN('arrest','Cardiac arrest before / at presentation'),
   SEL('arrestLoc','Arrest location',['Out-of-hospital','In-hospital'],{show:sh('arrest','Yes')}),
   SEL('arrestRhythm','Initial rhythm',['VF / pVT','PEA','Asystole','Unknown'],{show:sh('arrest','Yes')}),
   N('roscMin','Time to ROSC','min',{min:0,max:180,show:sh('arrest','Yes')}),
   YN('coma','Comatose after ROSC (SCAI "A" modifier)',{show:sh('arrest','Yes')}),
   YN('mv','Invasive mechanical ventilation'),
   YN('niv','Non-invasive ventilation / HFNC')
 ]},
 {id:'aet', t:'Aetiology', f:[
   SEL('aetiology','Primary aetiology',AET,{req:1}),
   SEL('acsType','ACS type',['STEMI','NSTEMI'],{show:sh('aetiology','AMI-CS')}),
   SEL('territory','Infarct territory',['Anterior','Inferior','Inferior + RV','Lateral','Posterior','Indeterminate / LBBB'],{show:sh('aetiology','AMI-CS')}),
   SEL('mechComp','Mechanical complication',['None','Ventricular septal rupture','Papillary muscle rupture / acute MR','Free-wall rupture / tamponade']),
   SEL('shockPheno','Haemodynamic phenotype',['Cold-wet (classic)','Cold-dry (euvolaemic)','Warm-wet (vasodilatory)','Mixed']),
   SEL('ventDom','Ventricular involvement',['LV-dominant','RV-dominant','Biventricular']),
   YN('valvular','Valvular disease contributing'),
   YN('arrhythmia','Arrhythmia contributing (VT/VF/brady/AF-RVR)'),
   TA('aetNote','Aetiology notes')
 ]},
 {id:'lab', t:'Laboratory', f:[
   H('Perfusion & acid–base'),
   N('lacInit','Lactate — initial','mmol/L',{min:0,max:30}),
   N('lacPeak','Lactate — peak','mmol/L',{min:0,max:30}),
   N('lac24','Lactate — 24 h','mmol/L',{min:0,max:30}),
   C('lacClear','Lactate clearance (initial → 24 h)','%'),
   N('ph','pH','',{min:6.5,max:7.8}),
   N('hco3','Bicarbonate','mmol/L',{min:2,max:45}),
   N('be','Base excess','mmol/L',{min:-35,max:20}),
   H('Haematology'),
   N('wbcInit','WBC — initial','×10⁹/L',{min:0,max:100}),
   N('wbcPeak','WBC — peak','×10⁹/L',{min:0,max:100}),
   N('hbInit','Haemoglobin — initial','g/dL',{min:3,max:22}),
   N('hbNadir','Haemoglobin — nadir','g/dL',{min:3,max:22}),
   N('plt','Platelets','×10⁹/L',{min:5,max:1500}),
   N('inr','INR','',{min:0.5,max:15}),
   H('Renal & metabolic'),
   N('crInit','Creatinine — initial','µmol/L',{min:20,max:2000}),
   N('crPeak','Creatinine — peak','µmol/L',{min:20,max:2000}),
   C('egfr','eGFR (CKD-EPI 2021, initial Cr)','mL/min/1.73m²'),
   N('urea','Urea','mmol/L',{min:1,max:100}),
   N('na','Sodium','mmol/L',{min:100,max:180}),
   N('k','Potassium','mmol/L',{min:1.5,max:10}),
   N('glucose','Glucose — admission','mmol/L',{min:1,max:60}),
   N('albumin','Albumin','g/L',{min:10,max:60}),
   H('Hepatic & cardiac'),
   N('alt','ALT','U/L',{min:1,max:20000}),
   N('ast','AST','U/L',{min:1,max:20000}),
   N('bili','Total bilirubin','µmol/L',{min:1,max:800}),
   N('tropPeak','Troponin — peak (hs)','ng/L',{min:0,max:500000}),
   N('ntbnp','NT-proBNP','pg/mL',{min:0,max:70000})
 ]},
 {id:'echo', t:'Echo & haemodynamics', f:[
   H('Left ventricle'),
   N('lvef','LVEF','%',{min:5,max:80}),
   YN('rwma','Regional wall-motion abnormality'),
   N('lvotVti','LVOT VTI','cm',{min:3,max:40}),
   N('eePrime','E/e′ (average)','',{min:2,max:40}),
   YN('lvThrombus','LV thrombus'),
   H('Right ventricle'),
   N('tapse','TAPSE','mm',{min:3,max:35}),
   N('rvS','RV S′','cm/s',{min:2,max:25}),
   YN('rvDil','RV dilatation'),
   YN('rvDysf','RV systolic dysfunction'),
   N('paspEcho','PASP (echo)','mmHg',{min:10,max:120}),
   C('tapsePasp','TAPSE/PASP (RV–PA coupling)','mm/mmHg'),
   SEL('ivc','IVC',['<21 mm, collapses >50%','>21 mm or collapses <50%','Indeterminate']),
   H('Valves & pericardium'),
   SEL('mr','Mitral regurgitation',['None / trivial','Mild','Moderate','Severe']),
   SEL('as','Aortic stenosis',['None','Mild','Moderate','Severe']),
   SEL('effusion','Pericardial effusion',['None','Small','Moderate','Large','Tamponade']),
   H('Invasive haemodynamics (PAC)'),
   YN('pac','Pulmonary artery catheter used'),
   N('ra','RA pressure','mmHg',{min:0,max:40,show:sh('pac','Yes')}),
   N('paSys','PA systolic','mmHg',{min:5,max:120,show:sh('pac','Yes')}),
   N('paDia','PA diastolic','mmHg',{min:2,max:70,show:sh('pac','Yes')}),
   N('pcwp','PCWP','mmHg',{min:2,max:50,show:sh('pac','Yes')}),
   N('co','Cardiac output','L/min',{min:0.5,max:15,show:sh('pac','Yes')}),
   N('ci','Cardiac index','L/min/m²',{min:0.3,max:8,show:sh('pac','Yes')}),
   C('cpo','Cardiac power output','W',{show:sh('pac','Yes')}),
   C('papi','PAPi','',{show:sh('pac','Yes')}),
   C('raPcwp','RA/PCWP ratio','',{show:sh('pac','Yes')})
 ]},
 {id:'dev', t:'Revasc & devices', f:[
   H('Coronary angiography & revascularisation'),
   YN('angio','Coronary angiography'),
   YN('pci','PCI performed',{show:sh('angio','Yes')}),
   SEL('culprit','Culprit vessel',['Left main','LAD','LCx','RCA','Graft','None identified'],{show:sh('angio','Yes')}),
   SEL('cad','Extent of CAD',['No significant CAD','1-vessel','2-vessel','3-vessel','Left main ± others'],{show:sh('angio','Yes')}),
   SEL('timiPre','TIMI flow — pre',['0','1','2','3'],{show:sh('pci','Yes')}),
   SEL('timiPost','TIMI flow — post',['0','1','2','3'],{show:sh('pci','Yes')}),
   SEL('revascStrat','Revascularisation strategy',['Culprit-only','Immediate multivessel','Staged multivessel'],{show:sh('pci','Yes')}),
   N('d2b','Door-to-balloon','min',{min:0,max:1440,show:sh('pci','Yes')}),
   YN('cabg','Emergency CABG / surgery'),
   H('Mechanical circulatory support'),
   YN('iabp','IABP'), YN('impella','Impella'), YN('ecmo','VA-ECMO'),
   C('mcsAny','Any MCS','', 'cat'),
   SEL('mcsTiming','MCS timing',['Before PCI','After PCI','No PCI'],{show:function(v){return yes(v.iabp)||yes(v.impella)||yes(v.ecmo);}}),
   N('mcsDays','MCS duration','days',{min:0,max:60,show:function(v){return yes(v.iabp)||yes(v.impella)||yes(v.ecmo);}}),
   YN('rrt','Renal replacement therapy'),
   H('Device / procedural complications'),
   SEL('barc','Bleeding (BARC)',['None','1','2','3a','3b','3c','5']),
   YN('transfusion','Blood transfusion'),
   YN('limbIsch','Limb ischaemia'),
   YN('vascComp','Access-site vascular complication'),
   YN('haemolysis','Haemolysis'),
   YN('devInfect','Device-related infection')
 ]},
 {id:'pharm', t:'Pharmacotherapy', f:[
   H('Vasopressors & inotropes (maximum dose)'),
   YN('ne','Norepinephrine'), N('neMax','Norepinephrine max','µg/kg/min',{min:0,max:5,show:sh('ne','Yes')}),
   YN('epi','Epinephrine'), N('epiMax','Epinephrine max','µg/kg/min',{min:0,max:5,show:sh('epi','Yes')}),
   YN('dopa','Dopamine'), N('dopaMax','Dopamine max','µg/kg/min',{min:0,max:50,show:sh('dopa','Yes')}),
   YN('dobu','Dobutamine'), N('dobuMax','Dobutamine max','µg/kg/min',{min:0,max:40,show:sh('dobu','Yes')}),
   YN('vaso','Vasopressin'), N('vasoMax','Vasopressin max','U/min',{min:0,max:0.2,show:sh('vaso','Yes'),hint:'Converted to U/kg/min with weight for VIS'}),
   YN('milri','Milrinone'), N('milriMax','Milrinone max','µg/kg/min',{min:0,max:1,show:sh('milri','Yes')}),
   YN('levo','Levosimendan'),
   C('nVaso','Number of vasoactive agents',''),
   C('vis','Vasoactive-Inotropic Score (max)',''),
   N('vasoHours','Duration of vasoactive support','hours',{min:0,max:1000}),
   H('Other therapy'),
   YN('dapt','Dual antiplatelet therapy'),
   YN('anticoag','Therapeutic anticoagulation'),
   YN('diuretic','IV loop diuretic'),
   YN('steroid','Corticosteroids'),
   YN('antibiotic','Antibiotics (suspected sepsis)'),
   YN('ttm','Targeted temperature management',{show:sh('arrest','Yes')})
 ]},
 {id:'out', t:'Outcomes', f:[
   H('Mortality'),
   YN('death','In-hospital death',{req:1}),
   DT('deathDate','Date/time of death',{show:sh('death','Yes')}),
   SEL('deathCause','Cause of death',['Refractory cardiogenic shock','Arrhythmic','Multi-organ failure','Anoxic brain injury','Bleeding','Sepsis','Mechanical complication','Other'],{show:sh('death','Yes')}),
   C('hrsToDeath','Admission → death','hours',{show:sh('death','Yes')}),
   YN('d30','30-day mortality'),
   H('Course'),
   DT('dcDate','Discharge date/time',{show:function(v){return !yes(v.death);}}),
   C('los','Hospital length of stay','days'),
   N('icuDays','ICU / CCU length of stay','days',{min:0,max:200}),
   N('mvDays','Days on mechanical ventilation','days',{min:0,max:200,show:sh('mv','Yes')}),
   SEL('dispo','Discharge disposition',['Home','Transferred to another hospital','Repatriated (international pilgrim)','Rehabilitation / long-term care'],{show:function(v){return !yes(v.death);}}),
   H('In-hospital complications'),
   YN('aki','Acute kidney injury (KDIGO)'),
   YN('strokeOut','Stroke'),
   YN('mof','Multi-organ failure'),
   YN('sepsisOut','Nosocomial sepsis'),
   YN('reArrest','Recurrent cardiac arrest'),
   YN('readmit30','30-day readmission',{show:function(v){return !yes(v.death);}}),
   TA('outNote','Outcome notes')
 ]},
 {id:'scores', t:'Scores', f:[
   H('SCAI SHOCK stage (2022)'),
   C('scaiSug','SCAI — suggested by algorithm','', 'cat'),
   SEL('scaiManual','SCAI — confirmed (worst stage)',['A','B','C','D','E'],{hint:'Your clinical stage overrides the suggestion'}),
   C('scaiFinal','SCAI — used in analysis','', 'cat'),
   C('scaiMod','Cardiac-arrest modifier (A)','', 'cat'),
   H('CardShock score (Harjola 2015)'),
   C('cardshock','CardShock score','/9'),
   C('csRisk','CardShock risk group','', 'cat'),
   C('csPred','Predicted in-hospital mortality','%', 'txt'),
   H('IABP-SHOCK II score (Pöss 2017)'),
   C('iabpS','IABP-SHOCK II score','/9'),
   C('iabpRisk','IABP-SHOCK II risk group','', 'cat'),
   C('iabpPred','Predicted 30-day mortality','%', 'txt')
 ]}
];

var FIELDS = [], FMAP = {};
(function(){ for(var i=0;i<SECTIONS.length;i++){ var f = SECTIONS[i].f; for(var j=0;j<f.length;j++){ if(f[j].ty !== 'h'){ f[j].sec = i; FIELDS.push(f[j]); FMAP[f[j].k] = f[j]; } } } })();

/* ---------- clinical calculations ---------- */
function egfr(cr, age, sex){
  if(cr === null || age === null || !sex) return null;
  var scr = cr / 88.4, f = sex === 'Female', k = f ? 0.7 : 0.9, a = f ? -0.241 : -0.302;
  var e = 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age) * (f ? 1.012 : 1);
  return Math.round(e);
}
var HIJRI_FMT = null;
function hijri(d){
  try{
    if(!HIJRI_FMT) HIJRI_FMT = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {day:'numeric', month:'numeric', year:'numeric'});
    var parts = HIJRI_FMT.formatToParts(d), o = {};
    for(var i=0;i<parts.length;i++){ o[parts[i].type] = parts[i].value; }
    var dd = parseInt(o.day,10), mm = parseInt(o.month,10), yy = parseInt(o.year || o.relatedYear,10);
    if(isNaN(dd) || isNaN(mm)) return null;
    return {d:dd, m:mm, y:yy};
  }catch(e){ return null; }
}
var HMON = ['Muharram','Safar','Rabi I','Rabi II','Jumada I','Jumada II','Rajab','Sha\'ban','Ramadan','Shawwal','Dhul-Qa\'dah','Dhul-Hijjah'];
function hajjPhaseOf(h){
  if(!h) return null;
  if(h.m === 11) return 'Pre-Hajj';
  if(h.m === 12 && h.d <= 7) return 'Pre-Hajj';
  if(h.m === 12 && h.d <= 13) return 'Hajj days';
  if(h.m === 12) return 'Post-Hajj';
  if(h.m === 1 && h.d <= 15) return 'Post-Hajj';
  return 'Outside Hajj season';
}

var DETAIL = {};
function calc(v){
  var w = num(v.weight), ht = num(v.height), age = num(v.age);
  v.bmi = (w && ht) ? r1(w / Math.pow(ht / 100, 2)) : null;
  var sbp = num(v.sbp), dbp = num(v.dbp), hr = num(v.hr);
  v.map = (sbp !== null && dbp !== null) ? Math.round((sbp + 2 * dbp) / 3) : null;
  v.shockIndex = (hr !== null && sbp) ? r2(hr / sbp) : null;

  var ad = pdate(v.admDate), h = ad ? hijri(ad) : null;
  v.hijriAdm = h ? (h.d + ' ' + HMON[h.m - 1] + ' ' + h.y + ' AH') : null;
  v.hajjPhaseAuto = hajjPhaseOf(h);

  var li = num(v.lacInit), l24 = num(v.lac24), lp = num(v.lacPeak);
  v.lacClear = (li && l24 !== null) ? Math.round((li - l24) / li * 100) : null;
  var cr = num(v.crInit), crp = num(v.crPeak);
  v.egfr = egfr(cr, age, v.sex);

  var tap = num(v.tapse), pasp = num(v.paspEcho);
  v.tapsePasp = (tap !== null && pasp) ? r2(tap / pasp) : null;
  var co = num(v.co), ra = num(v.ra), ps = num(v.paSys), pd = num(v.paDia), pw = num(v.pcwp);
  v.cpo = (co !== null && v.map !== null) ? r2(v.map * co / 451) : null;
  v.papi = (ra && ps !== null && pd !== null) ? r2((ps - pd) / ra) : null;
  v.raPcwp = (ra !== null && pw) ? r2(ra / pw) : null;

  // MCS
  var anyM = yes(v.iabp) || yes(v.impella) || yes(v.ecmo);
  v.mcsAny = anyM ? 'Yes' : ((no(v.iabp) && no(v.impella) && no(v.ecmo)) ? 'No' : null);

  // vasoactives
  var ag = ['ne','epi','dopa','dobu','vaso','milri','levo'], nv = 0, anyKnown = false;
  for(var i=0;i<ag.length;i++){ if(yes(v[ag[i]])) nv++; if(filled(v[ag[i]])) anyKnown = true; }
  v.nVaso = anyKnown ? nv : null;
  var vis = 0, visAny = false;
  function addV(flag, dose, mult){ if(yes(v[flag]) && num(v[dose]) !== null){ vis += num(v[dose]) * mult; visAny = true; } }
  addV('dopa','dopaMax',1); addV('dobu','dobuMax',1); addV('epi','epiMax',100); addV('ne','neMax',100); addV('milri','milriMax',10);
  if(yes(v.vaso) && num(v.vasoMax) !== null && w){ vis += (num(v.vasoMax) / w) * 10000; visAny = true; }
  v.vis = visAny ? r1(vis) : (anyKnown && nv === 0 ? 0 : null);

  // outcomes
  v.los = days(v.admDate, yes(v.death) ? v.deathDate : v.dcDate);
  var hd = days(v.admDate, v.deathDate);
  v.hrsToDeath = (yes(v.death) && hd !== null) ? Math.round(hd * 24) : null;

  // CardShock
  var cs = 0, miss = [], items = [];
  function it(lbl, val, pts){ if(val === null){ miss.push(lbl); items.push([lbl,'missing',0]); } else { items.push([lbl, val ? 'yes' : 'no', val ? pts : 0]); if(val) cs += pts; } }
  it('Age > 75', age === null ? null : age > 75, 1);
  it('Confusion at presentation', filled(v.confusion) && v.confusion !== 'Unknown' ? yes(v.confusion) : null, 1);
  var pm = (filled(v.priorMI) && v.priorMI !== 'Unknown') || (filled(v.priorCABG) && v.priorCABG !== 'Unknown') ? (yes(v.priorMI) || yes(v.priorCABG)) : null;
  it('Previous MI or CABG', pm, 1);
  it('ACS aetiology', filled(v.aetiology) ? v.aetiology === 'AMI-CS' : null, 1);
  it('LVEF < 40%', num(v.lvef) === null ? null : num(v.lvef) < 40, 1);
  if(li === null){ miss.push('Lactate'); items.push(['Lactate (initial)','missing',0]); }
  else { var lpnt = li > 4 ? 2 : (li >= 2 ? 1 : 0); cs += lpnt; items.push(['Lactate ' + li + ' mmol/L', li > 4 ? '> 4' : (li >= 2 ? '2–4' : '< 2'), lpnt]); }
  if(v.egfr === null){ miss.push('eGFR'); items.push(['eGFR','missing',0]); }
  else { var gp = v.egfr < 30 ? 2 : (v.egfr <= 60 ? 1 : 0); cs += gp; items.push(['eGFR ' + v.egfr, v.egfr < 30 ? '< 30' : (v.egfr <= 60 ? '30–60' : '> 60'), gp]); }
  var csOK = miss.length === 0;
  v.cardshock = csOK ? cs : null;
  v.csRisk = csOK ? (cs <= 3 ? 'Low (0–3)' : (cs <= 5 ? 'Intermediate (4–5)' : 'High (6–9)')) : null;
  v.csPred = csOK ? (cs <= 3 ? '8.7' : (cs <= 5 ? '36.0' : '77.3')) : null;
  DETAIL.cs = {items:items, miss:miss, partial:cs};

  // IABP-SHOCK II
  var ib = 0, im = [], iitems = [];
  function ii(lbl, val, pts){ if(val === null){ im.push(lbl); iitems.push([lbl,'missing',0]); } else { iitems.push([lbl, val ? 'yes' : 'no', val ? pts : 0]); if(val) ib += pts; } }
  ii('Age > 73', age === null ? null : age > 73, 1);
  ii('Prior stroke', filled(v.priorStroke) && v.priorStroke !== 'Unknown' ? yes(v.priorStroke) : null, 2);
  ii('Glucose > 10.6 mmol/L', num(v.glucose) === null ? null : num(v.glucose) > 10.6, 1);
  ii('Creatinine > 132.6 µmol/L', cr === null ? null : cr > 132.6, 1);
  ii('Lactate > 5 mmol/L', li === null ? null : li > 5, 2);
  var tp = v.timiPost;
  ii(yes(v.pci) || !(no(v.pci) || no(v.angio)) ? 'TIMI < 3 after PCI' : 'TIMI < 3 after PCI (n/a — no PCI, scored 0)', yes(v.pci) ? (filled(tp) ? Number(tp) < 3 : null) : ((no(v.pci) || no(v.angio)) ? false : null), 2);
  var ibOK = im.length === 0 && v.aetiology === 'AMI-CS';
  v.iabpS = ibOK ? ib : null;
  v.iabpRisk = ibOK ? (ib <= 2 ? 'Low (0–2)' : (ib <= 4 ? 'Intermediate (3–4)' : 'High (5–9)')) : null;
  v.iabpPred = ibOK ? (ib <= 2 ? '23.8' : (ib <= 4 ? '49.2' : '76.6')) : null;
  DETAIL.ib = {items:iitems, miss:im, partial:ib, ami: v.aetiology === 'AMI-CS'};

  // SCAI suggestion
  var lmax = lp !== null ? lp : li, ph = num(v.ph), why = '';
  var s = null;
  if(sbp !== null || lmax !== null || v.nVaso !== null || anyM){
    if(yes(v.ecmo) || (lmax !== null && lmax >= 8) || (ph !== null && ph <= 7.2)){ s = 'E'; why = 'VA-ECMO, lactate ≥ 8 or pH ≤ 7.2'; }
    else if((v.nVaso !== null && v.nVaso >= 2) || (anyM && v.nVaso >= 1)){ s = 'D'; why = '≥ 2 vasoactives or MCS + vasoactive (escalation)'; }
    else if((lmax !== null && lmax >= 2) || v.nVaso >= 1 || anyM || (cr && crp && crp >= 2 * cr)){ s = 'C'; why = 'Hypoperfusion requiring a vasoactive, MCS or lactate ≥ 2'; }
    else if((sbp !== null && sbp < 90) || (v.map !== null && v.map < 60) || (hr !== null && hr > 100)){ s = 'B'; why = 'Hypotension / tachycardia without hypoperfusion'; }
    else { s = 'A'; why = 'At risk — no hypotension or hypoperfusion'; }
  }
  v.scaiSug = s;
  v.scaiFinal = filled(v.scaiManual) ? v.scaiManual : s;
  v.scaiMod = yes(v.arrest) ? (yes(v.coma) ? 'A (arrest + coma)' : 'Arrest, no coma') : (no(v.arrest) ? 'None' : null);
  DETAIL.scaiWhy = why;
  return v;
}

/* ---------- storage ---------- */
function load(){
  try{
    var s = localStorage.getItem(LS_KEY);
    if(s){ var o = JSON.parse(s); if(o && o.patients){ DB.patients = o.patients; if(o.settings) ext(DB.settings, o.settings); } }
  }catch(e){ toast('Could not read stored data'); }
}
function persist(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(DB)); DIRTY = false; setDot(); }
  catch(e){ toast('⚠ Storage full or blocked — export a JSON backup now'); }
}
function scheduleSave(){ DIRTY = true; setDot(); clearTimeout(SAVE_T); SAVE_T = setTimeout(persist, 400); }
function setDot(){ var d = $('sdot'); if(d){ d.className = 'dot' + (DIRTY ? ' dirty' : ''); d.title = DIRTY ? 'Saving…' : 'Saved'; } }
function byId(id){ for(var i=0;i<DB.patients.length;i++){ if(DB.patients[i].id === id) return DB.patients[i]; } return null; }
function cur(){ return CUR ? byId(CUR) : null; }
function nextStudyId(){
  var mx = 0;
  for(var i=0;i<DB.patients.length;i++){ var m = /^CS-(\d+)$/.exec(DB.patients[i].v.studyId || ''); if(m && +m[1] > mx) mx = +m[1]; }
  return 'CS-' + pad(mx + 1);
}
function completeness(v){
  var tot = 0, fil = 0;
  for(var i=0;i<FIELDS.length;i++){ var f = FIELDS[i];
    if(f.ty === 'calc' || f.ty === 'ta' || f.k === 'mrn' || f.k === 'initials') continue;
    if(f.show && !f.show(v)) continue;
    tot++; if(filled(v[f.k])) fil++; }
  return tot ? Math.round(fil / tot * 100) : 0;
}
function secCompleteness(si, v){
  var tot = 0, fil = 0, f = SECTIONS[si].f;
  for(var i=0;i<f.length;i++){ var x = f[i]; if(x.ty === 'h' || x.ty === 'calc' || x.ty === 'ta') continue; if(x.show && !x.show(v)) continue; tot++; if(filled(v[x.k])) fil++; }
  return tot ? Math.round(fil / tot * 100) : 100;
}

/* ---------- auth ---------- */
function isAuthed(){ try{ return sessionStorage.getItem(SESS_KEY) === '1' || localStorage.getItem(SESS_KEY) === '1'; }catch(e){ return false; } }
function doLogin(){
  var u = $('lu').value.trim(), p = $('lp').value;
  if(u.toLowerCase() === String(DB.settings.user).toLowerCase() && p === DB.settings.pass){
    try{ sessionStorage.setItem(SESS_KEY,'1'); if($('lrem').checked) localStorage.setItem(SESS_KEY,'1'); }catch(e){}
    $('lerr').textContent = ''; showApp();
  } else { $('lerr').textContent = 'Incorrect username or password'; }
}
function lock(){ try{ sessionStorage.removeItem(SESS_KEY); localStorage.removeItem(SESS_KEY); }catch(e){} persist(); $('app').className = 'hidden'; $('login').className = ''; $('lp').value = ''; }
function showApp(){ $('login').className = 'hidden'; $('app').className = ''; go(VIEW); }

/* ---------- navigation ---------- */
function go(v){
  VIEW = v;
  var vs = ['dash','list','entry','stats','set'];
  for(var i=0;i<vs.length;i++){ $('v-' + vs[i]).className = 'view' + (vs[i] === v ? '' : ' hidden'); }
  var tb = $('tabs').getElementsByTagName('button');
  for(var j=0;j<tb.length;j++){ tb[j].className = tb[j].getAttribute('data-arg') === v ? 'on' : ''; }
  if(v === 'dash') renderDash();
  else if(v === 'list') renderList();
  else if(v === 'entry') renderEntry();
  else if(v === 'stats') renderStats();
  else if(v === 'set') renderSet();
  window.scrollTo(0,0);
}

/* ---------- patient ops ---------- */
function newPatient(){
  var p = { id: uid(), created: Date.now(), updated: Date.now(), v: { studyId: nextStudyId() } };
  calc(p.v); DB.patients.push(p); CUR = p.id; CURSEC = 0; persist(); go('entry');
  toast('New patient ' + p.v.studyId);
}
function delPatient(id){
  var p = byId(id); if(!p) return;
  if(!window.confirm('Delete ' + (p.v.studyId || 'this patient') + '? This cannot be undone.')) return;
  for(var i=0;i<DB.patients.length;i++){ if(DB.patients[i].id === id){ DB.patients.splice(i,1); break; } }
  if(CUR === id) CUR = null;
  persist(); fsDelete(id); toast('Deleted'); go(VIEW === 'entry' ? 'list' : VIEW);
}
function dupPatient(id){
  var p = byId(id); if(!p) return;
  var c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.created = c.updated = Date.now(); c.v.studyId = nextStudyId(); c.v.mrn = '';
  DB.patients.push(c); CUR = c.id; persist(); go('entry'); toast('Duplicated as ' + c.v.studyId);
}

/* ---------- DASHBOARD ---------- */
function bars(items, red){
  var mx = 0, h = '';
  for(var i=0;i<items.length;i++){ if(items[i][1] > mx) mx = items[i][1]; }
  for(var j=0;j<items.length;j++){ var it = items[j];
    h += '<div class="bar"><div class="lb"><span>' + esc(it[0]) + '</span><span class="mut">' + esc(it[2] || it[1]) + '</span></div><div class="tr"><div class="fi' + (red ? ' r' : '') + '" style="width:' + (mx ? (it[1] / (it[3] || mx) * 100) : 0) + '%"></div></div></div>'; }
  return h || '<div class="mut small">No data yet</div>';
}
function mortBy(getter, cats){
  var out = [];
  for(var i=0;i<cats.length;i++){ var n = 0, d = 0;
    for(var j=0;j<DB.patients.length;j++){ var v = DB.patients[j].v; if(getter(v) === cats[i] && filled(v.death) && v.death !== 'Unknown'){ n++; if(yes(v.death)) d++; } }
    out.push([cats[i], pct(d,n), n ? (d + '/' + n + ' · ' + pct(d,n) + '%') : '—', 100]); }
  return out;
}
function countBy(getter, cats){
  var out = [], tot = 0, c = [];
  for(var i=0;i<cats.length;i++){ c[i] = 0; }
  for(var j=0;j<DB.patients.length;j++){ var g = getter(DB.patients[j].v); var ix = cats.indexOf(g); if(ix >= 0){ c[ix]++; tot++; } }
  for(var k=0;k<cats.length;k++){ out.push([cats[k], c[k], c[k] + ' (' + pct(c[k], tot) + '%)']); }
  return out;
}
function phaseOf(v){ return filled(v.hajjPhase) ? v.hajjPhase : v.hajjPhaseAuto; }
function renderDash(){
  var P = DB.patients, n = P.length, el = $('v-dash');
  if(!n){ el.innerHTML = '<div class="empty"><div style="font-size:46px">🫀</div><h2>No patients yet</h2><p>Add your first patient, import a CSV from your Excel workbook, or load demo data in Settings to explore.</p><div class="row" style="justify-content:center"><button class="btn p" data-act="newPt">＋ New patient</button><button class="btn" data-act="view" data-arg="set">Import / demo</button></div></div>'; return; }
  var dead = 0, dk = 0, d30 = 0, d30k = 0, ages = [], male = 0, sexk = 0, pil = 0, pilk = 0, ami = 0, amik = 0, mcs = 0, mcsk = 0, lac = [], los = [], comp = 0;
  for(var i=0;i<n;i++){ var v = P[i].v;
    if(yes(v.death) || no(v.death)){ dk++; if(yes(v.death)) dead++; }
    if(yes(v.d30) || no(v.d30)){ d30k++; if(yes(v.d30)) d30++; }
    if(num(v.age) !== null) ages.push(num(v.age));
    if(filled(v.sex)){ sexk++; if(v.sex === 'Male') male++; }
    if(filled(v.hajjStatus)){ pilk++; if(v.hajjStatus.indexOf('Pilgrim') === 0) pil++; }
    if(filled(v.aetiology)){ amik++; if(v.aetiology === 'AMI-CS') ami++; }
    if(filled(v.mcsAny)){ mcsk++; if(yes(v.mcsAny)) mcs++; }
    if(num(v.lacInit) !== null) lac.push(num(v.lacInit));
    if(num(v.los) !== null) los.push(num(v.los));
    comp += completeness(v);
  }
  var k = function(l, val, s){ return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + val + '</div><div class="s">' + (s || '') + '</div></div>'; };
  var h = '<h2>Cohort overview</h2><div class="kpis">' +
    k('Patients', n, 'Avg completeness ' + Math.round(comp / n) + '%') +
    k('In-hospital mortality', dk ? pct(dead, dk) + '%' : '—', dead + '/' + dk + ' with outcome') +
    k('30-day mortality', d30k ? pct(d30, d30k) + '%' : '—', d30 + '/' + d30k) +
    k('Age', ages.length ? r1(mean(ages)) : '—', ages.length ? '± ' + r1(sd(ages)) + ' (mean ± SD)' : '') +
    k('Male', sexk ? pct(male, sexk) + '%' : '—', male + '/' + sexk) +
    k('Pilgrims', pilk ? pct(pil, pilk) + '%' : '—', pil + '/' + pilk) +
    k('AMI-CS', amik ? pct(ami, amik) + '%' : '—', ami + '/' + amik) +
    k('MCS used', mcsk ? pct(mcs, mcsk) + '%' : '—', mcs + '/' + mcsk) +
    k('Initial lactate', lac.length ? r1(median(lac)) : '—', lac.length ? 'median, mmol/L' : '') +
    k('Length of stay', los.length ? r1(median(los)) : '—', los.length ? 'median, days' : '') +
    '</div><div class="grid2">';
  var stg = ['A','B','C','D','E'];
  h += '<div class="card"><h3 style="margin-top:0">SCAI stage distribution</h3>' + bars(countBy(function(v){ return v.scaiFinal; }, stg)) + '</div>';
  h += '<div class="card"><h3 style="margin-top:0">Mortality by SCAI stage</h3>' + bars(mortBy(function(v){ return v.scaiFinal; }, stg), true) + '</div>';
  h += '<div class="card"><h3 style="margin-top:0">Aetiology</h3>' + bars(countBy(function(v){ return v.aetiology; }, AET)) + '</div>';
  h += '<div class="card"><h3 style="margin-top:0">Mortality by Hajj phase</h3>' + bars(mortBy(phaseOf, PHASE), true) + '</div>';
  h += '<div class="card"><h3 style="margin-top:0">Admissions by Hajj phase</h3>' + bars(countBy(phaseOf, PHASE)) + '</div>';
  h += '<div class="card"><h3 style="margin-top:0">Mortality by pilgrim status</h3>' + bars(mortBy(function(v){ return v.hajjStatus; }, FMAP.hajjStatus.opts), true) + '</div>';
  // CardShock calibration
  var grp = ['Low (0–3)','Intermediate (4–5)','High (6–9)'], pred = ['8.7','36.0','77.3'];
  var ob = mortBy(function(v){ return v.csRisk; }, grp);
  var t = '<table><tr><th>CardShock group</th><th class="n">Predicted</th><th class="n">Observed</th></tr>';
  for(var g=0;g<3;g++){ t += '<tr><td>' + grp[g] + '</td><td class="n">' + pred[g] + '%</td><td class="n">' + ob[g][2] + '</td></tr>'; }
  t += '</table>';
  var grp2 = ['Low (0–2)','Intermediate (3–4)','High (5–9)'], pred2 = ['23.8','49.2','76.6'];
  var ob2 = mortBy(function(v){ return v.iabpRisk; }, grp2);
  var t2 = '<table><tr><th>IABP-SHOCK II group</th><th class="n">Predicted*</th><th class="n">Observed</th></tr>';
  for(var g2=0;g2<3;g2++){ t2 += '<tr><td>' + grp2[g2] + '</td><td class="n">' + pred2[g2] + '%</td><td class="n">' + ob2[g2][2] + '</td></tr>'; }
  t2 += '</table><div class="mut small" style="margin-top:6px">*Derivation cohort predicted 30-day mortality; observed column uses in-hospital death.</div>';
  h += '<div class="card"><h3 style="margin-top:0">Score calibration — CardShock</h3>' + t + '</div>';
  h += '<div class="card"><h3 style="margin-top:0">Score calibration — IABP-SHOCK II (AMI-CS)</h3>' + t2 + '</div>';
  h += '</div>';
  el.innerHTML = h;
}

/* ---------- PATIENT LIST ---------- */
function renderList(){
  var el = $('v-list');
  var h = '<h2>Patients <span class="mut small">(' + DB.patients.length + ')</span></h2>' +
    '<div class="row" style="margin-bottom:10px"><input id="lq" placeholder="Search ID, MRN, initials, aetiology…" value="' + esc(LISTQ) + '" style="flex:1;min-width:180px">' +
    '<select id="lf" style="width:auto">' + opt('all','All',LISTF) + opt('dead','Died',LISTF) + opt('alive','Survived',LISTF) + opt('pending','Outcome pending',LISTF) + opt('pil','Pilgrims',LISTF) + opt('ami','AMI-CS',LISTF) + opt('inc','< 80% complete',LISTF) + '</select></div><div id="lbox"></div>';
  el.innerHTML = h; fillList();
}
function opt(v, l, sel){ return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>'; }
function fillList(){
  var q = LISTQ.toLowerCase(), arr = DB.patients.slice().sort(function(a,b){ return b.updated - a.updated; }), h = '';
  for(var i=0;i<arr.length;i++){ var p = arr[i], v = p.v;
    var hay = [v.studyId, v.mrn, v.initials, v.aetiology, v.nationality, v.hajjStatus].join(' ').toLowerCase();
    if(q && hay.indexOf(q) < 0) continue;
    if(LISTF === 'dead' && !yes(v.death)) continue;
    if(LISTF === 'alive' && !no(v.death)) continue;
    if(LISTF === 'pending' && (yes(v.death) || no(v.death))) continue;
    if(LISTF === 'pil' && !(v.hajjStatus && v.hajjStatus.indexOf('Pilgrim') === 0)) continue;
    if(LISTF === 'ami' && v.aetiology !== 'AMI-CS') continue;
    var c = completeness(v);
    if(LISTF === 'inc' && c >= 80) continue;
    var sub = [num(v.age) !== null ? v.age + 'y' : '', v.sex ? v.sex.charAt(0) : '', v.aetiology || '', v.admDate ? v.admDate.slice(0,10) : ''].join(' · ').replace(/^( · )+|( · )+$/g,'');
    h += '<div class="pi"><div class="m" data-act="open" data-arg="' + p.id + '"><div class="id">' + esc(v.studyId || '(no ID)') + (v.initials ? ' <span class="mut small">' + esc(v.initials) + '</span>' : '') + '</div><div class="sub">' + esc(sub) + '</div><div style="margin-top:5px">' +
      (v.scaiFinal ? '<span class="tag s">SCAI ' + esc(v.scaiFinal) + '</span>' : '') +
      (yes(v.death) ? '<span class="tag r">Died</span>' : (no(v.death) ? '<span class="tag g">Survived</span>' : '<span class="tag">Outcome ?</span>')) +
      (yes(v.mcsAny) ? '<span class="tag">MCS</span>' : '') + (v.hajjStatus && v.hajjStatus.indexOf('Pilgrim') === 0 ? '<span class="tag">Pilgrim</span>' : '') +
      '</div><div class="prog"><i style="width:' + c + '%"></i></div></div>' +
      '<button class="btn sm d" data-act="del" data-arg="' + p.id + '" title="Delete">🗑</button></div>';
  }
  $('lbox').innerHTML = h || '<div class="empty">No matching patients</div>';
}

/* ---------- ENTRY ---------- */
function renderEntry(){
  var el = $('v-entry'), p = cur();
  if(!p){ el.innerHTML = '<div class="empty"><h2>No patient open</h2><p>Create a new record or open one from the patient list.</p><div class="row" style="justify-content:center"><button class="btn p" data-act="newPt">＋ New patient</button><button class="btn" data-act="view" data-arg="list">Patient list</button></div></div>'; return; }
  var v = calc(p.v);
  var h = '<div class="ebar"><div class="who"><b id="ewho">' + esc(v.studyId || '(no ID)') + '</b> <span class="mut small" id="ecomp">' + completeness(v) + '% complete</span></div>' +
    '<button class="btn sm" data-act="dup" data-arg="' + p.id + '">Duplicate</button><button class="btn sm d" data-act="del" data-arg="' + p.id + '">Delete</button><button class="btn sm t" data-act="saveNow">Save</button></div>';
  h += '<div class="chips" id="chips">' + chipsHTML(v) + '</div>';
  h += '<div class="card"><div class="form" id="form">' + sectionHTML(CURSEC, v) + '</div>';
  h += '<div class="nav2"><button class="btn" data-act="sec" data-arg="' + (CURSEC - 1) + '"' + (CURSEC === 0 ? ' disabled style="opacity:.4"' : '') + '>‹ Prev</button>' +
       '<button class="btn" data-act="sec" data-arg="' + (CURSEC + 1) + '"' + (CURSEC === SECTIONS.length - 1 ? ' disabled style="opacity:.4"' : '') + '>Next ›</button></div></div>';
  h += '<div class="mut small">Autosaves on every change. Dashed teal boxes are calculated automatically.</div>';
  el.innerHTML = h;
  refreshForm(v);
}
function chipsHTML(v){
  var h = '';
  for(var i=0;i<SECTIONS.length;i++){ h += '<button class="chip' + (i === CURSEC ? ' on' : '') + '" data-act="sec" data-arg="' + i + '">' + esc(SECTIONS[i].t) + (SECTIONS[i].id !== 'scores' ? '<em>' + secCompleteness(i, v) + '%</em>' : '') + '</button>'; }
  return h;
}
function sectionHTML(si, v){
  var f = SECTIONS[si].f, h = '';
  for(var i=0;i<f.length;i++){ h += fieldHTML(f[i], v); }
  if(SECTIONS[si].id === 'scores') h += '<div class="sdet" id="sdet"></div>';
  return h;
}
function fieldHTML(f, v){
  if(f.ty === 'h') return '<div class="fh">' + esc(f.l) + '</div>';
  var val = v[f.k], h = '<div class="fld' + (f.req ? ' req' : '') + '" data-row="' + f.k + '"><label>' + esc(f.l) + (f.u && f.ty !== 'calc' ? ' <span class="u">(' + esc(f.u) + ')</span>' : '') + '</label>';
  if(f.ty === 'num') h += '<input type="number" inputmode="decimal" step="any" data-k="' + f.k + '" value="' + (filled(val) ? esc(val) : '') + '">';
  else if(f.ty === 'text') h += '<input type="text" data-k="' + f.k + '" value="' + esc(val) + '" autocapitalize="characters">';
  else if(f.ty === 'dt') h += '<input type="datetime-local" data-k="' + f.k + '" value="' + esc(val) + '">';
  else if(f.ty === 'ta') h += '<textarea data-k="' + f.k + '">' + esc(val) + '</textarea>';
  else if(f.ty === 'sel'){ h += '<select data-k="' + f.k + '"><option value="">—</option>'; for(var i=0;i<f.opts.length;i++){ h += opt(f.opts[i], f.opts[i], val); } h += '</select>'; }
  else if(f.ty === 'yn'){ var o = ['Yes','No','Unknown']; h += '<div class="seg">'; for(var j=0;j<3;j++){ h += '<button type="button" class="' + o[j] + (val === o[j] ? ' on' : '') + '" data-act="yn" data-arg="' + f.k + '|' + o[j] + '">' + (o[j] === 'Unknown' ? 'Unk' : o[j]) + '</button>'; } h += '</div>'; }
  else if(f.ty === 'calc') h += '<div class="calc" data-calc="' + f.k + '">—</div>';
  if(f.hint) h += '<div class="hint">' + esc(f.hint) + '</div>';
  if(f.ty === 'num' || f.k === 'studyId' || f.k === 'mrn') h += '<div class="warn" data-warn="' + f.k + '"></div>';
  return h + '</div>';
}
function fmtCalc(f, x){
  if(x === null || x === undefined || x === '') return '—';
  if(f.k === 'scaiSug' || f.k === 'scaiFinal') return '<span class="pill st-' + x + '">' + x + '</span>';
  return esc(x) + (f.u ? ' <span class="mut small">' + esc(f.u) + '</span>' : '');
}
function refreshForm(v){
  var form = $('form'); if(!form) return;
  var f = SECTIONS[CURSEC].f;
  for(var i=0;i<f.length;i++){ var x = f[i]; if(x.ty === 'h') continue;
    var row = form.querySelector('[data-row="' + x.k + '"]');
    if(row) row.className = 'fld' + (x.req ? ' req' : '') + (x.show && !x.show(v) ? ' hidden' : '');
    if(x.ty === 'calc'){ var c = form.querySelector('[data-calc="' + x.k + '"]'); if(c) c.innerHTML = fmtCalc(x, v[x.k]); }
    var w = form.querySelector('[data-warn="' + x.k + '"]');
    if(w){ var msg = '', n = num(v[x.k]);
      if(x.ty === 'num' && n !== null && ((x.min !== undefined && n < x.min) || (x.max !== undefined && n > x.max))) msg = 'Outside expected range (' + x.min + '–' + x.max + ') — please check';
      if(x.k === 'studyId' && filled(v.studyId) && dupCount('studyId', v.studyId) > 1) msg = 'Duplicate Study ID';
      if(x.k === 'mrn' && filled(v.mrn) && dupCount('mrn', v.mrn) > 1) msg = 'MRN already exists in another record';
      w.textContent = msg; }
  }
  // section-specific consistency checks
  if(SECTIONS[CURSEC].id === 'lab'){ var wl = form.querySelector('[data-warn="lacPeak"]'); if(wl && num(v.lacPeak) !== null && num(v.lacInit) !== null && num(v.lacPeak) < num(v.lacInit)) wl.textContent = 'Peak lactate is lower than initial'; }
  if(SECTIONS[CURSEC].id === 'pres'){ var wd = form.querySelector('[data-warn="dbp"]'); if(wd && num(v.dbp) !== null && num(v.sbp) !== null && num(v.dbp) >= num(v.sbp)) wd.textContent = 'Diastolic ≥ systolic'; }
  if(SECTIONS[CURSEC].id === 'scores') renderScoreDetail(v);
  var ec = $('ecomp'); if(ec) ec.textContent = completeness(v) + '% complete';
  var ew = $('ewho'); if(ew) ew.textContent = v.studyId || '(no ID)';
  var ch = $('chips'); if(ch){ var sl = ch.scrollLeft; ch.innerHTML = chipsHTML(v); ch.scrollLeft = sl; }
}
function dupCount(k, val){ var c = 0, s = String(val).trim().toLowerCase(); for(var i=0;i<DB.patients.length;i++){ if(String(DB.patients[i].v[k] || '').trim().toLowerCase() === s) c++; } return c; }
function itemsTable(d){
  var h = '<table><tr><th>Variable</th><th>Value</th><th class="n">Points</th></tr>';
  for(var i=0;i<d.items.length;i++){ var it = d.items[i]; h += '<tr><td>' + esc(it[0]) + '</td><td' + (it[1] === 'missing' ? ' class="warn"' : '') + '>' + esc(it[1]) + '</td><td class="n">' + it[2] + '</td></tr>'; }
  return h + '</table>';
}
function renderScoreDetail(v){
  var el = $('sdet'); if(!el) return;
  var h = '<div class="grid2" style="margin-top:8px">';
  h += '<div class="card" style="background:var(--card2)"><h3 style="margin-top:0">SCAI algorithm</h3><div class="small">' + (v.scaiSug ? 'Suggested <span class="pill st-' + v.scaiSug + '">' + v.scaiSug + '</span> — ' + esc(DETAIL.scaiWhy) : 'Enter BP, lactate, vasoactives or MCS to get a suggestion.') + '</div>' +
       '<table style="margin-top:8px"><tr><th>Stage</th><th>Definition (SCAI 2022)</th></tr>' +
       '<tr><td><span class="pill st-A">A</span></td><td>At risk: no hypotension or hypoperfusion (e.g. large AMI, ADHF)</td></tr>' +
       '<tr><td><span class="pill st-B">B</span></td><td>Beginning: hypotension (SBP < 90 / MAP < 60) or tachycardia without hypoperfusion</td></tr>' +
       '<tr><td><span class="pill st-C">C</span></td><td>Classic: hypoperfusion needing intervention (vasoactive / MCS / volume) — lactate ≥ 2, cold, oliguria</td></tr>' +
       '<tr><td><span class="pill st-D">D</span></td><td>Deteriorating: failing initial therapy — escalation, ≥ 2 vasoactives or added MCS</td></tr>' +
       '<tr><td><span class="pill st-E">E</span></td><td>Extremis: ongoing CPR / VA-ECMO, lactate ≥ 8, pH ≤ 7.2, refractory</td></tr></table>' +
       '<div class="mut small" style="margin-top:6px">The suggestion is a rule-based aid built from entered data; confirm the worst stage clinically.</div></div>';
  var cs = DETAIL.cs;
  h += '<div class="card" style="background:var(--card2)"><h3 style="margin-top:0">CardShock breakdown</h3>' + itemsTable(cs) +
       '<div class="small" style="margin-top:6px">' + (cs.miss.length ? '<span class="warn">Incomplete — missing: ' + esc(cs.miss.join(', ')) + '. Partial score ' + cs.partial + '.</span>' : 'Total <b>' + v.cardshock + '</b> → ' + esc(v.csRisk) + ', predicted in-hospital mortality ' + v.csPred + '%') + '</div></div>';
  var ib = DETAIL.ib;
  h += '<div class="card" style="background:var(--card2)"><h3 style="margin-top:0">IABP-SHOCK II breakdown</h3>' + itemsTable(ib) +
       '<div class="small" style="margin-top:6px">' + (!ib.ami ? '<span class="mut">Validated for AMI-CS only — set aetiology to AMI-CS.</span>' : (ib.miss.length ? '<span class="warn">Incomplete — missing: ' + esc(ib.miss.join(', ')) + '. Partial score ' + ib.partial + '.</span>' : 'Total <b>' + v.iabpS + '</b> → ' + esc(v.iabpRisk) + ', predicted 30-day mortality ' + v.iabpPred + '%')) + '</div></div>';
  h += '</div>';
  el.innerHTML = h;
}
function setField(k, val){
  var p = cur(); if(!p) return;
  var f = FMAP[k]; if(!f) return;
  if(f.ty === 'num'){ val = (val === '' || val === null) ? '' : Number(val); if(val !== '' && isNaN(val)) val = ''; }
  p.v[k] = val; p.updated = Date.now(); calc(p.v); refreshForm(p.v); scheduleSave();
}

/* ---------- STATISTICS ---------- */
function mean(a){ var s = 0; for(var i=0;i<a.length;i++) s += a[i]; return a.length ? s / a.length : null; }
function variance(a){ if(a.length < 2) return null; var m = mean(a), s = 0; for(var i=0;i<a.length;i++) s += (a[i] - m) * (a[i] - m); return s / (a.length - 1); }
function sd(a){ var x = variance(a); return x === null ? null : Math.sqrt(x); }
function quant(a, q){ if(!a.length) return null; var s = a.slice().sort(function(x,y){ return x - y; }); var pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); }
function median(a){ return quant(a, 0.5); }
function lgamma(x){ var c = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5]; var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); var s = 1.000000000190015; for(var j=0;j<6;j++){ y++; s += c[j] / y; } return -t + Math.log(2.5066282746310005 * s / x); }
function betacf(a, b, x){ var FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if(Math.abs(d) < FP) d = FP; d = 1 / d; var h = d;
  for(var m=1;m<=300;m++){ var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if(Math.abs(d) < FP) d = FP; c = 1 + aa / c; if(Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if(Math.abs(d) < FP) d = FP; c = 1 + aa / c; if(Math.abs(c) < FP) c = FP; d = 1 / d; var del = d * c; h *= del; if(Math.abs(del - 1) < 3e-14) break; }
  return h; }
function ibeta(a, b, x){ if(x <= 0) return 0; if(x >= 1) return 1; var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
function gammp(a, x){ if(x <= 0) return 0; var gln = lgamma(a);
  if(x < a + 1){ var ap = a, sum = 1 / a, del = sum; for(var n=0;n<500;n++){ ap++; del *= x / ap; sum += del; if(Math.abs(del) < Math.abs(sum) * 1e-15) break; } return sum * Math.exp(-x + a * Math.log(x) - gln); }
  var b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for(var i=1;i<500;i++){ var an = -i * (i - a); b += 2; d = an * d + b; if(Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if(Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var dl = d * c; h *= dl; if(Math.abs(dl - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h; }
function chiP(x, df){ return Math.max(0, 1 - gammp(df / 2, x / 2)); }
function welch(a, b){ if(a.length < 2 || b.length < 2) return null; var va = variance(a) / a.length, vb = variance(b) / b.length, se = Math.sqrt(va + vb); if(!se) return null; var t = (mean(a) - mean(b)) / se; var df = (va + vb) * (va + vb) / (va * va / (a.length - 1) + vb * vb / (b.length - 1)); return ibeta(df / 2, 0.5, df / (df + t * t)); }
function mannWhitney(a, b){ var n1 = a.length, n2 = b.length; if(n1 < 2 || n2 < 2) return null; var all = [], i;
  for(i=0;i<n1;i++) all.push([a[i],0]); for(i=0;i<n2;i++) all.push([b[i],1]);
  all.sort(function(x,y){ return x[0] - y[0]; }); var r1s = 0, tie = 0, j = 0, N2 = n1 + n2;
  while(j < N2){ var k = j; while(k + 1 < N2 && all[k + 1][0] === all[j][0]) k++; var rk = (j + k) / 2 + 1, t = k - j + 1; if(t > 1) tie += t * t * t - t; for(var m=j;m<=k;m++){ if(all[m][1] === 0) r1s += rk; } j = k + 1; }
  var U = r1s - n1 * (n1 + 1) / 2, mu = n1 * n2 / 2, sg = Math.sqrt(n1 * n2 / 12 * ((N2 + 1) - tie / (N2 * (N2 - 1)))); if(!sg) return null;
  var z = (Math.abs(U - mu) - 0.5) / sg; return chiP(z * z, 1); }
function lf(n){ return lgamma(n + 1); }
function fisher(a, b, c, d){ var r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  function pr(x){ return Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x)); }
  var po = pr(a), lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1), s = 0; for(var x=lo;x<=hi;x++){ var px = pr(x); if(px <= po * (1 + 1e-7)) s += px; } return Math.min(1, s); }
function chiTable(tab){ // tab[r][c]
  var R = [], i, j; for(i=0;i<tab.length;i++){ var rs = 0; for(j=0;j<tab[i].length;j++) rs += tab[i][j]; if(rs > 0) R.push(tab[i]); }
  if(R.length < 2) return null; var nc = R[0].length, cs = [], N = 0;
  for(j=0;j<nc;j++){ cs[j] = 0; for(i=0;i<R.length;i++) cs[j] += R[i][j]; N += cs[j]; }
  var cols = []; for(j=0;j<nc;j++){ if(cs[j] > 0) cols.push(j); } if(cols.length < 2) return null;
  if(R.length === 2 && cols.length === 2){ var a = R[0][cols[0]], b = R[0][cols[1]], c = R[1][cols[0]], d = R[1][cols[1]]; var mE = Math.min((a+b)*(a+c),(a+b)*(b+d),(c+d)*(a+c),(c+d)*(b+d)) / N;
    if(mE < 5) return {p: fisher(a,b,c,d), t:'F'}; }
  var x2 = 0; for(i=0;i<R.length;i++){ var rsum = 0; for(j=0;j<cols.length;j++) rsum += R[i][cols[j]]; for(j=0;j<cols.length;j++){ var e = rsum * cs[cols[j]] / N; if(e > 0) x2 += Math.pow(R[i][cols[j]] - e, 2) / e; } }
  return {p: chiP(x2, (R.length - 1) * (cols.length - 1)), t:'χ²'}; }
function fmtP(p){ if(p === null || p === undefined || isNaN(p)) return ''; return p < 0.001 ? '<0.001' : p.toFixed(3); }

var GROUPS = {
  none:{l:'No comparison'},
  death:{l:'In-hospital death', a:'Survivors', b:'Non-survivors', f:function(v){ return yes(v.death) ? 1 : (no(v.death) ? 0 : null); }},
  d30:{l:'30-day mortality', a:'Alive at 30 d', b:'Died ≤ 30 d', f:function(v){ return yes(v.d30) ? 1 : (no(v.d30) ? 0 : null); }},
  pilgrim:{l:'Pilgrim vs non-pilgrim', a:'Non-pilgrim', b:'Pilgrim', f:function(v){ return !v.hajjStatus ? null : (v.hajjStatus.indexOf('Pilgrim') === 0 ? 1 : 0); }},
  hajj:{l:'Hajj days vs other periods', a:'Other periods', b:'Hajj days', f:function(v){ var ph = phaseOf(v); return !ph ? null : (ph === 'Hajj days' ? 1 : 0); }},
  ami:{l:'AMI-CS vs non-AMI', a:'Non-AMI', b:'AMI-CS', f:function(v){ return !v.aetiology ? null : (v.aetiology === 'AMI-CS' ? 1 : 0); }},
  mcs:{l:'MCS vs no MCS', a:'No MCS', b:'MCS', f:function(v){ return yes(v.mcsAny) ? 1 : (no(v.mcsAny) ? 0 : null); }},
  sex:{l:'Male vs female', a:'Male', b:'Female', f:function(v){ return v.sex === 'Female' ? 1 : (v.sex === 'Male' ? 0 : null); }}
};
var NONPARAM = false;
function buildTable1(){
  var g = GROUPS[STATG], P = DB.patients, rows = [], vs = [], ga = [], gb = [], i;
  for(i=0;i<P.length;i++){ var v = P[i].v; vs.push(v); if(g.f){ var x = g.f(v); if(x === 0) ga.push(v); else if(x === 1) gb.push(v); } }
  function nums(arr, k){ var o = []; for(var q=0;q<arr.length;q++){ var n = num(arr[q][k]); if(n !== null) o.push(n); } return o; }
  function ms(a){ return a.length ? r1(mean(a)) + ' ± ' + (a.length > 1 ? r1(sd(a)) : '–') : '—'; }
  function mi(a){ return a.length ? r1(median(a)) + ' [' + r1(quant(a,.25)) + '–' + r1(quant(a,.75)) + ']' : '—'; }
  function cnt(arr, k, val){ var n = 0, d = 0; for(var q=0;q<arr.length;q++){ var x = arr[q][k]; if(filled(x) && x !== 'Unknown'){ d++; if(x === val) n++; } } return [n, d]; }
  function nc(c){ return c[1] ? c[0] + ' (' + pct(c[0], c[1]) + '%)' : '—'; }
  for(var s=0;s<SECTIONS.length;s++){
    rows.push({sec: SECTIONS[s].t});
    var f = SECTIONS[s].f;
    for(var j=0;j<f.length;j++){ var x = f[j]; if(x.ty === 'h' || x.ty === 'text' || x.ty === 'dt' || x.ty === 'ta') continue; if(x.ct === 'txt') continue;
      var lab = x.l + (x.u ? ', ' + x.u : '');
      if(x.ty === 'num' || (x.ty === 'calc' && x.ct === 'num')){
        var all = nums(vs, x.k); if(!all.length) continue;
        var a = nums(ga, x.k), b = nums(gb, x.k);
        var p = g.f ? (NONPARAM ? mannWhitney(a, b) : welch(a, b)) : null;
        rows.push({l: lab, o: NONPARAM ? mi(all) : ms(all), o2: NONPARAM ? '' : mi(all), a: NONPARAM ? mi(a) : ms(a), b: NONPARAM ? mi(b) : ms(b), p: p, n: all.length, miss: vs.length - all.length});
      } else if(x.ty === 'yn' || (x.ty === 'calc' && x.ct === 'cat' && (x.k === 'mcsAny'))){
        var co = cnt(vs, x.k, 'Yes'); if(!co[1]) continue;
        var ca = cnt(ga, x.k, 'Yes'), cb = cnt(gb, x.k, 'Yes'), pp = null;
        if(g.f){ var r = chiTable([[ca[0], ca[1] - ca[0]], [cb[0], cb[1] - cb[0]]]); pp = r ? r.p : null; }
        rows.push({l: lab, o: nc(co), a: nc(ca), b: nc(cb), p: pp, n: co[1], miss: vs.length - co[1]});
      } else if(x.ty === 'sel' || (x.ty === 'calc' && x.ct === 'cat')){
        var opts = x.opts ? x.opts : (x.k === 'scaiSug' || x.k === 'scaiFinal' ? ['A','B','C','D','E'] : uniq(vs, x.k));
        if(!opts.length) continue;
        var tot = 0, tab = [[],[]], sub = [];
        for(var o=0;o<opts.length;o++){ var c0 = cnt(vs, x.k, opts[o]), c1 = cnt(ga, x.k, opts[o]), c2 = cnt(gb, x.k, opts[o]); tot = c0[1]; tab[0].push(c1[0]); tab[1].push(c2[0]); sub.push({l: opts[o], o: nc(c0), a: nc(c1), b: nc(c2), opt: 1}); }
        if(!tot) continue;
        var rr = g.f ? chiTable(tab) : null;
        rows.push({l: lab, o: '', a: '', b: '', p: rr ? rr.p : null, n: tot, miss: vs.length - tot, hdr: 1});
        for(var z=0;z<sub.length;z++) rows.push(sub[z]);
      }
    }
  }
  return {rows: rows, na: ga.length, nb: gb.length, N: vs.length, g: g};
}
function uniq(vs, k){ var o = []; for(var i=0;i<vs.length;i++){ var x = vs[i][k]; if(filled(x) && o.indexOf(x) < 0) o.push(x); } return o.sort(); }
function renderStats(){
  var el = $('v-stats');
  if(!DB.patients.length){ el.innerHTML = '<div class="empty"><h2>No data</h2><p>Statistics appear once patients are entered.</p></div>'; return; }
  var h = '<h2>Statistics — Table 1</h2><div class="row" style="margin-bottom:10px"><select id="sg" style="width:auto">';
  for(var k in GROUPS){ if(GROUPS.hasOwnProperty(k)) h += opt(k, GROUPS[k].l, STATG); }
  h += '</select><label class="row small" style="gap:6px"><input type="checkbox" id="snp" style="width:auto;min-height:0"' + (NONPARAM ? ' checked' : '') + '> Median [IQR] + Mann-Whitney</label>' +
       '<button class="btn sm" data-act="t1csv">Export Table 1 (CSV)</button></div><div id="sbox"></div>';
  el.innerHTML = h; fillStats();
}
function fillStats(){
  var T1 = buildTable1(), g = T1.g, cmp = !!g.f;
  var h = '<div class="card" style="padding:8px"><div class="tw"><table><tr><th>Variable</th><th class="n">Overall<br><span class="mut">n=' + T1.N + '</span></th>' +
    (cmp ? '<th class="n">' + esc(g.a) + '<br><span class="mut">n=' + T1.na + '</span></th><th class="n">' + esc(g.b) + '<br><span class="mut">n=' + T1.nb + '</span></th><th class="n">p</th>' : '') + '<th class="n">Missing</th></tr>';
  for(var i=0;i<T1.rows.length;i++){ var r = T1.rows[i];
    if(r.sec){ h += '<tr class="sec"><td colspan="' + (cmp ? 6 : 3) + '">' + esc(r.sec) + '</td></tr>'; continue; }
    h += '<tr' + (r.opt ? ' class="opt"' : '') + '><td>' + esc(r.l) + (r.o2 ? '<div class="mut small">median [IQR] ' + esc(r.o2) + '</div>' : '') + '</td><td class="n">' + esc(r.o) + '</td>' +
      (cmp ? '<td class="n">' + esc(r.a) + '</td><td class="n">' + esc(r.b) + '</td><td class="n' + (r.p !== null && r.p < 0.05 ? ' sig' : '') + '">' + fmtP(r.p) + '</td>' : '') +
      '<td class="n mut">' + (r.miss !== undefined ? r.miss : '') + '</td></tr>'; }
  h += '</table></div></div><div class="mut small">Continuous: mean ± SD with Welch t-test (or median [IQR] with Mann-Whitney U). Categorical: n (% of non-missing) with χ² or Fisher\'s exact (2×2 with expected count < 5). "Unknown" is treated as missing. Exploratory — verify final analyses in SPSS/R.</div>';
  $('sbox').innerHTML = h;
}

/* ---------- SETTINGS / IO ---------- */
function renderSet(){
  var s = DB.settings, el = $('v-set');
  var h = '<h2>Settings & data</h2>';
  h += '<div class="card"><h3 style="margin-top:0">Backup & export</h3><div class="row">' +
    '<button class="btn t" data-act="expJson">⬇ JSON backup</button><button class="btn" data-act="impJson">⬆ Restore JSON</button>' +
    '<button class="btn" data-act="expCsv">⬇ CSV (all variables)</button><button class="btn" data-act="expDict">⬇ Data dictionary</button>' +
    '<button class="btn" data-act="impCsv">⬆ Import CSV</button></div>' +
    '<div class="mut small" style="margin-top:8px">Data lives only in this browser. iOS can clear website storage — export a JSON backup regularly (Files / iCloud Drive). CSV uses the variable names from the data dictionary and opens in Excel, SPSS and R. CSV import matches columns by variable name <i>or</i> label; rows with an existing Study ID are merged.</div></div>';
  h += '<div class="card"><h3 style="margin-top:0">Cloud sync — Firebase Firestore (optional)</h3>' +
    '<div class="form"><div class="fld"><label>Project ID</label><input id="fbp" value="' + esc(s.fbProject) + '" autocapitalize="off"></div>' +
    '<div class="fld"><label>Web API key</label><input id="fbk" value="' + esc(s.fbKey) + '" autocapitalize="off"></div>' +
    '<div class="fld"><label>Collection</label><input id="fbc" value="' + esc(s.fbCol || 'cs_patients') + '" autocapitalize="off"></div></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn" data-act="fbSave">Save config</button><button class="btn t" data-act="fbPush">⬆ Push all</button><button class="btn t" data-act="fbPull">⬇ Pull & merge</button></div>' +
    '<div class="mut small" style="margin-top:8px">Uses the Firestore REST API — no SDK needed. Last sync: ' + esc(s.lastSync || 'never') + '. Merge rule: newest edit wins. Your Firestore security rules must permit access; avoid storing MRNs/initials in the cloud unless your IRB approval covers it.</div></div>';
  h += '<div class="card"><h3 style="margin-top:0">Sign-in</h3><div class="form"><div class="fld"><label>Username</label><input id="su" value="' + esc(s.user) + '" autocapitalize="off"></div><div class="fld"><label>New password</label><input id="sp" type="password" placeholder="leave blank to keep"></div></div>' +
    '<div class="row" style="margin-top:10px"><button class="btn" data-act="credSave">Update sign-in</button></div><div class="mut small" style="margin-top:6px">This is a convenience lock, not encryption.</div></div>';
  h += '<div class="card"><h3 style="margin-top:0">Demo & reset</h3><div class="row"><button class="btn" data-act="demo">Load 40 demo patients</button><button class="btn" data-act="clearDemo">Remove demo patients</button><button class="btn d" data-act="wipe">Erase all data</button></div>' +
    '<div class="mut small" style="margin-top:8px">Demo records are synthetic and prefixed DEMO-. They are included in all statistics, so remove them before real analysis.</div></div>';
  h += '<div class="card"><h3 style="margin-top:0">About</h3><div class="kv"><div>Records</div><div>' + DB.patients.length + '</div><div>Variables</div><div>' + FIELDS.length + ' (' + countCalc() + ' calculated)</div><div>Storage used</div><div>' + storageKB() + ' KB</div><div>Scores</div><div>SCAI 2022 · CardShock · IABP-SHOCK II · VIS · CPO · PAPi · eGFR CKD-EPI 2021</div></div></div>';
  el.innerHTML = h;
}
function countCalc(){ var c = 0; for(var i=0;i<FIELDS.length;i++) if(FIELDS[i].ty === 'calc') c++; return c; }
function storageKB(){ try{ return Math.round((localStorage.getItem(LS_KEY) || '').length / 1024); }catch(e){ return '?'; } }
function stamp(){ var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) + '_' + pad(d.getHours(), 2) + pad(d.getMinutes(), 2); }
function download(name, text, type){
  try{ var blob = new Blob([text], {type: type}); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1500); toast('Exported ' + name); }
  catch(e){ toast('Export failed: ' + e.message); }
}
function csvCell(x){ if(x === null || x === undefined) return ''; var s = String(x); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; }
function expCsv(){
  var keys = []; for(var i=0;i<FIELDS.length;i++) keys.push(FIELDS[i].k);
  var lines = [keys.join(',')];
  for(var j=0;j<DB.patients.length;j++){ var v = calc(DB.patients[j].v), row = []; for(var k=0;k<keys.length;k++) row.push(csvCell(v[keys[k]])); lines.push(row.join(',')); }
  download('CS_Registry_' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}
function expDict(){
  var lines = ['variable,label,section,type,unit,options_or_coding,expected_range'];
  for(var i=0;i<FIELDS.length;i++){ var f = FIELDS[i];
    var ty = {num:'numeric',text:'text',dt:'datetime (YYYY-MM-DDTHH:MM)',yn:'categorical',sel:'categorical',calc:'calculated',ta:'free text'}[f.ty];
    var o = f.ty === 'yn' ? 'Yes | No | Unknown' : (f.opts ? f.opts.join(' | ') : '');
    lines.push([f.k, f.l, SECTIONS[f.sec].t, ty, f.u || '', o, f.min !== undefined ? f.min + '–' + f.max : ''].map(csvCell).join(',')); }
  download('CS_Data_Dictionary.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}
function expT1(){
  var T1 = buildTable1(), g = T1.g, cmp = !!g.f, lines = [];
  lines.push(['Variable','Overall (n=' + T1.N + ')'].concat(cmp ? [g.a + ' (n=' + T1.na + ')', g.b + ' (n=' + T1.nb + ')', 'p'] : []).concat(['Missing']).map(csvCell).join(','));
  for(var i=0;i<T1.rows.length;i++){ var r = T1.rows[i]; if(r.sec){ lines.push(csvCell(r.sec.toUpperCase())); continue; }
    lines.push([(r.opt ? '   ' : '') + r.l, r.o].concat(cmp ? [r.a, r.b, fmtP(r.p)] : []).concat([r.miss !== undefined ? r.miss : '']).map(csvCell).join(',')); }
  download('CS_Table1_' + STATG + '_' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}
function parseCSV(t){
  var rows = [], row = [], cell = '', q = false, i = 0, c;
  t = t.replace(/^﻿/, '');
  for(i=0;i<t.length;i++){ c = t.charAt(i);
    if(q){ if(c === '"'){ if(t.charAt(i + 1) === '"'){ cell += '"'; i++; } else q = false; } else cell += c; }
    else if(c === '"') q = true;
    else if(c === ','){ row.push(cell); cell = ''; }
    else if(c === '\n' || c === '\r'){ if(c === '\r' && t.charAt(i + 1) === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c; }
  if(cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
function normVal(f, s){
  s = String(s).trim(); if(s === '') return '';
  if(f.ty === 'num'){ var n = Number(s.replace(',', '.')); return isNaN(n) ? '' : n; }
  if(f.ty === 'yn'){ var l = s.toLowerCase(); if(['yes','y','1','true','نعم'].indexOf(l) >= 0) return 'Yes'; if(['no','n','0','false','لا'].indexOf(l) >= 0) return 'No'; if(['unknown','unk','u','na','n/a'].indexOf(l) >= 0) return 'Unknown'; return ''; }
  if(f.ty === 'sel'){ for(var i=0;i<f.opts.length;i++){ if(f.opts[i].toLowerCase() === s.toLowerCase()) return f.opts[i]; } return s; }
  if(f.ty === 'dt'){ var m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s); if(m) return m[3] + '-' + pad(m[2],2) + '-' + pad(m[1],2) + 'T' + pad(m[4] || 0,2) + ':' + (m[5] || '00');
    var m2 = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s); if(m2) return m2[1] + '-' + m2[2] + '-' + m2[3] + 'T' + (m2[4] || '00') + ':' + (m2[5] || '00'); return ''; }
  return s;
}
function impCsv(text){
  var rows = parseCSV(text); if(rows.length < 2){ toast('CSV has no data rows'); return; }
  var hdr = rows[0], map = [], matched = 0, i, j;
  var byLabel = {}; for(i=0;i<FIELDS.length;i++){ byLabel[FIELDS[i].k.toLowerCase()] = FIELDS[i]; byLabel[FIELDS[i].l.toLowerCase()] = FIELDS[i]; }
  for(i=0;i<hdr.length;i++){ var f = byLabel[String(hdr[i]).trim().toLowerCase()]; map.push(f && f.ty !== 'calc' ? f : null); if(map[i]) matched++; }
  if(!matched){ toast('No columns matched — export the data dictionary to see variable names'); return; }
  var added = 0, merged = 0;
  for(j=1;j<rows.length;j++){ var r = rows[j], v = {}, any = false;
    for(i=0;i<map.length;i++){ if(map[i] && r[i] !== undefined){ var val = normVal(map[i], r[i]); if(val !== ''){ v[map[i].k] = val; any = true; } } }
    if(!any) continue;
    var ex = null; if(v.studyId){ for(var q=0;q<DB.patients.length;q++){ if(DB.patients[q].v.studyId === v.studyId){ ex = DB.patients[q]; break; } } }
    if(ex){ ext(ex.v, v); ex.updated = Date.now(); calc(ex.v); merged++; }
    else { if(!v.studyId) v.studyId = nextStudyId(); var p = {id: uid(), created: Date.now(), updated: Date.now(), v: v}; calc(v); DB.patients.push(p); added++; } }
  persist(); toast('CSV: ' + added + ' added, ' + merged + ' merged (' + matched + '/' + hdr.length + ' columns matched)'); go(VIEW);
}
function impJson(text){
  try{ var o = JSON.parse(text), arr = o.patients || o; if(!arr || !arr.length && arr.length !== 0) throw new Error('No patients array');
    var replace = DB.patients.length && window.confirm('OK = REPLACE all current data with the backup.\nCancel = MERGE (newest edit wins).');
    if(replace || !DB.patients.length){ DB.patients = arr; }
    else { mergeIn(arr); }
    if(o.settings && o.settings.fbProject && !DB.settings.fbProject){ DB.settings.fbProject = o.settings.fbProject; DB.settings.fbKey = o.settings.fbKey; DB.settings.fbCol = o.settings.fbCol; }
    for(var i=0;i<DB.patients.length;i++) calc(DB.patients[i].v);
    persist(); toast('Restored — ' + DB.patients.length + ' patients'); go(VIEW); }
  catch(e){ toast('Invalid backup: ' + e.message); }
}
function mergeIn(arr){ var a = 0, u = 0; for(var i=0;i<arr.length;i++){ var p = arr[i]; if(!p || !p.id || !p.v) continue; var ex = byId(p.id);
    if(!ex){ DB.patients.push(p); a++; } else if((p.updated || 0) > (ex.updated || 0)){ ex.v = p.v; ex.updated = p.updated; u++; } } return [a, u]; }

/* ---------- Firestore REST ---------- */
function fsReady(){ var s = DB.settings; return !!(s.fbProject && s.fbKey); }
function fsBase(){ var s = DB.settings; return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(s.fbProject) + '/databases/(default)/documents/' + encodeURIComponent(s.fbCol || 'cs_patients'); }
function fsPush(){
  if(!fsReady()){ toast('Enter Project ID and API key first'); return; }
  var list = DB.patients.slice(), i = 0, ok = 0, fail = 0;
  toast('Pushing ' + list.length + ' records…');
  function next(){
    if(i >= list.length){ DB.settings.lastSync = new Date().toLocaleString(); persist(); toast('Push complete: ' + ok + ' ok' + (fail ? ', ' + fail + ' failed' : '')); if(VIEW === 'set') renderSet(); return; }
    var p = list[i++];
    fetch(fsBase() + '/' + encodeURIComponent(p.id) + '?key=' + encodeURIComponent(DB.settings.fbKey), {method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fields:{json:{stringValue: JSON.stringify(p)}, updated:{integerValue: String(p.updated || 0)}, studyId:{stringValue: p.v.studyId || ''}}})})
      .then(function(r){ if(r.ok) ok++; else { fail++; if(fail === 1) r.text().then(function(t){ console.log('Firestore error', t); }); } next(); })
      .catch(function(){ fail++; next(); });
  }
  next();
}
function fsPull(){
  if(!fsReady()){ toast('Enter Project ID and API key first'); return; }
  var got = [];
  function page(tok){
    fetch(fsBase() + '?pageSize=300&key=' + encodeURIComponent(DB.settings.fbKey) + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''))
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status + ' — check rules / key'); return r.json(); })
      .then(function(j){ var d = j.documents || [];
        for(var i=0;i<d.length;i++){ try{ got.push(JSON.parse(d[i].fields.json.stringValue)); }catch(e){} }
        if(j.nextPageToken) page(j.nextPageToken);
        else { var res = mergeIn(got); for(var k=0;k<DB.patients.length;k++) calc(DB.patients[k].v); DB.settings.lastSync = new Date().toLocaleString(); persist(); toast('Pulled ' + got.length + ': ' + res[0] + ' new, ' + res[1] + ' updated'); go(VIEW); } })
      .catch(function(e){ toast('Pull failed: ' + e.message); });
  }
  page(null);
}
function fsDelete(id){ if(!fsReady() || !navigator.onLine) return; try{ fetch(fsBase() + '/' + encodeURIComponent(id) + '?key=' + encodeURIComponent(DB.settings.fbKey), {method:'DELETE'}); }catch(e){} }

/* ---------- demo data ---------- */
function rnd(a, b){ return a + Math.random() * (b - a); }
function ri(a, b){ return Math.floor(rnd(a, b + 1)); }
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }
function yn(p){ return Math.random() < p ? 'Yes' : 'No'; }
function loadDemo(){
  var hajjStarts = [new Date(2024,5,7), new Date(2025,4,28), new Date(2026,4,18)];
  for(var i=1;i<=40;i++){
    var base = pick(hajjStarts), ad = new Date(base.getTime() + ri(-25, 30) * 86400000 + ri(0, 23) * 3600000);
    var ami = Math.random() < 0.65, lac = r1(rnd(1.2, 11)), age = ri(38, 86), arrest = yn(0.25);
    var nv = lac > 6 ? ri(2,3) : ri(1,2), mcs = Math.random() < (lac > 5 ? 0.6 : 0.25);
    var risk = -2.2 + (lac - 4) * 0.35 + (age - 65) * 0.03 + (arrest === 'Yes' ? 0.8 : 0) + (nv - 1) * 0.5;
    var died = Math.random() < 1 / (1 + Math.exp(-risk));
    var los = ri(2, 21), sbp = ri(62, 92), dbp = ri(35, 60);
    var v = { studyId: 'DEMO-' + pad(i), age: age, sex: Math.random() < 0.78 ? 'Male' : 'Female', nationality: pick(['Saudi','Egyptian','Indonesian','Pakistani','Indian','Nigerian','Bangladeshi','Turkish']),
      hajjStatus: pick(['Pilgrim – international','Pilgrim – international','Pilgrim – domestic','Non-pilgrim resident']), hajjYear: 1445 + hajjStarts.indexOf(base),
      admDate: ad.getFullYear() + '-' + pad(ad.getMonth() + 1, 2) + '-' + pad(ad.getDate(), 2) + 'T' + pad(ad.getHours(), 2) + ':00',
      weight: ri(55, 105), height: ri(155, 185), smoking: pick(['Never','Former','Current']), htn: yn(0.6), dm: yn(0.5), dyslip: yn(0.45), ckd: yn(0.15), priorMI: yn(0.2), priorPCI: yn(0.18), priorCABG: yn(0.06), priorHF: yn(0.2), af: yn(0.12), priorStroke: yn(0.08), pad: yn(0.05), copd: yn(0.07), malig: 'No',
      route: pick(['Direct to ED','Hajj field hospital / medical post','Inter-hospital transfer','Red Crescent / EMS']), heatIllness: yn(0.15), dehydration: yn(0.3),
      sbp: sbp, dbp: dbp, hr: ri(85, 135), rr: ri(18, 34), spo2: ri(82, 98), temp: r1(rnd(36, 39)), gcs: ri(8, 15), confusion: yn(0.4), coldExt: yn(0.8), mottling: yn(0.3), oliguria: yn(0.55), killip: 'IV', arrest: arrest, mv: yn(0.45), niv: yn(0.2),
      aetiology: ami ? 'AMI-CS' : pick(['ADHF – de novo','ADHF – acute-on-chronic','Myocarditis','Takotsubo','Valvular','Arrhythmic']),
      lacInit: lac, lacPeak: r1(lac + rnd(0, 3)), lac24: r1(Math.max(0.8, lac + rnd(-4, 2))), ph: r2(rnd(7.08, 7.42)), hco3: ri(10, 24), wbcInit: r1(rnd(7, 22)), wbcPeak: r1(rnd(10, 28)), hbInit: r1(rnd(9, 16)), hbNadir: r1(rnd(7, 13)), plt: ri(90, 380), inr: r2(rnd(1, 2.4)),
      crInit: ri(70, 320), crPeak: ri(90, 450), urea: r1(rnd(5, 30)), na: ri(128, 146), k: r1(rnd(3.3, 5.9)), glucose: r1(rnd(6, 22)), albumin: ri(25, 42), alt: ri(20, 900), ast: ri(25, 1400), bili: ri(8, 60), tropPeak: ami ? ri(5000, 150000) : ri(50, 5000),
      lvef: ri(10, 45), rwma: ami ? 'Yes' : yn(0.3), tapse: ri(8, 20), paspEcho: ri(28, 60), rvDil: yn(0.35), rvDysf: yn(0.4), mr: pick(['None / trivial','Mild','Moderate','Severe']), effusion: 'None', pac: yn(0.3),
      angio: ami ? 'Yes' : yn(0.3), iabp: mcs ? yn(0.5) : 'No', impella: mcs ? yn(0.4) : 'No', ecmo: mcs ? yn(0.25) : 'No', rrt: yn(0.2), barc: pick(['None','None','None','2','3a','3b']), transfusion: yn(0.25), limbIsch: yn(0.05), vascComp: yn(0.08), haemolysis: yn(0.05), devInfect: 'No',
      ne: 'Yes', neMax: r2(rnd(0.05, 0.8)), dobu: nv >= 2 ? 'Yes' : 'No', dobuMax: r1(rnd(2.5, 10)), epi: nv >= 3 ? 'Yes' : 'No', epiMax: r2(rnd(0.02, 0.3)), dopa: 'No', vaso: yn(0.15), vasoMax: 0.03, milri: 'No', levo: yn(0.08), vasoHours: ri(12, 160),
      dapt: ami ? 'Yes' : 'No', anticoag: yn(0.6), diuretic: yn(0.6), steroid: yn(0.1), antibiotic: yn(0.4),
      death: died ? 'Yes' : 'No', d30: died ? 'Yes' : yn(0.05), icuDays: ri(1, 14), aki: yn(0.45), strokeOut: yn(0.05), mof: died ? yn(0.6) : yn(0.1), sepsisOut: yn(0.15), reArrest: yn(0.15) };
    if(ami){ v.acsType = Math.random() < 0.8 ? 'STEMI' : 'NSTEMI'; v.territory = pick(['Anterior','Inferior','Inferior + RV','Lateral']); v.pci = 'Yes'; v.culprit = pick(['LAD','LAD','RCA','LCx','Left main']); v.cad = pick(['1-vessel','2-vessel','3-vessel']); v.timiPre = pick(['0','0','1','2']); v.timiPost = pick(['3','3','3','2','1']); v.d2b = ri(45, 180); v.revascStrat = 'Culprit-only'; }
    if(v.vaso === 'No') delete v.vasoMax;
    var end = new Date(ad.getTime() + los * 86400000), es = end.getFullYear() + '-' + pad(end.getMonth() + 1, 2) + '-' + pad(end.getDate(), 2) + 'T' + pad(end.getHours(), 2) + ':00';
    if(died){ v.deathDate = es; v.deathCause = pick(['Refractory cardiogenic shock','Refractory cardiogenic shock','Multi-organ failure','Arrhythmic','Anoxic brain injury']); }
    else { v.dcDate = es; v.dispo = v.hajjStatus === 'Pilgrim – international' ? pick(['Home','Repatriated (international pilgrim)']) : 'Home'; }
    if(arrest === 'Yes'){ v.arrestLoc = pick(['Out-of-hospital','In-hospital']); v.arrestRhythm = pick(['VF / pVT','PEA','Asystole']); v.roscMin = ri(3, 35); v.coma = yn(0.4); }
    calc(v);
    DB.patients.push({id: uid(), created: Date.now(), updated: Date.now() - i * 1000, v: v});
  }
  persist(); toast('40 demo patients loaded'); go('dash');
}
function clearDemo(){ var b = DB.patients.length; DB.patients = DB.patients.filter(function(p){ return String(p.v.studyId || '').indexOf('DEMO-') !== 0; }); persist(); toast('Removed ' + (b - DB.patients.length) + ' demo patients'); go(VIEW); }

/* ---------- events ---------- */
var ACT = {
  login: doLogin, lock: lock, newPt: newPatient,
  view: function(a){ go(a); },
  open: function(a){ CUR = a; CURSEC = 0; go('entry'); },
  del: function(a){ delPatient(a); },
  dup: function(a){ dupPatient(a); },
  sec: function(a){ var n = +a; if(n < 0 || n >= SECTIONS.length) return; CURSEC = n; renderEntry(); window.scrollTo(0,0); },
  yn: function(a){ var parts = a.split('|'), p = cur(); if(!p) return; var nv = p.v[parts[0]] === parts[1] ? '' : parts[1];
    var row = document.querySelector('[data-row="' + parts[0] + '"]'); if(row){ var bs = row.getElementsByTagName('button'); for(var i=0;i<bs.length;i++){ var val = bs[i].getAttribute('data-arg').split('|')[1]; bs[i].className = val + (val === nv ? ' on' : ''); } }
    setField(parts[0], nv); },
  saveNow: function(){ persist(); toast('Saved'); },
  expJson: function(){ download('CS_Registry_backup_' + stamp() + '.json', JSON.stringify({app:'CS Registry', version:1, exported:new Date().toISOString(), patients:DB.patients, settings:{fbProject:DB.settings.fbProject, fbKey:DB.settings.fbKey, fbCol:DB.settings.fbCol}}, null, 1), 'application/json'); },
  impJson: function(){ $('fileJson').value = ''; $('fileJson').click(); },
  impCsv: function(){ $('fileCsv').value = ''; $('fileCsv').click(); },
  expCsv: expCsv, expDict: expDict, t1csv: expT1,
  fbSave: function(){ DB.settings.fbProject = $('fbp').value.trim(); DB.settings.fbKey = $('fbk').value.trim(); DB.settings.fbCol = $('fbc').value.trim() || 'cs_patients'; persist(); toast('Firestore config saved'); },
  fbPush: function(){ ACT.fbSave(); fsPush(); }, fbPull: function(){ ACT.fbSave(); fsPull(); },
  credSave: function(){ var u = $('su').value.trim(), p = $('sp').value; if(!u){ toast('Username required'); return; } DB.settings.user = u; if(p) DB.settings.pass = p; persist(); toast('Sign-in updated'); renderSet(); },
  demo: loadDemo, clearDemo: clearDemo,
  wipe: function(){ if(!window.confirm('Erase ALL patients from this device?')) return; if(!window.confirm('Really erase? Export a backup first if unsure.')) return; DB.patients = []; CUR = null; persist(); toast('All data erased'); go('dash'); }
};
document.addEventListener('click', function(e){
  var t = closest(e.target, 'data-act'); if(!t || t.disabled) return;
  var fn = ACT[t.getAttribute('data-act')]; if(fn){ e.preventDefault(); fn(t.getAttribute('data-arg'), t, e); }
});
function onInput(e){
  var t = e.target, k = t.getAttribute && t.getAttribute('data-k');
  if(k){ setField(k, t.value); return; }
  if(t.id === 'lq'){ LISTQ = t.value; fillList(); }
  else if(t.id === 'lf'){ LISTF = t.value; fillList(); }
  else if(t.id === 'sg'){ STATG = t.value; fillStats(); }
  else if(t.id === 'snp'){ NONPARAM = t.checked; fillStats(); }
}
document.addEventListener('input', onInput);
document.addEventListener('change', function(e){ var t = e.target; if(t.tagName === 'SELECT' || t.type === 'datetime-local' || t.type === 'checkbox') onInput(e); });
$('lp').addEventListener('keydown', function(e){ if(e.keyCode === 13) doLogin(); });
$('lu').addEventListener('keydown', function(e){ if(e.keyCode === 13) $('lp').focus(); });
function readFile(input, cb){ input.addEventListener('change', function(){ var f = input.files && input.files[0]; if(!f) return; var r = new FileReader(); r.onload = function(){ cb(String(r.result)); }; r.readAsText(f); }); }
readFile($('fileJson'), impJson);
readFile($('fileCsv'), impCsv);
window.addEventListener('beforeunload', function(){ if(DIRTY) persist(); });
document.addEventListener('visibilitychange', function(){ if(document.hidden && DIRTY) persist(); });

/* ---------- boot ---------- */
load();
for(var b=0;b<DB.patients.length;b++){ try{ calc(DB.patients[b].v); }catch(e){} }
if(isAuthed()) showApp(); else { $('login').className = ''; setTimeout(function(){ try{ $('lu').focus(); }catch(e){} }, 50); }
window.CSReg = {DB: DB, calc: calc, FIELDS: FIELDS, welch: welch, fisher: fisher, chiP: chiP, egfr: egfr};
})();

/* ---------- PWA: register service worker when served over http(s) ---------- */
if('serviceWorker' in navigator && /^https?:/.test(location.protocol)){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}
