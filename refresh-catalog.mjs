import { readFile, writeFile } from 'node:fs/promises';

const api = 'https://script.google.com/macros/s/AKfycbz6RuW2FKhvGSHQG6Hynshw4lngNRzZ3xf7gqQr2B_MXHUoN5VS7B628OCfdGcBdkwfww/exec';
const callback = '__yauteshuSnapshot';
const snapshotPath = 'catalog-data.js';

const response = await fetch(api + '?callback=' + callback + '&_=' + Date.now(), {
  redirect: 'follow',
  headers: { 'user-agent': 'yauteshu-catalog-snapshot/2.0' }
});
if (!response.ok) throw new Error('Catalog request failed: HTTP ' + response.status);

const body = (await response.text()).trim();
const prefix = callback + '(';
if (!body.startsWith(prefix) || !body.endsWith(');')) {
  throw new Error('Unexpected catalog response');
}

const wrappedPayload = body.slice(prefix.length, -2).trim();
const jsonStart = wrappedPayload.indexOf('{');
const jsonEnd = wrappedPayload.lastIndexOf('}');
if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('Catalog response has no JSON object');
const data = JSON.parse(wrappedPayload.slice(jsonStart, jsonEnd + 1));
if (!data || !Array.isArray(data.items)) throw new Error('Catalog has no items array');

const settings = data.settings || {};
// Пока обновлённая версия Apps Script ещё не развёрнута, новые настройки
// передаются через неиспользуемую витриной подпись скрытого статуса.
const settingsBridge = String(settings.TEXT_STATUS_HIDDEN || '');
const bridgeHours = settingsBridge.match(/(?:^|\|)snapshot_hours=([^|]+)/);
const bridgeForce = settingsBridge.match(/(?:^|\|)force=([^|]*)/);
const requestedHours = Number(String(
  settings.SNAPSHOT_REFRESH_HOURS || (bridgeHours && bridgeHours[1]) || '24'
).replace(',', '.'));
const refreshHours = Number.isFinite(requestedHours)
  ? Math.min(720, Math.max(1, requestedHours))
  : 24;
const forceToken = String(
  settings.SNAPSHOT_FORCE_TOKEN ?? (bridgeForce && bridgeForce[1]) ?? '0'
);

let previous = null;
try {
  const source = (await readFile(snapshotPath, 'utf8')).trim();
  const marker = 'window.__YauteshuEmbeddedCatalog=';
  if (source.startsWith(marker) && source.endsWith(';')) {
    previous = JSON.parse(source.slice(marker.length, -1));
  }
} catch (error) {
  if (error && error.code !== 'ENOENT') throw error;
}

const now = Date.now();
const previousSnapshot = previous && previous._snapshot ? previous._snapshot : {};
const previousTime = Date.parse(previousSnapshot.updatedAt || '');
const dueByTime = !Number.isFinite(previousTime) || now - previousTime >= refreshHours * 60 * 60 * 1000;
const dueByForce = String(previousSnapshot.forceToken ?? '') !== forceToken;

if (previous && !dueByTime && !dueByForce) {
  const nextAt = new Date(previousTime + refreshHours * 60 * 60 * 1000).toISOString();
  console.log('Snapshot is current; next scheduled refresh after ' + nextAt);
  process.exit(0);
}

data._snapshot = {
  updatedAt: new Date(now).toISOString(),
  refreshHours,
  forceToken
};

const json = JSON.stringify(data)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');
await writeFile(
  snapshotPath,
  'window.__YauteshuEmbeddedCatalog=' + json + ';\n' +
  'window.dispatchEvent(new CustomEvent("yauteshu:snapshot",{detail:window.__YauteshuEmbeddedCatalog}));\n',
  'utf8'
);
console.log(
  'Saved ' + data.items.length + ' catalog item(s); reason: ' +
  (dueByForce ? 'forced' : 'scheduled') + '; interval: ' + refreshHours + 'h'
);
