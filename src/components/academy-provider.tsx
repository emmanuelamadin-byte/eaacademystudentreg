"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { rowFromDatabase } from "@/lib/supabase-data";
import type { AcademyUser } from "@/lib/types";

interface AcademyContext {
  user: AcademyUser | null;
  authUser: User | null;
  loading: boolean;
  configured: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Context = createContext<AcademyContext | null>(null);

export function AcademyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AcademyUser | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setAuthUser(data.session?.user || null);
      if (!data.session?.user) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      if (!nextUser) {
        setAuthUser(null);
        setUser(null);
        setLoading(false);
        return;
      }
      setAuthUser((prev) => {
        // If the same user is already loaded, avoid resetting state or unmounting components
        if (prev?.id === nextUser.id) {
          return prev;
        }
        setLoading(true);
        return nextUser;
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (profileError) throw profileError;
    setUser(
      data
        ? (rowFromDatabase("users", data) as unknown as AcademyUser)
        : null,
    );
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !authUser) return;
    let cancelled = false;
    const load = async () => {
      try {
        await loadProfile(authUser.id);
        if (!cancelled) setError(null);
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "Unable to load profile.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel(`profile:${authUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${authUser.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authUser, loadProfile]);

  const refreshProfile = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (data.user) await loadProfile(data.user.id);
  }, [loadProfile]);

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
    setUser(null);
    setAuthUser(null);
  };

  return (
    <Context.Provider
      value={{
        user,
        authUser,
        loading,
        configured: supabaseConfigured,
        error,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAcademy() {
  const context = useContext(Context);
  if (!context) throw new Error("AcademyProvider is required.");
  return context;
}
