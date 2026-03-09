Firebase setup (Firestore + Storage + Auth)

1) Create a Firebase project at https://console.firebase.google.com/

2) Enable Firestore (Native mode) and Firebase Storage.

3) Enable Email authentication (or Anonymous for quick testing).

4) Add a web app to the project and copy the config (apiKey, authDomain, projectId, storageBucket, etc.).

5) Locally: install the Firebase JS SDK

```bash
npm install firebase
```

6) Add the config via environment variables (recommended) or Expo config.

This repo reads Firebase config from environment variables at build time (see `app.config.js`), and at runtime from `Constants.expoConfig.extra.FIREBASE_CONFIG`.

Locally: copy `.env.example` → `.env.local` (gitignored) and set:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID` (optional)

For EAS Build: add the same vars as **Secrets** (project scope) before building.

7) Run the app and test authentication + storage flows.

Security rules (basic starter):

Firestore (allow reads/writes for authenticated users):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

Storage (allow upload/download for authenticated users):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

8) Recommended schema (Firestore):

- `users/{userId}`: { name, campusOrCity, createdAt }
- `checkins/{checkinId}`: { userId, spotName, caption, photoUrl, createdAt, campusOrCity }
- `eventLogs/{id}`: { eventName, userId?, eventTime, metadata }

9) After setup, update `services/firebaseClient.ts` with your config values or load from env.
