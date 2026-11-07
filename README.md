# Cardiogenic Shock Registry: source code

An offline web app for collecting patient data in a clinical registry. The original was built for a retrospective study of cardiogenic shock during Hajj at King Abdullah Medical City, Makkah. It uses plain HTML, CSS and ES5 JavaScript, with **no frameworks, no build step and no external libraries**. It runs in any browser and can be installed on iPhone or Android as an offline app.

Default sign-in: **MK / MK**. You can change it in Settings, or change the defaults in `js/app.js` (line 10).

---

## 1. Folder layout

```
CS_Registry_Source/
├── index.html              App shell: login screen, header, 5 views, bottom tab bar
├── css/styles.css          All styling (dark theme, CSS variables at the top)
├── js/app.js               All logic (about 1,000 lines, one IIFE, ES5 only)
├── manifest.webmanifest    App name, icons and colours for "Add to Home Screen"
├── sw.js                   Service worker that caches the files so the app works offline
├── icons/                  180 / 192 / 512 px app icons
├── firestore.rules         Example security rules for the optional cloud sync
└── single-file/
    └── CS_Registry.html    The same app inlined into ONE file (double-click to run)
```

**Running it**
- Quickest: open `single-file/CS_Registry.html` in a browser.
- Development: serve the folder. For example, run `python3 -m http.server 8000` inside the folder, then open `http://localhost:8000`.
- To install it as a phone app, host the folder on any HTTPS static host (GitHub Pages, Netlify, Firebase Hosting or Cloudflare Pages). Open the URL in Safari, then use Share → Add to Home Screen. The service worker then makes it work fully offline.
- After you change any file, **raise `VERSION` in `sw.js`**. Otherwise installed phones keep showing the old cached copy.

---

## 2. Architecture (how `js/app.js` is organised)

The file is in sections, in this order:

| Section | What it does |
|---|---|
| **helpers** | `$`, `esc` (HTML escaping), `num`, `yes/no/filled`, rounding, date parsing, `toast` |
| **schema builders** | Shorthand helpers that define fields: `N`, `T`, `DT`, `YN`, `SEL`, `C`, `TA`, `H`, `sh` |
| **`SECTIONS`** | **The whole case report form as data.** The form, CSV export, CSV import, data dictionary, completeness checks and Table 1 are all generated from this one array |
| **clinical calculations** | `calc(v)`: works out every derived value and score for one patient record |
| **storage** | `load`, `persist` (localStorage, saved 400 ms after the last change), and record lookup |
| **auth** | A simple username/password screen, kept per session or per device |
| **views** | `renderDash`, `renderList`, `renderEntry`, `renderStats` and `renderSet`. Each one builds its HTML as a string and sets `innerHTML` |
| **statistics** | Mean, SD, quantiles, Welch t-test, Mann-Whitney U, χ², Fisher exact, and `buildTable1()` |
| **import/export** | JSON backup and restore, CSV export, data dictionary, CSV import with column matching |
| **Firestore REST** | Push, pull and merge through Firestore's REST endpoint (no Firebase SDK) |
| **demo data** | 40 made-up patients for testing |
| **events** | **One** click listener sends any `[data-act]` element to the `ACT` object. One input/change listener handles all form fields (`[data-k]`) |
| **boot** | Load data, recalculate every record, then show the login screen or the app |

**Key design choices**
1. **The form is defined as data.** To add a variable you add one line to `SECTIONS` and nothing else.
2. **Event delegation:** the HTML has no inline `onclick`. Any button with `data-act="name" data-arg="value"` calls `ACT.name(value)`.
3. **ES5 only** (`var` and `function`, with no arrow functions, template literals, `let` or `const`), so it runs on older iOS Safari. Check this with `npx acorn --ecma5 js/app.js`.
4. **Every value from the user goes through `esc()`** before it's put into HTML.

---

## 3. Data model

Everything is saved under one localStorage key, `csreg_v1`:

```js
{
  patients: [
    { id: "p…", created: 1730000000000, updated: 1730000000000,
      v: { studyId: "CS-001", age: 72, sex: "Male", htn: "Yes", lacInit: 5.2, /* … */ } }
  ],
  settings: { user, pass, fbProject, fbKey, fbCol, lastSync }
}
```

- Numbers are stored as numbers. Yes/No fields store `"Yes"`, `"No"` or `"Unknown"`. Date-times are stored as `"YYYY-MM-DDTHH:MM"`.
- Calculated fields are stored in `v` as well, so CSV exports include them. `calc(v)` rebuilds them every time anything changes.

---

## 4. How to customise it

### Add a field
Add one line to the right section in `SECTIONS`:

```js
N('troponinI', 'Troponin I — peak', 'ng/L', {min:0, max:100000}),
YN('ivus', 'Intravascular imaging used'),
SEL('accessSite', 'Access site', ['Radial', 'Femoral', 'Other']),
```

The form, CSV, data dictionary, completeness, range warnings and Table 1 all pick it up automatically.

**Field builders**

| Builder | Type | Signature |
|---|---|---|
| `N` | number | `N(key, label, unit, options)` |
| `T` | text | `T(key, label, options)` |
| `DT` | date + time | `DT(key, label, options)` |
| `YN` | Yes / No / Unknown buttons | `YN(key, label, options)` |
| `SEL` | dropdown | `SEL(key, label, [choices], options)` |
| `C` | calculated (read-only) | `C(key, label, unit, 'num' or 'cat' or 'txt', options)` |
| `TA` | free text (multi-line) | `TA(key, label, options)` |
| `H` | sub-heading | `H(label)` |

**Options:** `{min, max}` turns on range warnings, `req:1` marks a field as required, `hint:'…'` shows help text under the field, and `show: sh('otherKey','Yes')` (or any `function(v){…}`) controls when the field is visible.

### Add a section
Add `{id:'myid', t:'Tab title', f:[ …fields… ]}` to `SECTIONS`. It appears as a new tab automatically.

### Add a calculated value or score
1. Declare it with `C('myScore', 'My score', '/10')` in a section.
2. Calculate it in `calc(v)`, for example: `v.myScore = (num(v.age) > 70 ? 1 : 0) + (yes(v.dm) ? 1 : 0);`
3. Return `null` when inputs are missing, so the box shows "—" and statistics skip the record.
4. For a points breakdown like the CardShock table, store the details in `DETAIL` and display them in `renderScoreDetail`.

### Reuse it for another disease or registry
Replace `SECTIONS`, the score logic in `calc()`, the comparison groups in `GROUPS` (used by Table 1), and the charts in `renderDash()`. The storage, import/export, statistics, sync and interface code can stay as they are. Change `LS_KEY` so the new app's data doesn't mix with this one's.

### Change the look
Edit the CSS variables at the top of `css/styles.css` (`--bg`, `--card`, `--acc` and so on).

---

## 5. Built-in clinical logic (check before you rely on it)

| Item | Implementation |
|---|---|
| SCAI SHOCK stage (2022) | A rule-based **suggestion** from BP, lactate, pH, number of vasoactives and MCS. The user confirms the stage, and analyses use the confirmed stage |
| CardShock (Harjola 2015) | Age > 75, confusion, prior MI/CABG, ACS cause, LVEF < 40, lactate (2–4 → 1 point, > 4 → 2 points), eGFR (30–60 → 1, < 30 → 2). Groups 0–3 / 4–5 / 6–9 → 8.7 / 36.0 / 77.3 % |
| IABP-SHOCK II (Pöss 2017) | Age > 73, prior stroke (2 points), glucose > 10.6 mmol/L, creatinine > 132.6 µmol/L, lactate > 5 (2 points), TIMI < 3 after PCI (2 points). AMI-CS patients only |
| eGFR | CKD-EPI 2021 (no race term); creatinine entered in µmol/L |
| VIS | dopamine + dobutamine + 100×epinephrine + 100×norepinephrine + 10×milrinone + 10,000×vasopressin (U/kg/min) |
| CPO / PAPi | MAP × CO / 451; (PASP − PADP) / RAP |
| Hajj phase | The Umm al-Qura Hijri date from `Intl.DateTimeFormat`. The cut-offs are in `hajjPhaseOf()`; adjust them to your protocol |

Statistics are for exploring the data. Run the final analyses in SPSS or R using the CSV export.

---

## 6. Optional cloud sync (Firebase Firestore)

1. Create a Firebase project and a Firestore database.
2. Copy the **Project ID** and **Web API key** into Settings → Cloud sync.
3. Publish suitable security rules (see `firestore.rules`). The app has no Firebase Auth, so open rules mean anyone with the project ID can read the data. **Store de-identified data only**, or add Firebase Auth and require `request.auth != null`.

Each patient is saved as one document `cs_patients/{id}` with three fields: `json` (the full record), `updated` and `studyId`. When records are merged, the newest edit wins.

---

## 7. Known limits and ideas for extending it

- localStorage holds about 5 MB, which is plenty for thousands of records. For bigger datasets or images, move `load` and `persist` to IndexedDB.
- The login screen isn't encryption: anyone with the device can read the data through the browser's developer tools.
- Possible next steps: Firebase Auth for multiple users, an audit trail of edits per field, survival curves (Kaplan-Meier), logistic regression, and an Arabic/RTL interface.
