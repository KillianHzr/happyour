import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isOffline: boolean;
  profileComplete: boolean | null;
  /** L'utilisateur a-t-il déjà passé l'onboarding (slider de bienvenue) ? */
  hasOnboarded: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<{ isComplete: boolean; hasOnboarded: boolean }>;
  checkProfileStatus: (userId: string) => Promise<{ isComplete: boolean; hasOnboarded: boolean }>;
  /** Marque l'onboarding comme fait (persisté en BDD) — appelé en sortie du slider. */
  markOnboarded: () => Promise<void>;
  bypassAuthDev: (isExistingUser?: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false); // Désactivé (nécessite rebuild natif)
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  const checkProfileStatus = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("username, has_onboarded")
        .eq("id", userId)
        .single();

      const isComplete = !!data?.username;
      const onboarded = !!data?.has_onboarded;
      setProfileComplete(isComplete);
      setHasOnboarded(onboarded);
      return { isComplete, hasOnboarded: onboarded };
    } catch (e) {
      setProfileComplete(false);
      setHasOnboarded(false);
      return { isComplete: false, hasOnboarded: false };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Get initial session from storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        checkProfileStatus(session.user.id);
      } else {
        setProfileComplete(false);
        setHasOnboarded(false);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Important: Only clear session if it's a real sign out
      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfileComplete(false);
        setHasOnboarded(false);
      } else if (session) {
        setSession(session);
        checkProfileStatus(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) throw error;
  };

  const sendOtp = async (email: string) => {
    // shouldCreateUser: true → un code est envoyé que le compte existe ou non
    // (l'utilisateur est créé à la volée si nécessaire). Le routage app vs
    // onboarding se fait ensuite à la vérification du code (checkProfileStatus).
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  };

  const verifyOtp = async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) throw error;
    const u = data.session?.user;
    if (!u) return { isComplete: false, hasOnboarded: false };
    // La décision slider/app se base sur le flag persistant `has_onboarded`
    // (cf. checkProfileStatus) : fiable, sans seuil temporel.
    return await checkProfileStatus(u.id);
  };

  /** Persiste « onboarding fait » (appelé en sortie du slider) + maj de l'état local. */
  const markOnboarded = async () => {
    setHasOnboarded(true);
    const userId = session?.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, has_onboarded: true }, { onConflict: "id" });
    if (error) console.warn("[auth] échec markOnboarded:", error.message);
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://happyour.killianherzer.fr/reset-password",
    });
    if (error) throw error;
  };

  const bypassAuthDev = async (isExistingUser = false) => {
    const dummySession = {
      access_token: "dummy",
      token_type: "bearer" as const,
      expires_in: 3600,
      refresh_token: "dummy",
      user: {
        id: "dummy-user-id",
        email: "dev@happyhour.com",
        aud: "authenticated",
        role: "authenticated",
      } as any,
    };
    setSession(dummySession);
    setProfileComplete(isExistingUser);
    setHasOnboarded(isExistingUser);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isOffline,
        profileComplete,
        hasOnboarded,
        login,
        register,
        logout,
        resetPassword,
        sendOtp,
        verifyOtp,
        checkProfileStatus,
        markOnboarded,
        bypassAuthDev,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
