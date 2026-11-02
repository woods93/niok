# The Nashville I Once Knew: news aggregator

A static website that collects Nashville and Nashville music news, flags stories that look back at the 1980s and early 1990s scene, and links to the original publishers. A scheduled GitHub Actions job refreshes it every 4 hours. There is no server and no database.

## How it works

1. `scripts/ingest.mjs` reads the feeds in `config/sources.json`, removes duplicates, and scores each story using `config/entities.json`.
2. It saves the results as JSON files in `src/_data/` (last 90 days) and `data/archive/` (older, by month).
3. Eleventy builds the pages from those files and GitHub Pages publishes them.
4. The hosts' picks come from an optional Google Sheet (see below).

## First-time setup

1. Upload everything in this folder to the repository (Add file, then Upload files).
2. Create the workflow file: Add file, Create new file, type `.github/workflows/update.yml` as the name, paste the contents of `update.yml`, and commit.
3. In the repository, open Settings, then Pages. Under Build and deployment, set Source to **GitHub Actions**.
4. Open the Actions tab, choose **Update news and deploy site**, and click **Run workflow**. The first run takes a few minutes.
5. When it finishes, the site is at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
6. Open the site's **Source status** page (link in the footer). It shows which feeds answered. Fix or disable any that failed in `config/sources.json`.

## Connecting a custom domain

1. Buy the domain from a registrar.
2. In the repository, open Settings, Pages, and enter the domain under Custom domain. GitHub shows the DNS records to add at your registrar.
3. Add those records at the registrar. When GitHub's check passes, turn on Enforce HTTPS.
4. In Settings, Secrets and variables, Actions, open the Variables tab and add:
   - `PATH_PREFIX` with the value `/`
   - `SITE_URL` with the value `https://yourdomain.com`
5. Run the workflow again so the site is rebuilt with the new addresses.

## Editing things

Edit files on GitHub (open the file, click the pencil icon, commit). Each commit rebuilds the site.

| To change | Edit |
| --- | --- |
| Sources and Google News searches | `config/sources.json` |
| Venues, artists, labels, remembrance words, scoring weights, threshold | `config/entities.json` |
| Site title, tagline, contact email, podcast link | `src/_data/site.js` |
| Look of the site | `src/assets/style.css` |

Set `contact` in `src/_data/site.js` before launch. The About page uses it for corrections and takedown requests.

The scoring is a first pass. If too many ordinary stories get flagged, raise `threshold` in `config/entities.json` from 3 to 4. If too few, add more names to `entities`.

## Host picks and This Day (Google Sheet)

1. Create a Google Sheet. Put these headers in row 1: `url`, `pin`, `note`, `tags`, `episode`, `nostalgia_override`, `title`, `source`, `date`.
2. Each row is a story. Only `url` is required. `pin` is yes or no. `episode` can be text or a link. To add a story the feeds missed, fill in `title`, `source`, and `date` too.
3. In the sheet, choose File, Share, Publish to web. Pick the tab and the format **Comma-separated values (.csv)**, then publish and copy the link.
4. In the repository, open Settings, Secrets and variables, Actions, Variables, and add `PICKS_CSV_URL` with that link.
5. For "This day in Nashville music," use a second tab with headers `month`, `day`, `year`, `event`, `url`, publish it the same way, and save the link as `THISDAY_CSV_URL`.

A published sheet is public, so keep private notes elsewhere.

## Known limits

- Scheduled runs are best effort and can start late. GitHub also pauses scheduled workflows in a public repository after 60 days with no repository activity. The update job commits new data on most runs, which should keep it active, but check the Actions tab now and then.
- Feeds change. The Source status page and the Actions log show failures.
- Google News links are redirects through Google. Those stories open at Google first, then the publisher.
- The feed addresses in `config/sources.json` for Saving Country Music, Music Row, WPLN, Billboard, and Rolling Stone are best guesses, not confirmed.

## Running it on your own computer (optional)

Needs Node 20 or newer.

```
npm install
npm run update
npm start
```
