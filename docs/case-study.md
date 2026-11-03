# Case study: the bakery site nobody wanted to update

*Fictional client, real problems. Everything below is reproduced by
`./demo.sh` on a lab site; the numbers come from the demo's own run notes.*

## The situation

Harbor & Pine Bakery has a small WordPress site: home page with opening
hours, a menu, a visit page, a contact form that brings in catering orders.
An agency built the theme in 2017. Since then the site has been "left alone":
PHP 7.4, WordPress two major versions behind, a premium opening-hours plugin
bought once and never touched. The host has started warning that PHP 7.4 is
going away.

The owner had tried "update all" on another site once and spent a weekend
with a white screen. The request was simple: bring it up to date, and don't
break the thing that takes orders.

## Why "update all" is the wrong button

Each update has requirements, and they point in different directions:

| | installed | latest | the latest one needs |
|---|---|---|---|
| WordPress | 6.4.5 | 7.1.4 | — |
| Contact Form 7 | 5.7.7 | 6.2.4.1 | WordPress 7.1 **and** PHP 8.3 |
| Yoast SEO | 22.0 | 28.8 | WordPress 7.0 |
| Harbor Hours (vendor) | 1.4 | 2.0 | — |
| PHP | 7.4 | 8.3 | a theme that runs on PHP 8 |

Clicking "update all" tries the contact form first and installs a version
that cannot run on this server — on the one page that brings in money.

The order has to come from the requirements, not from the alphabet:

```
1. Harbor Hours 1.4 → 2.0      works on what the site has now
2. WordPress 6.4.5 → 7.1.4     the rest are waiting for it
3. Yoast SEO 22.0 → 28.8       needs WordPress 7.0
4. PHP 7.4 → 8.3               last platform step, once WordPress is current
5. Contact Form 7 → 6.2.4.1    needs WordPress 7.1 and PHP 8.3
```

## What every step goes through

Snapshot (files, database, and which PHP the site ran on) → update → checks
in a real browser → accept, or roll back and prove the rollback worked.

The checks are the ones an owner would do if they had the patience:

- every key page opens, without a 500 or "There has been a critical error";
- the page still looks the same — pixel comparison with the last good state,
  with a difference image saved for each page;
- a test message sent through the contact form actually arrives;
- the PHP log has no new fatal errors (new warnings are recorded, not fatal).

## What it caught

**The vendor update that looked fine.** Harbor Hours 2.0 installs without a
single error. The new version loads its styles only where its new block is
used. The bakery uses the old shortcode, so its opening hours turned into an
unstyled line of text. The visual check flagged it: 0.83% of the home page
and 1.2% of the visit page changed, home page 119 pixels shorter. A person
glancing at the site might miss it; customers checking whether the bakery is
open on Monday would not. Rolled back, and the version is put on hold so the
next run doesn't trip over it again.

**The theme that dies on PHP 8.** Switching to PHP 8.3 took down every page:
the theme still used a PHP function removed in 8.0. On 7.4 this had been a
"deprecated" line in a log nobody reads — for years. The log check gave the
exact file and line; the site went back to PHP 7.4 within the same step and
the checks confirmed it matched the last good state.

**The step that had to wait.** Contact Form 7 6.2 was skipped with a reason,
not attempted: "waits for PHP 8.3; the site has WordPress 7.1.4 on PHP 7.4".

**What was not a problem.** After the WordPress update, Yoast wrote a new
warning about loading translations too early. It is noted in the run, not
treated as a failure — a tool that rolls back on every warning gets switched
off by the second week.

## The result

| pass | step | result | time |
|---|---|---|---|
| 1 | Harbor Hours 2.0 | rolled back, on hold | 68 s |
| 1 | WordPress 7.1.4 | done | 50 s |
| 1 | Yoast SEO 28.8 | done | 41 s |
| 1 | PHP 8.3 | rolled back — theme, file and line | 85 s |
| 1 | Contact Form 7 6.2.4.1 | skipped — waits for PHP 8.3 | — |
| | *one line in the theme fixed* | | |
| 2 | PHP 8.3 | done | 28 s |
| 2 | Contact Form 7 6.2.4.1 | done, test message delivered | 32 s |

Visitors never saw either breakage. The site ends on PHP 8.3 with everything
current except the one vendor update that is waiting for a fix from the
vendor — and the owner knows exactly why it is waiting.

The owner gets one page in plain language: what was updated, what was caught
before anyone saw it (with before / after / difference screenshots), what is
still waiting and what it waits for —
[sample-owner-report.html](sample-owner-report.html). The next developer gets
`run.md` with versions, log lines and measurements.

## What carries over to a real site

- Order updates by what each one requires. PHP is a platform step like
  WordPress itself, and it goes after WordPress, not before.
- "No errors" is not "nothing broke". The worst breakages are visual and
  silent; compare the pages.
- Test the form by sending a message, not by opening the page.
- Read the PHP log *before* updating. Most PHP 8 fatals are announced for
  years as deprecation notices.
- A rollback isn't done until the site is checked again and matches the last
  good state.
- On a live site the loop runs on a staging copy first; the accepted steps are
  repeated on production in the same order, with a fresh backup and the same
  checks in front of each one.
