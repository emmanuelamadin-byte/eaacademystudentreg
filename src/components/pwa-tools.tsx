"use client";
import { useEffect, useState } from "react";
import { Download, X, WifiOff, Bell } from "lucide-react";
import { useOnline } from "@/lib/hooks";
import { useAcademy } from "@/components/academy-provider";
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
} from "@/lib/push";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function PwaTools() {
  const { user } = useAcademy();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const online = useOnline();

  useEffect(() => {
    setDismissed(sessionStorage.getItem("ea-install-dismissed") === "1");
    const isStandalone = matchMedia("(display-mode: standalone)").matches;
    setInstalled(isStandalone);

    if (process.env.NODE_ENV === "production")
      navigator.serviceWorker?.register("/sw.js").catch(() => {});
    else
      navigator.serviceWorker
        ?.getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter((r) => r.active?.scriptURL === `${location.origin}/sw.js`)
              .map((r) => r.unregister()),
          ),
        )
        .catch(() => {});

    // Check if push notifications can be prompted
    if (
      user &&
      isPushSupported() &&
      getNotificationPermission() === "default" &&
      sessionStorage.getItem("ea-push-prompt-dismissed") !== "1"
    ) {
      // Delay prompt slightly so it feels natural
      const timer = setTimeout(() => {
        setShowPushPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    const handle = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handle);
    const done = () => setInstalled(true);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", handle);
      window.removeEventListener("appinstalled", done);
    };
  }, [user]);

  async function installApp() {
    if (install) {
      await install.prompt();
      const choice = await install.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstall(null);
    } else setHelp(!help);
  }

  return (
    <>
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={16} /> You’re offline. Saved lessons and drafts are
          still available.
        </div>
      )}

      {/* PWA Install Banner */}
      {!installed && !dismissed && (
        <aside className="install-banner" aria-label="Install EA Academy">
          <span className="install-icon">
            <Download size={20} />
          </span>
          <div>
            <strong>Your academy. On the go.</strong>
            <p>Install for quick access and offline learning.</p>
            {help && (
              <p className="install-help">
                Open your browser’s menu and choose “Install app” or “Add to
                Home Screen”. On iPhone, use Safari’s Share menu.
              </p>
            )}
          </div>
          <button className="btn btn-secondary btn-small" onClick={installApp}>
            Install
          </button>
          <button
            className="icon-btn"
            aria-label="Dismiss install prompt"
            onClick={() => {
              setDismissed(true);
              sessionStorage.setItem("ea-install-dismissed", "1");
            }}
          >
            <X size={15} />
          </button>
        </aside>
      )}

      {/* Push Notification Prompt */}
      {showPushPrompt && (installed || dismissed) && (
        <aside className="install-banner" aria-label="Enable notifications">
          <span className="install-icon">
            <Bell size={20} />
          </span>
          <div>
            <strong>Get instant updates</strong>
            <p>Turn on notifications for announcements & feedback on your phone.</p>
          </div>
          <button
            className="btn btn-secondary btn-small"
            disabled={pushBusy}
            onClick={async () => {
              setPushBusy(true);
              const result = await subscribeToPush(user);
              if (result.success || result.permission !== "default") {
                setShowPushPrompt(false);
              }
              setPushBusy(false);
            }}
          >
            {pushBusy ? "Enabling…" : "Turn on"}
          </button>
          <button
            className="icon-btn"
            aria-label="Dismiss notification prompt"
            onClick={() => {
              setShowPushPrompt(false);
              sessionStorage.setItem("ea-push-prompt-dismissed", "1");
            }}
          >
            <X size={15} />
          </button>
        </aside>
      )}
    </>
  );
}
