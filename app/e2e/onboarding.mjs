// First visit: the tour, the theme switch, and the getting-started checklist.
// Needs the dev server (and the local chain for the wallet steps).
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const shim = fs.readFileSync(new URL('./wallet-shim.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const errors = [];
const check = (ok, what) => { console.log(ok ? '•' : 'FAILED:', what); if (!ok) process.exitCode = 1; };

const ctx = await browser.newContext({ locale: 'en-US' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/`);
check((await page.locator('html').getAttribute('data-theme')) === 'dark', 'dark by default');

// The tour, from the hero.
await page.getByRole('button', { name: /See how it works/ }).click();
const tour = page.getByRole('dialog');
await tour.getByText('A name instead of an address').waitFor();
for (let i = 0; i < 3; i++) await tour.getByRole('button', { name: 'Next' }).click();
await tour.getByText('Nobody can pose as you').waitFor();
await tour.getByRole('button', { name: 'Find my name' }).click();
await tour.waitFor({ state: 'detached' });
check(await page.evaluate(() => document.activeElement?.id === 'name-search'), 'the tour ends in the search box');
await page.reload();
check(!(await page.getByRole('button', { name: /See how it works/ }).count()), 'the tour is offered as new only once');

// Theme switch, kept across a reload.
await page.getByRole('button', { name: 'Switch to light mode' }).click();
check((await page.locator('html').getAttribute('data-theme')) === 'light', 'switched to light');
await page.reload();
check((await page.locator('html').getAttribute('data-theme')) === 'light', 'light kept after a reload');
await page.getByRole('button', { name: 'Switch to dark mode' }).click();

// The checklist ticks itself from the wallet.
check(await page.getByText('0 of 6 done').isVisible(), 'checklist starts at 0 of 6 without a wallet');
const wctx = await browser.newContext({ locale: 'en-US' });
await wctx.addInitScript(`window.__TEST_ACCOUNT__='0x90F79bf6EB2c4f870365E785982E1f101E93b906';` + shim);
const w = await wctx.newPage();
w.on('pageerror', (e) => errors.push(e.message));
await w.goto(`${BASE}/`);
await w.waitForTimeout(1500);
const connect = w.getByRole('button', { name: 'Connect wallet' }).first();
if (await connect.isVisible().catch(() => false)) {
  await connect.click();
  await w.getByRole('menuitem', { name: /Test Wallet|Browser wallet/ }).first().click();
}
await w.getByText(/[3-6] of 6 done/).waitFor({ timeout: 20_000 }).then(
  () => check(true, 'connected, on the network, with ETH: the first three steps tick'),
  () => check(false, 'connected, on the network, with ETH: the first three steps tick'),
);
check(await w.getByText('Pick your name').isVisible(), 'the next step is picking a name');

check(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
