#!/usr/bin/env node
/**
 * Fetches public repo data from the GitHub API and writes projects.json.
 *
 * Which repos to show (and in what order) is controlled by FEATURED_REPOS below.
 * Add or remove repo names there — the script skips any that are private or missing.
 *
 * Run manually:  node .github/scripts/fetch-projects.js
 * In CI:        GITHUB_TOKEN is injected automatically by GitHub Actions.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Configuration ─────────────────────────────────────────────────────────
const USERNAME = 'TheMightyNighty';

// Edit this list to control which repos appear and in what order.
// Any repo that becomes private or is deleted is silently skipped.
const FEATURED_REPOS = [
  'jsonforms-designer',
  'ImpExpNL',
  // TODO: Repo-Namen des Matomo-Ersatzes hier eintragen sobald er angelegt ist
  // 'typo3-analytics',
];

const LANG_COLORS = {
  TypeScript:  '#4f9cf9',
  JavaScript:  '#f1e05a',
  Go:          '#00add8',
  PHP:         '#a78bfa',
  Python:      '#3572a5',
  Rust:        '#dea584',
  Shell:       '#89e051',
  HTML:        '#e34c26',
  CSS:         '#563d7c',
};
const FALLBACK_COLOR = '#8a99aa';
// ───────────────────────────────────────────────────────────────────────────

function fetchJSON(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent':    'github-actions/update-projects',
        'Accept':        'application/vnd.github.v3+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let body = '';
      res.on('data',  chunk => { body += chunk; });
      res.on('end',   ()    => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const token = process.env.GITHUB_TOKEN;

  console.log(`Fetching repos for ${USERNAME}…`);
  const allRepos = await fetchJSON(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100&type=public`,
    token
  );

  if (!Array.isArray(allRepos)) {
    throw new Error(`Unexpected API response: ${JSON.stringify(allRepos).slice(0, 200)}`);
  }

  const byName = {};
  allRepos.forEach(r => { byName[r.name] = r; });

  // Check which repos have a custom screenshot in the screenshots/ folder.
  const screenshotsDir = path.resolve(__dirname, '../../screenshots');
  const screenshotExts = ['.png', '.jpg', '.jpeg', '.webp'];
  function localScreenshot(repoName) {
    for (const ext of screenshotExts) {
      const file = path.join(screenshotsDir, repoName + ext);
      if (fs.existsSync(file)) return `./screenshots/${repoName}${ext}`;
    }
    return null;
  }

  const featured = FEATURED_REPOS
    .filter(name => {
      if (!byName[name]) { console.warn(`  ⚠ Repo "${name}" not found (private or deleted) — skipped.`); }
      return !!byName[name];
    })
    .map(name => {
      const r = byName[name];
      const local = localScreenshot(r.name);
      if (local) console.log(`  📸 Using local screenshot for "${r.name}": ${local}`);
      return {
        name:      r.name,
        desc:      r.description || '',
        lang:      r.language    || 'Other',
        langColor: LANG_COLORS[r.language] || FALLBACK_COLOR,
        url:       r.html_url,
        ogUrl:     local || `https://opengraph.githubassets.com/1/${USERNAME}/${r.name}`,
        stars:     r.stargazers_count,
        forks:     r.forks_count,
        updatedAt: r.pushed_at,
      };
    });

  const outPath = path.resolve(__dirname, '../../projects.json');
  fs.writeFileSync(outPath, JSON.stringify(featured, null, 2) + '\n');
  console.log(`✓ Wrote ${featured.length} repo(s) to projects.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
