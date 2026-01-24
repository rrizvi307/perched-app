import { createAccountWithEmail, deleteCurrentUser, ensureFirebase, getFirebaseInitError, sendPasswordResetEmail as fbSendPasswordResetEmail, signInWithEmail as fbSignInWithEmail, isFirebaseConfigured, reauthenticateCurrentUser, updateCurrentUserPassword, updateUserRemote } from '@/services/firebaseClient';
import { devLog } from '@/services/logger';
import { enqueuePendingProfileUpdate, getUserProfile, removePendingProfileUpdate, saveUserProfile, seedDemoNetwork } from '@/storage/local';
import { logEvent } from '@/services/logEvent';
import { syncPendingCheckins, syncPendingProfileUpdates } from '@/services/syncPending';
import React, { createContext, useContext, useState } from 'react';

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
} | null;

type AuthContextType = {
  user: User;
  register: (email: string, password: string, name?: string, city?: string, handle?: string, campusType?: 'campus' | 'city', campus?: string, phone?: string) => Promise<void>;
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
  const normalizeLocationFields = (data: any) => {
    const city = data?.city || (data?.campusType === 'city' ? data?.campusOrCity : undefined) || (!data?.campusType && data?.campusOrCity ? data.campusOrCity : undefined);
    const campus = data?.campus || (data?.campusType === 'campus' ? data?.campusOrCity : undefined);
    return { city, campus, campusOrCity: data?.campusOrCity, campusType: data?.campusType };
  };

  // initialize firebase auth listener when possible
  React.useEffect(() => {
    // If Firebase is configured, subscribe to its auth state.
    if (isFirebaseConfigured()) {
      let fb: any;
      try {
        fb = getFirebaseOrThrow();
      } catch {
        return;
      }
      const unsub = fb.auth().onAuthStateChanged(async (u: any) => {
        if (!u) {
          setUser(null);
          return;
        }
        try {
          const db = fb.firestore();
          const doc = await db.collection('users').doc(u.uid).get();
          const data = doc.exists ? doc.data() : {};
          const cached = await getUserProfile(u.uid);
          const loc = normalizeLocationFields({ ...(cached || {}), ...(data || {}) });
          const merged = {
            id: u.uid,
            email: u.email,
            emailVerified: !!u.emailVerified,
            name: data?.name ?? cached?.name,
            handle: data?.handle ?? cached?.handle,
            city: loc.city ?? cached?.city,
            campus: loc.campus ?? cached?.campus,
            campusOrCity: loc.campusOrCity ?? cached?.campusOrCity,
            campusType: loc.campusType ?? cached?.campusType,
            phone: data?.phone || u.phoneNumber || cached?.phone || null,
            photoUrl: data?.photoUrl || data?.avatarUrl || cached?.photoUrl || null,
          };
          setUser(merged);
          void saveUserProfile(merged);
          void syncPendingCheckins(2);
          void syncPendingProfileUpdates(2);

          if (cached) {
            const backfill: Record<string, any> = {};
            if (!data?.name && cached?.name) backfill.name = cached.name;
            if (!data?.handle && cached?.handle) backfill.handle = cached.handle;
            if (!data?.city && cached?.city) backfill.city = cached.city;
            if (!data?.campus && cached?.campus) backfill.campus = cached.campus;
            if (!data?.campusOrCity && cached?.campusOrCity) backfill.campusOrCity = cached.campusOrCity;
            if (!data?.campusType && cached?.campusType) backfill.campusType = cached.campusType;
            if (!data?.phone && cached?.phone) backfill.phone = cached.phone;
            if (!data?.photoUrl && cached?.photoUrl) backfill.photoUrl = cached.photoUrl;
            if (!data?.email && u.email) backfill.email = u.email;
            if (Object.keys(backfill).length) {
              void (async () => {
                try {
                  await updateUserRemote(u.uid, backfill);
                } catch {
                  await enqueuePendingProfileUpdate(u.uid, backfill);
                }
              })();
            }
          }
        } catch (e) {
          const cached = await getUserProfile(u.uid);
          if (cached) {
            const merged = { ...cached, id: u.uid, email: u.email, emailVerified: !!u.emailVerified };
            setUser(merged as any);
            void saveUserProfile(merged);
          } else {
            setUser({ id: u.uid, email: u.email, emailVerified: !!u.emailVerified, phone: u.phoneNumber || null, photoUrl: null });
          }
        }
      });
      return () => unsub();
    }

    // Local/demo fallback: load persisted local user if present so demo accounts auto-sign-in
    let hadLocal = false;
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem('spot_user_v1');
          if (raw) {
            const u = JSON.parse(raw);
            const loc = normalizeLocationFields(u);
            setUser({ ...u, ...loc } as any);
            hadLocal = true;
          }
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
          if (typeof window !== 'undefined' && window.localStorage) {
            const demoEmail = `demo+${Date.now()}@local`;
            const u = { id: `local-${Date.now()}`, email: demoEmail, name: 'Demo User', handle: `demo${Date.now().toString().slice(-4)}`, city: 'Houston', campusOrCity: 'Houston', campusType: 'city', emailVerified: true } as any;
            window.localStorage.setItem('spot_user_v1', JSON.stringify(u));
            const loc = normalizeLocationFields(u);
            setUser({ ...u, ...loc } as any);
            try {
              // best-effort logging
              logEvent('user_demo_auto_signed_in', u.id);
            } catch {}
          }
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
  }, []);

  async function register(email: string, password: string, name?: string, city?: string, handle?: string, campusType?: 'campus' | 'city', campus?: string, phone?: string) {
    try {
      devLog('register called', { email, name, city, campus, handle, fbConfigured: isFirebaseConfigured() });
      if (!isFirebaseConfigured()) {
        // local fallback: persist simple user in localStorage for dev/demo
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const campusOrCity = campusType === 'campus' ? campus : city;
            const u = { id: `local-${Date.now()}`, email, name, city, campus, campusOrCity, campusType: campusType || 'city', handle, phone, emailVerified: true };
            window.localStorage.setItem('spot_user_v1', JSON.stringify(u));
            // also keep a list of local users for debugging
            try {
              const rawList = window.localStorage.getItem('spot_users_v1');
              const list = rawList ? JSON.parse(rawList) : [];
              list.push({ id: u.id, email: u.email, name: u.name, handle: u.handle, city: u.city, campus: u.campus, campusOrCity: u.campusOrCity, campusType: u.campusType, phone: u.phone, createdAt: Date.now() });
              window.localStorage.setItem('spot_users_v1', JSON.stringify(list));
            } catch {}
            setUser(u as any);
            void saveUserProfile(u);
            await logEvent('user_registered_local', u.id, { city, campus, handle });
            devLog('local register success', u.id);
            return;
          }
        } catch (e) {
          devLog('local register failed', e);
        }
        throw new Error('Firebase not configured');
      }

      const fb = getFirebaseOrThrow();

      const campusOrCity = campusType === 'campus' ? campus : city;
      const created = await createAccountWithEmail({ email, password, name, city, campus, campusOrCity, handle, campusType: campusType || 'city', phone } as any);
      void (async () => {
        try {
          await updateUserRemote(created.uid, { name, city, campus, campusOrCity, campusType: campusType || 'city', handle, phone, email });
          await removePendingProfileUpdate(created.uid);
        } catch {
          await enqueuePendingProfileUpdate(created.uid, { name, city, campus, campusOrCity, campusType: campusType || 'city', handle, phone, email });
        }
      })();
      // user needs to verify email before full access
      const merged = { id: created.uid, email: created.email, emailVerified: false, name, city, campus, campusOrCity, handle, campusType: campusType || 'city', phone };
      setUser(merged);
      void saveUserProfile(merged);
      await logEvent('user_registered', created.uid, { city, campus, handle });
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
          if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem('spot_user_v1');
            if (!raw) throw new Error('No local user');
            const u = JSON.parse(raw);
            if (u.email === email) {
              setUser(u as any);
              void logEvent('user_signed_in_local', u.id);
              try {
                const { sendSigninNotification } = await import('@/services/notify');
                void sendSigninNotification(u.email, undefined, { local: true, uid: u.id });
              } catch {}
              return;
            }
            throw new Error('Invalid credentials');
          }
        } catch (e) {
          devLog('local sign-in failed', e);
          throw e;
        }
        throw new Error('Firebase not configured');
      }

      const fb = getFirebaseOrThrow();

      const userObj = await fbSignInWithEmail({ email, password } as any);
      const authUser = fb.auth().currentUser;
      const emailVerified = !!(authUser && authUser.emailVerified);
      // Hydrate from local cache first so UI has name/handle immediately (avoids "Someone" on first post).
      let cached: any = null;
      try {
        cached = await getUserProfile(userObj.uid);
      } catch {
        cached = null;
      }
      const cachedLoc = normalizeLocationFields(cached || {});
      const initial = {
        id: userObj.uid,
        email: userObj.email,
        emailVerified,
        name: cached?.name,
        handle: cached?.handle,
        city: cachedLoc.city ?? cached?.city,
        campus: cachedLoc.campus ?? cached?.campus,
        campusOrCity: cachedLoc.campusOrCity ?? cached?.campusOrCity,
        campusType: cachedLoc.campusType ?? cached?.campusType,
        phone: cached?.phone || authUser?.phoneNumber || userObj.phoneNumber || null,
        photoUrl: cached?.photoUrl || null,
      };
      setUser(initial);
      void saveUserProfile(initial);
      void logEvent('user_signed_in_email', userObj.uid);
      void syncPendingCheckins(2);
      void syncPendingProfileUpdates(2);
      void (async () => {
        try {
          const db = fb.firestore();
          const doc = await db.collection('users').doc(userObj.uid).get();
          const data = doc.exists ? doc.data() : {};
          const cached = await getUserProfile(userObj.uid);
          const loc = normalizeLocationFields({ ...(cached || {}), ...(data || {}) });
          setUser((prev: any) => {
            const merged = {
              ...prev,
              name: data?.name ?? cached?.name,
              handle: data?.handle ?? cached?.handle,
              city: loc.city ?? cached?.city,
              campus: loc.campus ?? cached?.campus,
              campusOrCity: loc.campusOrCity ?? cached?.campusOrCity,
              campusType: loc.campusType ?? cached?.campusType,
              phone: data?.phone || authUser.phoneNumber || cached?.phone || prev?.phone,
              photoUrl: data?.photoUrl || data?.avatarUrl || cached?.photoUrl || prev?.photoUrl,
            };
            void saveUserProfile(merged);
            return merged;
          });
          const backfill: Record<string, any> = {};
          if (!data?.name && cached?.name) backfill.name = cached.name;
          if (!data?.handle && cached?.handle) backfill.handle = cached.handle;
          if (!data?.city && cached?.city) backfill.city = cached.city;
          if (!data?.campus && cached?.campus) backfill.campus = cached.campus;
          if (!data?.campusOrCity && cached?.campusOrCity) backfill.campusOrCity = cached.campusOrCity;
          if (!data?.campusType && cached?.campusType) backfill.campusType = cached.campusType;
          if (!data?.phone && (cached?.phone || authUser?.phoneNumber)) backfill.phone = cached?.phone || authUser?.phoneNumber;
          if (!data?.photoUrl && cached?.photoUrl) backfill.photoUrl = cached.photoUrl;
          if (!data?.email && userObj.email) backfill.email = userObj.email;
          if (Object.keys(backfill).length) {
            try {
              await updateUserRemote(userObj.uid, backfill);
              await removePendingProfileUpdate(userObj.uid);
            } catch {
              await enqueuePendingProfileUpdate(userObj.uid, backfill);
            }
          }
        } catch {}
      })();
      void (async () => {
        try {
          const { sendSigninNotification } = await import('@/services/notify');
          await sendSigninNotification(userObj.email || '', undefined, { uid: userObj.uid });
        } catch {}
      })();
      if (!emailVerified) {
      } else {
      }
    } catch (e) {
      devLog('signInWithEmail error', e);
      throw e;
    }
  }

  // Create a simple local/demo user and sign them in immediately.
  async function createDemoUser(email?: string, name = 'Demo User') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const demoEmail = (email && email.trim()) || `demo+${Date.now()}@local`;
        const u = { id: `local-${Date.now()}`, email: demoEmail, name, handle: `demo${Date.now().toString().slice(-4)}`, city: 'Houston', campusOrCity: 'Houston', campusType: 'city', emailVerified: true } as any;
        window.localStorage.setItem('spot_user_v1', JSON.stringify(u));
        const loc = normalizeLocationFields(u);
        setUser({ ...u, ...loc } as any);
        await logEvent('user_demo_signed_in', u.id);
        return;
      }
    } catch (e) {
      devLog('createDemoUser failed', e);
      throw e;
    }
    throw new Error('Demo not available');
  }

  async function resendVerification() {
    const fb = getFirebaseOrThrow();
    try {
      // prefer central helper to include actionCodeSettings
      const { sendVerificationEmail } = await import('@/services/firebaseClient');
      await sendVerificationEmail();
    } catch (e) {
      const authUser = fb.auth().currentUser;
      if (!authUser) throw new Error('No authenticated user');
      if (typeof authUser.sendEmailVerification === 'function') await authUser.sendEmailVerification();
    }
  }

  async function signOut() {
    const fb = ensureFirebase();
    try {
      if (fb) await fb.auth().signOut();
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
    try {
      const fb = getFirebaseOrThrow();
      if (currentPassword && user?.email) {
        try {
          await reauthenticateCurrentUser({ email: user.email, password: currentPassword } as any);
        } catch (reauthErr) {
          throw reauthErr;
        }
      }
      await deleteCurrentUser();
    } catch (e) {
      devLog('deleteAccount error', e);
      throw e;
    }
    setUser(null);
    await logEvent('user_deleted', user?.id);
  }

  async function resetPassword(email: string) {
    if (!email) throw new Error('Email required');
    if (!isFirebaseConfigured()) {
      await logEvent('password_reset_requested_local', undefined, { email });
      return;
    }
    await fbSendPasswordResetEmail(email);
    await logEvent('password_reset_requested', undefined, { email });
  }

  async function refreshUser() {
    if (!isFirebaseConfigured()) return true;
    let fb: any;
    try {
      fb = getFirebaseOrThrow();
    } catch {
      return false;
    }
    const authUser = fb.auth().currentUser;
    if (!authUser) return false;
    try {
      if (typeof authUser.reload === 'function') {
        await authUser.reload();
      }
      const emailVerified = !!authUser.emailVerified;
      try {
        const db = fb.firestore();
        const doc = await db.collection('users').doc(authUser.uid).get();
        const data = doc.exists ? doc.data() : {};
        const cached = await getUserProfile(authUser.uid);
        const loc = normalizeLocationFields({ ...(cached || {}), ...(data || {}) });
        const merged = {
          id: authUser.uid,
          email: authUser.email,
          emailVerified,
          name: data?.name ?? cached?.name,
          handle: data?.handle ?? cached?.handle,
          city: loc.city ?? cached?.city,
          campus: loc.campus ?? cached?.campus,
          campusOrCity: loc.campusOrCity ?? cached?.campusOrCity,
          campusType: loc.campusType ?? cached?.campusType,
          phone: data?.phone || authUser.phoneNumber || cached?.phone || null,
          photoUrl: data?.photoUrl || data?.avatarUrl || cached?.photoUrl || null,
        };
        setUser(merged);
        void saveUserProfile(merged);
      } catch {
        setUser({ id: authUser.uid, email: authUser.email, emailVerified, phone: authUser.phoneNumber || null });
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
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('spot_user_v1', JSON.stringify(merged));
      } catch {}
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

  return <AuthContext.Provider value={{ user, register, signInWithEmail, createDemoUser, signOut, resendVerification, changePassword, resetPassword, refreshUser, deleteAccount, updateProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
