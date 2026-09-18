import { writeFile } from 'node:fs/promises';

const api = 'https://script.google.com/macros/s/AKfycbz6RuW2FKhvGSHQG6Hynshw4lngNRzZ3xf7gqQr2B_MXHUoN5VS7B628OCfdGcBdkwfww/exec';
const callback = '__yauteshuSnapshot';
const response = await fetch(api + '?callback=' + callback + '&_=' + Date.now(), {
  redirect: 'follow',
  headers: { 'user-agent': 'yauteshu-catalog-snapshot/1.0' }
});
if (!response.ok) throw new Error('Catalog request failed: HTTP ' + response.status);
const body = (await response.text()).trim();
const prefix = callback + '(';
if (!body.startsWith(prefix) || !body.endsWith(');')) {
  throw new Error('Unexpected catalog response');
}
const data = JSON.parse(body.slice(prefix.length, -2));
if (!data || !Array.isArray(data.items)) throw new Error('Catalog has no items array');
const json = JSON.stringify(data)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');
await writeFile('catalog-data.js', 'window.__YauteshuEmbeddedCatalog=' + json + ';\n', 'utf8');
console.log('Saved ' + data.items.length + ' catalog item(s)');
