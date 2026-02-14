# USER REPRO ERRORS

## Symptoms reported
- picture on startup still different than picture within the app.
- explroe page sys no spots yet stil and shows sanf ranciso.

## Verbatim log lines from user input

```text
Error: xcrun simctl openurl F2EAAA95-C4E1-4680-A818-3518A2E93F3B exp://192.168.50.136:8081 exited with non-zero code: 60
An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=60):
Simulator device failed to open exp://192.168.50.136:8081.
Operation timed out
Underlying error (domain=NSPOSIXErrorDomain, code=60):
        The operation couldn’t be completed. Operation timed out
        Operation timed out
WARN  Require cycle: services/firebaseClient.ts -> services/perfMonitor.ts -> services/firebaseClient.ts
WARN  Invalid deep link: exp://192.168.50.136:8081
LOG  logEvent error: [FirebaseError: Missing or insufficient permissions.]
ERROR  [2026-02-13T22:46:49.613Z]  @firebase/firestore: Firestore (12.6.0): Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
ERROR  [service-error] {"durationMs": 1544, "errorMessage": "Missing or insufficient permissions.", "errorName": "FirebaseError", "errorStack": "FirebaseError: Missing or insufficient permissions.", "hasFallback": true, "operation": "firebase_get_checkins_remote"}
ERROR  [service-error] {"durationMs": 77, "errorMessage": "Missing or insufficient permissions.", "errorName": "FirebaseError", "errorStack": "FirebaseError: Missing or insufficient permissions.", "hasFallback": true, "operation": "firebase_get_checkins_remote"}
ERROR  Error persisting metrics to Firestore: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.
LOG  🌱 Seeding comprehensive demo data for user: w7CcW1qCjRXX79SSaUzdvb86kfB2
LOG  ✅ Seeded user stats: 47 check-ins
LOG  ✅ Seeded saved spots: 3 spots
LOG  ✅ Seeded metrics impact: 32 metrics shared
LOG  ✅ Seeded friend requests: 2 incoming, 1 outgoing
LOG  ✅ Comprehensive demo data seeded successfully!
LOG  📊 What was seeded:
LOG    • User stats with 47 check-ins
LOG    • 5-day streak with achievements unlocked
LOG    • 3 saved spots
LOG    • 32 metrics shared, ~96 people helped
LOG    • 2 incoming + 1 outgoing friend requests
LOG    • 12 friends (from seedDemoNetwork)
ERROR  Failed to get candidate spots: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.
```
