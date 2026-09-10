"use client";
import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  PanelsTopLeft,
  CalendarDays,
  Wallet,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
  ChevronRight,
  GraduationCap,
  Shield,
  FileCheck,
  Send,
  Heart,
  WifiOff,
  Video,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useAcademy } from "./academy-provider";
import { Brand, Loading, SetupNotice } from "./ui";
import { useRecords, useOnline } from "@/lib/hooks";
import { TRACKS, isPremium, type AcademyNotification } from "@/lib/types";
import { LearningSync } from "@/features/learning/offline";
import { api } from "@/lib/api";
import { isBirthdayToday, localDateParts } from "@/lib/birthdays";

const studentLinks = [
  { href: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/shop", label: "Shop", icon: Store },
  { href: "/app/library", label: "My library", icon: ShoppingBag },
  { href: "/app/classes", label: "Classroom", icon: Video },
  { href: "/app/tracks", label: "My learning", icon: BookOpen },
  { href: "/app/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/app/transcript", label: "Learning record", icon: GraduationCap },
];
const communityLinks = [
  { href: "/app/community", label: "Cohort lounge", icon: Users },
  { href: "/app/showcase", label: "Project showcase", icon: PanelsTopLeft },
  { href: "/app/sessions", label: "Live sessions", icon: CalendarDays },
  { href: "/donate", label: "Support a scholar", icon: Heart },
];
const adminLinks = [
  { href: "/app/admin", label: "Command center", icon: Shield },
  { href: "/app/shop-studio", label: "Shop studio", icon: Store },
  { href: "/app/users", label: "People", icon: Users },
  { href: "/app/courses", label: "Track editor", icon: BookOpen },
  { href: "/app/submissions", label: "Review submissions", icon: FileCheck },
  { href: "/app/notifications", label: "Announcements", icon: Send },
  { href: "/app/settings", label: "Platform settings", icon: Settings },
];
export function AppShell({ children }: { children: ReactNode }) {
  const {
    user,
    authUser,
    loading,
    configured,
    error,
    signOut,
    refreshProfile,
  } = useAcademy();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [search, setSearch] = useState("");
  const [seen, setSeen] = useState("");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const online = useOnline();

  useEffect(() => {
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!showLogoutModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !signingOut) setShowLogoutModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showLogoutModal, signingOut]);
  const userId = user?.id;
  const validPrimaryTrack =
    !!user && TRACKS.some((track) => track.id === user.enrolledClassId);
  const needsOnboarding =
    !!user &&
    user.role === "Student" &&
    (!validPrimaryTrack || !user.phoneNumber);
  useEffect(() => {
    if (!userId) return;
    void api("profile.ensure").catch(() => {});
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone && timeZone !== user?.timeZone)
      void api("profile.timezone", { timeZone })
        .then(() => refreshProfile())
        .catch(() => {});
  }, [userId, user?.timeZone, refreshProfile]);
  const { data: notifications } = useRecords<AcademyNotification>(
    "notifications",
    [["targetTrack", "in", ["all", user?.enrolledClassId || "system-dev"]]],
    !!user,
  );
  useEffect(() => {
    if (!loading && configured && !authUser) router.replace("/login");
    if (!loading && configured && authUser && !user && !error)
      router.replace("/signup");
    if (!loading && configured && authUser && needsOnboarding)
      router.replace("/signup");
  }, [loading, configured, authUser, user, error, needsOnboarding, router]);
  useEffect(() => {
    setMenu(false);
    setBell(false);
    setSearch("");
  }, [pathname]);
  useEffect(() => {
    if (user)
      setSeen(localStorage.getItem(`ea-notifications-seen:${user.id}`) || "");
  }, [user]);
  if (loading) return <Loading />;
  if (!configured)
    return (
      <div className="setup-page">
        <Brand />
        <SetupNotice />
      </div>
    );
  if (error)
    return (
      <div className="setup-page">
        <Brand />
        <div className="setup-notice">
          <h2>Your workspace couldn’t load.</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Try again
          </button>
          <button className="btn btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  if (!user || needsOnboarding) return <Loading />;
  const staff = user.role !== "Student";
  const allLinks = [
    ...studentLinks,
    ...communityLinks,
    ...(staff
      ? adminLinks.filter(
          (l) =>
            user.role === "Admin" ||
            ["/app/courses", "/app/submissions"].includes(l.href),
        )
      : []),
    { href: "/app/billing", label: "Membership & billing", icon: Wallet },
    { href: "/app/account", label: "Account settings", icon: Settings },
  ];
  const current = allLinks.find((l) => l.href === pathname);
  const today = localDateParts(user.timeZone || "UTC");
  const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const personalNotifications: AcademyNotification[] = [];
  if (!user.birthday)
    personalNotifications.push({
      id: "birthday-missing",
      title: "Add your birthday",
      message:
        "Add your birthday month and day so EA Academy can celebrate you.",
      type: "system",
      targetTrack: user.enrolledClassId,
      priority: "normal",
      actionScreen: "/app/account",
      createdAt: user.enrolledAt,
    });
  if (isBirthdayToday(user.birthday, user.timeZone || "UTC"))
    personalNotifications.push({
      id: `birthday-${todayKey}`,
      title: `Happy birthday, ${user.name.split(" ")[0]}!`,
      message:
        "Everyone at EA Academy is celebrating you today. We hope this new year brings you growth, joy, and bold new opportunities.",
      type: "system",
      targetTrack: user.enrolledClassId,
      priority: "high",
      createdAt: `${todayKey}T00:00:00.000Z`,
    });
  const allNotifications = [...personalNotifications, ...notifications];
  const unread = allNotifications.filter((n) => n.createdAt > seen).length;
  function nav(items: typeof studentLinks) {
    return items.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        scroll={true}
        onClick={() => {
          setMenu(false);
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        }}
        className={pathname === href ? "sidebar-link active" : "sidebar-link"}
      >
        <Icon size={19} />
        <span>{label}</span>
        {pathname === href && <span className="active-dot" />}
      </Link>
    ));
  }
  return (
    <div className="app-layout">
      {menu && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-square">EA</span>
          <div>
            My academy
            <small>
              {user.role === "Student"
                ? "Student workspace"
                : `${user.role} workspace`}
            </small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          <span className="sidebar-caption">YOUR LEARNING</span>
          {nav(studentLinks)}
          <span className="sidebar-caption">GROW TOGETHER</span>
          {nav(communityLinks)}
          {staff && (
            <>
              <span className="sidebar-caption">ACADEMY MANAGEMENT</span>
              {nav(
                adminLinks.filter(
                  (l) =>
                    user.role === "Admin" ||
                    ["/app/courses", "/app/submissions"].includes(l.href),
                ),
              )}
            </>
          )}
          <span className="sidebar-caption">YOUR ACCOUNT</span>
          {nav([
            { href: "/app/billing", label: "Membership", icon: Wallet },
            { href: "/app/account", label: "Settings", icon: Settings },
          ])}
          <button
            type="button"
            className="sidebar-link sidebar-logout-nav-item"
            onClick={() => setShowLogoutModal(true)}
          >
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </nav>
        {!isPremium(user) && (
          <div className="sidebar-upgrade">
            <h4>Make room for more.</h4>
            <p>Every track. ₦3,000 / month.</p>
            <Link href="/app/billing">
              Explore Premium <ArrowUpRight size={16} />
            </Link>
          </div>
        )}
        <div className="sidebar-user">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{isPremium(user) ? "Premium member" : "Free member"}</small>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            aria-label="Log out of account"
            title="Log out"
            onClick={() => setShowLogoutModal(true)}
          >
            <LogOut size={15} />
            <span className="logout-btn-label">Log out</span>
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="workspace-header">
          <div className="workspace-breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{current?.label || "Lesson"}</strong>
          </div>
          <div className="workspace-tools">
            <div className="workspace-search">
              <Search size={17} />
              <input
                aria-label="Search workspace pages"
                placeholder="Find your next step…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <div className="search-results">
                  {allLinks.filter((l) =>
                    l.label.toLowerCase().includes(search.toLowerCase()),
                  ).length ? (
                    allLinks
                      .filter((l) =>
                        l.label.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((l) => (
                        <Link key={l.href} href={l.href}>
                          {l.label}
                          <ArrowUpRight size={14} />
                        </Link>
                      ))
                  ) : (
                    <p>No matching workspace pages.</p>
                  )}
                </div>
              )}
            </div>
            {!online && <WifiOff size={17} aria-label="Offline" />}
            <div className="notification-anchor">
              <button
                className="icon-btn bell-button"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                aria-expanded={bell}
                onClick={() => {
                  setBell(!bell);
                  if (!bell) {
                    const now = new Date().toISOString();
                    setSeen(now);
                    localStorage.setItem(
                      `ea-notifications-seen:${user.id}`,
                      now,
                    );
                  }
                }}
              >
                <Bell size={20} />
                {unread > 0 && <i />}
              </button>
              {bell && (
                <div className="notification-panel">
                  <h3>Your updates</h3>
                  {allNotifications.length ? (
                    [...allNotifications]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 12)
                      .map((n) => (
                        <div key={n.id} className="notification-item">
                          <strong>{n.title}</strong>
                          <p>{n.message}</p>
                          <small>
                            {new Date(n.createdAt).toLocaleDateString()}
                          </small>
                          {n.actionScreen &&
                            n.actionScreen.startsWith("/app/") && (
                              <Link href={n.actionScreen}>Open update →</Link>
                            )}
                        </div>
                      ))
                  ) : (
                    <p className="muted">
                      You’re all caught up. Academy announcements will appear
                      here.
                    </p>
                  )}
                </div>
              )}
            </div>
            <Link
              href="/app/account"
              className="avatar avatar-small"
              aria-label="Your account"
            >
              {user.name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main key={pathname} className="workspace-content">
          <LearningSync />
          {children}
        </main>
        <footer className="workspace-footer">
          <span>One step closer to what’s next.</span>
          <span>
            {TRACKS.find((t) => t.id === user.enrolledClassId)?.name}{" "}
            <span className="green-dot" />
          </span>
          <Link href="/donate">
            <Heart size={13} /> Support a scholar
          </Link>
        </footer>
      </div>
      {/* Native App Bottom Navigation Bar (Mobile only, hidden on desktop) */}
      <nav className="mobile-bottom-nav" aria-label="Mobile application navigation">
        <Link
          href="/app/dashboard"
          scroll={true}
          onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
          className={`mobile-tab ${pathname === "/app/dashboard" ? "active" : ""}`}
        >
          <LayoutDashboard size={20} />
          <span>Overview</span>
        </Link>
        <Link
          href="/app/classes"
          scroll={true}
          onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
          className={`mobile-tab ${pathname.startsWith("/app/classes") ? "active" : ""}`}
        >
          <Video size={20} />
          <span>Classes</span>
        </Link>
        <Link
          href="/app/tracks"
          scroll={true}
          onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
          className={`mobile-tab ${pathname.startsWith("/app/tracks") ? "active" : ""}`}
        >
          <BookOpen size={20} />
          <span>Tracks</span>
        </Link>
        <Link
          href="/app/assignments"
          scroll={true}
          onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
          className={`mobile-tab ${pathname.startsWith("/app/assignments") ? "active" : ""}`}
        >
          <ClipboardList size={20} />
          <span>Tasks</span>
        </Link>
        <button
          type="button"
          className={`mobile-tab ${menu ? "active" : ""}`}
          onClick={() => setMenu(!menu)}
          aria-label={menu ? "Close menu drawer" : "Open menu drawer"}
          aria-expanded={menu}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* Log Out Confirmation Dialog */}
      {showLogoutModal && (
        <div
          className="logout-modal-backdrop"
          role="presentation"
          onClick={() => !signingOut && setShowLogoutModal(false)}
        >
          <div
            className="logout-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="logout-modal-icon">
              <LogOut size={24} />
            </div>
            <h3 id="logout-dialog-title">Log out of EA Academy?</h3>
            <p>
              Are you sure you want to log out? You will need to sign back in
              with your email ({user.email}) to access your enrolled tracks,
              classes, and assignments.
            </p>
            <div className="logout-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLogoutModal(false)}
                disabled={signingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  try {
                    await signOut();
                    setShowLogoutModal(false);
                    setMenu(false);
                    router.push("/");
                  } catch {
                    setSigningOut(false);
                  }
                }}
              >
                {signingOut ? "Signing out…" : "Yes, Log out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
