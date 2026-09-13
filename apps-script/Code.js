/**
 * Volsoc Master Plan — bound to the "Volsoc Master Plan" spreadsheet.
 *
 * - syncFromGoogleCalendar: pulls every event run by the UCL Student Social
 *   Impact organiser from Adam's Campus Toolbox's iCal feed into Sheet1, updating rows it already knows and adding new ones,
 *   then keeps the sheet in date order. VolSoc-only rows (no Union Event) are
 *   never touched.
 * - Doc Detail "＋ Create doc" button: a link to this script's web app, which
 *   drafts a planning doc from that row and puts the doc's link in the cell.
 * - VolSoc Calendar dropdown: Provisional or Confirmed puts the row's VolSoc
 *   event in the shared "VolSoc" Google Calendar and keeps it in step with the
 *   sheet; clearing it removes the event.
 * - A thick rule under the last row of each day.
 * - setup: run once from the VolSoc menu to add formatting, buttons and triggers.
 *
 * Source of truth is apps-script/ in the ucl-volunteering repo; deploy with
 * `npm run deploy` from that folder (push + update the web app deployment).
 */

const CONFIG = {
  SPREADSHEET_ID: '1QRxAfvIjHU_23beHWh-cd2oV7a1bk1bhdQPYGYMPBXA',
  // The /exec URL of the web app deployment the Create doc buttons point at.
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
  COMMITTEE: ['Committee Present'],
  LEAD: ['Activity Lead?', 'Activity Lead'],
  CALENDAR: ['VolSoc Calendar'],
};
// Script-owned columns, created hidden at the end of the sheet if missing.
const HIDDEN_HEADERS = {
  EVENT_KEY: 'Calendar Event Key',
  ROW_ID: 'Row ID',
  CALENDAR_EVENT_ID: 'VolSoc Calendar Event ID',
};
// The fields the feed owns, in eventFields_ order.
const FEED_COLUMNS = ['DATE', 'UNION_EVENT', 'UNION_START', 'UNION_END', 'LOCATION', 'LINK'];

// 1-based column numbers for this run, filled in by getSheet_. Optional
// columns that aren't in the sheet are 0. WIDTH covers every known column.
let COL = null;

// Doc Detail cells are styled as chips: tinted fill, bold text, no underline.
const DOC_CHIPS = {
  create: { label: 'Create doc', text: '#007fff', fill: '#e5f2ff' },
  open: { label: 'Open doc ↗', text: '#444054', fill: '#e8f6ef' },
};
// Labels from earlier versions, recognised so they get restyled.
const LEGACY_CREATE_LABELS = ['＋ Create doc'];

const MISSING_VOLSOC_COLOUR = '#f4c7c3';

const CALENDAR_STATUS = {
  PROVISIONAL: { label: 'Provisional', fill: '#fff5d6' },
  CONFIRMED: { label: 'Confirmed', fill: '#e8f6ef' },
};

// Matches the rule under the header row.
const DAY_DIVIDER_COLOUR = '#051c33';

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
  addCalendarStatusRules_(sheet);
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
  const formula = `=AND($${g}2="",OR($${a}2<>"",$${b}2<>""))`;
  const rules = sheet.getConditionalFormatRules();
  const exists = rules.some((rule) => {
    const condition = rule.getBooleanCondition();
    return condition && condition.getCriteriaValues()[0] === formula;
  });
  if (exists) return;

  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula)
      .setBackground(MISSING_VOLSOC_COLOUR)
      .setRanges([sheet.getRange(2, COL.VOLSOC_EVENT, sheet.getMaxRows() - 1, 1)])
      .build()
  );
  sheet.setConditionalFormatRules(rules);
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
    refreshDocButtons_(sheet);
    refreshCalendarColumn_(sheet);
    refreshDayDividers_(sheet);
    lock.releaseLock();
  }
}

function sync_() {
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const sheet = getSheet_();

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

  if (newRows.length || datesChanged) sortByDate_(sheet);

  if (COL.CALENDAR) {
    const all = sheet.getLastRow() - 1;
    syncCalendarRows_(sheet, Array.from({ length: all }, (_, i) => i + 2));
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

function sortByDate_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 2) return;
  // Social Impact start time first, then VolSoc start time for VolSoc-only rows.
  sheet.getRange(2, 1, rows, sheet.getLastColumn()).sort([
    { column: COL.DATE, ascending: true },
    { column: COL.UNION_START, ascending: true },
    { column: COL.VOLSOC_START, ascending: true },
  ]);
}

// Every row with content gets a Create doc chip in Doc Detail, which becomes
// an Open doc chip once the doc exists. Rebuilt on each sync so sorted, pasted
// or hand-added rows always get one. Anything else typed into the cell is left
// alone.
function refreshDocButtons_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  const docRange = sheet.getRange(2, COL.DOC, rows, 1);
  const docs = docRange.getRichTextValues();
  const fills = docRange.getBackgrounds();
  const ids = values.map((row) => [String(row[COL.ROW_ID - 1]) || (hasContent_(row) ? Utilities.getUuid() : '')]);
  sheet.getRange(2, COL.ROW_ID, rows, 1).setValues(ids);
  docRange.clearDataValidations();

  values.forEach((row, i) => {
    const raw = row[COL.DOC - 1];
    // Rich text is null for non-text cells, e.g. the FALSE an old checkbox left.
    const text = docs[i][0] ? docs[i][0].getText() : '';
    const link = docs[i][0] ? docs[i][0].getLinkUrl() : null;
    const isCreate = text === DOC_CHIPS.create.label || LEGACY_CREATE_LABELS.includes(text);
    const isDoc = !isCreate && /^https:\/\/docs\.google\.com\//.test(link || '');
    const isBlank = raw === '' || typeof raw === 'boolean';
    const cell = sheet.getRange(i + 2, COL.DOC);
    const isChipFill = (fill) => [DOC_CHIPS.create.fill, DOC_CHIPS.open.fill].includes(fill);

    if (hasContent_(row) && (isBlank || isCreate)) {
      const url = createDocUrl_(ids[i][0]);
      if (text !== DOC_CHIPS.create.label || link !== url) cell.setRichTextValue(docChip_(DOC_CHIPS.create, url));
      fills[i][0] = DOC_CHIPS.create.fill;
    } else if (isDoc) {
      if (text !== DOC_CHIPS.open.label) cell.setRichTextValue(docChip_(DOC_CHIPS.open, link));
      fills[i][0] = DOC_CHIPS.open.fill;
    } else {
      if (isCreate || typeof raw === 'boolean') cell.clearContent();
      if (isChipFill(fills[i][0])) fills[i][0] = null;
    }
  });

  docRange
    .setBackgrounds(fills)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

function hasContent_(row) {
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

function createDocUrl_(rowId) {
  return `${CONFIG.WEB_APP_URL}?row=${encodeURIComponent(rowId)}`;
}

// ── Day dividers ──────────────────────────────────────────────────────────

// Sheets can't draw borders from conditional formatting, so the rules are
// redrawn after every sync and whenever a date is edited.
function refreshDayDividers_(sheet) {
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const dates = sheet.getRange(2, COL.DATE, rows, 1).getValues().map((r) => dateKey_(r[0], tz));
  const lastCol = columnLetter_(sheet.getLastColumn());
  const rowA1 = (row) => `A${row}:${lastCol}${row}`;

  const thin = [rowA1(rows + 2)];
  const thick = [];
  dates.forEach((date, i) => {
    (date !== '' && date !== dates[i + 1] ? thick : thin).push(rowA1(i + 2));
  });

  sheet.getRangeList(thin).setBorder(null, null, false, null, null, null);
  if (thick.length) {
    sheet
      .getRangeList(thick)
      .setBorder(null, null, true, null, null, null, DAY_DIVIDER_COLOUR, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
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

    if (touches(COL.DATE)) refreshDayDividers_(sheet);

    if (COL.CALENDAR && touches(COL.CALENDAR, COL.DATE, COL.VOLSOC_EVENT, COL.VOLSOC_START, COL.VOLSOC_END)) {
      const first = Math.max(range.getRow(), 2);
      const last = Math.min(range.getLastRow(), first + 99);
      syncCalendarRows_(sheet, Array.from({ length: last - first + 1 }, (_, i) => first + i));
    }
  } finally {
    lock.releaseLock();
  }
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

// Makes the calendar match the VolSoc Calendar column for the given rows: an
// event per Provisional or Confirmed row, none for a blank one. The sheet is
// the source of truth, so an event deleted in Calendar comes back while the
// row still asks for it.
function syncCalendarRows_(sheet, rowNumbers) {
  if (!rowNumbers.length) return;
  const tz = spreadsheet_().getSpreadsheetTimeZone();
  const first = Math.min(...rowNumbers);
  const count = Math.max(...rowNumbers) - first + 1;
  const values = sheet.getRange(first, 1, count, COL.WIDTH).getValues();
  const text = sheet.getRange(first, 1, count, COL.WIDTH).getDisplayValues();
  const docLinks = sheet.getRange(first, COL.DOC, count, 1).getRichTextValues();
  let calendar = null;

  rowNumbers.forEach((row) => {
    const i = row - first;
    const status = String(values[i][COL.CALENDAR - 1]).trim();
    const eventId = String(values[i][COL.CALENDAR_EVENT_ID - 1]);
    if (!status && !eventId) return;

    calendar = calendar || volsocCalendar_();
    const statusCell = sheet.getRange(row, COL.CALENDAR);
    const idCell = sheet.getRange(row, COL.CALENDAR_EVENT_ID);
    let event = eventId ? calendar.getEventById(eventId) : null;

    if (!status) {
      if (event) event.deleteEvent();
      idCell.clearContent();
      statusCell.clearNote();
      return;
    }

    const docRich = docLinks[i][0];
    const docUrl = docRich && /^https:\/\/docs\.google\.com\//.test(docRich.getLinkUrl() || '') ? docRich.getLinkUrl() : '';
    const details = calendarDetails_(values[i], text[i], status, docUrl, tz);
    if (details.error) {
      statusCell.setNote(`Not in the calendar yet: ${details.error}`);
      return;
    }
    if (statusCell.getNote()) statusCell.clearNote();

    if (!event) {
      event = details.allDay
        ? calendar.createAllDayEvent(details.title, details.start, { description: details.description })
        : calendar.createEvent(details.title, details.start, details.end, { description: details.description });
      event.setTag('volsocRowId', String(values[i][COL.ROW_ID - 1]));
      idCell.setValue(event.getId());
      return;
    }

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
    event.setTag('volsocRowId', String(values[i][COL.ROW_ID - 1]));
  });
}

function calendarDetails_(values, text, status, docUrl, tz) {
  const date = dateKey_(values[COL.DATE - 1], tz);
  const name = text[COL.VOLSOC_EVENT - 1].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'add a date.' };
  if (!name) return { error: 'add a Volsoc Event name.' };

  const confirmed = status === CALENDAR_STATUS.CONFIRMED.label;
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
  if (!confirmed) lines.push('', 'Provisional — not confirmed yet.');
  lines.push('', 'Managed from the Volsoc Master Plan sheet. Edit the sheet, not this event.');

  const details = {
    title: confirmed ? name : `[Provisional] ${name}`,
    description: lines.join('\n'),
  };
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

function refreshCalendarColumn_(sheet) {
  if (!COL.CALENDAR) return;
  const rows = sheet.getLastRow() - 1;
  if (rows < 1) return;
  const values = sheet.getRange(2, 1, rows, COL.WIDTH).getValues();
  const dropdown = SpreadsheetApp.newDataValidation()
    .requireValueInList([CALENDAR_STATUS.PROVISIONAL.label, CALENDAR_STATUS.CONFIRMED.label], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, COL.CALENDAR, rows, 1).setDataValidations(values.map((row) => [hasContent_(row) ? dropdown : null]));
}

function addCalendarStatusRules_(sheet) {
  if (!COL.CALENDAR) return;
  const rules = sheet.getConditionalFormatRules();
  const range = sheet.getRange(2, COL.CALENDAR, sheet.getMaxRows() - 1, 1);
  Object.values(CALENDAR_STATUS).forEach((status) => {
    const exists = rules.some((rule) => {
      const condition = rule.getBooleanCondition();
      return (
        condition &&
        condition.getCriteriaType() === SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO &&
        condition.getCriteriaValues()[0] === status.label &&
        rule.getRanges().some((r) => r.getColumn() === COL.CALENDAR)
      );
    });
    if (exists) return;
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status.label)
        .setBackground(status.fill)
        .setBold(true)
        .setRanges([range])
        .build()
    );
  });
  sheet.setConditionalFormatRules(rules);
}

// ── Planning docs ─────────────────────────────────────────────────────────

// Clicking a Create doc link lands here. The page itself creates nothing: its
// script calls createDocFromWebApp once it loads in a browser, so a link
// preview or crawler fetching the URL can't make docs.
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('CreateDoc');
  template.rowId = (e && e.parameter && e.parameter.row) || '';
  return template
    .evaluate()
    .setTitle('VolSoc — create doc')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function createDocFromWebApp(rowId) {
  const sheet = getSheet_();
  const rows = sheet.getLastRow() - 1;
  const ids = rows > 0 ? sheet.getRange(2, COL.ROW_ID, rows, 1).getValues() : [];
  const i = ids.findIndex((r) => String(r[0]) === String(rowId));
  if (!rowId || i === -1) {
    throw new Error('Could not find that row — it may have been deleted. Refresh the sheet and try again.');
  }
  return createDocForRow_(i + 2);
}

function createDocForSelectedRow() {
  const ss = spreadsheet_();
  const range = SpreadsheetApp.getActiveRange();
  if (range.getSheet().getName() !== CONFIG.SHEET_NAME || range.getRow() < 2) {
    SpreadsheetApp.getUi().alert(`Select a row in ${CONFIG.SHEET_NAME} first.`);
    return;
  }
  const result = createDocForRow_(range.getRow());
  ss.toast(result.existed ? 'This row already has a doc.' : 'Doc created.', 'VolSoc');
}

// Returns { url, existed }. Throws with a readable message on failure.
function createDocForRow_(row) {
  const ss = spreadsheet_();
  const sheet = getSheet_();
  const cell = sheet.getRange(row, COL.DOC);

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('The sheet is busy syncing — try again in a moment.');

  try {
    const current = cell.getRichTextValue();
    const existingUrl = /^https:\/\/docs\.google\.com\//.test(current.getLinkUrl() || '') ? current.getLinkUrl() : '';
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
      committee: optional(COL.COMMITTEE),
      lead: optional(COL.LEAD),
    };
    if (!info.date && !info.unionEvent && !info.volsocEvent) {
      throw new Error('This row is empty — nothing to make a doc from.');
    }

    const name = [info.date, 'VolSoc', info.volsocEvent || info.unionEvent || 'event'].filter(Boolean).join(' – ');
    const doc = DocumentApp.create(name);
    try {
      writePlanningDoc_(doc, info);
      doc.saveAndClose();
      DriveApp.getFileById(doc.getId()).moveTo(docFolder_(ss));
    } catch (err) {
      // Don't leave a half-written doc lying around in My Drive.
      DriveApp.getFileById(doc.getId()).setTrashed(true);
      throw err;
    }

    cell.setRichTextValue(docChip_(DOC_CHIPS.open, doc.getUrl())).setBackground(DOC_CHIPS.open.fill);
    SpreadsheetApp.flush();
    return { url: doc.getUrl(), name, existed: false };
  } finally {
    lock.releaseLock();
  }
}

function writePlanningDoc_(doc, info) {
  const body = doc.getBody();
  const tbc = 'TBC';

  // Paragraph.setText returns nothing, so it can't be chained.
  const title = body.getParagraphs()[0];
  title.setText(info.volsocEvent || 'VolSoc event — name TBC');
  title.setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph([formatDay_(info.date), info.volsocTime].filter(Boolean).join(' · '))
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

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
