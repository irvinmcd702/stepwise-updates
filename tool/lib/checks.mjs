// What "the site still works" means: key pages, how they look, the contact form, the PHP log.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { SITE, mailCount } from './lab.mjs';

export const PAGES = [
	{ name: 'home', path: '/', must: ['.hero h1', '.site-nav a', '.card'] },
	{ name: 'menu', path: '/menu/', must: ['.menu-list li'] },
	{ name: 'visit', path: '/visit/', must: ['.card'] },
	{ name: 'contact', path: '/contact/', must: ['form.wpcf7-form [type=submit]'] },
	{ name: 'login', path: '/wp-login.php', must: ['#loginform'], visual: false },
];

// Share of pixels that may differ before a page counts as changed / broken.
export const LIMITS = { note: 0.0005, fail: 0.005 };

const STILL = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';

function chromePath() {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
	const candidates = [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	];
	return candidates.find((c) => fs.existsSync(c));
}

export async function capture(dir) {
	fs.mkdirSync(dir, { recursive: true });
	const browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--hide-scrollbars', '--font-render-hinting=none'] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		const out = { pages: {} };
		for (const p of PAGES) {
			const errors = [];
			const onConsole = (m) => m.type() === 'error' && errors.push(m.text());
			const onError = (e) => errors.push(e.message);
			page.on('console', onConsole).on('pageerror', onError);
			const res = await page.goto(SITE + p.path, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => null);
			const html = await page.content().catch(() => '');
			const missing = [];
			for (const sel of p.must) if (!(await page.$(sel))) missing.push(sel);
			let shot = null;
			if (p.visual !== false) {
				await page.addStyleTag({ content: STILL }).catch(() => {});
				shot = `${p.name}.png`;
				await page.screenshot({ path: path.join(dir, shot), fullPage: true });
			}
			page.off('console', onConsole).off('pageerror', onError);
			out.pages[p.name] = {
				path: p.path, status: res?.status() ?? 0, missing, consoleErrors: errors, shot,
				fatal: /There has been a critical error|Fatal error:/i.test(html),
			};
		}
		out.form = await submitContactForm(page);
		return out;
	} finally {
		await browser.close();
	}
}

async function submitContactForm(page) {
	const before = mailCount();
	await page.goto(SITE + '/contact/', { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => null);
	if (!(await page.$('form.wpcf7-form'))) return { ok: false, delivered: false, message: 'the form is not on the page' };
	await page.type('[name="your-name"]', 'Test Visitor');
	await page.type('[name="your-email"]', 'visitor@example.com');
	await page.type('[name="your-subject"]', 'Cake order');
	await page.type('[name="your-message"]', 'Two country loaves for Saturday, please.');
	await page.click('form.wpcf7-form [type=submit]');
	await page.waitForFunction(() => document.querySelector('.wpcf7-response-output')?.textContent.trim(), { timeout: 20000 }).catch(() => {});
	const message = await page.$eval('.wpcf7-response-output', (e) => e.textContent.trim()).catch(() => '');
	const delivered = mailCount() > before;
	return { ok: delivered, delivered, message };
}

function padded(img, w, h) {
	if (img.width === w && img.height === h) return img;
	const p = new PNG({ width: w, height: h });
	p.data.fill(255);
	PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0);
	return p;
}

export function compare(beforePng, afterPng, diffPng) {
	const a = PNG.sync.read(fs.readFileSync(beforePng));
	const b = PNG.sync.read(fs.readFileSync(afterPng));
	const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
	const diff = new PNG({ width: w, height: h });
	const changed = pixelmatch(padded(a, w, h).data, padded(b, w, h).data, diff.data, w, h, { threshold: 0.1 });
	if (diffPng) fs.writeFileSync(diffPng, PNG.sync.write(diff));
	return { ratio: changed / (w * h), heightChange: b.height - a.height };
}

const pct = (r) => `${(r * 100).toFixed(r < 0.01 ? 2 : 1)}%`;

/**
 * Compares a capture with the last accepted one.
 * known: PHP log messages already present before this step (not news).
 */
export function judge(cur, curDir, prev, prevDir, log, known = new Set()) {
	const problems = [], notes = [], visual = {};
	for (const p of PAGES) {
		const r = cur.pages[p.name];
		if (r.status === 0 || r.status >= 500) problems.push(`${p.path} answers ${r.status || 'nothing'}`);
		else if (r.fatal) problems.push(`${p.path} shows a critical error`);
		else if (r.missing.length) problems.push(`${p.path} lost ${r.missing.join(', ')}`);
		const newErrors = r.consoleErrors.filter((e) => !prev?.pages[p.name]?.consoleErrors.includes(e));
		if (newErrors.length) notes.push(`${p.path}: new browser errors: ${newErrors.slice(0, 2).join('; ')}`);
		if (!r.shot || !prev?.pages[p.name]?.shot || r.status >= 500 || r.fatal) continue;
		const d = compare(path.join(prevDir, prev.pages[p.name].shot), path.join(curDir, r.shot), path.join(curDir, `${p.name}.diff.png`));
		visual[p.name] = { ...d, diff: `${p.name}.diff.png` };
		if (d.ratio > LIMITS.fail) problems.push(`${p.path} looks different: ${pct(d.ratio)} of the page changed`);
		else if (d.ratio > LIMITS.note) notes.push(`${p.path}: small visual change (${pct(d.ratio)})`);
	}
	if (prev?.form?.ok && !cur.form.ok) problems.push(`contact form stopped delivering (${cur.form.message || 'no answer'})`);
	const fresh = (list) => (list ?? []).filter((m) => !known.has(m));
	for (const m of fresh(log.fatal)) problems.push(`PHP fatal error: ${m}`);
	const warnings = fresh(log.warning), deprecated = fresh(log.deprecated);
	if (warnings.length) notes.push(`${warnings.length} new PHP warning(s): ${warnings[0]}`);
	if (deprecated.length) notes.push(`${deprecated.length} new PHP deprecation notice(s): ${deprecated[0]}`);
	return { ok: problems.length === 0, problems, notes, visual };
}
