// End-to-end check against a local chain (see README, "Testing locally").
// Registers names, manages records and subnames, and checks names, through
// the real interface with a stand-in wallet.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const SHOTS = process.env.SHOTS ?? 'e2e/screens';
const ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
fs.mkdirSync(SHOTS, { recursive: true });
const shim = fs.readFileSync(new URL('./wallet-shim.js', import.meta.url), 'utf8');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await context.addInitScript(`window.__TEST_ACCOUNT__='${ACCOUNT}';` + shim);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let n = 0;
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true });
const step = (msg) => console.log('•', msg);
const expectText = async (text, timeout = 30_000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });

async function connect() {
  const btn = page.getByRole('button', { name: 'Connect wallet' }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.getByRole('menuitem', { name: /Test Wallet|Browser wallet/ }).first().click();
    await page.getByRole('button', { name: /0x7099|\.hood/ }).first().waitFor();
  }
}

async function register(label, payWith) {
  await page.goto(`${BASE}/register/${encodeURIComponent(label)}`);
  await connect();
  await expectText('Summary');
  if (payWith) await page.getByRole('group', { name: 'Payment' }).getByRole('button', { name: new RegExp('^' + payWith) }).click();
  await page.getByRole('button', { name: /^Reserve / }).click();
  await page.getByRole('button', { name: /Waiting/ }).waitFor({ timeout: 60_000 });
  step(`${label}: reserved, waiting a minute`);
  await page.getByRole('button', { name: 'Confirm and pay' }).waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Confirm and pay' }).click();
  await expectText(`${label}.hood is yours`, 120_000);
  step(`${label}: registered`);
}

try {
  step('Search page');
  await page.goto(BASE);
  await expectText('One name for your wallet');
  await page.getByLabel('Search for a name').fill('Sage');
  await expectText('Available');
  await expectText('Capitals are folded');
  await shot('search-available');

  await page.getByLabel('Search for a name').fill('robinhood');
  await expectText('Reserved');
  await page.getByLabel('Search for a name').fill('r0binhood');
  await expectText('Reserved');
  await shot('search-reserved');
  await page.getByLabel('Search for a name').fill('nvda');
  await expectText('Reserved');
  await page.getByLabel('Search for a name').fill('sаge'); // Cyrillic а among Latin letters
  await expectText('Not allowed');
  await page.getByLabel('Search for a name').fill('привет');
  await expectText('Available');

  step('Register sage.hood with ETH');
  await register('sage', 'ETH');
  await shot('registered');

  step('Lookalike of a live name');
  await page.goto(`${BASE}/?q=5age`);
  await page.goto(`${BASE}/?q=sagе`); // Cyrillic е at the end: mixed, refused
  await expectText('Not allowed');
  await page.goto(`${BASE}/?q=s%C3%A1ge`); // ságe
  await expectText('Looks taken');
  await expectText('sage.hood, which is registered');
  await shot('search-lookalike');

  step('Test dollars, then register with tUSD');
  await page.goto(`${BASE}/names`);
  await connect();
  await expectText('sage.hood');
  await expectText('Primary');
  await page.getByRole('button', { name: 'Get 1,000 tUSD' }).click();
  await expectText('Added to your wallet', 60_000);
  await shot('my-names');
  await register('привет', 'tUSD');

  step('Records');
  await page.goto(`${BASE}/name/sage`);
  await expectText('What sage.hood points to');
  await page.waitForFunction(() => !document.querySelector('#r-addr')?.disabled);
  await page.getByLabel('X', { exact: true }).fill('@sage');
  await page.getByLabel('Website').fill('https://example.com');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expectText('Saved.', 60_000);
  await page.reload();
  await page.getByLabel('X', { exact: true }).and(page.locator('[value="@sage"]')).waitFor({ timeout: 30_000 });
  await shot('records');

  step('Subnames');
  await page.getByRole('tab', { name: 'Subnames' }).click();
  await page.getByLabel('Name', { exact: true }).fill('pay');
  await page.getByRole('button', { name: 'Create subname' }).click();
  await expectText('Subname created and switched on', 90_000);
  await expectText('pay.sage.hood', 30_000);
  await expectText('Working');
  await shot('subnames');

  step('Check page');
  await page.goto(`${BASE}/check?name=sage`);
  await expectText('Changed hands');
  await expectText(ACCOUNT);
  await shot('check-recent');
  await page.goto(`${BASE}/check?name=s%C3%A1ge`);
  await expectText('is not a registered name');
  await expectText('looks like sage.hood');

  step('Gift cards');
  await page.goto(`${BASE}/gift-cards`);
  await expectText('Buy');
  await page.getByRole('group', { name: 'Payment' }).getByRole('button', { name: 'tUSD' }).click();
  await page.getByRole('button', { name: /^Buy gift card/ }).click();
  await expectText('Bought.', 90_000);
  await page.getByRole('button', { name: 'Redeem all' }).click();
  await expectText('Added as points', 90_000);
  await shot('gift-cards');

  step('Renew');
  await page.goto(`${BASE}/name/sage?tab=ownership`);
  await page.getByRole('button', { name: 'Renew sage.hood' }).click();
  await expectText('Renewed.', 90_000);
  await shot('ownership');

  step('Phone width');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/?q=sage`);
  await expectText('Taken');
  await shot('phone-search');

  const real = errors.filter((e) => !/favicon|Failed to load resource|WalletConnect|Lit is in dev mode/i.test(e));
  if (real.length) {
    console.log('Console errors:\n' + real.slice(0, 10).join('\n'));
  }
  console.log('ALL STEPS PASSED');
} catch (e) {
  await shot('failure');
  console.error('FAILED:', e.message);
  console.error('Console errors:\n' + errors.slice(-10).join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
