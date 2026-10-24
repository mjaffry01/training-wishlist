/**
 * Training Wish List — Google Apps Script backend.
 *
 * The bound Google Sheet is the database. Each person gets one row:
 *   Name | Wishes | Updated
 * Submitting again with the same name (case-insensitive) updates that row.
 *
 * Deployed as a Web app (see appsscript.json):
 *   Execute as: Me    Who has access: Anyone
 * Run setup() once from the editor to authorize the script.
 */

const SHEET_NAME = 'Wishes';
const HEADERS = ['Name', 'Wishes', 'Updated'];
const MAX_NAME = 60;
const MAX_WISHES = 2000;
const MAX_ENTRIES = 200;          // hard cap on rows, protects the sheet from spam
const MAX_WRITES_PER_MIN = 30;    // global write throttle (no per-user identity without login)
const CACHE_KEY = 'entries';
const CACHE_SECONDS = 30;

/** Run once from the Apps Script editor to create the sheet and grant permissions. */
function setup() {
  getSheet_();
  Logger.log('Ready: %s', SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 480);
    sheet.getRange('B:B').setWrap(true);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Drop control characters (keep newlines and tabs) and trim.
function clean_(value, max) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

// Stop spreadsheet formula injection (values starting with = + - @).
function safe_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function unsafe_(value) {
  const s = String(value == null ? '' : value);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

function readAll_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        name: unsafe_(r[0]),
        wishes: unsafe_(r[1]),
        updated: r[2] instanceof Date ? r[2].toISOString() : String(r[2])
      };
    });
}

function readCached_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const entries = readAll_();
  const payload = JSON.stringify(entries);
  if (payload.length < 90000) cache.put(CACHE_KEY, payload, CACHE_SECONDS);
  return entries;
}

// Counts writes in the current minute; returns false once the limit is hit.
function underRateLimit_() {
  const cache = CacheService.getScriptCache();
  const key = 'writes-' + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0);
  if (count >= MAX_WRITES_PER_MIN) return false;
  cache.put(key, String(count + 1), 120);
  return true;
}

/** GET → returns every entry as JSON. */
function doGet() {
  try {
    return json_({ ok: true, entries: readCached_() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'The board is temporarily unavailable.' });
  }
}

/**
 * POST body (sent as text/plain to avoid CORS preflight):
 *   { "name": "...", "wishes": "...", "website": "" }
 * "website" is a honeypot field that real users never fill in.
 */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Invalid request.' });
  }

  try {
    if (data.website) return json_({ ok: true, entries: readCached_() });

    const name = clean_(data.name, MAX_NAME).replace(/\s+/g, ' ');
    const wishes = clean_(data.wishes, MAX_WISHES);
    if (!name) return json_({ ok: false, error: 'Please enter your name.' });
    if (!wishes) return json_({ ok: false, error: 'Please enter at least one wish.' });
    if (!underRateLimit_()) {
      return json_({ ok: false, error: 'Lots of people are saving right now. Please try again in a minute.' });
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return json_({ ok: false, error: 'The board is busy. Please try again.' });
    }
    try {
      const sheet = getSheet_();
      const lastRow = sheet.getLastRow();
      const now = new Date();
      let rowIndex = -1;

      if (lastRow >= 2) {
        const names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < names.length; i++) {
          if (unsafe_(names[i][0]).trim().toLowerCase() === name.toLowerCase()) {
            rowIndex = i + 2;
            break;
          }
        }
      }

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 2, 1, 2).setValues([[safe_(wishes), now]]);
      } else {
        if (lastRow - 1 >= MAX_ENTRIES) {
          return json_({ ok: false, error: 'The board is full. Please contact the organiser.' });
        }
        sheet.appendRow([safe_(name), safe_(wishes), now]);
      }
      SpreadsheetApp.flush();
      CacheService.getScriptCache().remove(CACHE_KEY);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true, entries: readCached_() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Could not save right now. Please try again.' });
  }
}
