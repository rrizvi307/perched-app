# Google Maps / Places Integration

This project includes a minimal Places API scaffold to enable place search when creating a check-in.

Files:
- `services/googleMaps.ts` – wrapper over Google Places Text Search + Details endpoints. Returns small place objects: `{ placeId, name, address, location }`.
- `components/place-search.tsx` – modal UI component to search and select places. It uses `searchPlaces()` and returns the selected place to the caller.
- `app/(tabs)/checkin.tsx` – wired to open the PlaceSearch modal; selected place is attached to the check-in (`spotPlaceId` and `spotLatLng`) when posting.

How to enable locally:
1. Obtain a Google Cloud API key with Places API enabled.
2. For local testing, set the environment variable `GOOGLE_MAPS_API_KEY` before starting the app. For example (macOS / Linux):

```bash
export GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
npx expo start
```

For production or public web builds, secure the key either by:
- Restricting the key by HTTP referrers (web) and Android/iOS app package names, AND/OR
- Proxying Places requests through a server endpoint that holds the key.

Notes & security:
- Do not hard-code keys in the client for production apps.
- Consider server-side geocoding or a proxy if you need to restrict functionality or rate-limit requests.

Data stored when a place is selected:
- `spotName` — the place's human-readable name
- `spotPlaceId` — Google Place ID (used for lookups)
- `spotLatLng` — `{ lat, lng }` coordinates (optional)

If you want, I can add a small serverless proxy example (Netlify/AWS Lambda) to keep the API key safe and demonstrate secure production integration.
