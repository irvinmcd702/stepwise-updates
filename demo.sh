#!/usr/bin/env bash
# The whole story on a fresh lab: an outdated site, a plan, a first pass that
# catches two problems and undoes them, a fix, a second pass, the owner report.
# Run from the repository root: ./demo.sh
set -euo pipefail
cd "$(dirname "$0")"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
stepwise() { node tool/stepwise.mjs "$@"; }
in_cli() { (cd lab && MSYS_NO_PATHCONV=1 PHP_VERSION="$(cat php-version)" docker compose run --rm -T --entrypoint sh cli -c "$1"); }

[ -d tool/node_modules ] || (cd tool && npm ci --no-fund --no-audit)

step "1. Fresh lab: WordPress 6.4 on PHP 7.4, plugins two years behind"
(cd lab && docker compose down -v >/dev/null 2>&1 || true)
rm -rf runs lab/backups/* lab/logs/*
./lab/seed.sh | tail -1

step "2. The plan"
stepwise plan

step "3. First pass"
stepwise run

step "4. Fix what blocked PHP 8.3: the theme still calls a function removed in PHP 8"
grep -h "PHP fatal error" runs/*/run.md | head -1
in_cli 'cp /fixes/harbor-functions.php wp-content/themes/harbor/functions.php'

step "5. Second pass"
stepwise run --note "the theme's PHP 8 incompatibility was fixed"

step "6. Owner report"
stepwise report runs/2*/ --out runs/owner-report.html

step "Result"
last=$(ls -d runs/2*/ | tail -1)
node -e '
const r = require("./" + process.argv[1] + "run.json");
const a = r.after, held = require("./runs/holds.json");
const fail = [];
if (a.php !== "8.3") fail.push("PHP is " + a.php);
const pending = r.plan.blocked.length + r.steps.filter(s => s.status !== "done").length;
if (pending) fail.push(pending + " step(s) not done in the last pass");
if (!held["harbor-hours"]) fail.push("the broken vendor update was not held");
if (a.plugins["harbor-hours"] !== "1.4") fail.push("harbor-hours is " + a.plugins["harbor-hours"]);
console.log(`WordPress ${a.core}, PHP ${a.php}, ` + Object.entries(a.plugins).map(([k, v]) => k + " " + v).join(", "));
if (fail.length) { console.log("FAIL: " + fail.join("; ")); process.exit(1); }
console.log("PASS");
' "$last"
