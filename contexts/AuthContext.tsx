import {
  createAccountWithEmail,
  deleteAccountAndData,
  ensureFirebase,
  getCurrentFirebaseUser,
  getFirebaseInitError,
  isFirebaseConfigured,
  observeAuthStateChanges,
  observeIdTokenChanges,
  reauthenticateCurrentUser,
  sendVerificationEmail,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signInWithEmail as fbSignInWithEmail,
  signOutCurrentUser,
  updateCurrentUserPassword,
} from '@/services/repositories/authRepository';
import { buildPasswordResetTelemetry } from '@/services/analyticsPrivacy';
import { devLog } from '@/services/logger';
import { updateUserRemote } from '@/services/repositories/profileRepository';
import { enqueuePendingProfileUpdate, getUserProfile, removePendingProfileUpdate, saveUserProfile, seedDemoNetwork } from '@/storage/local';
import { logEvent } from '@/services/logEvent';
import type { DiscoveryIntent } from '@/services/discoveryIntents';
import {
  buildLocalAuthSessionUser,
  clearLocalAuthSession,
  createLocalDemoAuthSession,
  findLocalAuthSessionByEmail,
  loadLocalAuthSession,
  persistLocalAuthSession,
} from '@/domains/auth/authLocal';
import { registerAuthAccount } from '@/domains/auth/authRegistration';
import {
  buildAuthProfileBackfill,
  buildAuthUserFromCached,
  buildAuthUserFromRemote,
  loadRemoteAuthProfileState,
} from '@/domains/auth/authSession';
import React, { createContext, startTransition, useContext, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';

type AmbiancePreference = 'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic' | null;

type User = {
  id: string;
  name?: string;
  handle?: string;
  city?: string;
  campus?: string;
  campusOrCity?: string;
  campusType?: 'campus' | 'city';
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  photoUrl?: string | null;
  coffeeIntents?: DiscoveryIntent[];
  ambiancePreference?: AmbiancePreference;
  // Premium subscription fields
  premiumStatus?: {
    tier: 'free' | 'premium';
    isActive: boolean;
    expiresAt: number | null;
    source: 'purchase' | 'referral' | 'promo' | 'free';
    subscriptionId?: string;
    period?: 'monthly' | 'annual';
    autoRenew?: boolean;
    referralWeeksRemaining?: number;
  };
} | null;

type AuthContextType = {
  authReady: boolean;
  user: User;
  register: (
    email: string,
    password: string,
    name?: string,
    city?: string,
    handle?: string,
    campusType?: 'campus' | 'city',
    campus?: string,
    phone?: string,
    preferences?: {
      coffeeIntents?: DiscoveryIntent[];
      ambiancePreference?: AmbiancePreference;
    }
  ) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createDemoUser: (email?: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification?: () => Promise<void>;
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUser: () => Promise<boolean>;
  deleteAccount: (currentPassword?: string) => Promise<void>;
  updateProfile?: (fields: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User>(null);
  const getFirebaseOrThrow = () => {
    const fb = ensureFirebase();
    if (!fb) {
      const initError = getFirebaseInitError();
      const reason = initError ? initError?.message || String(initError) : 'Unknown init error';
      throw new Error(`Firebase not available: ${reason}`);
    }
    return fb;
  };
  const persistUser = (next: User, options?: { deferred?: boolean }) => {
    const apply = () => setUser(next);
    if (options?.deferred) {
      startTransition(apply);
    } else {
      apply();
    }
    if (next) {
      void saveUserProfile(next as any);
    }
  };
  const scheduleNonCriticalAuthWork = (work: () => void | Promise<void>) => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(() => {
        void work();
      }, 0);
      return () => clearTimeout(timer);
    }
    const task = InteractionManager.runAfterInteractions(() => {
      void work();
    });
    return () => task.cancel();
  };
  // initialize firebase auth listener when possible
  React.useEffect(() => {
    // If Firebase is configured, subscribe to its auth state.
    if (isFirebaseConfigured()) {
      let active = true;
      let authEventVersion = 0;
      let cancelDeferredHydration: (() => void) | null = null;
      let fb: any;
      try {
        fb = getFirebaseOrThrow();
      } catch {
        setAuthReady(true);
        return;
      }
      const unsub = observeAuthStateChanges((u: any) => {
        const eventVersion = ++authEventVersion;
        cancelDeferredHydration?.();
        cancelDeferredHydration = null;
        if (!u) {
          startTransition(() => setUser(null));
          setAuthReady(true);
          return;
        }
        void (async () => {
          let cached: any = null;
          try {
            cached = await getUserProfile(u.uid);
          } catch {
            cached = null;
          }
          if (!active || eventVersion !== authEventVersion) return;

          const initial = buildAuthUserFromCached(u, cached);
          persistUser(initial);
          setAuthReady(true);

          cancelDeferredHydration = scheduleNonCriticalAuthWork(async () => {
            try {
              const db = fb.firestore();
              const { publicData, privateData } = await loadRemoteAuthProfileState(db, u.uid);
              if (!active || eventVersion !== authEventVersion) return;

              const liveAuthUser = getCurrentFirebaseUser() || u;
              const merged = buildAuthUserFromRemote({
                authUser: liveAuthUser,
                cached,
                publicData,
                privateData,
              });
              persistUser(merged, { deferred: true });

              const backfill = buildAuthProfileBackfill({
                cached,
                publicData,
                privateData,
                email: liveAuthUser.email,
              });
              if (Object.keys(backfill).length) {
                try {
                  await updateUserRemote(u.uid, backfill);
                  await removePendingProfileUpdate(u.uid);
                } catch {
                  await enqueuePendingProfileUpdate(u.uid, backfill);
                }
              }
            } catch {
              if (!cached && active && eventVersion === authEventVersion) {
                persistUser(buildAuthUserFromCached(u, null), { deferred: true });
                setAuthReady(true);
              }
            }
          });
        })();
      });
      const unsubIdToken = observeIdTokenChanges((u: any) => {
        if (!u) return;
        const nextVerified = !!u.emailVerified;
        setUser((prev) => {
          if (!prev || prev.id !== u.uid) return prev;
          if (prev.emailVerified === nextVerified && prev.email === u.email) return prev;
          const merged = {
            ...prev,
            email: u.email,
            emailVerified: nextVerified,
            phone: prev.phone || u.phoneNumber || null,
          };
          void saveUserProfile(merged);
          return merged;
        });
      });
      return () => {
        active = false;
        cancelDeferredHydration?.();
        unsub();
        unsubIdToken();
      };
    }

    // Local/demo fallback: load persisted local user if present so demo accounts auto-sign-in
    let hadLocal = false;
    try {
      const localUser = loadLocalAuthSession();
      if (localUser) {
        persistUser(
          buildAuthUserFromCached(
            {
              uid: localUser.id,
              email: localUser.email,
              emailVerified: localUser.emailVerified,
              phoneNumber: localUser.phone,
              photoURL: localUser.photoUrl,
            },
            localUser,
          ) as any,
        );
        hadLocal = true;
      }
    } catch (e) {
      // ignore
    }

    // If running locally (dev) and no persisted local user, auto-create a demo user so dev can skip sign-in.
    try {
      const isDevHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const isDevEnv = process.env.NODE_ENV !== 'production';
      if (!hadLocal && !isFirebaseConfigured() && (isDevHost || isDevEnv)) {
        try {
          const localDemo = createLocalDemoAuthSession();
          const persisted = persistLocalAuthSession(localDemo);
          if (!persisted) return;
          persistUser(
            buildAuthUserFromCached(
              {
                uid: localDemo.id,
                email: localDemo.email,
                emailVerified: localDemo.emailVerified,
                phoneNumber: localDemo.phone,
                photoURL: localDemo.photoUrl,
              },
              localDemo,
            ) as any,
          );
          try {
            // best-effort logging
            logEvent('user_demo_auto_signed_in', localDemo.id);
          } catch {}
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }

    // seed demo network for local testing when Firebase isn't configured
    try {
      if (!isFirebaseConfigured()) {
        void seedDemoNetwork();
      }
    } catch {}
    setAuthReady(true);
  }, []);

  async function register(
    email: string,
    password: string,
    name?: string,
    city?: string,
    handle?: string,
    campusType?: 'campus' | 'city',
    campus?: string,
    phone?: string,
    preferences?: {
      coffeeIntents?: DiscoveryIntent[];
      ambiancePreference?: AmbiancePreference;
    }
  ) {
    try {
      devLog('register called', { email, name, city, campus, handle, fbConfigured: isFirebaseConfigured() });
      const merged = await registerAuthAccount(
        {
          email,
          password,
          name,
          city,
          handle,
          campusType,
          campus,
          phone,
          preferences,
        },
        {
          isFirebaseConfigured,
          createAccountWithEmail,
          logEvent,
        },
      );
      persistUser(merged);
    } catch (e) {
      devLog('register error', e);
      throw e;
    }
  }

  async function signInWithEmail(email: string, password: string) {
    try {
      if (!isFirebaseConfigured()) {
        // local fallback: check localStorage
        try {
          const localUser = findLocalAuthSessionByEmail(email);
          if (!localUser) throw new Error('Invalid credentials');
          persistUser(
            buildAuthUserFromCached(
              {
                uid: localUser.id,
                email: localUser.email,
                emailVerified: localUser.emailVerified,
                phoneNumber: localUser.phone,
                photoURL: localUser.photoUrl,
              },
              localUser,
            ) as any,
          );
          void logEvent('user_signed_in_local', localUser.id);
          try {
            const { sendSigninNotification } = await import('@/services/notify');
            void sendSigninNotification(localUser.email || '', undefined, { local: true, uid: localUser.id });
          } catch {}
          return;
        } catch (e) {
          devLog('local sign-in failed', e);
          throw e;
        }
        throw new Error('Firebase not configured');
      }

      getFirebaseOrThrow();
      const userObj = await fbSignInWithEmail({ email, password } as any);
      void logEvent('user_signed_in_email', userObj.uid);
      void (async () => {
        try {
          const { sendSigninNotification } = await import('@/services/notify');
          await sendSigninNotification(userObj.email || '', undefined, { uid: userObj.uid });
        } catch {}
      })();
    } catch (e) {
      devLog('signInWithEmail error', e);
      throw e;
    }
  }

  // Create a simple local/demo user and sign them in immediately.
  async function createDemoUser(email?: string, name = 'Demo User') {
    try {
      const localDemo = createLocalDemoAuthSession({ email, name });
      const persisted = persistLocalAuthSession(localDemo);
      if (!persisted) throw new Error('Demo not available');
      persistUser(
        buildAuthUserFromCached(
          {
            uid: localDemo.id,
            email: localDemo.email,
            emailVerified: localDemo.emailVerified,
            phoneNumber: localDemo.phone,
            photoURL: localDemo.photoUrl,
          },
          localDemo,
        ) as any,
      );
      await logEvent('user_demo_signed_in', localDemo.id);
      return;
    } catch (e) {
      devLog('createDemoUser failed', e);
      throw e;
    }
    throw new Error('Demo not available');
  }

  async function resendVerification() {
    getFirebaseOrThrow();
    await sendVerificationEmail();
  }

  async function signOut() {
    const fb = ensureFirebase();
    try {
      if (fb) await signOutCurrentUser();
    } catch {}
    // keep local user cache so local/demo accounts can sign back in
    setUser(null);
    await logEvent('user_signed_out', user?.id);
  }

  async function changePassword(newPassword: string, currentPassword?: string) {
    try {
      const fb = getFirebaseOrThrow();
      // if currentPassword provided, attempt reauthentication first
      if (currentPassword && user?.email) {
        try {
          await reauthenticateCurrentUser({ email: user.email, password: currentPassword } as any);
        } catch (reauthErr) {
          throw reauthErr;
        }
      }
      await updateCurrentUserPassword(newPassword);
      await logEvent('user_password_changed', user?.id);
    } catch (e) {
      devLog('changePassword error', e);
      throw e;
    }
  }

  async function deleteAccount(currentPassword?: string) {
    if (!isFirebaseConfigured()) {
      clearLocalAuthSession();
      setUser(null);
      await logEvent('user_deleted_local', user?.id);
      return;
    }

    try {
      getFirebaseOrThrow();
      await deleteAccountAndData({ password: currentPassword });
    } catch (e) {
      devLog('deleteAccount error', e);
      throw e;
    }
    setUser(null);
    await logEvent('user_deleted', user?.id);
  }

  async function resetPassword(email: string) {
    if (!email) throw new Error('Email required');
    const telemetry = buildPasswordResetTelemetry(email);
    if (!isFirebaseConfigured()) {
      await logEvent('password_reset_requested_local', undefined, telemetry);
      return;
    }
    await fbSendPasswordResetEmail(email);
    await logEvent('password_reset_requested', undefined, telemetry);
  }

  async function refreshUser() {
    if (!isFirebaseConfigured()) return true;
    let fb: any;
    try {
      fb = getFirebaseOrThrow();
    } catch {
      return false;
    }
    let authUser = getCurrentFirebaseUser();
    if (!authUser) return false;
    try {
      if (typeof authUser.reload === 'function') {
        await authUser.reload();
      }
      if (typeof authUser.getIdToken === 'function') {
        await authUser.getIdToken(true).catch(() => undefined);
      }
      authUser = getCurrentFirebaseUser() || authUser;
      const emailVerified = !!authUser.emailVerified;
      setUser((prev) => {
        if (!prev || prev.id !== authUser.uid) return prev;
        const merged = {
          ...prev,
          email: authUser.email,
          emailVerified,
          phone: prev.phone || authUser.phoneNumber || null,
        };
        void saveUserProfile(merged);
        return merged;
      });
      try {
        const db = fb.firestore();
        const { publicData, privateData } = await loadRemoteAuthProfileState(db, authUser.uid);
        const cached = await getUserProfile(authUser.uid);
        const merged = buildAuthUserFromRemote({
          authUser,
          cached,
          publicData,
          privateData,
        });
        persistUser(merged, { deferred: true });
      } catch {
        persistUser(buildAuthUserFromCached(authUser, null), { deferred: true });
      }
      return emailVerified;
    } catch (e) {
      return false;
    }
  }

  async function updateProfile(fields: Partial<User>) {
    if (!user) return;
    const merged = { ...user, ...(fields as any) } as User;
    // Optimistic local update for fast UI
    setUser(merged);
    void saveUserProfile(merged);
    if (merged) {
      persistLocalAuthSession(buildLocalAuthSessionUser({
        id: merged.id,
        email: merged.email,
        name: merged.name,
        city: merged.city,
        campus: merged.campus,
        campusType: merged.campusType,
        handle: merged.handle,
        phone: merged.phone,
        photoUrl: merged.photoUrl,
        emailVerified: merged.emailVerified,
        preferences: {
          coffeeIntents: merged.coffeeIntents,
          ambiancePreference: merged.ambiancePreference ?? null,
        },
      }));
    }

    const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const fb = ensureFirebase();
    if (fb) {
      void (async () => {
        try {
          await withTimeout(updateUserRemote(user.id, fields as any), 4000, 'Profile update');
          await removePendingProfileUpdate(user.id);
        } catch (e) {
          devLog('updateProfile remote failed', e);
          await enqueuePendingProfileUpdate(user.id, fields as any);
        }
      })();
    } else {
      await enqueuePendingProfileUpdate(user.id, fields as any);
    }

    void logEvent('user_profile_updated', user?.id, fields as any);
  }

  return <AuthContext.Provider value={{ authReady, user, register, signInWithEmail, createDemoUser, signOut, resendVerification, changePassword, resetPassword, refreshUser, deleteAccount, updateProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
