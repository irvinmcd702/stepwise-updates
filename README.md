# Stepwise updates for an outdated WordPress site

An old WordPress site that nobody dares to update — PHP 7.4, WordPress two
major versions behind, plugins that stopped getting updates years ago — brought
up to date one step at a time. Every step is checked in a real browser and
rolled back automatically if anything breaks.

This repository is a working demonstration: a lab site with the problems such
sites really have, the tool that updates it, and the report the owner gets.

```
./demo.sh
```

## The site

Harbor & Pine Bakery, a fictional small business site in Docker:

| | before | latest |
|---|---|---|
| PHP | 7.4 | 8.3 |
| WordPress | 6.4.5 | 7.1.x |
| Contact Form 7 | 5.7.7 | 6.2.x — needs WordPress 7.1 **and** PHP 8.3 |
| Yoast SEO | 22.0 | 28.x — needs WordPress 7.0 |
| Harbor Hours (premium, from the vendor) | 1.4 | 2.0 |
| theme | built by an agency in 2017 | — |

Two traps are built in, both common on real sites:

- **The vendor update that looks fine in the changelog.** Harbor Hours 2.0
  moved its styles so they load only for its new block. Sites that use the
  old shortcode get an unstyled list: `MondayClosed`, `Tuesday7:00 – 15:00`.
  Nothing errors; only the page looks wrong.
- **The theme that dies on PHP 8.** It still calls a PHP function that was
  deprecated in 7.2 and removed in 8.0. On PHP 7.4 that is a quiet line in a
  log nobody reads; on PHP 8.3 every page is "There has been a critical error".

## The plan

`stepwise plan` reads the site with WP-CLI, asks wordpress.org what is
current and what each version requires, and orders the steps so that every
update lands on a site that already meets its requirements:

```
site: WordPress 6.4.5, PHP 7.4
  1. harbor-hours 1.4 → 2.0        — new version works on the current WordPress and PHP
  2. WordPress 6.4.5 → 7.1.4       — plugins that fit the old WordPress are done; the rest wait for this
  3. Yoast SEO 22.0 → 28.8         — new version needs WordPress 7.0
  4. PHP 7.4 → 8.3                 — PHP goes last among the platform steps, once WordPress itself is current
  5. Contact Form 7 5.7.7 → 6.2.4.1 — new version needs WordPress 7.1 and PHP 8.3
```

Clicking "update all" in the dashboard would try Contact Form 7 first and
install a version that cannot run on the server.

## A step

`stepwise run` takes a baseline, then for each step:

1. **Snapshot** — files and database, plus which PHP the site ran on.
2. **Apply** — `wp plugin update`, `wp core update` + `update-db`, a vendor
   folder, or a different PHP container.
3. **Check** in headless Chrome:
   - home, menu, visit, contact and login pages open (no 5xx, no "critical
     error"), and key elements are still there;
   - each page is compared pixel by pixel with the last state that passed —
     a diff image is saved for every page;
   - a test message goes through the contact form and must arrive in the
     lab mailbox;
   - the PHP log is read for new fatal errors, warnings and deprecations.
4. **Accept or roll back.** On failure the snapshot goes back, the same
   checks run again, and the step is recorded as rolled back only if the
   site matches the last good state. A plugin version that failed is put on
   hold, so the next run skips it instead of failing on it again.

A step that depends on a rolled-back one is skipped with the reason
("waits for PHP 8.3; the site has WordPress 7.1.4 on PHP 7.4").

## What the demo shows

| pass | step | result |
|---|---|---|
| 1 | Harbor Hours 2.0 | rolled back — the hours box lost its layout; held |
| 1 | WordPress 7.1.4 | done |
| 1 | Yoast SEO 28.8 | done |
| 1 | PHP 8.3 | rolled back — fatal error in the theme, file and line from the log |
| 1 | Contact Form 7 6.2.4.1 | skipped — waits for PHP 8.3 |
| | *theme fixed* | |
| 2 | PHP 8.3 | done |
| 2 | Contact Form 7 6.2.4.1 | done, test message delivered |

Then `stepwise report` writes one page for the owner: what was updated, what
was caught before visitors saw it (with before / after / difference
screenshots), what is still waiting and why. Each pass also leaves `run.md`
for the next developer: versions, log lines, measurements.

The demo fails unless the site ends on PHP 8.3 with every other update
installed, the broken vendor update held back, and the last pass clean.

## Layout

```
lab/       docker-compose (MariaDB, WordPress on php7.4 / php8.3 images, WP-CLI),
           the theme, the vendor plugin 1.4 and 2.0, the theme fix, a mailbox mu-plugin
tool/      stepwise.mjs — plan, run, report
  lib/plan.mjs     ordering by requirements (unit-tested)
  lib/lab.mjs      WP-CLI, snapshots, rollback, PHP switch, wordpress.org lookups
  lib/checks.mjs   browser checks, pixel diff, verdict
  lib/report.mjs   owner page and run.md
demo.sh    the whole story from an empty Docker
```

Needs Docker, Node 20+ and Chrome or Chromium (`CHROME_PATH` to override).
CI runs the unit tests and the full demo on every push.

## On a real site

The lab stands in for a staging copy. On a client site the same loop runs
against staging, the pages and form fields come from the site itself, and the
accepted steps are then repeated on production in the same order — with the
same checks and a fresh backup in front of each one.
