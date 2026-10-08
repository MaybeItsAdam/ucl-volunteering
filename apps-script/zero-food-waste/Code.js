/**
 * Zero Food Waste log — appends a shift from uclvolunteering.org/zero-food-waste
 * to the team's tracking sheet.
 *
 * The web app (src/app/api/zero-food-waste) POSTs
 *   { secret, row: { date: "YYYY-MM-DD", values: { "<column heading>": value } } }
 * and this writes one row: the date in "Date", each value under the column
 * whose heading starts with that text. Columns are found by heading each time,
 * so the team can move, add or widen columns freely; renaming one the site
 * writes to stops the log with a message naming it.
 *
 * Deploy with `npm run deploy` from this folder: push, then update the one
 * web app deployment, so the /exec URL (ZFW_SHEET_WEBHOOK_URL in Doppler)
 * stays the same.
 *
 * The shared secret is ZFW_SHEET_SECRET in Doppler, and here either the
 * ZFW_SECRET script property or ZFW_SECRET_FILE in Secret.js (pushed, never
 * committed). The property wins, so it can be rotated in the editor.
 *
 * Once, as the deploying account (which must be able to edit the sheet): open
 * the project, run checkSetup, and allow access. Until then every log fails.
 */

const ZFW = {
  SPREADSHEET_ID: '1u3fxsT_OfxwZd7-lYAkhgMWsUutjx5O9jpMORYxHvM8',
  // The tab to log to; blank means the first one.
  SHEET_NAME: '',
  HEADER_ROW: 1,
  DATE_HEADER: 'Date',
  // How the sheet already shows dates: "1-Oct".
  DATE_FORMAT: 'd-mmm',
};

/** "Main\n(e.g. Sandwiches…)" and "Other baked goods (e.g. …)" → "main", "other baked goods". */
function normaliseHeading_(text) {
  return String(text).split('\n')[0].replace(/\(.*$/, '').trim().toLowerCase();
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function secret_() {
  const property = PropertiesService.getScriptProperties().getProperty('ZFW_SECRET');
  if (property) return property;
  return typeof ZFW_SECRET_FILE === 'string' && ZFW_SECRET_FILE ? ZFW_SECRET_FILE : null;
}

/**
 * Run once from the editor: asks for access to the sheet, then logs whether
 * the columns the site writes to are there.
 */
function checkSetup() {
  const ss = SpreadsheetApp.openById(ZFW.SPREADSHEET_ID);
  const sheet = ZFW.SHEET_NAME ? ss.getSheetByName(ZFW.SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('No tab called ' + ZFW.SHEET_NAME);
  const headings = sheet.getRange(ZFW.HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0].map(normaliseHeading_);
  const wanted = [ZFW.DATE_HEADER, 'Outlet', 'Shift Leader', 'Main', 'Fruit pots & Yogurt pots', 'Pastries / Pasties',
    'Other baked goods', 'Snacks', 'Fruit', 'Others', 'Total', 'Incentives'];
  const missing = wanted.filter((h) => headings.indexOf(normaliseHeading_(h)) === -1);
  Logger.log('Tab: ' + sheet.getName());
  Logger.log(missing.length ? 'Missing columns: ' + missing.join(', ') : 'Every column the site writes to is there');
  Logger.log(secret_() ? 'Secret: set' : 'Secret: NOT set — add ZFW_SECRET under Project Settings → Script Properties');
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Body was not JSON' });
  }
  const secret = secret_();
  if (!secret || body.secret !== secret) return json_({ ok: false, error: 'Not allowed' });

  const row = body.row || {};
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date || '');
  if (!day) return json_({ ok: false, error: 'No date' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(ZFW.SPREADSHEET_ID);
    const sheet = ZFW.SHEET_NAME ? ss.getSheetByName(ZFW.SHEET_NAME) : ss.getSheets()[0];
    if (!sheet) return json_({ ok: false, error: 'No tab called ' + ZFW.SHEET_NAME });

    const width = sheet.getLastColumn();
    const headings = sheet.getRange(ZFW.HEADER_ROW, 1, 1, width).getValues()[0].map(normaliseHeading_);
    const columnOf = (heading) => headings.indexOf(normaliseHeading_(heading));

    const cells = new Array(width).fill('');
    const dateCol = columnOf(ZFW.DATE_HEADER);
    if (dateCol === -1) return json_({ ok: false, error: 'The sheet has no "' + ZFW.DATE_HEADER + '" column' });
    cells[dateCol] = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));

    const missing = [];
    Object.keys(row.values || {}).forEach((heading) => {
      const col = columnOf(heading);
      if (col === -1) missing.push(heading);
      else cells[col] = row.values[heading];
    });
    if (missing.length) return json_({ ok: false, error: 'The sheet has no column for: ' + missing.join(', ') });

    sheet.appendRow(cells);
    sheet.getRange(sheet.getLastRow(), dateCol + 1).setNumberFormat(ZFW.DATE_FORMAT);
    return json_({ ok: true, row: sheet.getLastRow() });
  } finally {
    lock.releaseLock();
  }
}
