// Orders updates so that each one lands on a site that already meets its requirements.

export function cmp(a, b) {
	const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return Math.sign(d);
	}
	return 0;
}

export const satisfies = (have, need) => !need || cmp(have, need) >= 0;

// Plugins first while they still fit the current site, then WordPress, then PHP.
const RANK = { plugin: 0, theme: 0, core: 1, php: 2 };

export const label = (u) => u.kind === 'core' ? 'WordPress' : u.kind === 'php' ? 'PHP' : u.name ?? u.slug;

/**
 * state:   { core, php }
 * updates: [{ kind, slug, from, to, requires: { wp, php } }]
 * returns  { steps, blocked } — steps in a safe order, each with the reason for its place.
 */
export function order(state, updates) {
	const now = { core: state.core, php: state.php };
	const pending = [...updates];
	const steps = [];
	while (pending.length) {
		const ready = pending.filter((u) => satisfies(now.core, u.requires?.wp) && satisfies(now.php, u.requires?.php));
		if (!ready.length) break;
		ready.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
		const u = ready[0];
		steps.push({ ...u, reason: reason(u, state) });
		if (u.kind === 'core') now.core = u.to;
		if (u.kind === 'php') now.php = u.to;
		pending.splice(pending.indexOf(u), 1);
	}
	const blocked = pending.map((u) => ({ ...u, reason: `needs ${needs(u)}, which no step in this plan provides` }));
	return { steps, blocked };
}

function needs(u) {
	return [u.requires?.wp && `WordPress ${u.requires.wp}`, u.requires?.php && `PHP ${u.requires.php}`].filter(Boolean).join(' and ');
}

function reason(u, start) {
	const waits = [];
	if (u.requires?.wp && !satisfies(start.core, u.requires.wp)) waits.push(`WordPress ${u.requires.wp}`);
	if (u.requires?.php && !satisfies(start.php, u.requires.php)) waits.push(`PHP ${u.requires.php}`);
	if (u.kind === 'php') return 'PHP goes last among the platform steps, once WordPress itself is current';
	if (u.kind === 'core') return waits.length ? `needs ${waits.join(' and ')}` : 'plugins that fit the old WordPress are done; the rest wait for this';
	return waits.length ? `new version needs ${waits.join(' and ')}` : 'new version works on the current WordPress and PHP';
}
