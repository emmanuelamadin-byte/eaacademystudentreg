"use client";
import { useEffect, useState } from "react";
import { useAcademy } from "@/components/academy-provider";
import { TRACKS } from "@/lib/types";
import { api } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { formatBirthday } from "@/lib/birthdays";
export default function Account() {
  const { user, refreshProfile } = useAcademy();
  const [name, setName] = useState(user?.name || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [birthMonth, setBirthMonth] = useState(
    user?.birthday?.month.toString() || "",
  );
  const [birthDay, setBirthDay] = useState(
    user?.birthday?.day.toString() || "",
  );
  const [correctingBirthday, setCorrectingBirthday] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(
    user?.emailNotificationsEnabled !== false,
  );
  const [birthdayEmail, setBirthdayEmail] = useState(
    user?.birthdayEmailEnabled !== false,
  );
  const [whatsappNotifications, setWhatsappNotifications] = useState(
    user?.whatsappNotificationsEnabled === true,
  );
  const [birthdayWhatsapp, setBirthdayWhatsapp] = useState(
    user?.birthdayWhatsappEnabled === true,
  );
  const [whatsappConsent, setWhatsappConsent] = useState(
    Boolean(user?.whatsappOptedInAt),
  );
  const dayCount = birthMonth
    ? new Date(2000, Number(birthMonth), 0).getDate()
    : 31;
  useEffect(() => {
    setBirthMonth(user?.birthday?.month.toString() || "");
    setBirthDay(user?.birthday?.day.toString() || "");
  }, [user?.birthday?.month, user?.birthday?.day]);
  useEffect(() => {
    setEmailNotifications(user?.emailNotificationsEnabled !== false);
    setBirthdayEmail(user?.birthdayEmailEnabled !== false);
    setWhatsappNotifications(user?.whatsappNotificationsEnabled === true);
    setBirthdayWhatsapp(user?.birthdayWhatsappEnabled === true);
    setWhatsappConsent(Boolean(user?.whatsappOptedInAt));
  }, [
    user?.emailNotificationsEnabled,
    user?.birthdayEmailEnabled,
    user?.whatsappNotificationsEnabled,
    user?.birthdayWhatsappEnabled,
    user?.whatsappOptedInAt,
  ]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-header">
        <span className="eyebrow">MAKE YOURSELF AT HOME</span>
        <h1>Your account</h1>
        <p className="muted">
          Your details, your learning direction, and your preferences.
        </p>
      </div>
      {message && (
        <div role="status" className="alert alert-success">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      <div className="grid-2">
        <section className="card">
          <h3>Personal details</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api("profile.update", { name });
                await refreshProfile();
              }, "Your name has been updated.");
            }}
          >
            <label className="field">
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label className="field">
              Email
              <input value={user?.email || ""} disabled />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              Save changes
            </button>
          </form>
        </section>
        <section className="card">
          <h3>Your learning direction</h3>
          <span className="badge">{user?.role}</span>
          <h2>{TRACKS.find((t) => t.id === user?.enrolledClassId)?.name}</h2>
          <p className="muted">
            Your primary track was selected when you joined. Premium lets you
            explore all three tracks while keeping your primary direction.
          </p>
          <small>
            Member since{" "}
            {user &&
              new Date(user.enrolledAt).toLocaleDateString("en-NG", {
                month: "long",
                year: "numeric",
              })}
          </small>
        </section>
        <section className="card birthday-card">
          <h3>Your birthday</h3>
          {user?.birthday && !correctingBirthday ? (
            <>
              <p className="birthday-value">{formatBirthday(user.birthday)}</p>
              <p className="muted">
                We only store the month and day. Your birth year is not needed.
              </p>
              {(user.birthdayChanges || 0) < 1 ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setCorrectingBirthday(true)}
                >
                  Correct birthday
                </button>
              ) : (
                <small>
                  Your one correction has been used. Contact the academy if this
                  is still incorrect.
                </small>
              )}
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  user?.birthday &&
                  !window.confirm(
                    "This is your only birthday correction. Save this new date?",
                  )
                )
                  return;
                void run(
                  async () => {
                    await api("profile.birthday", {
                      birthday: {
                        month: Number(birthMonth),
                        day: Number(birthDay),
                      },
                    });
                    await refreshProfile();
                    setCorrectingBirthday(false);
                  },
                  user?.birthday
                    ? "Your birthday has been corrected."
                    : "Your birthday has been added.",
                );
              }}
            >
              <fieldset className="birthday-picker">
                <legend>
                  Month and day
                  <small>
                    {user?.birthday
                      ? "This correction cannot be changed again."
                      : "You will have one correction after saving."}
                  </small>
                </legend>
                <div className="birthday-fields">
                  <label className="field">
                    Month
                    <select
                      value={birthMonth}
                      onChange={(event) => {
                        const month = event.target.value;
                        setBirthMonth(month);
                        const days = month
                          ? new Date(2000, Number(month), 0).getDate()
                          : 31;
                        if (Number(birthDay) > days) setBirthDay("");
                      }}
                      required
                    >
                      <option value="">Choose month</option>
                      {Array.from({ length: 12 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {new Intl.DateTimeFormat("en-NG", {
                            month: "long",
                            timeZone: "UTC",
                          }).format(new Date(Date.UTC(2000, index, 1)))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Day
                    <select
                      value={birthDay}
                      onChange={(event) => setBirthDay(event.target.value)}
                      required
                    >
                      <option value="">Choose day</option>
                      {Array.from({ length: dayCount }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <div className="button-row">
                <button className="btn btn-primary" disabled={busy}>
                  Save birthday
                </button>
                {user?.birthday && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBirthMonth(user.birthday?.month.toString() || "");
                      setBirthDay(user.birthday?.day.toString() || "");
                      setCorrectingBirthday(false);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
        <section className="card">
          <h3>Account security</h3>
          <p className="muted">
            Your account uses Google sign-in. Google manages your password and
            account recovery.
          </p>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { error } =
                  (await getSupabase()?.auth.refreshSession()) || {};
                if (error) throw error;
                await refreshProfile();
              }, "Account status refreshed.")
            }
          >
            Refresh verification status
          </button>
        </section>
        <section className="card">
          <h3>Stay in the loop</h3>
          <p className="muted">
            Receive lesson updates, live session announcements, and academy news
            on this device.
          </p>
          <p className="muted">
            In-app announcements update automatically while you use the academy.
          </p>
          <form
            className="communication-preferences"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await api("communications.update", {
                  preferences: {
                    emailNotificationsEnabled: emailNotifications,
                    birthdayEmailEnabled: birthdayEmail,
                    whatsappNotificationsEnabled: whatsappNotifications,
                    birthdayWhatsappEnabled: birthdayWhatsapp,
                    whatsappConsent,
                  },
                });
                await refreshProfile();
              }, "Your communication preferences have been saved.");
            }}
          >
            <label className="preference-option">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(event) =>
                  setEmailNotifications(event.target.checked)
                }
              />
              <span>
                <strong>Email academy updates</strong>
                <small>Announcements, lessons, sessions and reminders.</small>
              </span>
            </label>
            <label className="preference-option preference-child">
              <input
                type="checkbox"
                checked={birthdayEmail}
                onChange={(event) => setBirthdayEmail(event.target.checked)}
              />
              <span>
                <strong>Email birthday wishes</strong>
                <small>Sent automatically on your birthday.</small>
              </span>
            </label>
            <label className="preference-option">
              <input
                type="checkbox"
                checked={whatsappNotifications}
                onChange={(event) => {
                  setWhatsappNotifications(event.target.checked);
                  if (!event.target.checked) setBirthdayWhatsapp(false);
                }}
              />
              <span>
                <strong>WhatsApp academy updates</strong>
                <small>Only sent to the phone number on your profile.</small>
              </span>
            </label>
            {whatsappNotifications && (
              <>
                <label className="preference-option preference-consent">
                  <input
                    type="checkbox"
                    checked={whatsappConsent}
                    onChange={(event) =>
                      setWhatsappConsent(event.target.checked)
                    }
                    required
                  />
                  <span>
                    I agree to receive EA Academy updates on WhatsApp. I can opt
                    out here at any time.
                  </span>
                </label>
                <label className="preference-option preference-child">
                  <input
                    type="checkbox"
                    checked={birthdayWhatsapp}
                    onChange={(event) =>
                      setBirthdayWhatsapp(event.target.checked)
                    }
                  />
                  <span>
                    <strong>WhatsApp birthday wishes</strong>
                    <small>Sent automatically on your birthday.</small>
                  </span>
                </label>
              </>
            )}
            <button className="btn btn-primary" disabled={busy}>
              Save communication preferences
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
