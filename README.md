# Mans plānotājs

Personal, Latvian-only planner for **mkalme/planner**, hosted at **https://mkalme.github.io/planner/**. Plain static HTML/CSS/JavaScript, Google authorization and a private `planner.json` file in Google Drive's hidden application-data folder. No server, database subscription, or account data in GitHub.

The selected compact-directory design retains the wide layout, yellow selected-view highlight, light appearance, and overlay-only drag previews. The narrow white sidebar follows the original directory prototype, with a yellow calendar heading and a thin vertical divider. Matching left and right page insets follow the prototype: 24px on desktop, 12px on tablet and 8px on small phones; the bottom inset is 24px. The divider ends with the calendar and has matching space above and below. The account menu uses the same plain rows and hover styling as quick status changes. Drag previews draw their dashed outline above the task's color band without moving the original task slot. The task editor has a taller description and a single row for date, status and priority. Task colors are assigned automatically and remain unchanged when tasks move or are edited. A tiny colored regenerate button beside the editor's close button previews a different retro color; saving applies it and canceling discards it. Status and priority changes add Latvian activity entries; personal comments remain optional.

Weekends and Latvian statutory public holidays use a pale red tint throughout the calendar; hover labels name the holiday in Latvian. Rules are based on the [holiday law](https://likumi.lv/ta/id/72608-par-svetku-atceres-un-atzimejamam-dienam), checked 2026-10-31, including Easter, Mother's Day, Pentecost and eligible substitute days. Confirmed Song and Dance Festival closing dates are listed explicitly through [2028](https://likumi.lv/ta/id/367734-par-xxviii-visparejo-latviesu-dziesmu-un-xviii-deju-svetku-norises-laiku), rather than guessed for future festivals. This is a statutory holiday calendar, not a complete historical law archive or an employer-specific schedule: optional workday transfers are not applied. Update the rules when legislation or festival dates change.

Task colors come from a 256-color RGB332 palette (three red bits, three green bits and two blue bits), filtered to 117 colorful shades that contrast with white by at least 3:1 without becoming nearly black. The regenerate symbol switches between black and white for readability. Completed colors still lift only lightness. Existing saved hue values remain intact; the expanded display palette gives them corresponding new shades.

New tasks prefer a visible retro color not already used by tasks on their chosen date, including completed tasks. If all available colors are taken, selection falls back to a random palette color. The regenerate button follows the same preference and chooses a different visible color from the preview. Changing a new task's date refreshes its automatic color unless the regenerate button was used explicitly. Existing tasks are never recolored merely by opening the editor, changing dates or dragging them.

The app fits the viewport height without an outer page scrollbar. Its layout is centered at a maximum width of 1440px, matching the prototype's effective left and right margins on wide screens; narrower screens use the responsive page padding. Long calendar content remains scrollable within its panel or day column using touch, wheel or keyboard (focus the calendar first). The sidebar calendar, heading and bottom privacy link share aligned edges, and its heading divider follows the main header height.

## Local development

Use Node 22 or newer:

```sh
npm ci
npm start
```

Open http://localhost:4173/planner/. The `/planner/` prefix is deliberate: it tests the actual GitHub Pages project URL. The unconfigured app opens read-only with an empty calendar. There are no automatically uploaded sample tasks.

For local Google sign-in, put your **development public OAuth client ID** in `public/config.js` temporarily; do not commit this local change. Alternatively run `GOOGLE_CLIENT_ID=your-client-id npm run build` and serve `dist/` with a static server. A client ID is public configuration, not a secret. Never put a client secret, service-account key, or token in any file.

## Google setup under your personal ownership

1. Create a Google Cloud project in your personal Google account; enable **Google Drive API**.
2. Configure the Google Auth Platform branding and audience. For initial testing add your own Google account as a test user. Set the app name to **Mans plānotājs**, home page to `https://mkalme.github.io/planner/`, and privacy policy to `https://mkalme.github.io/planner/privacy.html`. Use your own contact email.
3. Configure `openid`, `email`, and `https://www.googleapis.com/auth/drive.appdata`. Do not request Gmail access or broad Drive access.
4. Create a **Web application** OAuth client. Production Authorized JavaScript origin: **https://mkalme.github.io** (no `/planner/` path). The app uses Google's popup/token model, with no custom callback endpoint.
5. Use a separate development Cloud project/client with origins `http://localhost:4173` and `http://127.0.0.1:4173`. Production origins should not include development addresses.
6. The provided production client ID is configured in `public/config.js`. An optional Actions repository variable **GOOGLE_CLIENT_ID** overrides it during deployment. Complete any consent-screen production requirements shown by Google before regular use. Production status does not prevent short-lived browser tokens expiring; reconnect through the visible Google button when requested.

References: [browser authorization](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [application-data folder](https://developers.google.com/workspace/drive/api/guides/appdata).

## Publish in the personal account

No organizational repository or Sites deployment is used. Check that `gh api user --jq .login` returns **mkalme**. Refresh your login with `gh auth login -h github.com` if necessary.

From this project's directory, if `mkalme/planner` does **not** exist:

```sh
gh repo create mkalme/planner --public
git push -u origin main
```

If it already exists, inspect its contents before connecting this checkout; do not overwrite unrelated work. In repository **Settings → Pages**, choose **GitHub Actions** as the publishing source, then run the **Test and deploy planner** workflow. Pull requests run checks without deploying. The workflow intentionally refuses production deployment without a configured client ID.

`npm run build` copies only application assets to `dist/`. GitHub Pages publishes those assets; test artifacts, local recovery files, tokens, and Google account data are not deployed. The repository can be public while each account's Drive data stays private behind Google's permissions.

## Saving and recovery

- Account actions (refresh, export, import, account switching and sign-out) are in the compact email-address menu beside **Jauns uzdevums**. Save status stays visible in the header. Click outside the menu or press Escape to close it.
- New accounts start with an empty planner. After connecting Google, editing is enabled only after Drive loads successfully.
- Refreshing the page in the same tab restores the connection automatically while Google's access token is valid. Only the short-lived token, its original expiration deadline and public client ID are kept in `sessionStorage`; nothing is stored in localStorage for login. The account is verified with Google before Drive data or account-specific recovery data loads. Reloading never extends the token lifetime. Signing out, expiration or a rejected token clears the saved grant. Closing the tab ends this session in normal browser use; browser session-restore features may preserve it until expiration. If browser storage is disabled, manual sign-in still works but cannot survive refresh.
- Google browser authorization does not provide a refresh token. After the access token expires, use **Pieslēgt Google kontu** to reconnect. Staying signed in across expiration would require a different authorization architecture with a server; this static site does not attempt automatic authorization popups.
- Only **one device should edit at a time**. Wait for **Saglabāts Google diskā.** before switching devices. Saves, account loading and background refreshes are serialized, and Web Locks serialize uploads across tabs in the same browser. Before saving, the app compares the current remote planner with a SHA-256 fingerprint of the exact document originally loaded. Drive metadata-only version changes do not block saving; actual document changes do. This comparison is not an atomic cross-device lock; concurrent editing/merging is outside this version.
- While saving, offline, or after token expiration, new edits are disabled. Existing in-memory tasks remain available for reading and export. Modern browsers with Web Locks are required for saving.
- Pending writes are kept under account-specific `mkalme-planner:pending:<Google user ID>` localStorage keys. They contain task data and the original document fingerprint, **never access tokens**. Failed uploads can be retried after reconnecting without losing their original conflict baseline. A full-document fingerprint lets a retry recognize an earlier successful upload whose response was lost, without trusting `writeId` alone.
- Recovery copies from older releases have no baseline fingerprint, so they retain the conservative Drive version check. If one still reports a conflict, use **Lejupielādēt** to preserve the pending version, then **Atjaunot** to load Drive data. Review the downloaded file and use **Importēt** if that pending version should replace the current Drive data. The app downloads a backup and asks for confirmation before an import replaces data.
- Use **Lejupielādēt** to export the current/pending document. **Atjaunot** downloads pending changes before discarding them, after confirmation. Never clear browser data while it is the only copy of an unsaved write.
- **Importēt** validates the whole JSON file, displays counts, downloads the previous data, and requires confirmation before replacing Drive data. Unsupported versions or malformed records leave cloud data untouched. Maximum import size: 10 MB.
- Signing out clears the displayed tasks and account identity. Pending data remains scoped to the original account and is downloaded before sign-out. Another account cannot accidentally upload it.
- A duplicate `planner.json` or invalid cloud document stops editing rather than silently choosing or resetting data. Preserve/export the affected files before manual repair. The application-data folder itself is hidden from normal Drive browsing.

## Move existing prototype data

GitHub Pages cannot read the former prototype site's browser storage because the origins differ. In the browser **where your prototype tasks exist**, open the old compact planner and run this snippet in its developer console:

```js
const raw = localStorage.getItem('still-1990s-directory-compact-planner-v1');
if (raw === null) throw new Error('Šajā pārlūkā nav atrasti saglabāti uzdevumi.');
const data = {schemaVersion: 1, updatedAt: new Date().toISOString(), tasks: JSON.parse(raw)};
const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
const link = document.createElement('a');
link.href = url; link.download = 'planner-prototype-export.json'; link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

Then connect your Google account in the new app, choose **Importēt**, select the export and confirm. Task IDs, dates, order, colors, statuses, priorities, and history are preserved. Authored text is not translated or rewritten. Bare legacy task arrays are also accepted as imports.

## Checks and release gate

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Browser tests start their own local server if needed and test the `/planner/` URL. They mock Google/Drive and cover authorization denial and expiry, automatic session restoration, sign-out, initialization, status/history, metadata-only Drive version drift, actual content conflicts, recovery fingerprints across reload, serialized refreshes, import/export, offline write protection, account isolation, matching account/status menus, visible drag outlines, holidays across calendar views, and responsive layouts. Unit tests also cover invalid sessions, expiration, blocked browser storage, content fingerprints, upload acknowledgements and Latvian holiday rules. Test screenshots go to ignored `artifacts/`.

Before considering the production release verified, perform a **real Google account smoke test** on Pages: connect, create a task, wait for save, open the site on a second device with the same Google account, verify all fields and comments, edit there only after the first device finishes saving, then refresh the first device. Also test export and reconnect. Mocked tests cannot verify your OAuth consent configuration, account policy or actual Google API access.

Storage format: `{schemaVersion: 1, updatedAt, writeId, tasks: [...]}`. The existing task fields and stable internal status/priority values are retained. Breaking data changes must introduce an explicit schema migration; never replace unreadable data with samples.
