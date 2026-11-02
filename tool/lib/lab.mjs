// The site under update: WP-CLI and Docker Compose calls, snapshots and rollback.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const LAB = path.join(ROOT, 'lab');
export const SITE = process.env.STEPWISE_URL ?? 'http://localhost:8095';
const LOGS = path.join(LAB, 'logs');

export const phpVersion = () => fs.readFileSync(path.join(LAB, 'php-version'), 'utf8').trim();

function compose(args, php = phpVersion()) {
	const r = spawnSync('docker', ['compose', ...args], {
		cwd: LAB, encoding: 'utf8', maxBuffer: 64 << 20,
		env: { ...process.env, PHP_VERSION: php },
	});
	if (r.status !== 0) {
		const tail = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.trim() && !/^\s*Container /.test(l)).slice(-4).join(' | ');
		throw new Error(tail || `docker compose ${args[0]} failed`);
	}
	return r.stdout;
}

export const wp = (...args) => compose(['run', '--rm', '-T', 'cli', 'wp', ...args]).trim();
export const inCli = (cmd) => compose(['run', '--rm', '-T', '--entrypoint', 'sh', 'cli', '-c', cmd]);

const lastJson = (out) => JSON.parse(out.split('\n').reverse().find((l) => /^[[{]/.test(l.trim())));

export function state() {
	const list = lastJson(wp('plugin', 'list', '--fields=name,version,status', '--format=json'));
	const plugins = Object.fromEntries(list.filter((p) => !['must-use', 'dropin'].includes(p.status)).map((p) => [p.name, p.version]));
	return { core: wp('core', 'version'), php: phpVersion(), plugins };
}

export async function waitForSite(tries = 60) {
	for (let i = 0; i < tries; i++) {
		try {
			await fetch(SITE + '/', { redirect: 'manual' });
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	throw new Error(`${SITE} does not answer`);
}

export async function switchPhp(version) {
	compose(['up', '-d', 'wordpress'], version);
	fs.writeFileSync(path.join(LAB, 'php-version'), version + '\n');
	await waitForSite();
}

// Files and database, plus the PHP version the site ran on.
export function snapshot(id) {
	inCli(`tar -C /var/www/html -czf /backups/${id}.tgz . && wp db export /backups/${id}.sql --quiet`);
	fs.writeFileSync(path.join(LAB, 'backups', `${id}.php-version`), phpVersion());
}

export async function restore(id) {
	const php = fs.readFileSync(path.join(LAB, 'backups', `${id}.php-version`), 'utf8').trim();
	if (php !== phpVersion()) await switchPhp(php);
	inCli(`find /var/www/html -mindepth 1 -delete && tar -C /var/www/html -xzf /backups/${id}.tgz && wp db import /backups/${id}.sql --quiet`);
}

export async function apply(step) {
	if (step.kind === 'php') return switchPhp(step.to);
	if (step.kind === 'core') {
		wp('core', 'update', `--version=${step.to}`);
		wp('core', 'update-db');
		return;
	}
	if (step.source === 'vendor') {
		inCli(`rm -rf wp-content/plugins/${step.slug} && cp -r /updates/${step.dir} wp-content/plugins/${step.slug}`);
		return;
	}
	wp('plugin', 'update', step.slug, `--version=${step.to}`);
}

// PHP log lines written since `offset`, without timestamps and repeats.
export const logSize = () => fs.existsSync(path.join(LOGS, 'debug.log')) ? fs.statSync(path.join(LOGS, 'debug.log')).size : 0;

export function logSince(offset) {
	const file = path.join(LOGS, 'debug.log');
	if (!fs.existsSync(file)) return { fatal: [], warning: [], deprecated: [] };
	const text = fs.readFileSync(file).subarray(offset).toString('utf8');
	const out = { fatal: new Set(), warning: new Set(), deprecated: new Set() };
	for (const line of text.split('\n')) {
		const m = line.match(/PHP (Fatal error|Parse error|Warning|Deprecated|Notice):\s+(.*)/);
		if (!m) continue;
		const msg = m[2].replace(/\s+/g, ' ').replace(/ in \/var\/www\/html\//, ' in ').trim();
		const kind = /Fatal|Parse/.test(m[1]) ? 'fatal' : m[1] === 'Deprecated' ? 'deprecated' : 'warning';
		out[kind].add(msg.slice(0, 400));
	}
	return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

export const mailCount = () => {
	const file = path.join(LOGS, 'mail.log');
	return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0;
};

// "Yoast SEO &#8211; Advanced SEO with ..." → "Yoast SEO"
const shortName = (name = '') => name.replace(/&amp;/g, '&').split(/\s+(?:&#82(?:11|12);|[–—|])\s+/)[0];

// Updates on offer: wordpress.org for core and listed plugins, the vendor folder for the rest.
export async function available(st, targetPhp) {
	const manifest = JSON.parse(fs.readFileSync(path.join(LAB, 'updates', 'manifest.json'), 'utf8'));
	const updates = [];
	const core = await (await fetch(`https://api.wordpress.org/core/version-check/1.7/?version=${st.core}&php=${st.php}`)).json();
	const latest = core.offers?.[0];
	if (latest && latest.current !== st.core) {
		updates.push({ kind: 'core', slug: 'wordpress', name: 'WordPress', from: st.core, to: latest.current, requires: { php: latest.php_version } });
	}
	const coreTarget = latest?.current ?? st.core;
	for (const [slug, from] of Object.entries(st.plugins)) {
		const vendor = manifest.plugins[slug];
		if (vendor) {
			if (vendor.version !== from) updates.push({ kind: 'plugin', source: 'vendor', slug, dir: vendor.dir, from, to: vendor.version, requires: { wp: vendor.requires, php: vendor.requires_php } });
			continue;
		}
		const info = await (await fetch(`https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${slug}`)).json();
		if (!info.version || info.version === from) continue;
		updates.push({ kind: 'plugin', source: 'wordpress.org', slug, name: shortName(info.name), from, to: info.version, requires: { wp: info.requires || undefined, php: info.requires_php || undefined } });
	}
	if (targetPhp && targetPhp !== st.php) {
		updates.push({ kind: 'php', slug: 'php', name: 'PHP', from: st.php, to: targetPhp, requires: { wp: coreTarget } });
	}
	return updates;
}
