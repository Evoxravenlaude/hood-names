// Language switching: the site's own menu, there and back, and what happens
// when the browser's translator rewrites the page. Needs the dev server.
import { chromium } from 'playwright';
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (ok, what) => { if (!ok) { console.log('FAILED:', what); process.exitCode = 1; } else console.log('•', what); };
const h1 = () => page.locator('h1').first().innerText();

await page.goto(`${BASE}/`);
check((await h1()).startsWith('One name'), 'starts in English for an English browser');

for (const [code, name, word] of [['fr', 'Français', 'Un nom'], ['ja', '日本語', ''], ['hi', 'हिन्दी', '']]) {
  await page.getByRole('button', { name: /Language|Langue|言語|भाषा/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(name) }).click();
  await page.waitForFunction((c) => document.documentElement.lang === c, code);
  const title = await h1();
  check(!title.startsWith('One name') && (!word || title.startsWith(word)), `switched to ${name}: "${title.slice(0, 30)}"`);
  check((await page.locator('html').getAttribute('translate')) === 'no', `${name}: browser translator switched off`);
  // English is always first and named in English.
  await page.getByRole('button', { name: /Language|Langue|言語|भाषा/ }).click();
  const first = await page.getByRole('menuitemradio').first().innerText();
  check(first.trim() === 'English', `${name}: English is first in the menu`);
  await page.getByRole('menuitemradio', { name: /^English/ }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  check((await h1()).startsWith('One name'), `${name}: back to English`);
}

// The choice survives a reload.
await page.getByRole('button', { name: /Language/ }).click();
await page.getByRole('menuitemradio', { name: /Español/ }).click();
await page.waitForFunction(() => document.documentElement.lang === 'es');
await page.reload();
await page.waitForTimeout(800);
check((await page.locator('html').getAttribute('lang')) === 'es', 'the choice survives a reload');
await page.getByRole('button', { name: /Idioma|Language/ }).click();
await page.getByRole('menuitemradio', { name: /^English/ }).click();
await page.waitForFunction(() => document.documentElement.lang === 'en');

// A browser translator rewriting the page: the site notices and offers its own language.
const fresh = await (await browser.newContext({ locale: 'en-US' })).newPage();
fresh.on('pageerror', (e) => errors.push(e.message));
await fresh.goto(`${BASE}/?q=sage`);
await fresh.waitForTimeout(1500);
await fresh.evaluate(() => {
  const walker = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim() && !walker.currentNode.parentElement.closest('[translate=no]')) nodes.push(walker.currentNode);
  for (const n of nodes) { const f = document.createElement('font'); f.textContent = '[fr] ' + n.nodeValue; n.parentNode.replaceChild(f, n); }
  document.documentElement.classList.add('translated-ltr');
  document.documentElement.lang = 'fr';
});
await fresh.getByText('Your browser has translated this page', { exact: false }).first().waitFor({ timeout: 5000 }).then(() => check(true, 'notice shown when the browser translates'), () => check(false, 'notice shown when the browser translates'));
// The name in the result keeps updating, because names are never handed to the translator.
await fresh.fill('#name-search', 'robinhood');
await fresh.waitForTimeout(1800);
const shown = await fresh.locator('.result-name').innerText();
check(shown.startsWith('robinhood'), `search result follows the typing after translation ("${shown}")`);
await fresh.getByRole('button', { name: 'Français' }).click();
await fresh.waitForLoadState('load');
await fresh.waitForTimeout(1200);
check((await fresh.locator('html').getAttribute('lang')) === 'fr' && !(await fresh.locator('font').count()), 'chose the site’s French: clean page, no browser translation');

check(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
