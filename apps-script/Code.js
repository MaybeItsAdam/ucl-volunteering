/**
 * Volsoc Master Plan — bound to the "Volsoc Master Plan" spreadsheet.
 *
 * - syncFromGoogleCalendar: pulls every event run by the UCL Student Social
 *   Impact organiser from Adam's Campus Toolbox's iCal feed into Sheet1, updating rows it already knows and adding new ones,
 *   then keeps the sheet in date order. Standalone VolSoc rows (a Volsoc Event
 *   with no Union Event) are never changed or struck through, only sorted.
 * - Button columns are checkboxes; ticking one runs it through handleEdit,
 *   which runs as the script owner whoever ticks:
 *   - Doc Detail: drafts a planning doc from the row and becomes an
 *     "Open doc ↗" link to it.
 *   - VolSoc Calendar: puts the row's VolSoc event in the shared "VolSoc"
 *     Google Calendar as "[Provisional] …", keeps it in step with the sheet,
 *     and becomes an "In calendar ↗" link. Clearing the cell removes the event.
 *   - Delete doc trashes the doc and Remove event deletes the event, each
 *     after a second tick to confirm.
 * - Each planning doc also links to the web app, which asks, then deletes
 *   the doc or the event.
 * - A thick rule under the last row of each day, a shaded bar above each new
 *   week, and a dark bar above each new term.
 * - Five narrow columns beside the VolSoc event, one per committee member,
 *   say who's coming, who might, who can't, and who hasn't answered yet.
 * - setup: run once from the VolSoc menu to add formatting, buttons and triggers.
 *
 * Source of truth is apps-script/ in the ucl-volunteering repo; deploy with
 * `npm run deploy` from that folder (push + update the web app deployment).
 */

const CONFIG = {
  SPREADSHEET_ID: '1QRxAfvIjHU_23beHWh-cd2oV7a1bk1bhdQPYGYMPBXA',
  // The /exec URL of the web app deployment the sheet's buttons point at.
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxyfS1T9IGgIzIbjosc4hZvvJSg9QLmpSUScdxcBmmk72EBkIYGCwCa3d_m3d-owtIq/exec',
  // Adam's Campus Toolbox organiser feed (src/app/api/organiser/[id]/ical in
  // adams-campus-toolbox). ucl-suu-pipeline files What's On listings under
  // this organiser, so this is every Social Impact event and nothing else.
  ICAL_URL: 'https://www.adamscampustoolbox.org.uk/api/organiser/org_uni_juev5rp0v/ical',
  SHEET_NAME: 'Sheet1',
  DAYS_AHEAD: 90,
  // Created on first use; its ID is kept in Script Properties.
  VOLSOC_CALENDAR_NAME: 'VolSoc',
  // Leave blank to create docs in the same Drive folder as the spreadsheet.
  DOC_FOLDER_ID: '',
};

// Columns are found by header text each run, so inserting, moving or adding
// columns in the sheet doesn't break the script. Only renaming one of the
// required headers does, and that stops the script with a message naming it.
// "Start Time" and "End Time" appear twice; each pair is the first one after
// its event column.
const REQUIRED_HEADERS = {
  DATE: 'Date',
  UNION_EVENT: 'Union Event',
  UNION_START: ['Start Time', 'UNION_EVENT'],
  UNION_END: ['End Time', 'UNION_EVENT'],
  LOCATION: 'Location',
  LINK: 'Link',
  VOLSOC_EVENT: 'Volsoc Event',
  VOLSOC_START: ['Start Time', 'VOLSOC_EVENT'],
  VOLSOC_END: ['End Time', 'VOLSOC_EVENT'],
  DOC: 'Doc Detail',
};
// Used in the planning doc when present; the first matching name wins.
const OPTIONAL_HEADERS = {
  WHATSON: ['Created Whats on Event Link'],
  SOCIAL_POST: ['Canva Post', 'Instagram Post'],
  // Replaced by the tick columns; still read for the planning doc while it's
  // there, so the notes typed into it aren't lost. Safe to delete.
  COMMITTEE: ['Committee Present', 'Committee'],
  LEAD: ['Activity Lead?', 'Activity Lead'],
  CALENDAR: ['VolSoc Calendar'],
};
// Script-owned columns, created hidden at the end of the sheet if missing.
const HIDDEN_HEADERS = {
  EVENT_KEY: 'Calendar Event Key',
  SORT_TIME: 'Sort Time',
  ROW_ID: 'Row ID',
  CALENDAR_EVENT_ID: 'VolSoc Calendar Event ID',
};
// Narrow checkbox columns the script inserts just right of the column they
// act on.
const DELETE_HEADERS = {
  DELETE_DOC: ['Delete doc', 'DOC'],
  REMOVE_EVENT: ['Remove event', 'CALENDAR'],
};
const DELETE_COLUMN_WIDTH = 56;

// One narrow column per committee member, sitting with the VolSoc event they
// answer for, right of its end time: ✓ they're coming, ? they might, ✕ they
// can't, and blank means they haven't said yet — the difference a free-text
// column couldn't show. They're the replacement for "Committee Present".
// The headers are yours: put the committee's initials in them and rename them
// whenever the committee changes. These names are only what a new column is
// made with; the script keeps track of its own columns by the note on their
// header, so renaming or moving one doesn't lose it.
const COMMITTEE_HEADERS = ['C1', 'C2', 'C3', 'C4', 'C5'];
const COMMITTEE_COLUMNS = COMMITTEE_HEADERS.length;
const COMMITTEE_COLUMN_WIDTH = 36;
const COMMITTEE_NOTE =
  "✓ coming, ? maybe, ✕ can't. Blank means they haven't said yet.\n\n" +
  "Rename this column to whoever it's for. Managed by the VolSoc script.";
// The second is the note the first columns were made with, so they're picked
// up where they are rather than made again.
const COMMITTEE_MARKERS = ['Managed by the VolSoc script.', "Rename this to whoever it's for."];
// Picked from the dropdown, or typed: anything in `typed` becomes the mark.
// The fills are the sheet's own green, amber and red, so a tick here reads
// like a yes anywhere else — #f4c7c3 is already MISSING_VOLSOC_COLOUR.
const COMMITTEE_MARKS = {
  yes: { value: '✓', fill: '#b7e1cd', text: '#0b6b3f', typed: ['y', 'yes', '1', 'true', 't', '✓', '✔', '✅'] },
  maybe: { value: '?', fill: '#ffe599', text: '#7f6000', typed: ['m', 'maybe', 'tbc', '?', '~'] },
  no: { value: '✕', fill: '#f4c7c3', text: '#a61c1c', typed: ['n', 'no', '0', 'false', 'f', 'x', '✕', '✖', '❌'] },
};
// Still to answer, on a row with a VolSoc event. A quiet well rather than a
// colour, so it can't be read as an answer and doesn't fight the amber maybe.
const COMMITTEE_WAITING_FILL = '#edebef';
// The fields the feed owns, in eventFields_ order.
const FEED_COLUMNS = ['DATE', 'UNION_EVENT', 'UNION_START', 'UNION_END', 'LOCATION', 'LINK'];

// 1-based column numbers for this run, filled in by getSheet_. Optional
// columns that aren't in the sheet are 0. WIDTH covers every known column.
let COL = null;
// One shift of the committee block per run, whatever the outcome: the columns
// work wherever they are, so a move that doesn't land where it was aimed is
// worth leaving alone rather than nudging again on every resolve.
let COMMITTEE_MOVED = false;

// Doc Detail cells are styled as chips: tinted fill, bold text, no underline.
// Rows without a doc get a checkbox (BUTTON_BOX) instead.
const DOC_CHIPS = {
  open: { label: 'Open doc ↗', text: '#444054', fill: '#e8f6ef' },
  // Shown after the first tick of Delete doc, until the second or it expires.
  confirm: { label: 'Tick ✕ again to delete', text: '#d62246', fill: '#fbe9ec' },
};
// Create doc links from earlier versions, replaced by a checkbox.
const LEGACY_CREATE_LABELS = ['Create doc', '＋ Create doc'];

const MISSING_VOLSOC_COLOUR = '#f4c7c3';

// VolSoc Calendar cells, styled like the Doc Detail chips.
// Rows not in the calendar get a checkbox (BUTTON_BOX) instead.
const CALENDAR_CHIPS = {
  added: { label: 'In calendar ↗', text: '#444054', fill: '#fff5d6' },
  confirm: { label: 'Tick ✕ again to remove', text: '#d62246', fill: '#fbe9ec' },
};

// Checkboxes stand in for buttons: a cell can't hold a real one, and ticking
// a box fires the edit trigger. The tick colour is the cell's font colour.
const BUTTON_BOX = { text: '#007fff', fill: '#e5f2ff' };
const DELETE_BOX = { text: '#d62246', fill: '#fbe9ec' };
// Deleting takes a second tick within this long.
const DELETE_CONFIRM_SECONDS = 5 * 60;
// Values the old Provisional / Confirmed dropdown left, cleared on refresh.
const LEGACY_CALENDAR_VALUES = ['Provisional', 'Confirmed'];

// Matches the rule under the header row.
const DAY_DIVIDER_COLOUR = '#051c33';

// Week and term bars: full-width rows the script puts above the first row of
// each week and each term. They're thrown away and redrawn on every sync, so
// they never have to survive a sort; the hidden Row ID column marks them.
const BANNER_PREFIX = 'banner:';
const TERM_BAR = { id: 'banner:term', fill: '#444054', text: '#ffffff', size: 11, height: 26 };
const WEEK_BAR = { id: 'banner:week', fill: '#edebef', text: '#6e6b7c', size: 10, height: 22 };
// UCL term dates, in date order, first and last day of each term inclusive.
// Weeks are numbered from the start of the term they're in; anything between
// two terms is one vacation block, numbered by the Monday instead. Add the
// next year's dates when UCL publishes them.
const TERMS = [
  { name: 'Term 1', start: '2026-09-28', end: '2026-12-18' },
  { name: 'Term 2', start: '2027-01-11', end: '2027-03-25' },
  { name: 'Term 3', start: '2027-04-26', end: '2027-06-11' },
];
// Mondays of the reading weeks, called out on the week bar.
const READING_WEEKS = ['2026-11-09', '2027-02-15'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Menu and one-off setup ────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VolSoc')
    .addItem('Sync Social Impact events now', 'syncFromGoogleCalendar')
    .addItem('Create doc for selected row', 'createDocForSelectedRow')
    .addSeparator()
    .addItem('Set up sheet and triggers', 'setup')
    .addToUi();
}

function setup() {
  const sheet = getSheet_();
  addMissingVolsocRule_(sheet);
  addCommitteeRules_(sheet);
  removeCalendarStatusRules_(sheet);
  refreshCommitteeColumns_(sheet);
  refreshDocButtons_(sheet);
  if (COL.CALENDAR) volsocCalendar_();
  installTriggers_();
  syncFromGoogleCalendar();
}

function installTriggers_() {
  const handlers = ['syncFromGoogleCalendar', 'handleEdit'];
  ScriptApp.getProjectTriggers()
    .filter((t) => handlers.includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncFromGoogleCalendar').timeBased().everyHours(1).create();
  // Installable, not a simple onEdit: calendar changes need authorisation, and
  // it runs as you whoever edits, so events always land in your calendar.
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(CONFIG.SPREADSHEET_ID).onEdit().create();
}

function addMissingVolsocRule_(sheet) {
  const [g, a, b] = [COL.VOLSOC_EVENT, COL.DATE, COL.UNION_EVENT].map(columnLetter_);
  const formula = `=AND($${g}2="",OR($${a}2<>"",$${b}2<>""),${notBanner_()})`;
  const rules = sheet.getConditionalFormatRules();
  // Earlier versions of this rule left out the last test and so painted the
  // week and term bars red, which is why the old rule is replaced rather than
  // added to.
  const criteria = (rule) => {
    const condition = rule.getBooleanCondition();
    const value = condition && condition.getCriteriaValues()[0];
    return typeof value === 'string' ? value : '';
  };
  const mine = rules.filter((rule) => criteria(rule).startsWith(`=AND($${g}2=""`));
  if (mine.length === 1 && criteria(mine[0]) === formula) return;

  const kept = rules.filter((rule) => !mine.includes(rule));
  kept.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula)
      .setBackground(MISSING_VOLSOC_COLOUR)
      .setRanges([sheet.getRange(2, COL.VOLSOC_EVENT, sheet.getMaxRows() - 1, 1)])
      .build()
  );
  sheet.setConditionalFormatRules(kept);
}

// ── Event sync ────────────────────────────────────────────────────────────

// Name kept from the original Calendar-based script so existing triggers and
// menu items still point at it.
function syncFromGoogleCalendar() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    sync_();
  } finally {
    // Also after a failed sync, so a feed problem never hides the buttons.
    const sheet = getSheet_();
    // Both no-ops once the rules are right, so this is a cheap way of making
    // a deploy land without anyone running setup from the menu.
    addMissingVolsocRule_(sheet);
    addCommitteeRules_(sheet);
    refreshDocButtons_(sheet);
    refreshCalendarButtons_(sheet);
    refreshCommitteeColumns_(sheet);
    refreshDayDividers_(sheet);
    refreshBanners_(sheet);
    addDocControlsToExistingDocs_(sheet);
    lock.releaseLock();
  }
}

function sync_() {
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const sheet = getSheet_();
  // Out of the way before anything reads, writes, appends to or sorts the
  // rows; the finally block in syncFromGoogleCalendar draws them again.
  stripBanners_(sheet);

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + CONFIG.DAYS_AHEAD);
  const events = fetchEvents_(tz).filter((event) => event.start >= windowStart && event.start < windowEnd);

  const lastRow = sheet.getLastRow();
  const rowCount = Math.max(lastRow - 1, 0);
  const values = rowCount ? sheet.getRange(2, 1, rowCount, COL.WIDTH).getValues() : [];
  const display = rowCount ? sheet.getRange(2, 1, rowCount, COL.WIDTH).getDisplayValues() : [];
  const struck = rowCount
    ? sheet.getRange(2, COL.UNION_EVENT, rowCount, 1).getFontLines().map((r) => r[0] === 'line-through')
    : [];

  // Rows synced by this version carry a key. Rows from the old title-only sync
  // don't, so they're matched once on date + title + start time and adopted.
  const rowByKey = new Map();
  const legacyRowByMatch = new Map();
  values.forEach((row, i) => {
    const key = String(row[COL.EVENT_KEY - 1]);
    if (key) rowByKey.set(key, i);
    else if (row[COL.UNION_EVENT - 1]) legacyRowByMatch.set(currentMatch_(row, display[i], tz), i);
  });

  const seenKeys = new Set();
  const matchedRows = new Set();
  const newRows = [];
  let datesChanged = false;

  events.forEach((event) => {
    const fields = eventFields_(event, tz);
    const key = event.uid;
    seenKeys.add(key);

    let i = rowByKey.get(key);
    if (i === undefined) {
      const match = [fields[0], fields[1], fields[2]].join('|');
      i = legacyRowByMatch.get(match);
      if (i !== undefined) legacyRowByMatch.delete(match);
    }

    if (i === undefined) {
      const row = new Array(COL.WIDTH).fill('');
      fields.forEach((value, f) => (row[COL[FEED_COLUMNS[f]] - 1] = value));
      row[COL.EVENT_KEY - 1] = key;
      newRows.push(row);
      return;
    }

    matchedRows.add(i);
    const current = currentFields_(values[i], display[i], tz);
    const changed = fields.some((value, c) => value !== current[c]);
    const sheetRow = i + 2;
    if (changed) {
      if (fields[0] !== current[0]) datesChanged = true;
      fields.forEach((value, f) => {
        if (value !== current[f]) sheet.getRange(sheetRow, COL[FEED_COLUMNS[f]]).setValue(value);
      });
    }
    if (String(values[i][COL.EVENT_KEY - 1]) !== key) {
      sheet.getRange(sheetRow, COL.EVENT_KEY).setValue(key);
    }
    if (struck[i]) {
      sheet.getRange(sheetRow, COL.UNION_EVENT).setFontLine('none').clearNote();
    }
  });

  // An upcoming Union Event that isn't in the feed — cancelled, moved, or never
  // a Social Impact event — may still have VolSoc plans hanging off it, so
  // strike it through rather than delete the row. Skipped when the feed was
  // empty, which is more likely an outage than every event being cancelled.
  if (events.length) {
    values.forEach((row, i) => {
      const key = String(row[COL.EVENT_KEY - 1]);
      const date = row[COL.DATE - 1];
      if (!row[COL.UNION_EVENT - 1] || seenKeys.has(key) || matchedRows.has(i) || struck[i]) return;
      if (!(date instanceof Date) || date < windowStart || date >= windowEnd) return;
      sheet
        .getRange(i + 2, COL.UNION_EVENT)
        .setFontLine('line-through')
        .setNote('Not in the UCL Student Social Impact feed — cancelled, moved, or not a Social Impact event?');
    });
  }

  if (newRows.length) {
    const start = sheet.getLastRow() + 1;
    const end = start + newRows.length - 1;
    if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
    if (start > 2) {
      sheet.getRange(2, 1, 1, COL.WIDTH).copyFormatToRange(sheet, 1, COL.WIDTH, start, end);
    }
    sheet.getRange(start, 1, newRows.length, COL.WIDTH).setValues(newRows);
    sheet.getRange(start, COL.UNION_EVENT, newRows.length, 1).setFontLine('none');
  }

  // Also catches rows added by hand, e.g. a standalone VolSoc event typed in
  // at the bottom. Sorting waits for the sync rather than happening on edit so
  // a row doesn't jump away while someone is still filling it in.
  if (newRows.length || datesChanged || !isInDateOrder_(sheet, tz)) sortByDate_(sheet);

  if (COL.CALENDAR) {
    const all = sheet.getLastRow() - 1;
    const moved = syncCalendarRows_(sheet, Array.from({ length: all }, (_, i) => i + 2), { pull: true });
    if (moved) sortByDate_(sheet);
    removeOrphanCalendarEvents_(sheet, windowStart);
  }
}

function eventFields_(event, tz) {
  return [
    Utilities.formatDate(event.start, tz, 'yyyy-MM-dd'),
    event.title,
    Utilities.formatDate(event.start, tz, 'HH:mm'),
    Utilities.formatDate(event.end || event.start, tz, 'HH:mm'),
    event.location,
    event.url,
  ];
}

// ── iCal feed ─────────────────────────────────────────────────────────────

function fetchEvents_(tz) {
  const response = UrlFetchApp.fetch(CONFIG.ICAL_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Social Impact feed returned HTTP ${response.getResponseCode()}: ${CONFIG.ICAL_URL}`);
  }
  return parseIcal_(response.getContentText(), tz);
}

// Enough of RFC 5545 for the toolbox feed and ordinary exports: folded lines,
// escaped text, UTC / TZID / all-day dates. Recurrence rules aren't expanded;
// the toolbox writes one VEVENT per occurrence.
function parseIcal_(text, tz) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let current = null;

  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      return;
    }
    if (line === 'END:VEVENT') {
      if (current && current.uid && current.start) events.push(current);
      current = null;
      return;
    }
    if (!current) return;

    const colon = line.indexOf(':');
    if (colon === -1) return;
    const [name, ...params] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    const param = (key) => (params.find((p) => p.startsWith(key + '=')) || '').split('=')[1];

    switch (name.toUpperCase()) {
      case 'UID':
        current.uid = value;
        break;
      case 'SUMMARY':
        current.title = unescapeIcal_(value);
        break;
      case 'LOCATION':
        current.location = unescapeIcal_(value);
        break;
      case 'URL':
        current.url = unescapeIcal_(value);
        break;
      case 'DTSTART':
        current.start = parseIcalDate_(value, param('TZID') || tz);
        break;
      case 'DTEND':
        current.end = parseIcalDate_(value, param('TZID') || tz);
        break;
      case 'STATUS':
        if (value.toUpperCase() === 'CANCELLED') current.cancelled = true;
        break;
    }
  });

  return events
    .filter((event) => !event.cancelled)
    .map((event) => ({ title: '', location: '', url: '', ...event }));
}

function parseIcalDate_(value, tz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', sec = '00', utc] = m;
  if (utc) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec));
  return Utilities.parseDate(`${y}-${mo}-${d} ${h}:${mi}:${sec}`, tz, 'yyyy-MM-dd HH:mm:ss');
}

function unescapeIcal_(value) {
  return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c)).trim();
}

function currentFields_(row, displayRow, tz) {
  return [
    dateKey_(row[COL.DATE - 1], tz),
    String(row[COL.UNION_EVENT - 1]),
    timeKey_(displayRow[COL.UNION_START - 1]),
    timeKey_(displayRow[COL.UNION_END - 1]),
    String(row[COL.LOCATION - 1]),
    String(row[COL.LINK - 1]),
  ];
}

function currentMatch_(row, displayRow, tz) {
  const fields = currentFields_(row, displayRow, tz);
  return [fields[0], fields[1], fields[2]].join('|');
}

function dateKey_(value, tz) {
  return value instanceof Date ? Utilities.formatDate(value, tz, 'yyyy-MM-dd') : String(value);
}

// Times are compared through their displayed text, whatever the cell's number
// format, because 1899-epoch time values don't survive timezone conversion.
function timeKey_(text) {
  const m = String(text).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (!m) return String(text);
  let hours = Number(m[1]) % (m[3] ? 12 : 24);
  if (m[3] && m[3].toLowerCase() === 'pm') hours += 12;
  return String(hours).padStart(2, '0') + ':' + m[2];
}

// When a row starts: the Social Impact event if it follows one, otherwise the
// VolSoc event's own time. Sorting on the two columns one after the other
// instead would drop every standalone VolSoc row to the end of its day,
// because a sheet sort puts empty cells last whichever way it's pointed.
function sortTime_(displayRow) {
  return timeKey_(displayRow[COL.UNION_START - 1]) || timeKey_(displayRow[COL.VOLSOC_START - 1]);
}

// Rows without a date, and rows with no time on the day, count as last, which
// is where the sort puts them.
function isInDateOrder_(sheet, tz) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 2) return true;
  const dates = sheet.getRange(2, COL.DATE, rows, 1).getValues();
  const text = sheet.getRange(2, 1, rows, COL.WIDTH).getDisplayValues();
  const keys = dates.map(
    (r, i) => `${r[0] === '' ? '\uffff' : dateKey_(r[0], tz)} ${sortTime_(text[i]) || '\uffff'}`
  );
  return keys.every((key, i) => i === 0 || keys[i - 1] <= key);
}

function sortByDate_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 2) return;
  const text = sheet.getRange(2, 1, rows, COL.WIDTH).getDisplayValues();
  sheet.getRange(2, COL.SORT_TIME, rows, 1).setValues(text.map((row) => [sortTime_(row)]));
  sheet.getRange(2, 1, rows, sheet.getLastColumn()).sort([
    { column: COL.DATE, ascending: true },
    { column: COL.SORT_TIME, ascending: true },
  ]);
}

// Every row with content gets a Create doc checkbox in Doc Detail, which
// becomes an Open doc link once the doc exists, with a Delete doc checkbox
// beside it. Rebuilt on each sync so sorted, pasted or hand-added rows always
// get one. Anything else typed into the cell is left alone.
function refreshDocButtons_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  const docRange = sheet.getRange(2, COL.DOC, rows, 1);
  const docs = docRange.getRichTextValues();
  const fills = docRange.getBackgrounds();
  const ids = values.map((row) => [String(row[COL.ROW_ID - 1]) || (hasContent_(row) ? Utilities.getUuid() : '')]);
  sheet.getRange(2, COL.ROW_ID, rows, 1).setValues(ids);
  const pending = pendingDeletes_('deleteDoc', ids.map((r) => r[0]));
  const chipFills = [BUTTON_BOX.fill, ...Object.values(DOC_CHIPS).map((chip) => chip.fill)];

  // Decide first, so validations are set before anything is written: a
  // checkbox cell rejects a link written into it.
  const plan = values.map((row, i) => {
    const raw = row[COL.DOC - 1];
    // Rich text is null for non-text cells, such as a checkbox.
    const text = docs[i][0] ? docs[i][0].getText() : '';
    const link = docs[i][0] ? docs[i][0].getLinkUrl() : null;
    const isLegacy = LEGACY_CREATE_LABELS.includes(text);
    if (!isLegacy && /^https:\/\/docs\.google\.com\//.test(link || '')) {
      const chip = pending.has(ids[i][0]) ? DOC_CHIPS.confirm : DOC_CHIPS.open;
      return { kind: 'chip', chip, url: link, text };
    }
    const isBlank = raw === '' || typeof raw === 'boolean' || isLegacy;
    if (hasContent_(row) && isBlank) return { kind: 'box', raw };
    return { kind: isLegacy || typeof raw === 'boolean' ? 'clear' : 'keep' };
  });

  docRange.setDataValidations(plan.map((p) => [p.kind === 'box' ? checkboxRule_() : null]));
  plan.forEach((p, i) => {
    const cell = sheet.getRange(i + 2, COL.DOC);
    if (p.kind === 'chip') {
      if (p.text !== p.chip.label) cell.setRichTextValue(docChip_(p.chip, p.url));
      fills[i][0] = p.chip.fill;
    } else if (p.kind === 'box') {
      if (p.raw !== false) cell.setValue(false).setFontColor(BUTTON_BOX.text).setFontWeight('normal');
      fills[i][0] = BUTTON_BOX.fill;
    } else {
      if (p.kind === 'clear') cell.clearContent();
      if (chipFills.includes(fills[i][0])) fills[i][0] = null;
    }
  });

  docRange
    .setBackgrounds(fills)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  refreshDeleteColumn_(sheet, COL.DELETE_DOC, plan.map((p, i) => deleteCellState_(p, values[i])));
}

// A red checkbox on rows with something to delete. Other rows with content
// keep the red tint with no box, so the column reads as one strip and doesn't
// lose its colour once something is deleted. Like the other button columns
// it's script-owned, so anything typed in is replaced.
function refreshDeleteColumn_(sheet, column, states) {
  if (!column || !states.length) return;
  const range = sheet.getRange(2, column, states.length, 1);
  const values = range.getValues();
  const fills = range.getBackgrounds();
  range.setDataValidations(states.map((state) => [state === 'box' ? checkboxRule_() : null]));

  states.forEach((state, i) => {
    const cell = sheet.getRange(i + 2, column);
    if (state === 'box') {
      if (values[i][0] !== false) cell.setValue(false);
    } else if (values[i][0] !== '') {
      cell.clearContent();
    }
    if (state !== 'none') fills[i][0] = DELETE_BOX.fill;
    else if (fills[i][0] === DELETE_BOX.fill) fills[i][0] = null;
  });

  range
    .setBackgrounds(fills)
    .setFontColor(DELETE_BOX.text)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

function deleteCellState_(plan, row) {
  if (plan.kind === 'chip') return 'box';
  return hasContent_(row) ? 'tint' : 'none';
}

function checkboxRule_() {
  return SpreadsheetApp.newDataValidation().requireCheckbox().build();
}

function hasContent_(row) {
  if (isBanner_(row)) return false;
  return [COL.DATE, COL.UNION_EVENT, COL.VOLSOC_EVENT].some((c) => row[c - 1] !== '');
}

function docChip_(chip, url) {
  const style = SpreadsheetApp.newTextStyle()
    .setBold(true)
    .setUnderline(false)
    .setForegroundColor(chip.text)
    .build();
  return SpreadsheetApp.newRichTextValue().setText(chip.label).setLinkUrl(url).setTextStyle(style).build();
}

// ── Day dividers ──────────────────────────────────────────────────────────

// Sheets can't draw borders from conditional formatting, so the rules are
// redrawn after every sync and whenever a date is edited.
function refreshDayDividers_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  // A week or term bar is a separator in itself, so it's stepped over: it gets
  // no rule of its own, and it doesn't break up the day on either side of it.
  const dates = values.map((row) => (isBanner_(row) ? null : dateKey_(row[COL.DATE - 1], tz)));
  const nextDate = (i) => dates.slice(i + 1).find((date) => date !== null);
  const lastCol = columnLetter_(sheet.getLastColumn());
  const rowA1 = (row) => `A${row}:${lastCol}${row}`;

  const thin = [rowA1(rows + 2)];
  const thick = [];
  dates.forEach((date, i) => {
    if (date === null) return;
    (date !== '' && date !== nextDate(i) ? thick : thin).push(rowA1(i + 2));
  });

  sheet.getRangeList(thin).setBorder(null, null, false, null, null, null);
  if (thick.length) {
    sheet
      .getRangeList(thick)
      .setBorder(null, null, true, null, null, null, DAY_DIVIDER_COLOUR, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
}

// ── Week and term bars ────────────────────────────────────────────────────

// Bars are worked out over the whole sheet first and then inserted from the
// bottom up, so the row numbers found here stay right as rows appear above
// them. Where a term and a week start on the same row, the term bar is found
// first and so ends up on top.
function refreshBanners_(sheet) {
  stripBanners_(sheet);
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const dates = sheet
    .getRange(2, COL.DATE, rows, 1)
    .getValues()
    .map((r) => (r[0] instanceof Date ? dateKey_(r[0], tz) : ''));

  const bars = [];
  let term = null;
  let week = null;
  dates.forEach((iso, i) => {
    if (!iso) return; // undated rows, which the sort leaves at the bottom
    const block = termBlock_(iso);
    const monday = mondayOf_(iso);
    if (block.key !== term) {
      bars.push({ row: i + 2, style: TERM_BAR, label: block.label });
      term = block.key;
      week = null; // a term starting mid-week still opens with a week bar
    }
    if (monday !== week) {
      bars.push({ row: i + 2, style: WEEK_BAR, label: weekLabel_(block, monday) });
      week = monday;
    }
  });

  bars.reverse().forEach((bar) => insertBanner_(sheet, bar));
}

// Deleted from the bottom up, and a term bar and the week bar under it go in
// one call, since a sheet edit is far slower than the loop around it. A bar
// that has been typed into is kept and turned into an ordinary row instead:
// clicking on one and filling it in is an easy mistake, and deleting the row
// would take the work with it.
function stripBanners_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  let run = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (isBanner_(values[i]) && !typedInto_(values[i])) {
      run++;
      continue;
    }
    if (isBanner_(values[i])) rescueBanner_(sheet, i + 2, values[i]);
    if (run) {
      sheet.deleteRows(i + 3, run);
      run = 0;
    }
  }
  if (run) sheet.deleteRows(2, run);
}

// The labels the script writes, so anything else in the cell is somebody's.
const BAR_LABEL = /^(TERM \d|WEEK \d|VACATION|OUT OF TERM|W\/C )/;

function typedInto_(row) {
  if (typeof row[0] !== 'string' || !BAR_LABEL.test(row[0])) return true;
  return row.some((value, c) => c !== 0 && c !== COL.ROW_ID - 1 && value !== '');
}

// Back to a plain row, keeping whatever was typed. With the marker gone the
// sort takes it from there, and a fresh bar is drawn for the week regardless.
function rescueBanner_(sheet, row, values) {
  sheet.getRange(row, COL.ROW_ID).clearContent();
  if (typeof values[0] === 'string' && BAR_LABEL.test(values[0])) sheet.getRange(row, 1).clearContent();
  sheet
    .getRange(row, 1, 1, COL.WIDTH)
    .setBackground(null)
    .setFontColor(null)
    .setFontSize(10)
    .setFontWeight('normal');
  sheet.setRowHeight(row, 21);
}

function isBanner_(row) {
  return String(row[COL.ROW_ID - 1]).startsWith(BANNER_PREFIX);
}

// Used in conditional formats, which run over the bar rows too.
function notBanner_() {
  return `LEFT($${columnLetter_(COL.ROW_ID)}2,${BANNER_PREFIX.length})<>"${BANNER_PREFIX}"`;
}

function insertBanner_(sheet, bar) {
  sheet.insertRowBefore(bar.row);
  // An inserted row comes with the formatting, checkboxes and day rule of the
  // row above it, none of which belong on a bar.
  const row = sheet.getRange(bar.row, 1, 1, sheet.getLastColumn());
  row.clear();
  row.setBackground(bar.style.fill);
  // The label sits in the first column and runs across the empty ones.
  sheet
    .getRange(bar.row, 1)
    .setValue(bar.label)
    .setFontWeight('bold')
    .setFontSize(bar.style.size)
    .setFontColor(bar.style.text)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.OVERFLOW);
  sheet.getRange(bar.row, COL.ROW_ID).setValue(bar.style.id);
  sheet.setRowHeight(bar.row, bar.style.height);
}

// The term a date falls in, or the vacation block between two terms. The key
// tells one block from the next; the label goes on the bar.
function termBlock_(iso) {
  const term = TERMS.find((t) => iso >= t.start && iso <= t.end);
  if (term) {
    return {
      key: term.start,
      start: term.start,
      label: `${term.name} · ${shortDate_(term.start)} – ${shortDate_(term.end)}`.toUpperCase(),
    };
  }
  const before = TERMS.filter((t) => t.end < iso).pop();
  const after = TERMS.find((t) => t.start > iso);
  const label =
    before && after
      ? `Vacation · ${shortDate_(shiftDays_(before.end, 1))} – ${shortDate_(shiftDays_(after.start, -1))}`
      : 'Out of term';
  return { key: `gap:${before ? before.end : 'start'}`, start: null, label: label.toUpperCase() };
}

function weekLabel_(block, monday) {
  const reading = READING_WEEKS.includes(monday) ? ' · READING WEEK' : '';
  if (!block.start) return `W/C MON ${shortDate_(monday)}`.toUpperCase() + reading;
  const week = Math.round((dayNumber_(monday) - dayNumber_(mondayOf_(block.start))) / 7) + 1;
  return `WEEK ${week} · MON ${shortDate_(monday)}`.toUpperCase() + reading;
}

// Dates are handled as yyyy-MM-dd strings and counted in whole UTC days, so
// neither the sheet's timezone nor British Summer Time can shift a week.
function dayNumber_(iso) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
}

function shiftDays_(iso, days) {
  const date = new Date((dayNumber_(iso) + days) * 86400000);
  return date.toISOString().slice(0, 10);
}

function mondayOf_(iso) {
  const weekday = new Date(dayNumber_(iso) * 86400000).getUTCDay();
  return shiftDays_(iso, -((weekday + 6) % 7));
}

function shortDate_(iso) {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

// ── Committee tick/cross columns ──────────────────────────────────────────

// The dropdown and the widths, rebuilt on each sync so rows added by hand or
// by the feed get them too. The marks themselves are coloured by conditional
// format rules, which setup puts in.
function refreshCommitteeColumns_(sheet) {
  if (!COL.COMMITTEE_FIRST) return;
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const count = COMMITTEE_COLUMNS;
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  const rule = committeeRule_();
  const range = sheet.getRange(2, COL.COMMITTEE_FIRST, rows, count);
  // Only a row with a VolSoc event of its own has anyone to ask about.
  range.setDataValidations(
    values.map((row) =>
      new Array(count).fill(!isBanner_(row) && row[COL.VOLSOC_EVENT - 1] !== '' ? rule : null)
    )
  );
  range.setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setColumnWidths(COL.COMMITTEE_FIRST, count, COMMITTEE_COLUMN_WIDTH);
}

function committeeRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(COMMITTEE_MARKS).map((mark) => mark.value), true)
    .setAllowInvalid(true) // so typing y, m or n isn't rejected before handleEdit sees it
    .setHelpText('✓ coming, ? maybe, ✕ can\'t, blank not asked yet — or type y, m or n.')
    .build();
}

// Typing y or n is quicker than picking from the dropdown, so anything that
// reads as a yes or a no becomes the tick or the cross. Pasting a block of
// them works the same way.
function normaliseCommitteeMarks_(sheet, range) {
  const first = Math.max(range.getColumn(), COL.COMMITTEE_FIRST);
  const last = Math.min(range.getLastColumn(), COL.COMMITTEE_LAST);
  if (last < first) return;
  const top = Math.max(range.getRow(), 2);
  const block = sheet.getRange(top, first, range.getLastRow() - top + 1, last - first + 1);
  let changed = false;
  const marked = block.getValues().map((row) =>
    row.map((value) => {
      const typed = String(value).trim().toLowerCase();
      const mark = typed && Object.values(COMMITTEE_MARKS).find((m) => m.typed.includes(typed));
      if (!mark || mark.value === value) return value;
      changed = true;
      return mark.value;
    })
  );
  if (changed) block.setValues(marked);
}

// Green tick, red cross, and a pale amber cell for anyone who hasn't answered
// on a row that has an event in it — the whole point of the columns is that
// "can't" and "hasn't said" don't look the same. Rules already on these
// columns are replaced, since the script owns them.
function addCommitteeRules_(sheet) {
  if (!COL.COMMITTEE_FIRST) return;
  const range = sheet.getRange(2, COL.COMMITTEE_FIRST, sheet.getMaxRows() - 1, COMMITTEE_COLUMNS);
  const wanted = [];

  Object.values(COMMITTEE_MARKS).forEach((mark) => {
    wanted.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(mark.value)
        .setBackground(mark.fill)
        .setFontColor(mark.text)
        .setBold(true)
        .setRanges([range])
        .build()
    );
  });

  // Relative to the top-left of the range, so each cell tests itself.
  const cell = `${columnLetter_(COL.COMMITTEE_FIRST)}2`;
  const event = `$${columnLetter_(COL.VOLSOC_EVENT)}2`;
  wanted.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(${cell}="",${event}<>"",${notBanner_()})`)
      .setBackground(COMMITTEE_WAITING_FILL)
      .setRanges([range])
      .build()
  );

  const rules = sheet.getConditionalFormatRules();
  const mine = rules.filter((rule) =>
    rule.getRanges().every((r) => r.getColumn() >= COL.COMMITTEE_FIRST && r.getLastColumn() <= COL.COMMITTEE_LAST)
  );
  if (ruleKeys_(mine) === ruleKeys_(wanted)) return;
  sheet.setConditionalFormatRules(rules.filter((rule) => !mine.includes(rule)).concat(wanted));
}

// Rules can't be compared to each other, so they're boiled down to the test
// they make and the cells they cover — enough to tell "mine are already
// there" from "they've been lost or changed", which is all this is for.
function ruleKeys_(rules) {
  return rules
    .map((rule) => {
      const condition = rule.getBooleanCondition();
      const test = condition ? `${condition.getCriteriaType()} ${condition.getCriteriaValues().join('|')}` : '';
      return `${test} @ ${rule.getRanges().map((r) => r.getA1Notation()).join(',')}`;
    })
    .join('\n');
}

// For the planning doc: who's coming, who can't, and who still owes an
// answer, by whatever the columns are headed at the time.
function committeeSummary_(sheet, text) {
  if (!COL.COMMITTEE_FIRST) return '';
  const names = sheet.getRange(1, COL.COMMITTEE_FIRST, 1, COMMITTEE_COLUMNS).getDisplayValues()[0];
  const marks = names.map((name, i) => [
    String(name).trim() || `Member ${i + 1}`,
    String(text[COL.COMMITTEE_FIRST - 1 + i]).trim(),
  ]);
  const named = (mark) => marks.filter(([, value]) => value === mark).map(([name]) => name);
  const parts = [
    ['Coming', named(COMMITTEE_MARKS.yes.value)],
    ['Maybe', named(COMMITTEE_MARKS.maybe.value)],
    ["Can't", named(COMMITTEE_MARKS.no.value)],
    ['No answer yet', named('')],
  ];
  return parts
    .filter(([, who]) => who.length)
    .map(([label, who]) => `${label}: ${who.join(', ')}`)
    .join(' · ');
}

// ── VolSoc calendar ───────────────────────────────────────────────────────

function handleEdit(e) {
  const range = e.range;
  if (range.getSheet().getName() !== CONFIG.SHEET_NAME || range.getLastRow() < 2) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20 * 1000)) return; // the hourly sync will catch up
  try {
    const sheet = getSheet_();
    const touches = (...cols) =>
      cols.some((col) => col && range.getColumn() <= col && range.getLastColumn() >= col);

    // A ticked button runs its action, which redraws the buttons itself.
    if (runTickedBoxes_(sheet, range, e.source)) return;

    if (COL.COMMITTEE_FIRST) normaliseCommitteeMarks_(sheet, range);

    if (touches(COL.DATE)) refreshDayDividers_(sheet);

    // A row typed in by hand, such as a standalone VolSoc event with no Union
    // Event, gets its Create doc and Add to calendar buttons straight away.
    if (touches(COL.DATE, COL.UNION_EVENT, COL.VOLSOC_EVENT)) {
      refreshDocButtons_(sheet);
      if (COL.CALENDAR) refreshCalendarButtons_(sheet);
    }

    if (COL.CALENDAR && touches(COL.CALENDAR, COL.DATE, COL.VOLSOC_EVENT, COL.VOLSOC_START, COL.VOLSOC_END)) {
      const first = Math.max(range.getRow(), 2);
      const last = Math.min(range.getLastRow(), first + 99);
      const rows = Array.from({ length: last - first + 1 }, (_, i) => first + i);
      // Clearing a VolSoc Calendar cell is how an event is taken out.
      if (touches(COL.CALENDAR)) removeClearedCalendarEvents_(sheet, rows);
      syncCalendarRows_(sheet, rows);
      refreshCalendarButtons_(sheet);
    }
  } finally {
    lock.releaseLock();
  }
}

// Which action each button column's checkbox runs. handleEdit already holds
// the document lock.
const BOX_ACTIONS = [
  ['DOC', (sheet, row) => createDocForRow_(row)],
  ['CALENDAR', (sheet, row) => addToCalendarForRow_(row)],
  ['DELETE_DOC', (sheet, row, source) => afterSecondTick_(sheet, row, source, 'deleteDoc')],
  ['REMOVE_EVENT', (sheet, row, source) => afterSecondTick_(sheet, row, source, 'removeEvent')],
];

// Returns true if any box in the edited range was ticked. A box whose action
// fails is unticked, with the reason in a toast.
function runTickedBoxes_(sheet, range, source) {
  let ticked = false;
  const first = Math.max(range.getRow(), 2);
  const count = range.getLastRow() - first + 1;
  BOX_ACTIONS.forEach(([key, run]) => {
    const col = COL[key];
    if (!col || range.getColumn() > col || range.getLastColumn() < col) return;
    sheet.getRange(first, col, count, 1).getValues().forEach(([value], i) => {
      if (value !== true) return;
      ticked = true;
      try {
        run(sheet, first + i, source);
      } catch (err) {
        sheet.getRange(first + i, col).setValue(false);
        source.toast(err.message, "Couldn't do that", 10);
      }
    });
  });
  return ticked;
}

// Deleting takes two ticks within DELETE_CONFIRM_SECONDS. The first turns
// the link beside the box red and pops up a toast asking for the second.
const SECOND_TICK = {
  deleteDoc: {
    ask: 'Tick ✕ again to move the doc for {name} to the Drive trash.',
    run: (sheet, row) => deleteDocForRow_(row),
    refresh: (sheet) => refreshDocButtons_(sheet),
  },
  removeEvent: {
    ask: 'Tick ✕ again to remove {name} from the VolSoc calendar.',
    run: (sheet, row) => removeCalendarForRow_(row),
    refresh: (sheet) => refreshCalendarButtons_(sheet),
  },
};

function afterSecondTick_(sheet, row, source, kind) {
  const step = SECOND_TICK[kind];
  const rowId = String(sheet.getRange(row, COL.ROW_ID).getValue());
  if (!rowId) throw new Error('This row has no ID yet — run VolSoc → Sync now, then try again.');
  const cache = CacheService.getScriptCache();
  const key = `${kind}:${rowId}`;
  if (cache.get(key)) {
    cache.remove(key);
    step.run(sheet, row);
    return;
  }
  cache.put(key, '1', DELETE_CONFIRM_SECONDS);
  step.refresh(sheet);
  const text = sheet.getRange(row, 1, 1, COL.WIDTH).getDisplayValues()[0];
  const name = text[COL.VOLSOC_EVENT - 1] || text[COL.UNION_EVENT - 1] || `row ${row}`;
  source.toast(step.ask.replace('{name}', `"${name}"`), 'Are you sure?', 15);
}

function pendingDeletes_(kind, rowIds) {
  const keys = rowIds.filter(Boolean).map((id) => `${kind}:${id}`);
  if (!keys.length) return new Set();
  const found = CacheService.getScriptCache().getAll(keys);
  return new Set(Object.keys(found).map((key) => key.slice(kind.length + 1)));
}

const VOLSOC_CALENDAR_SUMMARY = 'VolSoc events, managed from the Volsoc Master Plan sheet.';

// There is exactly one VolSoc calendar. It's looked up by stored ID, then by
// name, and only created if neither finds it — a calendar made seconds ago
// isn't always found by ID yet, which is how earlier runs made several. The
// script lock stops two runs (an edit and the hourly sync) racing to create
// it. Extra calendars this script made are deleted; their events are
// recreated in the real one by the next sync, since rows whose event can't be
// found get a new one.
function volsocCalendar_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    const props = PropertiesService.getScriptProperties();
    const storedId = props.getProperty('VOLSOC_CALENDAR_ID');
    const named = CalendarApp.getOwnedCalendarsByName(CONFIG.VOLSOC_CALENDAR_NAME);

    let calendar =
      named.find((c) => c.getId() === storedId) ||
      (storedId && CalendarApp.getCalendarById(storedId)) ||
      named[0] ||
      null;
    if (!calendar) {
      calendar = CalendarApp.createCalendar(CONFIG.VOLSOC_CALENDAR_NAME, {
        summary: VOLSOC_CALENDAR_SUMMARY,
        timeZone: spreadsheet_().getSpreadsheetTimeZone(),
      });
    }
    if (calendar.getId() !== storedId) props.setProperty('VOLSOC_CALENDAR_ID', calendar.getId());

    named
      .filter((c) => c.getId() !== calendar.getId() && c.getDescription() === VOLSOC_CALENDAR_SUMMARY)
      .forEach((c) => c.deleteCalendar());

    return calendar;
  } finally {
    lock.releaseLock();
  }
}

// Keeps events already in the calendar in step with their rows: title and
// description always follow the sheet, and so does the time unless the event
// has been moved in Calendar since we last wrote it, which the hourly sweep
// pulls back into the row instead. An event deleted in Calendar is treated
// as taken out, and the row goes back to an Add to calendar button.
function syncCalendarRows_(sheet, rowNumbers, { pull = false } = {}) {
  if (!rowNumbers.length) return false;
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const first = Math.min(...rowNumbers);
  const count = Math.max(...rowNumbers) - first + 1;
  const values = sheet.getRange(first, 1, count, COL.WIDTH).getValues();
  const text = sheet.getRange(first, 1, count, COL.WIDTH).getDisplayValues();
  let calendar = null;
  let datesChanged = false;

  rowNumbers.forEach((row) => {
    const i = row - first;
    const eventId = String(values[i][COL.CALENDAR_EVENT_ID - 1]);
    if (!eventId) return;

    calendar = calendar || volsocCalendar_();
    const event = calendar.getEventById(eventId);
    if (!event) {
      sheet.getRange(row, COL.CALENDAR_EVENT_ID).clearContent();
      return;
    }
    const details = calendarDetails_(values[i], text[i], docUrl_(sheet, row), tz);
    if (details.error) return; // keep the event as it was until the row is fixed

    // Dragging the event in Calendar is a deliberate act, so on the hourly
    // sweep the calendar wins and the move is pulled back into the row rather
    // than silently undone. A sheet edit pushes the other way the moment it
    // happens; the stamp tells the two apart, differing only when the event
    // was moved in Calendar after we last wrote it.
    const stamped = event.getTag('volsocSyncedTime');
    if (pull && stamped && stamped !== eventStamp_(event, tz)) {
      if (pullEventIntoRow_(sheet, row, event, values[i], tz)) datesChanged = true;
      return;
    }
    updateEvent_(event, details, values[i][COL.ROW_ID - 1], tz);
  });

  return datesChanged;
}

// Returns { url, existed }. Throws with a readable message on failure.
function addToCalendarForRow_(row) {
  const sheet = getSheet_();
  const calendar = volsocCalendar_();
  const values = sheet.getRange(row, 1, 1, COL.WIDTH).getValues()[0];
  const text = sheet.getRange(row, 1, 1, COL.WIDTH).getDisplayValues()[0];
  const existingId = String(values[COL.CALENDAR_EVENT_ID - 1]);
  const existing = existingId ? calendar.getEventById(existingId) : null;
  if (existing) {
    refreshCalendarButtons_(sheet);
    return { url: eventUrl_(existing, calendar), existed: true };
  }

  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const details = calendarDetails_(values, text, docUrl_(sheet, row), tz);
  if (details.error) throw new Error(`Can't add this row to the calendar yet — ${details.error}`);

  const event = details.allDay
    ? calendar.createAllDayEvent(details.title, details.start, { description: details.description })
    : calendar.createEvent(details.title, details.start, details.end, { description: details.description });
  event.setTag('volsocRowId', String(values[COL.ROW_ID - 1]));
  event.setTag('volsocSyncedTime', stamp_(details.allDay, details.start, details.end, tz));
  sheet.getRange(row, COL.CALENDAR_EVENT_ID).setValue(event.getId());
  refreshCalendarButtons_(sheet);
  SpreadsheetApp.flush();
  return { url: eventUrl_(event, calendar), existed: false };
}

function removeClearedCalendarEvents_(sheet, rowNumbers) {
  let calendar = null;
  rowNumbers.forEach((row) => {
    const idCell = sheet.getRange(row, COL.CALENDAR_EVENT_ID);
    const eventId = String(idCell.getValue());
    if (!eventId || sheet.getRange(row, COL.CALENDAR).getValue() !== '') return;
    calendar = calendar || volsocCalendar_();
    const event = calendar.getEventById(eventId);
    if (event) event.deleteEvent();
    idCell.clearContent();
  });
}

function updateEvent_(event, details, rowId, tz) {
  if (event.getTitle() !== details.title) event.setTitle(details.title);
  if (event.getDescription() !== details.description) event.setDescription(details.description);
  if (details.allDay) {
    if (!event.isAllDayEvent() || event.getAllDayStartDate().getTime() !== details.start.getTime()) {
      event.setAllDayDate(details.start);
    }
  } else if (
    event.isAllDayEvent() ||
    event.getStartTime().getTime() !== details.start.getTime() ||
    event.getEndTime().getTime() !== details.end.getTime()
  ) {
    event.setTime(details.start, details.end);
  }
  if (event.getTag('volsocRowId') !== String(rowId)) event.setTag('volsocRowId', String(rowId));
  event.setTag('volsocSyncedTime', stamp_(details.allDay, details.start, details.end, tz));
}

// What we last wrote to the event. Compared against the event's live times to
// spot a move made in Calendar, so an untouched event is never mistaken for
// one someone dragged.
function stamp_(allDay, start, end, tz) {
  const at = (d) => Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
  return allDay ? `${Utilities.formatDate(start, tz, 'yyyy-MM-dd')} all-day` : `${at(start)}/${at(end)}`;
}

function eventStamp_(event, tz) {
  return event.isAllDayEvent()
    ? stamp_(true, event.getAllDayStartDate(), null, tz)
    : stamp_(false, event.getStartTime(), event.getEndTime(), tz);
}

// Writes an event moved in Calendar back into its row. Returns true when the
// day changed and the sheet needs re-sorting.
function pullEventIntoRow_(sheet, row, event, values, tz) {
  const allDay = event.isAllDayEvent();
  const start = allDay ? event.getAllDayStartDate() : event.getStartTime();
  const date = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
  const startText = allDay ? '' : Utilities.formatDate(start, tz, 'HH:mm');
  const endText = allDay ? '' : Utilities.formatDate(event.getEndTime(), tz, 'HH:mm');

  sheet.getRange(row, COL.VOLSOC_START).setValue(startText);
  sheet.getRange(row, COL.VOLSOC_END).setValue(endText);

  const dateCell = sheet.getRange(row, COL.DATE);
  const sheetDate = dateKey_(values[COL.DATE - 1], tz);
  if (date === sheetDate) {
    dateCell.clearNote();
    event.setTag('volsocSyncedTime', eventStamp_(event, tz));
    return false;
  }

  // The Date column belongs to the Social Impact feed on rows that came from
  // it, so moving one of those to another day would only be undone at the next
  // sync. Keep the new time, put the day back, and say so on the cell.
  if (String(values[COL.EVENT_KEY - 1])) {
    dateCell.setNote(
      `The calendar event was moved to ${date}, but this row follows a Social Impact event on ${sheetDate}. ` +
        'The day has been put back and the new time kept — move the union event, or split this out into its own row.'
    );
    if (/^\d{4}-\d{2}-\d{2}$/.test(sheetDate)) moveEventToDate_(event, sheetDate, allDay, startText, endText, tz);
    else event.setTag('volsocSyncedTime', eventStamp_(event, tz));
    return false;
  }

  dateCell.setValue(date).clearNote();
  event.setTag('volsocSyncedTime', eventStamp_(event, tz));
  return true;
}

// Puts an event back on a given day, keeping the time of day it was moved to.
function moveEventToDate_(event, date, allDay, startText, endText, tz) {
  const at = (hhmm) => Utilities.parseDate(`${date} ${hhmm}`, tz, 'yyyy-MM-dd HH:mm');
  if (allDay) {
    event.setAllDayDate(at('00:00'));
  } else {
    const start = at(startText);
    let end = at(endText);
    if (end <= start) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    event.setTime(start, end);
  }
  event.setTag('volsocSyncedTime', eventStamp_(event, tz));
}

function docUrl_(sheet, row) {
  const rich = sheet.getRange(row, COL.DOC).getRichTextValue();
  const url = rich ? rich.getLinkUrl() : '';
  return /^https:\/\/docs\.google\.com\//.test(url || '') ? url : '';
}

function eventUrl_(event, calendar) {
  return eventUrlFromIds_(event.getId(), calendar.getId());
}

// Calendar's own link format: base64 of "<event id without @google.com> <calendar id>".
function eventUrlFromIds_(eventId, calendarId) {
  const eid = Utilities.base64EncodeWebSafe(`${eventId.split('@')[0]} ${calendarId}`).replace(/=+$/, '');
  return `https://calendar.google.com/calendar/event?eid=${eid}`;
}

function calendarDetails_(values, text, docUrl, tz) {
  const date = dateKey_(values[COL.DATE - 1], tz);
  const name = text[COL.VOLSOC_EVENT - 1].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'add a date.' };
  if (!name) return { error: 'add a Volsoc Event name.' };

  const at = (hhmm) => Utilities.parseDate(`${date} ${hhmm}`, tz, 'yyyy-MM-dd HH:mm');
  const startText = timeKey_(text[COL.VOLSOC_START - 1]);
  const endText = timeKey_(text[COL.VOLSOC_END - 1]);
  const isTime = (t) => /^\d{2}:\d{2}$/.test(t);

  const union = text[COL.UNION_EVENT - 1];
  const lines = [];
  if (union) {
    const unionTime = timeRange_(text[COL.UNION_START - 1], text[COL.UNION_END - 1]);
    const where = text[COL.LOCATION - 1];
    lines.push(`Follows the Social Impact event: ${union}${unionTime ? `, ${unionTime}` : ''}${where ? `, ${where}` : ''}`);
    if (text[COL.LINK - 1]) lines.push(text[COL.LINK - 1]);
  }
  if (COL.LEAD && text[COL.LEAD - 1]) lines.push(`Activity lead: ${text[COL.LEAD - 1]}`);
  if (docUrl) lines.push(`Planning doc: ${docUrl}`);
  lines.push('', 'Provisional — not confirmed yet.');
  lines.push('', 'Managed from the Volsoc Master Plan sheet. Edit the sheet, not this event.');

  const details = { title: `[Provisional] ${name}`, description: lines.join('\n') };
  if (!isTime(startText)) {
    return { ...details, allDay: true, start: at('00:00') };
  }
  const start = at(startText);
  let end = isTime(endText) ? at(endText) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  if (end <= start) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { ...details, allDay: false, start, end };
}

// Events whose row was deleted from the sheet. Only upcoming ones, and only
// ones this script made (tagged with a row ID).
function removeOrphanCalendarEvents_(sheet, from) {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('VOLSOC_CALENDAR_ID')) return;
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const known = new Set(
    sheet.getRange(2, COL.CALENDAR_EVENT_ID, rows, 1).getValues().map((r) => String(r[0])).filter(Boolean)
  );
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + 1);
  volsocCalendar_()
    .getEvents(from, until)
    .filter((event) => event.getTag('volsocRowId') && !known.has(event.getId()))
    .forEach((event) => event.deleteEvent());
}

// Every row with content shows an Add to calendar checkbox, or an In
// calendar link once its event exists, with a Remove event checkbox beside
// it. The column is script-owned: dropdowns and anything typed are replaced,
// except that a cell cleared by hand is handled by handleEdit first.
function refreshCalendarButtons_(sheet) {
  if (!COL.CALENDAR) return;
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  const range = sheet.getRange(2, COL.CALENDAR, rows, 1);
  const current = range.getRichTextValues();
  const fills = range.getBackgrounds();
  const chipFills = [BUTTON_BOX.fill, ...Object.values(CALENDAR_CHIPS).map((chip) => chip.fill)];
  const calendarId = PropertiesService.getScriptProperties().getProperty('VOLSOC_CALENDAR_ID');
  const pending = pendingDeletes_('removeEvent', values.map((row) => String(row[COL.ROW_ID - 1])));

  const plan = values.map((row, i) => {
    const raw = row[COL.CALENDAR - 1];
    const text = current[i][0] ? current[i][0].getText() : '';
    const link = current[i][0] ? current[i][0].getLinkUrl() : null;
    const eventId = String(row[COL.CALENDAR_EVENT_ID - 1]);
    if (eventId && calendarId) {
      const chip = pending.has(String(row[COL.ROW_ID - 1])) ? CALENDAR_CHIPS.confirm : CALENDAR_CHIPS.added;
      return { kind: 'chip', chip, url: eventUrlFromIds_(eventId, calendarId), text, link };
    }
    if (hasContent_(row)) return { kind: 'box', raw };
    return { kind: raw === '' ? 'keep' : 'clear' };
  });

  range.setDataValidations(plan.map((p) => [p.kind === 'box' ? checkboxRule_() : null]));
  plan.forEach((p, i) => {
    const cell = sheet.getRange(i + 2, COL.CALENDAR);
    if (p.kind === 'chip') {
      if (p.text !== p.chip.label || p.link !== p.url) cell.setRichTextValue(docChip_(p.chip, p.url));
      fills[i][0] = p.chip.fill;
    } else if (p.kind === 'box') {
      if (p.raw !== false) cell.setValue(false).setFontColor(BUTTON_BOX.text).setFontWeight('normal');
      fills[i][0] = BUTTON_BOX.fill;
    } else {
      if (p.kind === 'clear') cell.clearContent();
      if (chipFills.includes(fills[i][0])) fills[i][0] = null;
    }
  });

  range
    .setBackgrounds(fills)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  refreshDeleteColumn_(sheet, COL.REMOVE_EVENT, plan.map((p, i) => deleteCellState_(p, values[i])));
}

// The Provisional / Confirmed dropdown had colour rules of its own.
function removeCalendarStatusRules_(sheet) {
  if (!COL.CALENDAR) return;
  const rules = sheet.getConditionalFormatRules();
  const kept = rules.filter((rule) => {
    const condition = rule.getBooleanCondition();
    const isStatusRule =
      condition &&
      condition.getCriteriaType() === SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO &&
      LEGACY_CALENDAR_VALUES.includes(condition.getCriteriaValues()[0]) &&
      rule.getRanges().some((r) => r.getColumn() === COL.CALENDAR);
    return !isStatusRule;
  });
  if (kept.length !== rules.length) sheet.setConditionalFormatRules(kept);
}

// ── Planning docs ─────────────────────────────────────────────────────────

// What the web app can do to a row. Every action returns { url, existed },
// where existed means the row was already in the state asked for.
const ROW_ACTIONS = {
  doc: { title: 'VolSoc — create doc', run: (row) => createDocForRow_(row) },
  calendar: { title: 'VolSoc — add to calendar', run: (row) => addToCalendarForRow_(row) },
  deleteDoc: { title: 'VolSoc — delete doc', run: (row) => deleteDocForRow_(row) },
  removeCalendar: { title: 'VolSoc — remove from calendar', run: (row) => removeCalendarForRow_(row) },
};

// Clicking a Create doc or Add to calendar link lands here, as do the delete
// menu items. The page itself changes nothing: its script calls runRowAction
// once it loads in a browser, so a link preview or crawler fetching the URL
// can't make or delete anything. It runs as the script owner, so anyone on
// the committee can delete docs and events the owner's account made.
function doGet(e) {
  const params = (e && e.parameter) || {};
  const template = HtmlService.createTemplateFromFile('CreateDoc');
  template.rowId = params.row || '';
  template.action = ROW_ACTIONS[params.action] ? params.action : 'doc';
  return template
    .evaluate()
    .setTitle(ROW_ACTIONS[template.action].title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function runRowAction(action, rowId) {
  const sheet = getSheet_();
  const rows = sheet.getLastRow() - 1;
  const ids = rows > 0 ? sheet.getRange(2, COL.ROW_ID, rows, 1).getValues() : [];
  const i = ids.findIndex((r) => String(r[0]) === String(rowId));
  if (!rowId || i === -1) {
    throw new Error('Could not find that row — it may have been deleted. Refresh the sheet and try again.');
  }
  return withSheetLock_(() => (ROW_ACTIONS[action] || ROW_ACTIONS.doc).run(i + 2));
}

// The row actions expect the document lock to be held already, as it is in
// handleEdit, so the web app and menu take it here.
function withSheetLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('The sheet is busy syncing — try again in a moment.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ── Deleting docs and events ──────────────────────────────────────────────

// Each planning doc carries "Remove from VolSoc calendar" and "Delete this
// doc" links to the web app, which runs as the script owner, so anyone on the
// committee can use them. The web app page asks before doing either.
const DOC_CONTROLS = {
  marker: 'Delete this doc',
  colour: '#d62246',
};

function rowActionUrl_(action, rowId) {
  return `${CONFIG.WEB_APP_URL}?action=${action}&row=${encodeURIComponent(rowId)}`;
}

// Inserts the links as a small line at `index` in the doc body.
function insertDocControls_(body, index, rowId) {
  const links = [
    ['Remove from VolSoc calendar', rowActionUrl_('removeCalendar', rowId)],
    [DOC_CONTROLS.marker, rowActionUrl_('deleteDoc', rowId)],
  ];
  const separator = '  ·  ';
  const line = links.map(([label]) => label).join(separator);
  const paragraph =
    index >= body.getNumChildren() ? body.appendParagraph(line) : body.insertParagraph(index, line);
  paragraph.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  const text = paragraph.editAsText().setFontSize(9).setItalic(false).setForegroundColor('#6e6b7c');
  let at = 0;
  links.forEach(([label, url]) => {
    text.setLinkUrl(at, at + label.length - 1, url).setForegroundColor(at, at + label.length - 1, DOC_CONTROLS.colour);
    at += label.length + separator.length;
  });
}

// Docs made before the links existed get them once, just under the subtitle.
// Meant for the hourly sync, which runs as the owner of the docs; if any doc
// can't be edited (say a sync started by someone else) it tries again next time.
function addDocControlsToExistingDocs_(sheet) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DOC_CONTROLS_ADDED')) return;
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const ids = sheet.getRange(2, COL.ROW_ID, rows, 1).getValues();
  let failed = 0;

  ids.forEach(([rowId], i) => {
    const url = docUrl_(sheet, i + 2);
    if (!url || !rowId) return;
    try {
      const doc = DocumentApp.openByUrl(url);
      const body = doc.getBody();
      if (body.findText(DOC_CONTROLS.marker)) return;
      const paragraphs = body.getParagraphs();
      const subtitle = paragraphs.findIndex((p) => p.getHeading() === DocumentApp.ParagraphHeading.SUBTITLE);
      const index = subtitle === -1 ? 0 : body.getChildIndex(paragraphs[subtitle]) + 1;
      insertDocControls_(body, index, String(rowId));
      doc.saveAndClose();
    } catch (err) {
      failed++;
      console.warn(`Couldn't add delete links to ${url}: ${err.message}`);
    }
  });
  if (!failed) props.setProperty('DOC_CONTROLS_ADDED', new Date().toISOString());
}

// Trashes rather than deletes, so a doc removed by mistake can be restored
// from Drive for 30 days.
function deleteDocForRow_(row) {
  const sheet = getSheet_();
  const url = docUrl_(sheet, row);
  if (!url) return { url: sheetUrl_(sheet, row), existed: true };

  const id = (/\/d\/([\w-]+)/.exec(url) || [])[1];
  if (id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
    } catch (err) {
      // Already deleted by hand, or a doc someone else owns and pasted in.
      if (!/not found|no item/i.test(err.message)) {
        throw new Error(`Couldn't move the doc to the trash — ${err.message}`);
      }
    }
  }

  sheet.getRange(row, COL.DOC).clearContent();
  refreshDocButtons_(sheet);
  // Drops the planning doc line from the event description.
  if (COL.CALENDAR) syncCalendarRows_(sheet, [row]);
  SpreadsheetApp.flush();
  return { url: sheetUrl_(sheet, row), existed: false };
}

function removeCalendarForRow_(row) {
  const sheet = getSheet_();
  if (!COL.CALENDAR) throw new Error('The sheet has no VolSoc Calendar column.');
  const idCell = sheet.getRange(row, COL.CALENDAR_EVENT_ID);
  const eventId = String(idCell.getValue());
  if (!eventId) return { url: sheetUrl_(sheet, row), existed: true };

  const event = volsocCalendar_().getEventById(eventId);
  if (event) event.deleteEvent();
  idCell.clearContent();
  refreshCalendarButtons_(sheet);
  SpreadsheetApp.flush();
  return { url: sheetUrl_(sheet, row), existed: false };
}

function sheetUrl_(sheet, row) {
  return `${spreadsheet_().getUrl()}#gid=${sheet.getSheetId()}&range=A${row}`;
}

// Links made before the calendar button still call this name.
function createDocFromWebApp(rowId) {
  return runRowAction('doc', rowId);
}

function createDocForSelectedRow() {
  const ss = spreadsheet_();
  const range = SpreadsheetApp.getActiveRange();
  if (range.getSheet().getName() !== CONFIG.SHEET_NAME || range.getRow() < 2) {
    SpreadsheetApp.getUi().alert(`Select a row in ${CONFIG.SHEET_NAME} first.`);
    return;
  }
  const result = withSheetLock_(() => createDocForRow_(range.getRow()));
  ss.toast(result.existed ? 'This row already has a doc.' : 'Doc created.', 'VolSoc');
}

// Returns { url, existed }. Throws with a readable message on failure.
function createDocForRow_(row) {
  const ss = spreadsheet_();
  const sheet = getSheet_();
  const cell = sheet.getRange(row, COL.DOC);

  const existingUrl = docUrl_(sheet, row);
  if (existingUrl) return { url: existingUrl, existed: true };

  const tz = ss.getSpreadsheetTimeZone();
  const values = sheet.getRange(row, 1, 1, COL.WIDTH).getValues()[0];
  const text = sheet.getRange(row, 1, 1, COL.WIDTH).getDisplayValues()[0];
  const optional = (col) => (col ? text[col - 1] : '');
  const info = {
    date: dateKey_(values[COL.DATE - 1], tz),
    unionEvent: text[COL.UNION_EVENT - 1],
    unionTime: timeRange_(text[COL.UNION_START - 1], text[COL.UNION_END - 1]),
    location: text[COL.LOCATION - 1],
    link: text[COL.LINK - 1],
    volsocEvent: text[COL.VOLSOC_EVENT - 1],
    volsocTime: timeRange_(text[COL.VOLSOC_START - 1], text[COL.VOLSOC_END - 1]),
    whatsOn: optional(COL.WHATSON),
    socialPost: optional(COL.SOCIAL_POST),
    committee: committeeSummary_(sheet, text) || optional(COL.COMMITTEE),
    lead: optional(COL.LEAD),
  };
  if (!info.date && !info.unionEvent && !info.volsocEvent) {
    throw new Error('This row is empty — nothing to make a doc from.');
  }

  const name = [info.date, 'VolSoc', info.volsocEvent || info.unionEvent || 'event'].filter(Boolean).join(' – ');
  const doc = DocumentApp.create(name);
  try {
    writePlanningDoc_(doc, info, String(values[COL.ROW_ID - 1]));
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(docFolder_(ss));
  } catch (err) {
    // Don't leave a half-written doc lying around in My Drive.
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    throw err;
  }

  cell.clearDataValidations().setRichTextValue(docChip_(DOC_CHIPS.open, doc.getUrl())).setBackground(DOC_CHIPS.open.fill);
  refreshDocButtons_(sheet); // puts the Delete doc box beside it
  SpreadsheetApp.flush();
  return { url: doc.getUrl(), name, existed: false };
}

function writePlanningDoc_(doc, info, rowId) {
  const body = doc.getBody();
  const tbc = 'TBC';

  // Paragraph.setText returns nothing, so it can't be chained.
  const title = body.getParagraphs()[0];
  title.setText(info.volsocEvent || 'VolSoc event — name TBC');
  title.setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph([formatDay_(info.date), info.volsocTime].filter(Boolean).join(' · '))
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
  if (rowId) insertDocControls_(body, body.getNumChildren(), rowId);

  body.appendParagraph('At a glance').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  factTable_(body, [
    ['Date', formatDay_(info.date) || tbc],
    ['Time', info.volsocTime || tbc],
    ['Activity lead', info.lead || tbc],
    ['Committee present', info.committee || tbc],
    ['Meeting point', info.unionEvent ? `After the Social Impact event — ${info.location || 'location TBC'}` : tbc],
    ["What's On listing", info.whatsOn || 'Not created yet'],
    ['Canva post', info.socialPost || 'Not made yet'],
  ]);

  if (info.unionEvent) {
    body.appendParagraph('Social Impact event this follows').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    factTable_(body, [
      ['Event', info.unionEvent],
      ['Time', info.unionTime || tbc],
      ['Location', info.location || tbc],
      ['Listing', info.link || '—'],
    ]);
  }

  body.appendParagraph('Timings').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const timings = [['Time', 'What']];
  if (info.unionEvent && info.unionTime) timings.push([info.unionTime, `Social Impact: ${info.unionEvent}`]);
  timings.push([info.volsocTime ? info.volsocTime.split('–')[0] : '', 'Meet and head off']);
  timings.push(['', info.volsocEvent || 'Main activity']);
  timings.push([info.volsocTime ? info.volsocTime.split('–')[1] || '' : '', 'Finish']);
  const table = body.appendTable(timings);
  table.getRow(0).editAsText().setBold(true);

  section_(body, 'Plan', 'What are we doing, and what does someone joining straight from the Social Impact event need to know?');
  section_(body, 'Getting there', 'Route from the meeting point, travel time and cost, step-free access.');
  section_(body, 'Costs', 'Entry, travel, anything we are covering.');
  section_(body, 'Risks and accessibility', 'Anything the activity lead should plan around.');
  section_(body, 'Notes', '');
}

function factTable_(body, rows) {
  const table = body.appendTable(rows);
  table.setColumnWidth(0, 140);
  rows.forEach((row, r) => {
    table.getCell(r, 0).editAsText().setBold(true);
    if (/^https?:\/\//.test(row[1])) table.getCell(r, 1).editAsText().setLinkUrl(row[1]);
  });
}

function section_(body, heading, prompt) {
  body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const paragraph = body.appendParagraph(prompt).setHeading(DocumentApp.ParagraphHeading.NORMAL);
  if (prompt) paragraph.editAsText().setItalic(true).setForegroundColor('#6e6b7c');
}

function timeRange_(start, end) {
  const s = start ? timeKey_(start) : '';
  const e = end ? timeKey_(end) : '';
  return s && e ? `${s}–${e}` : s;
}

function formatDay_(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE d MMMM yyyy');
}

function docFolder_(ss) {
  if (CONFIG.DOC_FOLDER_ID) return DriveApp.getFolderById(CONFIG.DOC_FOLDER_ID);
  const parents = DriveApp.getFileById(ss.getId()).getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

// ── Sheet helpers ─────────────────────────────────────────────────────────

// Opened by ID rather than getActiveSpreadsheet so the web app, which has no
// active spreadsheet, uses the same code path as the menu and triggers.
function spreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_() {
  const sheet = spreadsheet_().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error(`No sheet called "${CONFIG.SHEET_NAME}".`);
  COL = resolveColumns_(sheet);
  return sheet;
}

function resolveColumns_(sheet) {
  let headers = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0].map((h) => String(h).trim());
  const find = (name, from = 0) => headers.indexOf(name, from) + 1;

  // The event key keeps a row tied to its feed event when the title, time or
  // date changes; the row ID lets a Create doc link find its row after a sort.
  Object.values(HIDDEN_HEADERS).forEach((name) => {
    if (find(name)) return;
    const col = Math.max(sheet.getLastColumn(), 1) + 1;
    if (col > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
    sheet.getRange(1, col).setValue(name);
    sheet.hideColumns(col);
    headers[col - 1] = name;
  });

  const col = {};
  const missing = [];
  Object.entries(REQUIRED_HEADERS).forEach(([key, spec]) => {
    const [name, after] = Array.isArray(spec) ? spec : [spec];
    col[key] = find(name, after ? col[after] : 0);
    if (!col[key]) missing.push(after ? `"${name}" after "${REQUIRED_HEADERS[after]}"` : `"${name}"`);
  });
  if (missing.length) {
    throw new Error(`Can't find these column headers in ${CONFIG.SHEET_NAME}: ${missing.join(', ')}. Rename them back or update REQUIRED_HEADERS in the script.`);
  }
  Object.entries(OPTIONAL_HEADERS).forEach(([key, names]) => {
    col[key] = names.map((name) => find(name)).find(Boolean) || 0;
  });
  Object.entries(HIDDEN_HEADERS).forEach(([key, name]) => (col[key] = find(name)));

  // A missing checkbox column is inserted beside its column. That shifts every
  // column to its right, so the headers are looked up again from scratch.
  const toInsert = Object.values(DELETE_HEADERS).find(([name, beside]) => col[beside] && !find(name));
  if (toInsert) {
    const at = col[toInsert[1]] + 1;
    sheet.insertColumnAfter(at - 1);
    sheet.getRange(1, at).setValue(toInsert[0]).setWrap(true);
    sheet.setColumnWidth(at, DELETE_COLUMN_WIDTH);
    return resolveColumns_(sheet);
  }
  Object.entries(DELETE_HEADERS).forEach(([key, [name]]) => (col[key] = find(name)));

  // The committee columns belong with the VolSoc event, right of its end
  // time. The script knows its own by the note on their header rather than by
  // where they sit or what they're called, so they can be renamed, and were
  // moved here from beside "Committee Present" without losing their ticks.
  const notes = sheet.getRange(1, 1, 1, headers.length).getNotes()[0];
  const ours = [];
  notes.forEach((note, i) => {
    if (COMMITTEE_MARKERS.some((marker) => note.includes(marker))) ours.push(i + 1);
  });
  const anchor = col.VOLSOC_END;
  if (ours.length && ours[0] !== anchor + 1 && !COMMITTEE_MOVED) {
    COMMITTEE_MOVED = true;
    sheet.moveColumns(sheet.getRange(1, ours[0], 1, ours.length), anchor + 1);
    return resolveColumns_(sheet);
  }
  if (ours.length < COMMITTEE_COLUMNS) {
    const at = (ours.length ? ours[ours.length - 1] : anchor) + 1;
    sheet.insertColumnAfter(at - 1);
    sheet
      .getRange(1, at)
      .setValue(COMMITTEE_HEADERS[ours.length])
      .setWrap(true)
      .setNote(COMMITTEE_NOTE);
    sheet.setColumnWidth(at, COMMITTEE_COLUMN_WIDTH);
    return resolveColumns_(sheet);
  }
  col.COMMITTEE_FIRST = ours[0];
  col.COMMITTEE_LAST = ours[0] + COMMITTEE_COLUMNS - 1;

  col.WIDTH = Math.max(...Object.values(col));
  return col;
}

function columnLetter_(col) {
  let letters = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}
