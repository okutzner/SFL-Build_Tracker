# Short Form Learning — Build Tracker

A shared team board for tracking Short Form Learning builds, with a Kanban view,
a timeline view, and a full project-intake form. No server required — data
lives in a free Firebase (Firestore) database, and the site itself is static
HTML you can host on GitHub Pages (or any static host).

## Files

- `short-form-learning-tracker.html` — the board (Kanban + Timeline views)
- `new-project.html` — the full "new project" intake form (also used for editing)
- `data-client.js` — shared code that talks to Firestore (used by both pages)
- `firebase-config.js` — **you edit this** with your own project's config
- `firestore.rules` — paste these into the Firebase console once, to open up read/write access

## Setup

### 1. Create a Firebase project
Go to [console.firebase.google.com](https://console.firebase.google.com), sign in
with a Google account, and click **Add project**. Free tier (Spark plan) is fine.

### 2. Create a Firestore database
In your new project: **Build → Firestore Database → Create database**.
Choose **Start in production mode** (we'll set our own rules next), pick any
region, and create it.

### 3. Set the security rules
Go to the **Rules** tab of Firestore, delete what's there, paste in the
contents of `firestore.rules`, and click **Publish**.

### 4. Register a web app and get your config
In **Project settings** (gear icon, top left) → **General** tab → scroll to
"Your apps" → click the `</>` (Web) icon → give it any nickname → **Register app**.
Firebase will show you a config object like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 5. Fill in `firebase-config.js`
Open `firebase-config.js` and replace the placeholder values with the ones
from step 4.

### 6. Push to GitHub
Create a new repo and push all the files in this folder to it (they need to
stay together — the HTML pages link to each other by filename, and both load
`firebase-config.js` and `data-client.js`).

### 7. Enable GitHub Pages
In your repo: **Settings → Pages → Source → Deploy from a branch**, pick
`main` and `/ (root)`, save. GitHub will give you a URL like
`https://yourname.github.io/your-repo/`.

### 8. Open it
Visit `https://yourname.github.io/your-repo/short-form-learning-tracker.html`.
The first load will seed a few example projects into your database
automatically. Anyone with the link can view and edit the board.

## How data works

Each project is one document in the `builds` Firestore collection. Both
pages talk to Firestore directly from the browser via `data-client.js` — no
backend server involved. Changes made by one person show up for everyone
else automatically (Firestore's realtime listeners), without needing to
refresh.

## Security note

This is set up for **open read/write access** — there's no login, and the
Firebase config (including the API key) is visible in the page source
(that's normal for this kind of setup; access control comes from the
Firestore rules, not from hiding the key). That's fine for an internal team
tool on an unlisted URL, but:

- Don't put sensitive data in it (real client PII, contracts, etc. beyond
  what's already in the form).
- Don't link to it from anywhere public — anyone with the URL can add,
  edit, or delete projects.
- If you want real access control later (e.g. only your team can edit),
  Firebase Authentication pairs with Firestore rules to restrict writes to
  signed-in users — worth doing before this holds anything you'd be upset
  to lose or have tampered with.
