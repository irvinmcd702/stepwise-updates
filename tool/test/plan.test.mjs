import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cmp, order } from '../lib/plan.mjs';

test('versions compare by number, not by text', () => {
	assert.equal(cmp('6.10', '6.9'), 1);
	assert.equal(cmp('7.4', '7.4.0'), 0);
	assert.equal(cmp('22.0', '28.8'), -1);
});

const site = { core: '6.4.5', php: '7.4' };
const updates = [
	{ kind: 'plugin', slug: 'contact-form-7', to: '6.2.4.1', requires: { wp: '7.1', php: '8.3' } },
	{ kind: 'php', slug: 'php', to: '8.3', requires: { wp: '7.1.4' } },
	{ kind: 'plugin', slug: 'wordpress-seo', to: '28.8', requires: { wp: '7.0', php: '7.4' } },
	{ kind: 'core', slug: 'wordpress', to: '7.1.4', requires: { php: '7.4' } },
	{ kind: 'plugin', slug: 'harbor-hours', to: '2.0', requires: { wp: '6.0', php: '7.4' } },
];

test('each update waits for what it needs', () => {
	const { steps, blocked } = order(site, updates);
	assert.deepEqual(steps.map((s) => s.slug), ['harbor-hours', 'wordpress', 'wordpress-seo', 'php', 'contact-form-7']);
	assert.equal(blocked.length, 0);
	assert.match(steps[4].reason, /WordPress 7\.1 and PHP 8\.3/);
});

test('an update nothing can unlock is reported, not dropped', () => {
	const { steps, blocked } = order(site, [{ kind: 'plugin', slug: 'x', to: '9', requires: { php: '9.0' } }]);
	assert.equal(steps.length, 0);
	assert.match(blocked[0].reason, /PHP 9\.0/);
});
