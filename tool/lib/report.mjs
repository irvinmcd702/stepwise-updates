// Two views of the same runs: a plain-language page for the site owner and a log for the next developer.
import fs from 'node:fs';
import path from 'node:path';
import { label } from './plan.mjs';
import { LIMITS, PAGES } from './checks.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const img = (file) => fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : '';
const secs = (s) => s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`;

const pageName = (p) => `${PAGES.find((x) => x.path === p)?.name ?? p} page`;
const DOWN = /^(\S+) (shows a critical error|answers 5\d\d|answers nothing)/;

function plain(problem) {
	let m;
	if ((m = problem.match(/^(\S+) looks different: (.+) of the page changed/))) return `The ${pageName(m[1])} looked different after the update (${m[2]} of it changed).`;
	if ((m = problem.match(DOWN))) return `The ${pageName(m[1])} stopped opening — visitors would have seen an error page.`;
	if ((m = problem.match(/^(\S+) lost /))) return `Part of the ${pageName(m[1])} disappeared.`;
	if (/^contact form/.test(problem)) return 'The contact form stopped delivering messages.';
	if (/^PHP fatal error/.test(problem)) return 'The server log recorded a fatal error, the kind that takes a site down.';
	if (/^update command failed/.test(problem)) return 'The update itself did not install cleanly.';
	return problem;
}

// Five "page X is down" lines say one thing: the whole site is down.
function plainList(problems) {
	const down = problems.filter((p) => DOWN.test(p));
	const lines = down.length >= 3
		? [`Every page we checked stopped opening (${down.map((p) => pageName(p.match(DOWN)[1]).replace(/ page$/, '')).join(', ')}) — visitors would have seen an error page instead of the site.`]
		: down.map(plain);
	return [...new Set([...lines, ...problems.filter((p) => !DOWN.test(p)).map(plain)])];
}

function checkedLine(step) {
	const pages = Object.keys(step.capture?.pages ?? {}).length;
	const parts = [`${pages} pages open`];
	const changed = Object.values(step.visual ?? {}).filter((v) => v.ratio > LIMITS.note).length;
	parts.push(changed ? `${changed} with a small visual change` : 'look the same');
	if (step.capture?.form?.delivered) parts.push('test message delivered');
	return parts.join(' · ');
}

// The page that changed most, or the first one that broke.
function evidence(runDir, step) {
	const broken = Object.entries(step.capture.pages).find(([, p]) => p.fatal || p.status >= 500);
	const [name] = broken ?? Object.entries(step.visual ?? {}).sort((a, b) => b[1].ratio - a[1].ratio)[0] ?? [];
	if (!name) return '';
	const before = img(path.join(runDir, step.compareTo, `${name}.png`));
	const after = img(path.join(runDir, step.id, `${name}.png`));
	const diff = broken ? '' : img(path.join(runDir, step.id, `${name}.diff.png`));
	const fig = (src, cap) => src ? `<figure><img src="${src}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>` : '';
	return `<div class="shots">${fig(before, 'Before the update')}${fig(after, 'After the update')}${fig(diff, 'What changed (red)')}</div>`;
}

export function ownerReport(site, runs) {
	const first = runs[0], last = runs.at(-1);
	const steps = runs.flatMap((r) => r.steps.map((s) => ({ ...s, run: r })));
	const done = steps.filter((s) => s.status === 'done');
	const caught = steps.filter((s) => s.status === 'rolled-back');
	const laterDone = (s) => done.find((d) => d.slug === s.slug && d.to === s.to && d.run.id > s.run.id);
	const held = caught.filter((s) => !laterDone(s));
	const skippedOnly = last.steps.filter((s) => s.status === 'skipped');
	const all = !held.length && !skippedOnly.length;
	const before = first.before, after = last.after;

	const rows = done.map((s) => `<tr><td>${esc(label(s))}</td><td>${esc(s.from)}</td><td><b>${esc(s.to)}</b></td><td>${esc(checkedLine(s))}</td></tr>`).join('');

	const caughtCards = caught.map((s) => {
		const fixed = laterDone(s);
		const outcome = fixed
			? `<p class="ok">Fixed and installed on the next pass${fixed.run.note ? `: ${esc(fixed.run.note)}` : ''}.</p>`
			: s.kind === 'plugin'
				? `<p class="warn">Held back. Version ${esc(s.from)} stays in place until the vendor ships a fix; the next update run skips ${esc(s.to)} automatically.</p>`
				: '<p class="warn">Waiting for a fix before the next attempt.</p>';
		return `<article class="card">
<h3>${esc(label(s))} ${esc(s.from)} → ${esc(s.to)}</h3>
<ul>${plainList(s.problems).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
${evidence(s.run.dir, s)}
<p>We put the site back the way it was in ${secs(s.seconds)}${s.rollback?.unchanged ? ', and a fresh check confirmed it matched the last good state page for page' : ''}. Visitors never saw the problem: this ran on a copy of the site.</p>
${outcome}
</article>`;
	}).join('');

	const waiting = [
		...held.map((s) => `<li><b>${esc(label(s))} ${esc(s.to)}</b> — ${s.kind === 'plugin' ? 'held back' : 'needs a fix first'}, see above.</li>`),
		...skippedOnly.map((s) => `<li><b>${esc(label(s))} ${esc(s.to)}</b> — ${esc(s.problems[0])}.</li>`),
		...(last.plan.blocked ?? []).map((s) => `<li><b>${esc(label(s))} ${esc(s.to)}</b> — ${esc(s.reason)}.</li>`),
	];

	const tpl = fs.readFileSync(new URL('./owner.html', import.meta.url), 'utf8');
	const vars = {
		site: esc(site),
		date: new Date(last.finished ?? last.started).toISOString().slice(0, 10),
		statusClass: all ? '' : ' partial',
		headline: all
			? 'Everything is up to date, and the site works as before.'
			: `Your site is updated and working. ${waiting.length === 1 ? 'One update is' : `${waiting.length} updates are`} waiting on purpose — see below.`,
		platform: `WordPress ${esc(before.core)} → <b>${esc(after.core)}</b> · PHP ${esc(before.php)} → <b>${esc(after.php)}</b>`,
		nDone: done.length, nCaught: caught.length, nHeld: waiting.length,
		rows,
		caught: caughtCards || '<p>None — every update passed its checks on the first try.</p>',
		waiting: waiting.length ? `<ul>${waiting.join('')}</ul>` : '<p>Nothing.</p>',
		runs: runs.map((r) => `<li><time>${esc(r.started.slice(0, 16).replace('T', ' '))} UTC</time>${r.note ? `Before this pass: ${esc(r.note)}. ` : ''}${r.steps.filter((s) => s.status === 'done').length} installed, ${r.steps.filter((s) => s.status === 'rolled-back').length} caught and undone, ${r.steps.filter((s) => s.status === 'skipped').length} skipped.</li>`).join(''),
	};
	return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export function runMarkdown(r) {
	const lines = [
		`# Update run ${r.id}`,
		'',
		r.note ? `Before this run: ${r.note}\n` : '',
		`Before: WordPress ${r.before.core}, PHP ${r.before.php}, plugins ${Object.entries(r.before.plugins).map(([k, v]) => `${k} ${v}`).join(', ')}`,
		`After:  WordPress ${r.after.core}, PHP ${r.after.php}, plugins ${Object.entries(r.after.plugins).map(([k, v]) => `${k} ${v}`).join(', ')}`,
		'',
		'| # | update | result | seconds | why here |',
		'|---|---|---|---|---|',
		...r.steps.map((s) => `| ${s.id} | ${label(s)} ${s.from} → ${s.to} | ${s.status} | ${s.seconds ?? ''} | ${s.reason} |`),
		'',
	];
	if (r.baseline?.log) {
		const old = Object.values(r.baseline.log).flat();
		if (old.length) lines.push('## Already in the PHP log before the run', '', ...old.map((m) => `- \`${m}\``), '');
	}
	for (const s of r.steps) {
		if (!s.problems?.length && !s.notes?.length) continue;
		lines.push(`## ${s.id}: ${label(s)} ${s.to} — ${s.status}`, '');
		for (const p of s.problems ?? []) lines.push(`- problem: ${p}`);
		for (const n of s.notes ?? []) lines.push(`- note: ${n}`);
		if (s.rollback) lines.push(`- rollback: site ${s.rollback.unchanged ? 'matches' : 'does NOT match'} ${s.compareTo}`);
		for (const [page, v] of Object.entries(s.visual ?? {})) lines.push(`- visual ${page}: ${(v.ratio * 100).toFixed(2)}% changed, height ${v.heightChange >= 0 ? '+' : ''}${v.heightChange}px`);
		lines.push('');
	}
	if (r.plan.held?.length) lines.push('## Held from earlier runs', '', ...r.plan.held.map((h) => `- ${label(h)} ${h.to}: ${h.reason}`), '');
	return lines.join('\n');
}
