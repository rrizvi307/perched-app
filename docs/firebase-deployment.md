# Firebase Security Rules Deployment

This document explains how to deploy Firestore and Storage security rules to your Firebase project.

## Prerequisites

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase in your project (if not already done):
```bash
firebase init
```
Select:
- Firestore
- Storage
- Use existing project (select your project)

## Deploy Rules

### Deploy All Rules
```bash
firebase deploy --only firestore:rules,storage:rules
```

### Deploy Firestore Rules Only
```bash
firebase deploy --only firestore:rules
```

### Deploy Storage Rules Only
```bash
firebase deploy --only storage:rules
```

## Verify Rules

### Firestore Rules
1. Go to Firebase Console → Firestore Database → Rules
2. Check that the rules are active and have a recent timestamp
3. Test with the Rules Playground in the Firebase Console

### Storage Rules
1. Go to Firebase Console → Storage → Rules
2. Verify the rules are deployed
3. Test uploads/downloads to ensure proper permissions

## Testing

Before deploying to production, test the rules:

1. **Test in Emulator (Recommended)**:
```bash
firebase emulators:start --only firestore,storage
```

2. **Manual Testing Checklist**:
   - [ ] Create user account
   - [ ] Upload check-in photo
   - [ ] Try to access another user's check-in (should respect visibility)
   - [ ] Try to delete another user's check-in (should fail)
   - [ ] Send/accept friend request
   - [ ] Access friends-only check-in
   - [ ] Delete own check-in
   - [ ] Delete account

## Rule Highlights

### Firestore (`firestore.rules`)
- Email verification required for creating check-ins
- Visibility-based access control (public/friends/close)
- Users can only modify their own data
- Friend requests have bidirectional access
- Reports are admin-only (read) and user-creatable
- Rate limiting placeholders (enhance with Cloud Functions)

### Storage (`storage.rules`)
- Users can only upload to their own folders
- 10MB max file size for images
- Only image content types allowed
- Email verification required for check-in uploads
- Profile photos and check-in photos are in separate paths

## Required Firestore Indexes

These composite indexes are required for queries. Deploy via Firebase Console or `firestore.indexes.json`:

1. **Check-ins by user + createdAt**:
   - Collection: `checkins`
   - Fields: `userId` (Ascending), `createdAt` (Descending)

2. **Check-ins by visibility + createdAt** (for public feed):
   - Collection: `checkins`
   - Fields: `visibility` (Ascending), `createdAt` (Descending)

3. **Friend requests by status + createdAt**:
   - Collection: `friendRequests`
   - Fields: `to` (Ascending), `status` (Ascending), `createdAt` (Descending)

4. **Place events for trending**:
   - Collection: `placeEvents`
   - Fields: `placeId` (Ascending), `ts` (Descending)

## Monitoring

After deploying rules, monitor for:
- Failed permission errors in Firebase Console logs
- Unusual access patterns
- Rule evaluation errors

Set up Cloud Logging alerts for repeated permission denials.

## Emergency Rollback

If rules cause issues:

1. **Quick fix**: Set rules to test mode temporarily:
```javascript
// Firestore - TEMPORARY ONLY
allow read, write: if request.auth != null;

// Storage - TEMPORARY ONLY
allow read, write: if request.auth != null;
```

2. **Proper rollback**: Deploy previous working rules from version control.

## Next Steps

1. Deploy rules: `firebase deploy --only firestore:rules,storage:rules`
2. Test all user flows
3. Monitor Firebase Console for rule evaluation errors
4. Set up Cloud Functions for advanced rate limiting
5. Implement Firebase App Check for additional security
