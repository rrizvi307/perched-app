# Firebase Rules Checklist

Use this list to harden Firestore/Storage before App Store submission.

## Firestore
- Require auth for any write to `users`, `checkins`, `friend_requests`, `reports`.
- Limit reads on `users` to only allowed fields (public profile).
- Users can only write their own profile doc: `request.auth.uid == userId`.
- Check-ins can only be created by `request.auth.uid == userId`.
- Reports can be created by any authed user; only admin can update `status`.
- Block direct client writes to admin-only collections.
- Add basic rate limit guardrails where possible (e.g., allow max N check-ins per hour per user).

## Storage
- Only allow upload to `checkins/{uid}/...` if `request.auth.uid == uid`.
- Restrict delete to owner or admin.

## Auth
- Email verification required for read access to feeds (if desired).
- Enforce password reset + MFA (optional).

## Logging
- `event_logs` should be write-only by client; no read access for non-admin.
