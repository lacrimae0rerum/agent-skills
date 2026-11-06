# Stripe

**Contents:** What it does · Fill in · Accounts and secrets · Prove it works

Status: `bun Tools/StripeRead.ts balance` (from the skill folder) · optional

## What it does

Runs Stripe billing work from the terminal: lists products and prices, counts subscribers, calculates MRR and revenue trends, looks up customers and payments, and, only after you approve each one, creates products, prices, coupons, invoices and payment links, refunds charges and cancels subscriptions. Reads go through a read-only command shipped with the skill (`Tools/StripeRead.ts`) that has no write path. Writes use the official `stripe` npm package. It works with one Stripe account or several, each chosen by an alias. Invoices you send by hand can be tracked until paid with `Tools/InvoiceWatch.ts`. If you run an admin dashboard that caches Stripe data, the skill can read it for fast overview answers; this is optional.

## Fill in

One file: `$AGENT_SKILLS_HOME/stripe/Config.md` (default `~/.agent-skills/stripe/Config.md`). The skill stops and points here when it is missing or `STRIPE_SDK_DIR` is unset.

Smallest working example:

```markdown
# Stripe — Config

## SDK

- `STRIPE_SDK_DIR`: ~/Tools/stripe-sdk
- `STRIPE_API_VERSION`: 2026-02-25.clover
- `TIMEZONE`: America/New_York

## Accounts

| Alias | Env var | Key type | Role |
|---|---|---|---|
| (main) | `STRIPE_SECRET_KEY` | sk_live | Default account |
| shop | `STRIPE_SECRET_KEY_SHOP` | rk_live (restricted) | Optional second account |
| test | `STRIPE_SECRET_KEY_TEST` | sk_test | Optional test mode of the main account |

## Products

| Product | Account | Domain | Product ID | Price ID env vars | Amounts |
|---|---|---|---|---|---|
| Example Pro | (main) | example.com | prod_0000000000000000 | `EXAMPLEPRO_PRICE_ID_1` | $10/mo |
```

| Field | Meaning |
|-------|---------|
| `STRIPE_SDK_DIR` | A folder where the `stripe` package is installed. Create it with `mkdir -p ~/Tools/stripe-sdk && cd ~/Tools/stripe-sdk && bun add stripe`. The skill reads it from this file; you do not export it |
| `STRIPE_API_VERSION` | The Stripe API version every SDK call passes. Use the version your installed `stripe` package was built for (Stripe's changelog lists it per release) |
| `TIMEZONE` | Time zone for day boundaries in daily revenue and attribution reports |
| Alias | The name you pass as `--account <alias>` to `StripeRead.ts` and `InvoiceWatch.ts`. The main account has no alias |
| Env var | `STRIPE_SECRET_KEY` for the main account, `STRIPE_SECRET_KEY_<ALIAS in capitals>` for every other one |
| Products table | Every product you may ask about, retired ones included, so history attributes correctly |

Optional sections in the same file, worked examples:

```markdown
## Invoicing practice

- Line wording: the words the client's accounts-payable team uses, for example "Consulting, March engagement".
- Cover email goes from the business mailbox with a copy to me.
- Follow-up date: seven days after sending.

## Admin dashboard

- `ADMIN_DASHBOARD_URL`: https://admin.example.com
- `ADMIN_DASHBOARD_SOURCE`: ~/Projects/your-admin-dashboard
- Cached endpoints: `/api/stripe/overview` (customers, active subscriptions, MRR), `/api/stripe/revenue` (12 months)
```

`## Invoicing practice` holds your own conventions for invoices you send by hand; the Manage intent follows it. `## Admin dashboard` points overview questions at a dashboard of yours that caches Stripe endpoints; without it every answer comes from the SDK.

To hear when a hand-sent invoice is paid, reaches its follow-up date or sits overdue, run `Tools/InvoiceWatch.ts gate` once a day. `gate` prints one line per piece of news, then `{"wakeAgent": true|false}`, and records each piece as told, so whatever runs it must pass the lines on. Schedule it with any scheduler you already use (cron, launchd, systemd timers, or your agent's own scheduled tasks). Worked example: save this as a small script outside the skill folder (for example `~/bin/invoice-watch.sh`), with `<skill folder>` replaced by the absolute path of this skill and `notify` replaced by your own notifier (a mail command, a chat webhook script, a desktop notification) that reads the news from stdin:

```sh
#!/bin/sh
cd "<skill folder>" || exit 1
out=$(bun Tools/InvoiceWatch.ts gate) || exit 1
news=$(printf '%s\n' "$out" | grep -v '"wakeAgent"')
if [ -n "$news" ]; then printf '%s\n' "$news" | notify; else echo "nothing new"; fi
```

Then run it daily, for example with the crontab line `0 9 * * * $HOME/bin/invoice-watch.sh` (keep `printf` and its `%` inside the script: cron treats a bare `%` in a crontab line as a newline).

On a day with news your notifier receives lines such as `PAID: …` or `FOLLOW-UP: …`; a quiet day prints `nothing new`. Keys come from the environment or `$AGENT_SKILLS_HOME/.env`, which the tool loads itself, so a cron job needs no `--env-file`. `gate` marks news as told before your notifier receives it, so a failed notifier makes the script exit non-zero; check the scheduler's log when a run fails, because a piece of news lost in a failed hand-off is not repeated. A `CHECK_FAILED: …` line means Stripe could not be read for that invoice; it is reported again on the next run.

## Accounts and secrets

- A Stripe account. In the Dashboard open Developers, then API keys, and create a secret key (`sk_live_...`) or a restricted key (`rk_live_...`) with the scopes you want. A restricted key with read scopes only is the safe choice for a second account.
- Env keys, exported in your shell or written to `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`; names only here, values from the Dashboard): `STRIPE_SECRET_KEY` for the main account and `STRIPE_SECRET_KEY_<ALIAS>` for each additional one. A test-mode key (`sk_test_...`) is one more account: give it its own row with an alias such as `test` (`STRIPE_SECRET_KEY_TEST`, used as `--account test`), or `shop_test` for a second account's test mode.
- Price IDs, if your workflows need them, are stored as env vars with the names listed in your Products table. Copy them from Dashboard, Product catalog, Pricing.

## Prove it works

Run these from the skill folder. Every command below reads only; `Tools/StripeRead.ts` has no write path.

1. `bun Tools/StripeRead.ts balance` prints your account balance as JSON, starting with `"object": "balance"`. For an additional account add `--account shop`. A missing key prints `[StripeRead] STRIPE_SECRET_KEY_SHOP not found (…)` and exits 1.
2. `bun Tools/StripeRead.ts products` lists your active products; check each one appears in your Config.md Products table.
3. `bun Tools/InvoiceWatch.ts list` prints the invoices you have registered for tracking, or `no tracked invoices` on a fresh install.
4. `ls ~/Tools/stripe-sdk/node_modules/stripe/package.json`, with the `STRIPE_SDK_DIR` folder from your Config.md in place of `~/Tools/stripe-sdk`, prints that path back and proves the SDK the write scripts import is installed.
