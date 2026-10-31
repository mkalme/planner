# Mans plānotājs

Personal, Latvian-only planner for **mkalme/planner**, hosted at **https://mkalme.github.io/planner/**. Plain static HTML/CSS/JavaScript, Google authorization and a private `planner.json` file in Google Drive's hidden application-data folder. No server, database subscription, or account data in GitHub.

The selected compact-directory design retains the wide layout, original task editor and yellow selected-view highlight, full-height edge-to-edge gray sidebar, light appearance, and overlay-only drag previews. Tasks retain their color when moved. Status and priority changes add Latvian activity entries; personal comments remain optional.

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

- New accounts start with an empty planner. After connecting Google, editing is enabled only after Drive loads successfully.
- Only **one device should edit at a time**. Wait for **Saglabāts Google diskā.** before switching devices. Saves are serialized, and Web Locks serialize uploads across tabs in the same browser. A newer remote file version blocks a stale save. The version check is not an atomic cross-device lock; concurrent editing/merging is outside this version.
- While saving, offline, or after token expiration, new edits are disabled. Existing in-memory tasks remain available for reading and export. Modern browsers with Web Locks are required for saving.
- Pending writes are kept under account-specific `mkalme-planner:pending:<Google user ID>` localStorage keys. They contain task data, **never access tokens**. Failed uploads can be retried after reconnecting. The upload's `writeId` lets a retry recognize an earlier successful upload whose response was lost.
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

Browser tests start their own local server if needed and test the `/planner/` URL. They mock Google/Drive and cover authorization denial and expiry, initialization, status/history, saving, failed uploads across reload, stale remote versions, import/export, offline write protection, account isolation, and responsive views. Test screenshots go to ignored `artifacts/`.

Before considering the production release verified, perform a **real Google account smoke test** on Pages: connect, create a task, wait for save, open the site on a second device with the same Google account, verify all fields and comments, edit there only after the first device finishes saving, then refresh the first device. Also test export and reconnect. Mocked tests cannot verify your OAuth consent configuration, account policy or actual Google API access.

Storage format: `{schemaVersion: 1, updatedAt, writeId, tasks: [...]}`. The existing task fields and stable internal status/priority values are retained. Breaking data changes must introduce an explicit schema migration; never replace unreadable data with samples.
