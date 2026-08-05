/**
 * generate-stats.js
 *
 * Fetches live GitHub stats for a user via the GraphQL API and renders
 * a custom SVG "stats card" for a profile README.
 *
 * Requires Node 18+ (built-in fetch).
 * Requires env vars:
 *   GH_USERNAME   - the GitHub username to build the card for
 *   GH_TOKEN      - a token with at least `read:user` and `public_repo` scopes
 *
 * Usage:
 *   GH_USERNAME=niRmana11 GH_TOKEN=xxxx node scripts/generate-stats.js
 *
 * Output:
 *   generated/stats-card.svg
 */

const fs = require("fs");
const path = require("path");

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN;

if (!USERNAME || !TOKEN) {
  console.error("Missing GH_USERNAME or GH_TOKEN environment variables.");
  process.exit(1);
}

const QUERY = `
query ($login: String!) {
  user(login: $login) {
    name
    login
    followers { totalCount }
    repositories(first: 100, ownerAffiliation: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        name
        stargazerCount
        languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
          edges {
            size
            node { name color }
          }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`;

async function fetchStats() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data.user;
}

function computeStreaks(weeks) {
  const days = weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let longest = 0;
  let running = 0;
  let current = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days.length; i++) {
    if (days[i].contributionCount > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  // current streak: walk backwards from the most recent day
  for (let i = days.length - 1; i >= 0; i--) {
    const d = new Date(days[i].date);
    d.setHours(0, 0, 0, 0);
    // allow "today" to have 0 contributions so far without breaking the streak
    if (d.getTime() === today.getTime() && days[i].contributionCount === 0) {
      continue;
    }
    if (days[i].contributionCount > 0) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, longest };
}

function computeLanguages(repos) {
  const totals = {};
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      const color = edge.node.color || "#8b8b8b";
      totals[name] = totals[name] || { size: 0, color };
      totals[name].size += edge.size;
    }
  }
  const sum = Object.values(totals).reduce((a, b) => a + b.size, 0) || 1;
  return Object.entries(totals)
    .map(([name, v]) => ({ name, color: v.color, pct: (v.size / sum) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderSvg({ user, totalStars, streak, languages }) {
  const width = 480;
  const height = 300;

  // ---- palette: warm charcoal + amber accent, distinct from generic blue/purple themes ----
  const bg = "#14161a";
  const panel = "#1c1f26";
  const border = "#2a2e37";
  const textPrimary = "#f1efe9";
  const textMuted = "#9a9fab";
  const accent = "#f2a541"; // amber

  const stats = [
    { label: "Commits (yr)", value: user.contributionsCollection.totalCommitContributions },
    { label: "Pull Requests", value: user.contributionsCollection.totalPullRequestContributions },
    { label: "Issues", value: user.contributionsCollection.totalIssueContributions },
    { label: "Stars Earned", value: totalStars },
    { label: "Followers", value: user.followers.totalCount },
    { label: "Public Repos", value: user.repositories.totalCount },
  ];

  const statCols = 3;
  const statCellW = 140;
  const statCellH = 58;
  const statsStartX = 24;
  const statsStartY = 96;

  const statBlocks = stats
    .map((s, i) => {
      const col = i % statCols;
      const row = Math.floor(i / statCols);
      const x = statsStartX + col * statCellW;
      const y = statsStartY + row * statCellH;
      return `
        <g transform="translate(${x}, ${y})">
          <text x="0" y="0" font-size="20" font-weight="700" fill="${textPrimary}" font-family="'Segoe UI', Helvetica, Arial, sans-serif">${escapeXml(
        s.value
      )}</text>
          <text x="0" y="20" font-size="11" fill="${textMuted}" font-family="'Segoe UI', Helvetica, Arial, sans-serif">${escapeXml(
        s.label
      )}</text>
        </g>`;
    })
    .join("\n");

  // language bar (stacked horizontal bar)
  const barX = 24;
  const barY = height - 78;
  const barW = width - 48;
  const barH = 10;
  let cursor = 0;
  const langBar = languages
    .map((l) => {
      const w = (l.pct / 100) * barW;
      const rect = `<rect x="${barX + cursor}" y="${barY}" width="${w.toFixed(
        2
      )}" height="${barH}" rx="2" fill="${l.color}" />`;
      cursor += w;
      return rect;
    })
    .join("\n");

  const langLegend = languages
    .map((l, i) => {
      const x = barX + (i % 3) * ((barW - 24) / 3);
      const y = barY + 26 + Math.floor(i / 3) * 18;
      return `
        <g transform="translate(${x}, ${y})">
          <circle cx="4" cy="-4" r="4" fill="${l.color}" />
          <text x="14" y="0" font-size="11" fill="${textMuted}" font-family="'Segoe UI', Helvetica, Arial, sans-serif">${escapeXml(
        l.name
      )} ${l.pct.toFixed(1)}%</text>
        </g>`;
    })
    .join("\n");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI', Helvetica, Arial, sans-serif">
  <defs>
    <clipPath id="rounded">
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" />
    </clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect width="${width}" height="${height}" fill="${bg}" />
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="none" stroke="${border}" />

    <!-- header -->
    <text x="24" y="34" font-size="18" font-weight="700" fill="${textPrimary}">${escapeXml(
    user.name || user.login
  )}</text>
    <text x="24" y="54" font-size="12" fill="${accent}">@${escapeXml(user.login)}</text>

    <!-- streak badge -->
    <g transform="translate(${width - 148}, 16)">
      <rect x="0" y="0" width="124" height="46" rx="10" fill="${panel}" stroke="${accent}" stroke-width="1.5" />
      <text x="62" y="20" font-size="16" font-weight="700" fill="${accent}" text-anchor="middle">${
    streak.current
  } day${streak.current === 1 ? "" : "s"}</text>
      <text x="62" y="36" font-size="9.5" fill="${textMuted}" text-anchor="middle">current \u00b7 longest ${
    streak.longest
  }</text>
    </g>

    <!-- divider -->
    <line x1="24" y1="72" x2="${width - 24}" y2="72" stroke="${border}" stroke-width="1" />

    <!-- stats grid -->
    ${statBlocks}

    <!-- divider -->
    <line x1="24" y1="${statsStartY + Math.ceil(stats.length / statCols) * statCellH - 20}" x2="${
    width - 24
  }" y2="${statsStartY + Math.ceil(stats.length / statCols) * statCellH - 20}" stroke="${border}" stroke-width="1" />

    <!-- languages -->
    <text x="24" y="${barY - 14}" font-size="11" fill="${textMuted}" letter-spacing="0.5">TOP LANGUAGES</text>
    ${langBar}
    ${langLegend}
  </g>
</svg>`;
}

async function main() {
  const user = await fetchStats();
  const repos = user.repositories.nodes;
  const totalStars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);
  const streak = computeStreaks(user.contributionsCollection.contributionCalendar.weeks);
  const languages = computeLanguages(repos);

  const svg = renderSvg({ user, totalStars, streak, languages });

  const outDir = path.join(__dirname, "..", "generated");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stats-card.svg"), svg, "utf8");
  console.log("Wrote generated/stats-card.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
