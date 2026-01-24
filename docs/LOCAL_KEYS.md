Local keys and setup

Copy `.env.example` to `.env.local` and add your keys (this file is gitignored):

```bash
cp .env.example .env.local
# edit .env.local and add your keys
```

For quick local testing you can add your Google Maps API key to `.env.local`:

```
GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
```

We attempt to load `.env.local` in Node dev so `services/googleMaps.ts` will pick up the key automatically.

Do NOT commit `.env.local` to source control.
