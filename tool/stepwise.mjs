#!/usr/bin/env node
// stepwise plan | run [--note "..."] | report <run-dir>... --out file.html
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, state, available, snapshot, restore, apply, logSize, logSince } from './lib/lab.mjs';
import { order, satisfies, label } from './lib/plan.mjs';
import { capture, judge, LIMITS } from './lib/checks.mjs';
import { ownerReport, runMarkdown } from './lib/report.mjs';

const RUNS = path.join(ROOT, 'runs');
const HOLDS = path.join(RUNS, 'holds.json');

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		php: { type: 'string', default: '8.3' },
		note: { type: 'string' },
		out: { type: 'string' },
		site: { type: 'string', default: 'Harbor & Pine Bakery' },
	},
});

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const say = (s) => process.stdout.write(s + '\n');

async function makePlan() {
	const st = state();
	const holds = readJson(HOLDS, {});
	const offered = await available(st, values.php);
	const held = offered.filter((u) => holds[u.slug]?.version === u.to);
	const { steps, blocked } = order(st, offered.filter((u) => !held.includes(u)));
	return { state: st, steps, blocked, held: held.map((u) => ({ ...u, reason: holds[u.slug].reason })) };
}

function printPlan(plan) {
	say(`site: WordPress ${plan.state.core}, PHP ${plan.state.php}`);
	plan.steps.forEach((s, i) => say(`  ${i + 1}. ${label(s)} ${s.from} → ${s.to}  — ${s.reason}`));
	for (const h of plan.held) say(`  held: ${label(h)} ${h.to} — ${h.reason}`);
	for (const b of plan.blocked) say(`  blocked: ${label(b)} ${b.to} — ${b.reason}`);
}

async function run() {
	const plan = await makePlan();
	printPlan(plan);
	const id = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
	const dir = path.join(RUNS, id);
	fs.mkdirSync(dir, { recursive: true });
	const record = { id, started: new Date().toISOString(), note: values.note, before: plan.state, plan, steps: [] };
	const save = () => fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(record, null, 2));

	say('\nbaseline');
	let offset = logSize();
	let accepted = { dir: '00-baseline', capture: await capture(path.join(dir, '00-baseline')) };
	// Whatever the log said before we touched anything is history, not news.
	const known = new Set(Object.values(logSince(0)).flat());
	const base = judge(accepted.capture, path.join(dir, accepted.dir), null, null, { fatal: [] });
	record.baseline = { dir: accepted.dir, capture: accepted.capture, problems: base.problems, log: logSince(0) };
	save();
	if (!base.ok) {
		say(`site is already broken before any update: ${base.problems.join('; ')}`);
		process.exit(1);
	}

	const holds = readJson(HOLDS, {});
	let now = { core: plan.state.core, php: plan.state.php };
	for (const [i, step] of plan.steps.entries()) {
		const sid = `${String(i + 1).padStart(2, '0')}-${step.slug}`;
		const entry = { id: sid, ...step };
		record.steps.push(entry);
		say(`\n${sid}: ${label(step)} ${step.from} → ${step.to}`);
		if (!satisfies(now.core, step.requires?.wp) || !satisfies(now.php, step.requires?.php)) {
			entry.status = 'skipped';
			entry.problems = [`waits for ${[step.requires?.wp && `WordPress ${step.requires.wp}`, step.requires?.php && `PHP ${step.requires.php}`].filter(Boolean).join(' and ')}; the site has WordPress ${now.core} on PHP ${now.php}`];
			say(`  skipped: ${entry.problems[0]}`);
			save();
			continue;
		}
		const t0 = Date.now();
		snapshot(sid);
		offset = logSize();
		let applyError = null;
		try {
			await apply(step);
		} catch (e) {
			applyError = e.message;
		}
		const cap = await capture(path.join(dir, sid));
		const log = logSince(offset);
		const verdict = judge(cap, path.join(dir, sid), accepted.capture, path.join(dir, accepted.dir), log, known);
		if (applyError) {
			verdict.problems.unshift(`update command failed: ${applyError}`);
			verdict.ok = false;
		}
		Object.assign(entry, { capture: cap, log, problems: verdict.problems, notes: verdict.notes, visual: verdict.visual, compareTo: accepted.dir });
		Object.values(log).flat().forEach((m) => known.add(m));

		if (verdict.ok) {
			entry.status = 'done';
			accepted = { dir: sid, capture: cap };
			if (step.kind === 'core') now.core = step.to;
			if (step.kind === 'php') now.php = step.to;
			entry.seconds = Math.round((Date.now() - t0) / 1000);
			say(`  done in ${entry.seconds} s${verdict.notes.length ? '\n  note: ' + verdict.notes.join('\n  note: ') : ''}`);
		} else {
			say(`  problem: ${verdict.problems.join('\n  problem: ')}`);
			await restore(sid);
			const back = await capture(path.join(dir, sid, 'rollback'));
			const check = judge(back, path.join(dir, sid, 'rollback'), accepted.capture, path.join(dir, accepted.dir), { fatal: [] });
			const unchanged = check.ok && Object.values(check.visual).every((v) => v.ratio <= LIMITS.note);
			entry.status = 'rolled-back';
			entry.rollback = { capture: back, problems: check.problems, visual: check.visual, unchanged };
			if (step.kind === 'plugin') {
				holds[step.slug] = { version: step.to, reason: verdict.problems[0], since: new Date().toISOString().slice(0, 10) };
				fs.writeFileSync(HOLDS, JSON.stringify(holds, null, 2));
			}
			entry.seconds = Math.round((Date.now() - t0) / 1000);
			say(`  rolled back in ${entry.seconds} s; site ${unchanged ? 'matches the last good state' : 'DIFFERS from the last good state: ' + check.problems.join('; ')}`);
		}
		save();
	}
	record.after = state();
	record.finished = new Date().toISOString();
	save();
	fs.writeFileSync(path.join(dir, 'run.md'), runMarkdown(record));
	say(`\nrun saved: ${path.relative(ROOT, dir)}`);
}

const [cmd, ...rest] = positionals;
if (cmd === 'plan') printPlan(await makePlan());
else if (cmd === 'run') await run();
else if (cmd === 'report') {
	const runs = rest.map((d) => ({ dir: path.resolve(d), ...readJson(path.join(d, 'run.json')) }));
	const out = values.out ?? path.join(ROOT, 'runs', 'owner-report.html');
	fs.writeFileSync(out, ownerReport(values.site, runs));
	say(`owner report: ${path.relative(ROOT, out)}`);
} else {
	say('usage: stepwise plan | run [--php 8.3] [--note "..."] | report <run-dir>... [--out file.html]');
	process.exit(2);
}
