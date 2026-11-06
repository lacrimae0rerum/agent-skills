# wastewater-ca

**Contents:** What it does · Fill in · Accounts and secrets · Prove it works

Status: bun Tools/Wastewater.ts config (from this skill's folder) · optional

## What it does

This skill answers "how much COVID, flu or RSV is going around in California right now" from wastewater, which tends to lead clinical testing by four to seven days. It reads two public sources each time you ask: CDC's National Wastewater Surveillance System, which gives every treatment plant a viral activity level (Very Low to Very High) for SARS-CoV-2, Influenza A and RSV, and the California Department of Public Health's sample-level data, which covers every pathogen CDPH tests for (including Influenza B, Mpox, Norovirus, H5 and Candida auris). It works statewide out of the box. Tell it which counties you live in and it also answers for that region.

How it is usually run: you ask the agent in plain words ("COVID levels before my trip?", "how's flu looking in wastewater?") and it runs the bundled `Tools/Wastewater.ts`. Needs: Bun 1.2+ and internet access to `data.cdc.gov` and `data.chhs.ca.gov`. No other skill is required. If you want a standing alert when a level jumps, wrap the same command in a scheduled job (example below).

## Fill in

Optional. Skip this and every answer is statewide. To add your region, create `$AGENT_SKILLS_HOME/wastewater-ca/Config.md` (default `~/.agent-skills/wastewater-ca/Config.md`); the folder under `$AGENT_SKILLS_HOME` is always this skill's own folder name, and `Wastewater.ts config` prints the exact path it looks for. Smallest working example, with made-up choices:

```markdown
---
version: 1.0.0
---

# Wastewater region

- region: Sacramento area
- counties: Sacramento 06067; Yolo 06113; Placer 06061
- rpho region: Greater Sierra-Sacramento
```

| Field | Meaning |
|---|---|
| `region` | The name answers use for your area |
| `counties` | `Name FIPS` pairs separated by `;`. The name is matched against CDC's county text, the 5-digit FIPS code (California's all start `06`) against CDPH's. Look a code up in the US Census county FIPS list. |
| `rpho region` | Optional. Your public-health region in the CHHS Respiratory Virus Dashboard, for test positivity and hospital admissions: Bay Area, Central California, Greater Sierra-Sacramento, Los Angeles, Rural North or Southern California |

To keep a second region on hand, save another file in the same format anywhere and point one run at it with `WASTEWATER_CONFIG`. A made-up example:

```bash
printf -- '- region: Fresno area\n- counties: Fresno 06019; Madera 06039\n' > ~/wastewater-fresno.md
WASTEWATER_CONFIG=~/wastewater-fresno.md bun Tools/Wastewater.ts covid   # from this skill's folder
```

Runs without the variable keep using your main Config.md.

### Extending it: a weekly alert

The skill only reads. If you want to hear about a jump without asking, schedule the read yourself. A generic starting point with made-up names: a small comparison script you own, run every Saturday after CDC's Friday update by cron (or launchd, a systemd timer, or your agent's own scheduler).

`~/wastewater-alert.ts` keeps last week's summary next to itself and always prints a summary object, so a scheduler log shows every run. Only when something moved does it also notify you; swap the notify command for your own channel (`osascript -e 'display notification ...'` on macOS, `notify-send` on Linux, an `ntfy` or mail command):

```ts
// Set WASTEWATER_TOOL to Tools/Wastewater.ts inside wherever this skill is installed.
const tool = process.env.WASTEWATER_TOOL ?? "/path/to/wastewater-ca/Tools/Wastewater.ts";
const run = Bun.spawnSync(["bun", tool, "covid", "--json"]);
if (run.exitCode !== 0) throw new Error(run.stderr.toString()); // a failed read fails the run
const now = JSON.parse(run.stdout.toString());
const file = Bun.file(`${import.meta.dir}/wastewater-last.json`);
const last = (await file.exists()) ? await file.json() : null;
await Bun.write(file, JSON.stringify(now));
const levels = ["Very Low", "Low", "Moderate", "High", "Very High"];
const up = last && levels.indexOf(now.mostCommon) > levels.indexOf(last.mostCommon);
const jump = last && now.highOrAbove - last.highOrAbove >= 3; // a first guess; tune it
const alerted = Boolean(up || jump);
if (alerted) {
  // Your channel here. notify-send is the Linux desktop example.
  Bun.spawnSync(["notify-send", `Wastewater levels rose in ${now.region}`,
    `Most common CDC level is now ${now.mostCommon}, week ending ${now.week}.`]);
}
console.log(JSON.stringify({ alerted, region: now.region ?? null, mostCommon: now.mostCommon ?? null, highOrAbove: now.highOrAbove ?? null, week: now.week ?? null }));
```

Run it once by hand (`bun ~/wastewater-alert.ts`) to check it prints the summary, then add a crontab line yourself with `crontab -e` (cron uses the machine's local time zone):

```
17 9 * * 6  WASTEWATER_TOOL=/path/to/wastewater-ca/Tools/Wastewater.ts bun "$HOME/wastewater-alert.ts" >> "$HOME/wastewater-alert.log" 2>&1
```

If an agent sets this up for you, it shows you the exact crontab line and waits for your go-ahead before installing it.

## Accounts and secrets

None. Both sources are public open-data APIs with no sign-up, and nothing goes in the environment or `$AGENT_SKILLS_HOME/.env` for this skill.

## Prove it works

From this skill's folder:

```bash
bun Tools/Wastewater.ts config
bun Tools/Wastewater.ts covid --dry-run
bun Tools/Wastewater.ts covid
```

Success: the first command prints your region, counties and the file it read. When it finds no file it prints `Source:  none: no file at <path>` and "none, so every command runs statewide"; if you did create a Config.md, move it to that exact path. The second prints the CDC request URL without touching the network. The third prints a line starting `SARS-CoV-2 wastewater viral activity —` with a week ending date no more than two weeks old and a count of sites at each CDC level. Exit 2 means a county in your Config.md has no valid `06xxx` code; exit 1 with "No ... WVAL rows" means none of your county names matched a CDC site.
