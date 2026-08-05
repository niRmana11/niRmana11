# Auto-updating GitHub stats widget — setup

This generates a custom SVG stats card (commits, PRs, issues, stars, followers,
repo count, contribution streak, top languages) and refreshes it automatically
once a day via GitHub Actions.

## 1. Find (or create) your profile repo

GitHub profile READMEs live in a special repo named exactly the same as your
username: **`niRmana11/niRmana11`**. If you don't have it yet, create a new
public repo with that exact name and add a `README.md` to it.

## 2. Add these files to that repo

Copy this folder's contents into the root of `niRmana11/niRmana11`:

```
scripts/generate-stats.js
.github/workflows/update-stats.yml
```

## 3. Create a Personal Access Token (PAT)

The default `GITHUB_TOKEN` that Actions provides can't read your full
contribution history across all repos, so you need a token with a bit more
access:

1. Go to **GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token**.
2. Scopes needed: `read:user` and `repo` (repo is only needed if you want
   private contributions counted — skip it if you only want public stats).
3. Copy the token (you'll only see it once).

## 4. Store it as a repo secret

In `niRmana11/niRmana11` → **Settings → Secrets and variables → Actions →
New repository secret**:

- Name: `STATS_TOKEN`
- Value: (paste the PAT)

## 5. Run it

Go to the **Actions** tab → "Update GitHub Stats Widget" → **Run workflow**
to trigger it manually the first time. After that it runs automatically every
day at 03:00 UTC, and also whenever you push to `main`.

It will commit `generated/stats-card.svg` back into your repo.

## 6. Embed it in your README

```markdown
![My GitHub stats](https://raw.githubusercontent.com/niRmana11/niRmana11/main/generated/stats-card.svg)
```

## Customizing

Everything about the look lives in `scripts/generate-stats.js` inside the
`renderSvg` function:

- **Colors**: edit the `bg`, `panel`, `border`, `textPrimary`, `textMuted`,
  `accent` variables near the top of `renderSvg`.
- **Which stats show**: edit the `stats` array (label/value pairs).
- **Card size**: `width` / `height` constants.
- **Schedule**: edit the `cron` line in `.github/workflows/update-stats.yml`
  (currently daily at 03:00 UTC).

Once you tweak the script, just push — the next scheduled run (or a manual
"Run workflow") will regenerate the card with your changes.
