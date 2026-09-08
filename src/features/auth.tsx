"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { TRACKS, type CareerPathClassId } from "@/lib/types";
import { useAcademy } from "@/components/academy-provider";
import { Brand } from "@/components/ui";

function authError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  if (message.toLowerCase().includes("rate limit"))
    return "Too many attempts. Please wait a moment before trying again.";
  if (message.toLowerCase().includes("network"))
    return "Unable to connect. Please check your internet connection.";
  return message;
}

function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.6a4.8 4.8 0 0 1-2.1 3.2v2.6H19c2-1.8 3-4.5 3-7.7Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.8 0 5.2-.9 7-2.5l-3.5-2.6c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.6v2.7A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.2 13.6a6 6 0 0 1 0-3.2V7.7H2.6a10 10 0 0 0 0 8.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.8 9.8 0 0 0 12 2a10 10 0 0 0-9.4 5.7l3.6 2.7A6.1 6.1 0 0 1 12 6.1Z"
      />
    </svg>
  );
}

export default function AuthPage({
  mode = "login",
}: {
  mode?: "login" | "signup";
}) {
  const { configured, user, authUser, loading, refreshProfile } = useAcademy();
  const router = useRouter();
  const search = useSearchParams();
  const createdProfile = useRef(false);
  const initialTrack = search.get("track");
  const [track, setTrack] = useState<CareerPathClassId>(
    TRACKS.some((item) => item.id === initialTrack)
      ? (initialTrack as CareerPathClassId)
      : "system-dev",
  );
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("NG");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";
  const hasValidTrack =
    !!user && TRACKS.some((item) => item.id === user.enrolledClassId);
  const onboarding =
    !!authUser &&
    (!user ||
      (user.role === "Student" && (!hasValidTrack || !user.phoneNumber))) &&
    !loading;
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return getCountries()
      .map((code) => ({ code, name: names.of(code) || code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const dayCount = birthMonth
    ? new Date(2024, Number(birthMonth), 0).getDate()
    : 31;

  useEffect(() => {
    const displayName =
      authUser?.user_metadata?.full_name || authUser?.user_metadata?.name;
    if (displayName && !name) setName(displayName);
  }, [authUser, name]);
  useEffect(() => {
    if (Number(birthDay) > dayCount) setBirthDay("");
  }, [birthDay, dayCount]);
  useEffect(() => {
    if (user && !onboarding && !createdProfile.current)
      router.replace("/app/dashboard");
  }, [user, onboarding, router]);

  async function google() {
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Account setup is not connected yet.");
      const next = signup ? "/signup" : "/login";
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${next}${window.location.search}`,
        },
      });
      if (signInError) throw signInError;
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  async function finishProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("profile.ensure", {
        name:
          name ||
          authUser?.user_metadata?.full_name ||
          authUser?.user_metadata?.name ||
          "Student",
        enrolledClassId: track,
        countryCode,
        phoneNumber,
        birthday: { month: Number(birthMonth), day: Number(birthDay) },
      });
      createdProfile.current = true;
      await refreshProfile();
      router.replace("/welcome");
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand light />
        <div>
          <span className="eyebrow">EA ACADEMY REGISTRATION</span>
          <h1>
            Learn it.
            <br />
            Build it.
            <br />
            <span>Put it to work.</span>
          </h1>
          <p>
            Use one Google account for your lessons, live sessions, assignments,
            and academy community.
          </p>
          <div className="auth-paths">
            {TRACKS.map((item, index) => (
              <div key={item.id}>
                <span>0{index + 1}</span>
                {item.name}
                <ArrowRight size={18} />
              </div>
            ))}
          </div>
        </div>
        <small>EMMANUEL AMADIN ACADEMY</small>
      </aside>
      <main className="auth-main">
        <Link href="/" className="text-link">
          <ArrowLeft size={16} /> Back to the academy
        </Link>
        <div className="auth-form-wrap">
          <span className="eyebrow">
            {onboarding
              ? "COMPLETE YOUR PROFILE"
              : signup
                ? "CREATE YOUR ACCOUNT"
                : "WELCOME BACK"}
          </span>
          <h2>
            {onboarding
              ? "A few details before you begin."
              : signup
                ? "Join EA Academy."
                : "Continue learning."}
          </h2>
          <p className="muted">
            {onboarding
              ? "Tell us how to reach you and choose your permanent primary track."
              : "Sign in securely with Google. No password to create or remember."}
          </p>
          {!configured ? (
            <div className="auth-form google-only-auth">
              <button type="button" className="btn google-signin" disabled>
                <GoogleMark /> Continue with Google
              </button>
              <div className="auth-connection-note" role="status">
                <span className="connection-dot" />
                <div>
                  <strong>Google signup is awaiting connection</strong>
                  <p>
                    The academy’s Supabase keys still need to be added before
                    this button can open Google.
                  </p>
                </div>
              </div>
              <div className="signup-assurance">
                <span>
                  <Check size={15} /> No password to create
                </span>
                <span>
                  <Check size={15} /> Secure Google authentication
                </span>
                <span>
                  <Check size={15} /> Your details stay private
                </span>
              </div>
            </div>
          ) : onboarding ? (
            <form onSubmit={finishProfile} className="auth-form">
              <label className="field">
                Full name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={100}
                />
              </label>
              <div className="onboarding-grid">
                <label className="field">
                  Country
                  <select
                    value={countryCode}
                    onChange={(event) =>
                      setCountryCode(event.target.value as CountryCode)
                    }
                    autoComplete="country"
                    required
                  >
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name} (+{getCountryCallingCode(country.code)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Phone number
                  <div className="phone-field">
                    <span>+{getCountryCallingCode(countryCode)}</span>
                    <input
                      required
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="801 234 5678"
                      maxLength={30}
                    />
                  </div>
                </label>
              </div>
              <fieldset className="birthday-picker">
                <legend>
                  Birthday <small>We only ask for the month and day.</small>
                </legend>
                <div className="onboarding-grid">
                  <label className="field">
                    Month
                    <select
                      required
                      value={birthMonth}
                      onChange={(event) => setBirthMonth(event.target.value)}
                    >
                      <option value="">Select month</option>
                      {Array.from({ length: 12 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {new Intl.DateTimeFormat("en", {
                            month: "long",
                          }).format(new Date(2024, index, 1))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Day
                    <select
                      required
                      value={birthDay}
                      onChange={(event) => setBirthDay(event.target.value)}
                    >
                      <option value="">Select day</option>
                      {Array.from({ length: dayCount }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset className="track-picker">
                <legend>Your primary track</legend>
                {TRACKS.map((item, index) => (
                  <label
                    className={track === item.id ? "selected" : ""}
                    key={item.id}
                  >
                    <input
                      type="radio"
                      name="track"
                      value={item.id}
                      checked={track === item.id}
                      onChange={() => setTrack(item.id)}
                    />
                    <span className="track-picker-number">0{index + 1}</span>
                    <span>{item.name}</span>
                    {track === item.id && <Check size={17} />}
                  </label>
                ))}
                <small>
                  Choose carefully. Your primary track cannot be changed after
                  signup.
                </small>
              </fieldset>
              {error && (
                <div role="alert" className="alert alert-error">
                  {error}
                </div>
              )}
              <button className="btn btn-primary" disabled={busy}>
                {busy && <LoaderCircle size={18} className="spin" />}Complete
                registration <ArrowRight size={17} />
              </button>
              <p className="auth-terms">
                By continuing, you agree to our{" "}
                <Link href="/terms">membership terms</Link> and{" "}
                <Link href="/privacy">privacy policy</Link>.
              </p>
            </form>
          ) : (
            <div className="auth-form google-only-auth">
              {error && (
                <div role="alert" className="alert alert-error">
                  {error}
                </div>
              )}
              <button
                type="button"
                className="btn google-signin"
                onClick={google}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle size={19} className="spin" />
                ) : (
                  <GoogleMark />
                )}
                Continue with Google
              </button>
              <div className="google-only-note">
                <Check size={16} />
                <span>One secure account for the whole academy</span>
              </div>
              <p className="auth-terms">
                By continuing, you agree to our{" "}
                <Link href="/terms">membership terms</Link> and{" "}
                <Link href="/privacy">privacy policy</Link>.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
