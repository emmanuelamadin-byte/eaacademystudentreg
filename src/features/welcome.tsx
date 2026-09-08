"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { TRACKS } from "@/lib/types";
import { useAcademy } from "@/components/academy-provider";
import { Brand } from "@/components/ui";

export default function Welcome() {
  const { user, authUser, loading } = useAcademy();
  const router = useRouter();
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !authUser) router.replace("/signup");
    else if (!loading && authUser && !user) router.replace("/signup");
  }, [authUser, loading, router, user]);
  useEffect(() => {
    if (!user) return;
    void api<{ whatsappGroupUrl?: string }>("onboarding.welcome")
      .then((result) => setWhatsappGroupUrl(result.whatsappGroupUrl || ""))
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load the group link.",
        ),
      )
      .finally(() => setLoaded(true));
  }, [user]);

  if (loading || !user) {
    return (
      <main className="welcome-page">
        <LoaderCircle className="spin" aria-label="Loading" />
      </main>
    );
  }
  const track = TRACKS.find((item) => item.id === user.enrolledClassId);
  return (
    <main className="welcome-page">
      <div className="welcome-card">
        <Brand />
        <span className="welcome-check">
          <Check size={30} />
        </span>
        <span className="eyebrow">REGISTRATION COMPLETE</span>
        <h1>Welcome to EA Academy, {user.name.split(" ")[0]}.</h1>
        <p>
          Your place in <strong>{track?.name}</strong> is ready. Join the
          academy WhatsApp group for announcements, class reminders, and
          community updates.
        </p>
        {!loaded ? (
          <button className="btn btn-secondary" disabled>
            <LoaderCircle size={18} className="spin" /> Loading group link
          </button>
        ) : whatsappGroupUrl ? (
          <a
            className="btn whatsapp-button"
            href={whatsappGroupUrl}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={19} /> Join the WhatsApp group{" "}
            <ArrowRight size={17} />
          </a>
        ) : (
          <div className="alert" role="status">
            Your account is ready. The admin will add the WhatsApp group invite
            here shortly.
          </div>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Link href="/app/dashboard" className="text-link">
          Go to my learning workspace <ArrowRight size={17} />
        </Link>
      </div>
    </main>
  );
}
