"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  Crown,
  Heart,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { useAcademy } from "@/components/academy-provider";
import { useRecord, useRecords } from "@/lib/hooks";
import { accessToken, api } from "@/lib/api";
import { TRACKS, PREMIUM_PRICE } from "@/lib/types";
import type {
  AcademyUser,
  Assignment,
  AssignmentSubmission,
  CourseModule,
  Donation,
  Lesson,
  PlatformSettings,
  Payment,
  Progress,
  CareerPathClassId,
  ShopItem,
  ShopPurchase,
} from "@/lib/types";
import {
  summarizeRevenueAnalytics,
  STREAM_LABELS,
  type RevenuePeriod,
  type RevenueStream,
} from "@/lib/revenue";
import {
  ActionMessage,
  Empty,
  ExternalLink,
  TrackSelect,
  dateLabel,
  trackName,
  useAction,
} from "./admin/shared";
import "./admin/admin.css";
import TrackProfileEditor from "./admin/track-profile";

export default function Admin({ section }: { section: string; id?: string }) {
  const { user } = useAcademy();
  const staff = user?.role === "Admin" || user?.role === "Instructor";
  if (
    !staff ||
    (user.role !== "Admin" && !["courses", "submissions"].includes(section))
  )
    return (
      <Empty title="Staff access required">
        This workspace is available to authorized academy staff.
      </Empty>
    );
  const titles: Record<string, [string, string]> = {
    admin: [
      "Academy overview",
      "A clear view of your academy, your students, and their progress.",
    ],
    revenue: [
      "Revenue & sales",
      "Track earnings across courses, digital products, premium memberships, and scholarship donations.",
    ],
    users: [
      "People & permissions",
      "Support your students and appoint instructors to the right tracks.",
    ],
    courses: [
      "Course studio",
      "Turn your experience into lessons worth learning.",
    ],
    submissions: [
      "Review workspace",
      "Thoughtful feedback. Clear next steps. Better work.",
    ],
    notifications: [
      "Announcements",
      "Keep your academy informed and moving together.",
    ],
    settings: [
      "Academy settings",
      "Manage the details that keep your academy running.",
    ],
  };
  const [title, description] = titles[section] ?? titles.admin;
  return (
    <div className="admin-workspace">
      <header className="page-header">
        <p className="eyebrow">
          {user.role === "Admin" ? "ADMINISTRATION" : "INSTRUCTOR WORKSPACE"}
        </p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </header>
      {section === "revenue" ? (
        <RevenuePanel />
      ) : section === "users" ? (
        <UsersPanel />
      ) : section === "courses" ? (
        <CoursesPanel user={user} />
      ) : section === "submissions" ? (
        <SubmissionsPanel user={user} />
      ) : section === "notifications" ? (
        <NotificationsPanel />
      ) : section === "settings" ? (
        <SettingsPanel />
      ) : (
        <Overview />
      )}
    </div>
  );
}

function Overview() {
  const [now] = useState(() => Date.now());
  const users = useRecords<AcademyUser>("users");
  const submissions = useRecords<AssignmentSubmission>("submissions");
  const payments = useRecords<Payment>("payments");
  const shopPurchases = useRecords<ShopPurchase>("shopPurchases");
  const shopItems = useRecords<ShopItem>("shopItems");
  const donations = useRecords<Donation>("donations");
  const settings = useRecord<PlatformSettings>("settings", "public");
  const progress = useRecords<Progress>("progress");
  const modules = useRecords<CourseModule>("modules");
  const students = users.data.filter((item) => item.role === "Student");
  const activeStudents = students.filter(
    (item) =>
      item.lastActiveAt && Date.parse(item.lastActiveAt) > now - 30 * 86400000,
  ).length;
  const pending = submissions.data.filter(
    (item) => item.status === "submitted" || item.status === "under-review",
  );
  const revenueSummary = summarizeRevenueAnalytics({
    payments: payments.data,
    shopPurchases: shopPurchases.data,
    donations: donations.data,
    users: users.data,
    shopItems: shopItems.data,
    settings: settings.data,
    period: "all",
    nowMs: now,
  });
  const revenue = revenueSummary.allTimeRevenue;
  const publishedLessons = modules.data
    .filter((item) => item.published)
    .flatMap((item) =>
      (item.lessons ?? []).map((lesson) => ({
        ...lesson,
        classId: item.classId,
        free: item.free && lesson.free,
      })),
    );
  const average = students.length
    ? Math.round(
        students.reduce((sum, student) => {
          const premium =
            student.premiumGranted ||
            (student.membershipPlan === "Premium" &&
              !!student.premiumUntil &&
              Date.parse(student.premiumUntil) > now);
          const eligible = publishedLessons.filter(
            (lesson) =>
              premium ||
              (lesson.classId === student.enrolledClassId && lesson.free),
          );
          const completed = new Set(
            progress.data
              .filter(
                (item) =>
                  item.studentId === student.id &&
                  eligible.some((lesson) => lesson.id === item.lessonId),
              )
              .map((item) => item.lessonId),
          );
          return (
            sum +
            (eligible.length ? (completed.size / eligible.length) * 100 : 0)
          );
        }, 0) / students.length,
      )
    : 0;
  const loading =
    users.loading ||
    payments.loading ||
    submissions.loading ||
    progress.loading ||
    modules.loading;
  const error =
    users.error ||
    payments.error ||
    submissions.error ||
    progress.error ||
    modules.error;
  return (
    <>
      {error && (
        <p role="alert" className="alert">
          {String(error)}
        </p>
      )}
      <div className="grid-3">
        {[
          {
            label: "Active students (30 days)",
            value: activeStudents.toLocaleString(),
            icon: Users,
          },
          {
            label: "Awaiting review",
            value: pending.length.toLocaleString(),
            icon: ClipboardCheck,
          },
          {
            label: "Total received",
            value: `₦${revenue.toLocaleString()}`,
            icon: Wallet,
          },
        ].map((metric) => (
          <div className="card" key={metric.label}>
            <div className="workspace-toolbar">
              <span className="muted">{metric.label}</span>
              <metric.icon size={19} />
            </div>
            <p className="metric">{loading ? "—" : metric.value}</p>
            <span className="muted">
              {metric.label === "Total received"
                ? "Courses, digital products, memberships & donations"
                : "Live academy records"}
            </span>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Students by track</h2>
          <div className="workspace-stack">
            {TRACKS.map((track) => {
              const count = students.filter(
                (item) => item.enrolledClassId === track.id,
              ).length;
              return (
                <div key={track.id} className="workspace-chart-row">
                  <span>{track.short}</span>
                  <div className="workspace-chart-bar">
                    <span
                      style={{
                        width: `${students.length ? (count / students.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
          <hr className="workspace-divider" />
          <div className="workspace-toolbar">
            <span>Average lesson completion</span>
            <strong>{average}%</strong>
          </div>
          <p className="muted">
            Completed lessons as a share of lessons each student can access.
          </p>
        </section>
        <section className="card">
          <h2>Make room for the next step</h2>
          <p className="muted">
            Your academy starts with what you teach. Build your modules, publish
            the first lesson, and welcome your students.
          </p>
          <div className="workspace-stack">
            <Link className="btn btn-secondary" href="/app/courses">
              <BookOpen size={17} /> Open course studio <ArrowRight size={16} />
            </Link>
            <Link className="btn btn-secondary" href="/app/shop-studio">
              <Store size={17} /> Manage store & courses <ArrowRight size={16} />
            </Link>
            <Link className="btn btn-secondary" href="/app/submissions">
              <ClipboardCheck size={17} /> Review student work{" "}
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
      <RevenueAnalyticsSection
        now={now}
        payments={payments.data}
        shopPurchases={shopPurchases.data}
        donations={donations.data}
        users={users.data}
        shopItems={shopItems.data}
        settings={settings.data}
        loading={
          payments.loading ||
          shopPurchases.loading ||
          donations.loading ||
          shopItems.loading
        }
      />
    </>
  );
}

function RevenuePanel() {
  const [now] = useState(() => Date.now());
  const users = useRecords<AcademyUser>("users");
  const payments = useRecords<Payment>("payments");
  const shopPurchases = useRecords<ShopPurchase>("shopPurchases");
  const shopItems = useRecords<ShopItem>("shopItems");
  const donations = useRecords<Donation>("donations");
  const settings = useRecord<PlatformSettings>("settings", "public");
  const error =
    payments.error ||
    shopPurchases.error ||
    donations.error ||
    shopItems.error ||
    users.error;

  return (
    <>
      {error && (
        <p role="alert" className="alert">
          {String(error)}
        </p>
      )}
      <RevenueAnalyticsSection
        now={now}
        payments={payments.data}
        shopPurchases={shopPurchases.data}
        donations={donations.data}
        users={users.data}
        shopItems={shopItems.data}
        settings={settings.data}
        loading={
          payments.loading ||
          shopPurchases.loading ||
          donations.loading ||
          shopItems.loading ||
          users.loading
        }
      />
    </>
  );
}

const PERIOD_OPTIONS: Array<{ value: RevenuePeriod; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

function RevenueAnalyticsSection({
  now,
  payments,
  shopPurchases,
  donations,
  users,
  shopItems,
  settings,
  loading,
}: {
  now: number;
  payments: Payment[];
  shopPurchases: ShopPurchase[];
  donations: Donation[];
  users: AcademyUser[];
  shopItems: ShopItem[];
  settings: PlatformSettings | null;
  loading: boolean;
}) {
  const [period, setPeriod] = useState<RevenuePeriod>("all");
  const [itemFilter, setItemFilter] = useState<
    "all" | "course" | "digital_product"
  >("all");
  const [streamFilter, setStreamFilter] = useState<RevenueStream | "all">(
    "all",
  );
  const [ledgerQuery, setLedgerQuery] = useState("");
  const [ledgerPage, setLedgerPage] = useState(0);

  const summary = summarizeRevenueAnalytics({
    payments,
    shopPurchases,
    donations,
    users,
    shopItems,
    settings,
    period,
    nowMs: now,
  });

  const { streams, metrics } = summary;

  const streamCards = [
    {
      key: "course" as const,
      title: "Courses",
      icon: BookOpen,
      data: streams.course,
      detail: `${streams.course.count.toLocaleString()} ${streams.course.count === 1 ? "sale" : "sales"} · Avg ₦${streams.course.averageAmount.toLocaleString()}`,
      footer: `${metrics.publishedCoursesCount} live of ${metrics.totalCoursesCount} courses in catalog`,
    },
    {
      key: "digital_product" as const,
      title: "Digital products",
      icon: Package,
      data: streams.digital_product,
      detail: `${streams.digital_product.count.toLocaleString()} ${streams.digital_product.count === 1 ? "sale" : "sales"} · Avg ₦${streams.digital_product.averageAmount.toLocaleString()}`,
      footer: `${metrics.publishedProductsCount} live of ${metrics.totalProductsCount} materials in catalog`,
    },
    {
      key: "premium" as const,
      title: "Premium memberships",
      icon: Crown,
      data: streams.premium,
      detail: `${streams.premium.count.toLocaleString()} ${streams.premium.count === 1 ? "payment" : "payments"} · ₦${PREMIUM_PRICE.toLocaleString()}/mo`,
      footer: `${metrics.activePaidMembersCount} active paid · ${metrics.recurringSubscribersCount} auto-renew · ${metrics.complimentaryMembersCount} sponsored`,
    },
    {
      key: "donation" as const,
      title: "Scholarship donations",
      icon: Heart,
      data: streams.donation,
      detail: `${streams.donation.count.toLocaleString()} ${streams.donation.count === 1 ? "contribution" : "contributions"} · Avg ₦${streams.donation.averageAmount.toLocaleString()}`,
      footer:
        metrics.scholarshipGoal > 0
          ? `${metrics.scholarshipGoalPercent}% of ₦${metrics.scholarshipGoal.toLocaleString()} scholarship goal`
          : `${metrics.scholarsSupportedCount} scholar months funded`,
    },
  ];

  const filteredItems = summary.itemPerformance.filter(
    (item) => itemFilter === "all" || item.type === itemFilter,
  );

  const filteredTransactions = summary.transactions.filter((tx) => {
    if (streamFilter !== "all" && tx.stream !== streamFilter) return false;
    if (!ledgerQuery.trim()) return true;
    const q = ledgerQuery.toLowerCase();
    return `${tx.customerName} ${tx.customerEmail} ${tx.itemTitle} ${tx.reference} ${STREAM_LABELS[tx.stream]}`
      .toLowerCase()
      .includes(q);
  });

  const pageSize = 10;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / pageSize),
  );
  const currentPage = Math.min(ledgerPage, totalPages - 1);

  return (
    <div className="revenue-section-stack">
      <section className="card">
        <div className="workspace-toolbar">
          <div>
            <h2>Revenue breakdown</h2>
            <p className="muted">
              Earnings across standalone courses, digital products, premium
              memberships, and scholarship donations.
            </p>
          </div>
          <div
            className="revenue-period-pills"
            role="group"
            aria-label="Filter revenue by time period"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`revenue-pill ${period === opt.value ? "active" : ""}`}
                onClick={() => {
                  setPeriod(opt.value);
                  setLedgerPage(0);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="revenue-summary-strip" style={{ marginTop: "16px" }}>
          <div className="revenue-summary-stat">
            <small>
              {PERIOD_OPTIONS.find((o) => o.value === period)?.label ||
                "Selected period"}{" "}
              revenue
            </small>
            <strong>
              {loading ? "—" : `₦${summary.totalRevenue.toLocaleString()}`}
            </strong>
          </div>
          <div className="revenue-summary-stat">
            <small>Store sales (Courses + Digital)</small>
            <strong>
              {loading ? "—" : `₦${summary.storeRevenue.toLocaleString()}`}
            </strong>
          </div>
          <div className="revenue-summary-stat">
            <small>Completed transactions</small>
            <strong>
              {loading ? "—" : summary.totalTransactions.toLocaleString()}
            </strong>
          </div>
          {period !== "all" && (
            <div className="revenue-summary-stat">
              <small>All-time total received</small>
              <strong>
                {loading ? "—" : `₦${summary.allTimeRevenue.toLocaleString()}`}
              </strong>
            </div>
          )}
        </div>

        <div className="revenue-streams-grid" style={{ marginTop: "20px" }}>
          {streamCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className={`card revenue-stream-card stream-${card.key}`}
              >
                <div>
                  <div className="workspace-toolbar">
                    <span className="muted">{card.title}</span>
                    <span className="revenue-stream-icon">
                      <Icon size={18} />
                    </span>
                  </div>
                  <p className="metric">
                    {loading ? "—" : `₦${card.data.revenue.toLocaleString()}`}
                  </p>
                  <div className="revenue-stream-meta">
                    <span>{card.detail}</span>
                    <strong>{card.data.sharePercent}%</strong>
                  </div>
                  <div
                    className="workspace-chart-bar"
                    style={{ marginTop: "8px" }}
                  >
                    <span
                      className={`stream-${card.key}`}
                      style={{ width: `${card.data.sharePercent}%` }}
                    />
                  </div>
                </div>
                <div className="revenue-stream-footer">{card.footer}</div>
              </div>
            );
          })}
        </div>

        <hr className="workspace-divider" />

        <h3>Revenue share by stream</h3>
        {summary.totalRevenue > 0 && (
          <div
            className="revenue-stacked-bar"
            aria-label="Revenue proportion bar"
          >
            {summary.streamList.map((st) =>
              st.revenue > 0 ? (
                <span
                  key={st.stream}
                  className={`revenue-stacked-segment stream-${st.stream}`}
                  style={{
                    width: `${Math.max(2, (st.revenue / summary.totalRevenue) * 100)}%`,
                  }}
                  title={`${st.label}: ₦${st.revenue.toLocaleString()} (${st.sharePercent}%)`}
                />
              ) : null,
            )}
          </div>
        )}
        <div className="workspace-stack">
          {summary.streamList.map((st) => (
            <div key={st.stream} className="revenue-chart-row">
              <span>
                <strong>{st.label}</strong>{" "}
                <small className="muted">({st.count})</small>
              </span>
              <div className="workspace-chart-bar">
                <span
                  className={`stream-${st.stream}`}
                  style={{ width: `${st.sharePercent}%` }}
                />
              </div>
              <strong className="revenue-chart-amount">
                ₦{st.revenue.toLocaleString()} ({st.sharePercent}%)
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="workspace-toolbar">
          <div>
            <h2>Course & digital product performance</h2>
            <p className="muted">
              Unit sales and revenue generated by each standalone course and
              downloadable digital product.
            </p>
          </div>
          <div className="workspace-inline">
            <div className="revenue-period-pills">
              {[
                { value: "all" as const, label: "All store items" },
                { value: "course" as const, label: "Courses" },
                { value: "digital_product" as const, label: "Digital products" },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`revenue-pill ${itemFilter === tab.value ? "active" : ""}`}
                  onClick={() => setItemFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Link className="btn btn-secondary btn-small" href="/app/shop-studio">
              <Store size={15} /> Shop studio
            </Link>
          </div>
        </div>
        {filteredItems.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: "14px" }}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Price</th>
                  <th>Units sold</th>
                  <th>Revenue earned</th>
                  <th>Store share</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>
                        {item.category} · {item.published ? "Live" : "Draft"}
                        {item.includedInPremium ? " · Included in Premium" : ""}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`revenue-stream-badge stream-${item.type}`}
                      >
                        {item.type === "digital_product"
                          ? "Digital product"
                          : "Course"}
                      </span>
                    </td>
                    <td>₦{item.price.toLocaleString()}</td>
                    <td>
                      <strong>{item.periodSales.toLocaleString()}</strong>
                      {period !== "all" && (
                        <small>
                          {item.allTimeSales.toLocaleString()} all-time
                        </small>
                      )}
                    </td>
                    <td>
                      <strong>₦{item.periodRevenue.toLocaleString()}</strong>
                      {period !== "all" && (
                        <small>
                          ₦{item.allTimeRevenue.toLocaleString()} all-time
                        </small>
                      )}
                    </td>
                    <td>{item.shareOfStoreRevenue}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              loading
                ? "Loading catalog performance…"
                : "No courses or digital products yet"
            }
          >
            Create courses or digital materials in Shop Studio to track per-item
            sales and revenue here.
          </Empty>
        )}
      </section>

      <section className="card">
        <div className="workspace-toolbar">
          <div>
            <h2>Transaction ledger</h2>
            <p className="muted">
              Complete record of payments across courses, digital products,
              memberships, and donations.
            </p>
          </div>
          <Receipt size={20} />
        </div>
        <div className="workspace-toolbar" style={{ marginTop: "14px" }}>
          <input
            aria-label="Search transactions"
            placeholder="Search by student, donor, email, item title, or reference…"
            value={ledgerQuery}
            onChange={(event) => {
              setLedgerQuery(event.target.value);
              setLedgerPage(0);
            }}
          />
          <select
            aria-label="Filter by revenue stream"
            value={streamFilter}
            onChange={(event) => {
              setStreamFilter(event.target.value as RevenueStream | "all");
              setLedgerPage(0);
            }}
          >
            <option value="all">All revenue streams</option>
            <option value="course">Courses</option>
            <option value="digital_product">Digital products</option>
            <option value="premium">Premium memberships</option>
            <option value="donation">Scholarship donations</option>
          </select>
          <span className="muted">
            {filteredTransactions.length}{" "}
            {filteredTransactions.length === 1 ? "transaction" : "transactions"}
          </span>
        </div>

        {filteredTransactions.length > 0 ? (
          <>
            <div className="table-wrap" style={{ marginTop: "14px" }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer / Donor</th>
                    <th>Stream</th>
                    <th>Item / Description</th>
                    <th>Amount</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions
                    .slice(
                      currentPage * pageSize,
                      currentPage * pageSize + pageSize,
                    )
                    .map((tx) => (
                      <tr key={tx.id}>
                        <td>{dateLabel(tx.createdAt)}</td>
                        <td>
                          <strong>{tx.customerName}</strong>
                          {tx.customerEmail && <small>{tx.customerEmail}</small>}
                        </td>
                        <td>
                          <span
                            className={`revenue-stream-badge stream-${tx.stream}`}
                          >
                            {STREAM_LABELS[tx.stream]}
                          </span>
                        </td>
                        <td>{tx.itemTitle}</td>
                        <td>
                          <strong>₦{tx.amount.toLocaleString()}</strong>
                        </td>
                        <td>
                          <small>{tx.reference}</small>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div
                className="workspace-pagination"
                style={{ marginTop: "16px" }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={currentPage === 0}
                  onClick={() => setLedgerPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span className="muted">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={currentPage + 1 >= totalPages}
                  onClick={() => setLedgerPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <Empty
            title={
              loading
                ? "Loading transactions…"
                : "No matching transactions found"
            }
          >
            Completed course purchases, digital product sales, premium
            subscriptions, and scholarship donations will appear here.
          </Empty>
        )}
      </section>
    </div>
  );
}

function UsersPanel() {
  const records = useRecords<AcademyUser>("users");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AcademyUser | null>(null);
  const filtered = records.data.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages - 1);
  return (
    <>
      <div className="workspace-toolbar">
        <input
          aria-label="Search people"
          placeholder="Search by name or email…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <span className="muted">{filtered.length} people</span>
      </div>
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {selected && (
        <UserEditor
          key={selected.id}
          user={selected}
          close={() => setSelected(null)}
        />
      )}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Primary track</th>
              <th>Membership</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 10, current * 10 + 10).map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </td>
                <td>{user.role}</td>
                <td>{trackName(user.enrolledClassId)}</td>
                <td>
                  {user.premiumGranted
                    ? "Granted Premium"
                    : user.membershipPlan}
                </td>
                <td>
                  {user.role === "Admin" ? (
                    <span className="badge">Owner</span>
                  ) : (
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => setSelected(user)}
                    >
                      Manage
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            title={records.loading ? "Loading people…" : "No people found"}
          >
            Students will appear here when they create their accounts.
          </Empty>
        )}
      </section>
      <div className="workspace-pagination">
        <button
          className="btn btn-secondary btn-small"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </button>
        <span className="muted">
          Page {current + 1} of {pages}
        </span>
        <button
          className="btn btn-secondary btn-small"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}

function UserEditor({ user, close }: { user: AcademyUser; close: () => void }) {
  const [role, setRole] = useState<"Student" | "Instructor">(
    user.role === "Instructor" ? "Instructor" : "Student",
  );
  const [track, setTrack] = useState(user.enrolledClassId);
  const [premium, setPremium] = useState(user.premiumGranted ?? false);
  const [scopes, setScopes] = useState<CareerPathClassId[]>(
    user.instructorTrackIds ?? [],
  );
  const action = useAction();
  return (
    <section className="card">
      <div className="workspace-toolbar">
        <h2>Manage {user.name}</h2>
        <button className="btn btn-secondary btn-small" onClick={close}>
          Close
        </button>
      </div>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(() =>
            api("users.update", {
              id: user.id,
              role,
              enrolledClassId: track,
              premiumGranted: premium,
              instructorTrackIds: role === "Instructor" ? scopes : [],
            }),
          );
        }}
      >
        <div className="grid-2">
          <label>
            Role
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "Student" | "Instructor")
              }
            >
              <option>Student</option>
              <option>Instructor</option>
            </select>
          </label>
          <label>
            Primary track
            <TrackSelect
              value={track}
              onChange={(value) => setTrack(value as CareerPathClassId)}
            />
          </label>
        </div>
        <p className="muted">
          Only the academy owner can correct a primary track. Students cannot
          change their own selection.
        </p>
        {role === "Instructor" && (
          <fieldset>
            <legend>Assigned teaching tracks</legend>
            {TRACKS.map((item) => (
              <label className="check-label" key={item.id}>
                <input
                  type="checkbox"
                  checked={scopes.includes(item.id)}
                  onChange={(event) =>
                    setScopes(
                      event.target.checked
                        ? [...scopes, item.id]
                        : scopes.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
          </fieldset>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={premium}
            onChange={(event) => setPremium(event.target.checked)}
          />
          Grant complimentary Premium access
        </label>
        <ActionMessage action={action} />
        <div>
          <button
            className="btn btn-primary"
            disabled={action.busy || (role === "Instructor" && !scopes.length)}
          >
            {action.busy ? "Saving…" : "Save permissions"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CoursesPanel({ user }: { user: AcademyUser }) {
  const allowed =
    user.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : (user.instructorTrackIds ?? []);
  const [track, setTrack] = useState<CareerPathClassId>(
    allowed[0] ?? "system-dev",
  );
  const modules = useRecords<CourseModule>(
    "modules",
    [["classId", "==", track]],
    allowed.includes(track),
  );
  const assignments = useRecords<Assignment>(
    "assignments",
    [["classId", "==", track]],
    allowed.includes(track),
  );
  const lessons = useRecords<Lesson>(
    "lessons",
    [["classId", "==", track]],
    allowed.includes(track),
  );
  const [moduleEdit, setModuleEdit] = useState<CourseModule | null>(null);
  const [lessonEdit, setLessonEdit] = useState<Lesson | null>(null);
  const [assignmentEdit, setAssignmentEdit] = useState<Assignment | null>(null);
  const [ai, setAi] = useState("");
  const [prompt, setPrompt] = useState("");
  const action = useAction();
  if (!allowed.length)
    return (
      <Empty title="No tracks assigned yet">
        The academy owner will assign your teaching tracks.
      </Empty>
    );
  const ordered = modules.data
    .map((module) => ({
      ...module,
      lessons: lessons.data.filter((lesson) => lesson.moduleId === module.id),
    }))
    .sort((a, b) => a.order - b.order);
  const newModule = () => {
    setLessonEdit(null);
    setAssignmentEdit(null);
    setModuleEdit({
      id: "",
      classId: track,
      title: "",
      description: "",
      order: Math.max(0, ...ordered.map((module) => module.order)) + 1,
      published: false,
      free: false,
    });
  };
  async function editLesson(id: string) {
    await action.run(async () => {
      const lesson = await api<Lesson>("lesson.get", { id });
      setLessonEdit(lesson);
      setModuleEdit(null);
      setAssignmentEdit(null);
    }, "Lesson loaded.");
  }
  return (
    <>
      <div className="workspace-toolbar">
        <TrackSelect
          value={track}
          allowed={allowed}
          onChange={(value) => {
            setTrack(value as CareerPathClassId);
            setModuleEdit(null);
            setLessonEdit(null);
            setAssignmentEdit(null);
          }}
        />
        <div className="workspace-inline">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setModuleEdit(null);
              setLessonEdit(null);
              setAssignmentEdit({
                id: "",
                classId: track,
                title: "",
                description: "",
                dueDate: "",
                totalPoints: 100,
                published: false,
                starter: false,
                milestones: [],
              });
            }}
          >
            New assignment
          </button>
          <button className="btn btn-primary" onClick={newModule}>
            <Plus size={16} /> New module
          </button>
        </div>
      </div>
      <ActionMessage action={action} />
      {(modules.error || assignments.error || lessons.error) && (
        <p className="alert" role="alert">
          {String(modules.error || assignments.error || lessons.error)}
        </p>
      )}
      <TrackProfileEditor key={track} track={track} />
      {moduleEdit && (
        <ModuleEditor
          key={moduleEdit.id || `new-${track}`}
          value={moduleEdit}
          close={() => setModuleEdit(null)}
        />
      )}
      {lessonEdit && (
        <LessonEditor
          key={lessonEdit.id || `new-${lessonEdit.moduleId}`}
          value={lessonEdit}
          close={() => setLessonEdit(null)}
        />
      )}
      {assignmentEdit && (
        <AssignmentEditor
          key={assignmentEdit.id || `new-${track}`}
          value={assignmentEdit}
          close={() => setAssignmentEdit(null)}
        />
      )}
      <section className="workspace-stack">
        {ordered.map((module) => (
          <article className="workspace-panel" key={module.id}>
            <div className="module-heading">
              <div>
                <p className="eyebrow">
                  MODULE {module.order} · {module.free ? "FREE" : "PREMIUM"}
                </p>
                <h3>{module.title}</h3>
                <p className="muted">{module.description}</p>
              </div>
              <div className="workspace-inline">
                <span className="workspace-status">
                  {module.published ? "Published" : "Draft"}
                </span>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setLessonEdit(null);
                    setAssignmentEdit(null);
                    setModuleEdit(module);
                  }}
                >
                  Edit module
                </button>
              </div>
            </div>
            <ol className="module-lessons">
              {[...(module.lessons ?? [])]
                .sort((a, b) => a.order - b.order)
                .map((lesson) => (
                  <li key={lesson.id}>
                    <span>
                      <strong>{lesson.order}.</strong> {lesson.title}{" "}
                      <span className="muted">· {lesson.duration}</span>
                    </span>
                    <button
                      className="btn btn-secondary btn-small"
                      disabled={action.busy}
                      onClick={() => void editLesson(lesson.id)}
                    >
                      Edit lesson
                    </button>
                  </li>
                ))}
            </ol>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                setModuleEdit(null);
                setAssignmentEdit(null);
                setLessonEdit({
                  id: "",
                  moduleId: module.id,
                  classId: track,
                  title: "",
                  duration: "",
                  videoUrl: "",
                  content: "",
                  order:
                    Math.max(
                      0,
                      ...(module.lessons ?? []).map((lesson) => lesson.order),
                    ) + 1,
                  published: false,
                  free: module.free,
                });
              }}
            >
              <Plus size={15} /> Add lesson
            </button>
          </article>
        ))}
      </section>
      {!ordered.length && (
        <Empty
          title={
            modules.loading
              ? "Loading curriculum…"
              : "Your next great course starts here"
          }
        >
          Add your first module, then bring it to life with videos, notes, and
          exercises.
        </Empty>
      )}
      <section className="card">
        <h2>Assignments & capstones</h2>
        {assignments.data.length ? (
          <div className="workspace-stack">
            {assignments.data.map((assignment) => (
              <div key={assignment.id} className="workspace-toolbar">
                <div>
                  <strong>{assignment.title}</strong>
                  <p className="muted">
                    Due {dateLabel(assignment.dueDate)} ·{" "}
                    {assignment.published ? "Published" : "Draft"} ·{" "}
                    {assignment.starter ? "Free starter" : "Premium"} ·{" "}
                    {assignment.milestones?.length ?? 0} milestones
                  </p>
                </div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setModuleEdit(null);
                    setLessonEdit(null);
                    setAssignmentEdit(assignment);
                  }}
                >
                  Edit assignment
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No assignments in this track yet.</p>
        )}
      </section>
      <section className="card">
        <h2>Curriculum assistant</h2>
        <p className="muted">
          Explore a structure for your next module. Review the suggestions, then
          create and publish your own lessons.
        </p>
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const result = await api<{ text: string }>("ai.ask", {
                mode: "curriculum",
                prompt: `Track: ${trackName(track)}. ${prompt}`,
              });
              setAi(result.text);
            }, "Curriculum suggestions are ready.");
          }}
        >
          <label>
            What would you like to teach?
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              required
              placeholder="Describe the topic, audience, and learning outcomes…"
            />
          </label>
          <div>
            <button className="btn btn-secondary" disabled={action.busy}>
              {action.busy ? "Working…" : "Suggest curriculum"}
            </button>
          </div>
          {ai && <div className="workspace-result">{ai}</div>}
        </form>
      </section>
    </>
  );
}

function EditorHeading({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="workspace-toolbar">
      <h2>{title}</h2>
      <button
        className="btn btn-secondary btn-small"
        type="button"
        onClick={close}
      >
        Close editor
      </button>
    </div>
  );
}
function ModuleEditor({
  value,
  close,
}: {
  value: CourseModule;
  close: () => void;
}) {
  const [module, setModule] = useState(value);
  const action = useAction();
  return (
    <section className="card">
      <EditorHeading
        title={value.id ? "Edit module" : "Create a module"}
        close={close}
      />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("module.save", { module });
            close();
          });
        }}
      >
        <label>
          Module title
          <input
            required
            value={module.title}
            onChange={(event) =>
              setModule({ ...module, title: event.target.value })
            }
            maxLength={160}
          />
        </label>
        <label>
          Description
          <textarea
            value={module.description}
            onChange={(event) =>
              setModule({ ...module, description: event.target.value })
            }
            required
          />
        </label>
        <label>
          Position in track
          <input
            type="number"
            min="1"
            step="1"
            value={module.order}
            onChange={(event) =>
              setModule({ ...module, order: Number(event.target.value) })
            }
            required
          />
        </label>
        <div className="workspace-inline">
          <label className="check-label">
            <input
              type="checkbox"
              checked={module.free}
              onChange={(event) =>
                setModule({ ...module, free: event.target.checked })
              }
            />
            Free module
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={module.published}
              onChange={(event) =>
                setModule({ ...module, published: event.target.checked })
              }
            />
            Published
          </label>
        </div>
        <ActionMessage action={action} />
        <div className="workspace-toolbar">
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save module"}
          </button>
          {value.id && (
            <button
              className="workspace-muted-button workspace-danger"
              type="button"
              disabled={action.busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this module? Remove its lessons first.",
                  )
                )
                  void action.run(async () => {
                    await api("module.delete", { id: value.id });
                    close();
                  });
              }}
            >
              Delete module
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function LessonEditor({ value, close }: { value: Lesson; close: () => void }) {
  const [lesson, setLesson] = useState(value);
  const action = useAction();
  const update = <K extends keyof Lesson>(key: K, val: Lesson[K]) =>
    setLesson({ ...lesson, [key]: val });
  return (
    <section className="card">
      <EditorHeading
        title={value.id ? "Edit lesson" : "Create a lesson"}
        close={close}
      />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("lesson.save", { lesson });
            close();
          });
        }}
      >
        <label>
          Lesson title
          <input
            required
            value={lesson.title}
            onChange={(event) => update("title", event.target.value)}
            maxLength={160}
          />
        </label>
        <div className="grid-2">
          <label>
            Duration
            <input
              value={lesson.duration}
              placeholder="18 min"
              onChange={(event) => update("duration", event.target.value)}
              required
            />
          </label>
          <label>
            Position in module
            <input
              type="number"
              min="1"
              step="1"
              value={lesson.order}
              onChange={(event) => update("order", Number(event.target.value))}
              required
            />
          </label>
        </div>
        <label>
          Video URL
          <input
            type="url"
            placeholder="https://…"
            value={lesson.videoUrl}
            onChange={(event) => update("videoUrl", event.target.value)}
          />
        </label>
        <label>
          Lesson notes (Markdown)
          <textarea
            className="code-input"
            value={lesson.content}
            onChange={(event) => update("content", event.target.value)}
            placeholder="# What you’ll learn"
            required
            rows={12}
          />
        </label>
        <div className="grid-2">
          <label>
            Starter JavaScript
            <textarea
              className="code-input"
              value={lesson.initialCode ?? ""}
              onChange={(event) => update("initialCode", event.target.value)}
            />
          </label>
          <label>
            Reference solution (staff only)
            <textarea
              className="code-input"
              value={lesson.solutionCode ?? ""}
              onChange={(event) => update("solutionCode", event.target.value)}
            />
          </label>
        </div>
        <fieldset>
          <legend>Resources & reading list</legend>
          {(lesson.resources ?? []).map((resource, index) => (
            <div key={index} className="workspace-stack">
              <div className="grid-2">
                <label>
                  Resource title
                  <input
                    value={resource.title}
                    required
                    onChange={(event) =>
                      update(
                        "resources",
                        lesson.resources?.map((item, idx) =>
                          idx === index
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Download or reading URL
                  <input
                    type="url"
                    value={resource.url}
                    required
                    onChange={(event) =>
                      update(
                        "resources",
                        lesson.resources?.map((item, idx) =>
                          idx === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <button
                className="workspace-muted-button"
                type="button"
                onClick={() =>
                  update(
                    "resources",
                    lesson.resources?.filter((_, idx) => idx !== index),
                  )
                }
              >
                Remove resource
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() =>
                update("resources", [
                  ...(lesson.resources ?? []),
                  { title: "", url: "" },
                ])
              }
            >
              Add resource
            </button>
          </div>
        </fieldset>
        <div className="workspace-inline">
          <label className="check-label">
            <input
              type="checkbox"
              checked={lesson.free}
              onChange={(event) => update("free", event.target.checked)}
            />
            Free lesson
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={lesson.published}
              onChange={(event) => update("published", event.target.checked)}
            />
            Published
          </label>
        </div>
        <ActionMessage action={action} />
        <div className="workspace-toolbar">
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save lesson"}
          </button>
          {value.id && (
            <button
              className="workspace-muted-button workspace-danger"
              type="button"
              disabled={action.busy}
              onClick={() => {
                if (window.confirm("Delete this lesson permanently?"))
                  void action.run(async () => {
                    await api("lesson.delete", { id: value.id });
                    close();
                  });
              }}
            >
              Delete lesson
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function AssignmentEditor({
  value,
  close,
}: {
  value: Assignment;
  close: () => void;
}) {
  const [assignment, setAssignment] = useState(value);
  const action = useAction();
  return (
    <section className="card">
      <EditorHeading
        title={value.id ? "Edit assignment" : "Create an assignment"}
        close={close}
      />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await api("assignment.save", {
              assignment: {
                ...assignment,
                totalPoints: 100,
                dueDate: new Date(assignment.dueDate).toISOString(),
                milestones: assignment.milestones?.map((item) => ({
                  ...item,
                  dueDate: new Date(item.dueDate).toISOString(),
                })),
              },
            });
            close();
          });
        }}
      >
        <label>
          Title
          <input
            required
            value={assignment.title}
            onChange={(event) =>
              setAssignment({ ...assignment, title: event.target.value })
            }
          />
        </label>
        <label>
          Brief and assessment criteria
          <textarea
            required
            rows={8}
            value={assignment.description}
            onChange={(event) =>
              setAssignment({ ...assignment, description: event.target.value })
            }
          />
        </label>
        <label>
          Submission deadline
          <input
            type="datetime-local"
            required
            value={localDate(assignment.dueDate)}
            onChange={(event) =>
              setAssignment({ ...assignment, dueDate: event.target.value })
            }
          />
        </label>
        <fieldset>
          <legend>Capstone milestones</legend>
          {(assignment.milestones ?? []).map((milestone, index) => (
            <div key={index} className="workspace-stack">
              <div className="grid-2">
                <label>
                  Milestone
                  <input
                    required
                    value={milestone.title}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        milestones: assignment.milestones?.map((item, idx) =>
                          idx === index
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Deadline
                  <input
                    type="datetime-local"
                    required
                    value={localDate(milestone.dueDate)}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        milestones: assignment.milestones?.map((item, idx) =>
                          idx === index
                            ? { ...item, dueDate: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="workspace-muted-button"
                onClick={() =>
                  setAssignment({
                    ...assignment,
                    milestones: assignment.milestones?.filter(
                      (_, idx) => idx !== index,
                    ),
                  })
                }
              >
                Remove milestone
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() =>
                setAssignment({
                  ...assignment,
                  milestones: [
                    ...(assignment.milestones ?? []),
                    { title: "", dueDate: "" },
                  ],
                })
              }
            >
              Add milestone
            </button>
          </div>
        </fieldset>
        <label className="check-label">
          <input
            type="checkbox"
            checked={assignment.starter ?? false}
            onChange={(event) =>
              setAssignment({ ...assignment, starter: event.target.checked })
            }
          />
          Free starter assignment
        </label>
        <p className="muted">
          Free students can submit starter assignments for practice. Only
          Premium submissions enter the instructor review queue.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={assignment.published ?? false}
            onChange={(event) =>
              setAssignment({ ...assignment, published: event.target.checked })
            }
          />
          Publish assignment
        </label>
        <ActionMessage action={action} />
        <div className="workspace-toolbar">
          <button className="btn btn-primary" disabled={action.busy}>
            {action.busy ? "Saving…" : "Save assignment"}
          </button>
          {value.id && (
            <button
              className="workspace-muted-button workspace-danger"
              type="button"
              disabled={action.busy}
              onClick={() => {
                if (window.confirm("Delete this assignment?"))
                  void action.run(async () => {
                    await api("assignment.delete", { id: value.id });
                    close();
                  });
              }}
            >
              Delete assignment
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
export function localDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function SubmissionsPanel({ user }: { user: AcademyUser }) {
  const allowed =
    user.role === "Admin"
      ? TRACKS.map((track) => track.id)
      : (user.instructorTrackIds ?? []);
  const records = useRecords<AssignmentSubmission>(
    "submissions",
    user.role === "Admin"
      ? []
      : [["classId", "in", allowed.length ? allowed : ["unassigned"]]],
    allowed.length > 0,
  );
  const [track, setTrack] = useState<CareerPathClassId | "all">("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AssignmentSubmission | null>(null);
  const filtered = records.data
    .filter(
      (item) =>
        item.status !== "draft" &&
        item.reviewEligible === true &&
        (track === "all" || item.classId === track) &&
        (status === "all" || item.status === status) &&
        `${item.studentName} ${item.assignmentId}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return (
    <>
      <div className="workspace-toolbar">
        <input
          aria-label="Search submissions"
          placeholder="Search student or assignment ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <TrackSelect value={track} onChange={setTrack} all allowed={allowed} />
        <select
          aria-label="Submission status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="under-review">Under review</option>
          <option value="graded">Graded</option>
        </select>
      </div>
      {records.error && (
        <p role="alert" className="alert">
          {String(records.error)}
        </p>
      )}
      {selected && (
        <ReviewEditor
          key={selected.id}
          submission={selected}
          close={() => setSelected(null)}
        />
      )}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Track</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Rating</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.studentName}</strong>
                  <small>{item.assignmentId}</small>
                </td>
                <td>{trackName(item.classId)}</td>
                <td>{dateLabel(item.submittedAt)}</td>
                <td>
                  <span className="workspace-status">
                    {item.status.replace("-", " ")}
                  </span>
                </td>
                <td>{item.grade === undefined ? "—" : `${item.grade}/100`}</td>
                <td>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setSelected(item)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            title={
              records.loading
                ? "Loading submissions…"
                : "Your review queue is clear"
            }
          >
            Submitted student work will appear here.
          </Empty>
        )}
      </section>
    </>
  );
}

function ReviewEditor({
  submission,
  close,
}: {
  submission: AssignmentSubmission;
  close: () => void;
}) {
  const assignment = useRecord<Assignment>(
    "assignments",
    submission.assignmentId,
  );
  const { authUser } = useAcademy();
  const [grade, setGrade] = useState(submission.grade ?? 0);
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [rubric, setRubric] = useState(submission.rubric ?? []);
  const [lines, setLines] = useState(submission.lineFeedback ?? []);
  const [ai, setAi] = useState("");
  const action = useAction();
  async function downloadAttachment(url: string) {
    await action.run(async () => {
      const token = authUser ? await accessToken() : undefined;
      if (!token) throw new Error("Please sign in again.");
      const attachmentUrl = url.startsWith("uploads/")
        ? "/api/upload?path=" + encodeURIComponent(url)
        : url;
      const parsed = new URL(attachmentUrl, window.location.origin);
      if (
        parsed.origin !== window.location.origin ||
        parsed.pathname !== "/api/upload"
      )
        throw new Error("This attachment does not use academy storage.");
      const response = await fetch(attachmentUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Unable to download attachment.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download =
        parsed.searchParams.get("path")?.split("/").pop() ?? "attachment";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }, "Attachment downloaded.");
  }
  return (
    <section className="card">
      <EditorHeading
        title={`Review: ${submission.studentName}`}
        close={close}
      />
      <h3>{assignment.data?.title ?? "Assignment submission"}</h3>
      <p className="muted">
        {trackName(submission.classId)} · Submitted{" "}
        {dateLabel(submission.submittedAt)}
      </p>
      <div className="workspace-inline">
        <ExternalLink href={submission.repoUrl}>Repository</ExternalLink>
        <ExternalLink href={submission.liveUrl}>Live project</ExternalLink>
        {submission.attachments?.map((url, index) => (
          <button
            key={url}
            type="button"
            className="btn btn-secondary btn-small"
            disabled={action.busy}
            onClick={() => void downloadAttachment(url)}
          >
            Attachment {index + 1}
          </button>
        ))}
      </div>
      <div className="workspace-note">{submission.writeUp}</div>
      <hr className="workspace-divider" />
      <div className="workspace-inline">
        <button
          className="btn btn-secondary btn-small"
          disabled={action.busy || submission.status === "graded"}
          onClick={() =>
            void action.run(
              () => api("submission.review", { id: submission.id }),
              "Marked as under review.",
            )
          }
        >
          Mark under review
        </button>
        <button
          className="btn btn-secondary btn-small"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              const result = await api<{ text: string }>("ai.ask", {
                mode: "review",
                prompt: `Suggest constructive feedback and a provisional 0–100 rating. An instructor will make the final decision. Assignment: ${assignment.data?.description ?? submission.assignmentId}`,
                code: submission.writeUp.slice(0, 30000),
              });
              setAi(result.text);
            }, "AI suggestion ready for your review.")
          }
        >
          Request AI suggestion
        </button>
      </div>
      {ai && (
        <div className="workspace-stack">
          <p className="muted">
            AI advice only. Verify the work and choose your own final rating.
          </p>
          <div className="workspace-result">{ai}</div>
        </div>
      )}
      <hr className="workspace-divider" />
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            () =>
              api("submission.grade", {
                id: submission.id,
                grade,
                feedback,
                rubric,
                lineFeedback: lines,
              }),
            "Rating and feedback published to the student.",
          );
        }}
      >
        <label>
          Final rating (0–100)
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            required
            value={grade}
            onChange={(event) => setGrade(Number(event.target.value))}
          />
        </label>
        <label>
          Written feedback
          <textarea
            required
            rows={6}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="What worked well? What should the student improve next?"
          />
        </label>
        <fieldset>
          <legend>Custom rubric</legend>
          {rubric.map((item, index) => (
            <div className="workspace-inline" key={index}>
              <label>
                Criterion
                <input
                  required
                  value={item.criterion}
                  onChange={(event) =>
                    setRubric(
                      rubric.map((row, idx) =>
                        idx === index
                          ? { ...row, criterion: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Score (0–100)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  value={item.score}
                  onChange={(event) =>
                    setRubric(
                      rubric.map((row, idx) =>
                        idx === index
                          ? { ...row, score: Number(event.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="workspace-muted-button"
                onClick={() =>
                  setRubric(rubric.filter((_, idx) => idx !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() =>
                setRubric([...rubric, { criterion: "", score: 0 }])
              }
            >
              Add criterion
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Line-by-line feedback</legend>
          {lines.map((item, index) => (
            <div key={index} className="workspace-inline">
              <label>
                Line
                <input
                  required
                  type="number"
                  min="1"
                  value={item.line}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, idx) =>
                        idx === index
                          ? { ...row, line: Number(event.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Comment
                <input
                  required
                  value={item.comment}
                  onChange={(event) =>
                    setLines(
                      lines.map((row, idx) =>
                        idx === index
                          ? { ...row, comment: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="workspace-muted-button"
                onClick={() =>
                  setLines(lines.filter((_, idx) => idx !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() => setLines([...lines, { line: 1, comment: "" }])}
            >
              Add line feedback
            </button>
          </div>
        </fieldset>
        <ActionMessage action={action} />
        <div>
          <button className="btn btn-primary" disabled={action.busy}>
            <Check size={16} />
            {action.busy ? "Publishing…" : "Publish rating & feedback"}
          </button>
        </div>
      </form>
    </section>
  );
}

type TemplatePlaceholder = {
  num: number;
  token: string;
  label: string;
  isNameGreeting: boolean;
  placeholder: string;
};

function parseTemplatePlaceholders(bodyText: string): TemplatePlaceholder[] {
  const matches = bodyText.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  const nums = Array.from(
    new Set(matches.map((m) => parseInt(m.replace(/\D/g, ""), 10))),
  ).sort((a, b) => a - b);

  const lines = bodyText.split("\n");
  return nums.map((num) => {
    const token = `{{${num}}}`;
    const lineIndex = lines.findIndex((l) => l.includes(token));
    const line = lineIndex >= 0 ? lines[lineIndex] : "";
    let label = line
      .replace(token, "")
      .trim()
      .replace(/[:,\-–—]+$/, "")
      .trim();

    if (!label && lineIndex > 0) {
      const prevLine = lines[lineIndex - 1]
        .trim()
        .replace(/[:,\-–—]+$/, "")
        .trim();
      if (prevLine && prevLine.length < 40) {
        label = prevLine;
      }
    }

    const isNameGreeting =
      num === 1 && /hello|hi|dear|welcome/i.test(line || "");
    if (isNameGreeting) {
      label = `Student Name ({{${num}}})`;
    } else if (!label) {
      label = `Variable {{${num}}}`;
    } else {
      label = `${label} ({{${num}}})`;
    }

    return {
      num,
      token,
      label,
      isNameGreeting,
      placeholder: isNameGreeting
        ? "Student's First Name (automatic)"
        : `Enter value for ${label.replace(/\s*\(\{\{\d+\}\}\)/, "")}`,
    };
  });
}

function NotificationsPanel() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<
    "all" | "track" | "free" | "premium"
  >("all");
  const [track, setTrack] = useState<CareerPathClassId>("system-dev");
  const [channels, setChannels] = useState(["in-app"]);
  const [actionScreen, setActionScreen] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [whatsappTemplate, setWhatsappTemplate] = useState("");
  const [whatsappTemplates, setWhatsappTemplates] = useState<
    Array<{
      name: string;
      status: string;
      language: string;
      category?: string;
      bodyText?: string;
      variableCount: number;
      hasUrlButton?: boolean;
    }>
  >([]);
  const [isCustomTemplate, setIsCustomTemplate] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [refreshingTemplates, setRefreshingTemplates] = useState(false);
  const [templateParams, setTemplateParams] = useState<Record<number, string>>(
    {},
  );
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [processingSummary, setProcessingSummary] = useState<string | null>(
    null,
  );
  const [history, setHistory] = useState<
    {
      id: string;
      title: string;
      audience: string;
      channels: string[];
      status: string;
      scheduledFor: string;
      recipientCount: number;
      sentCount: number;
      failedCount: number;
      lastError?: string | null;
      createdAt: string;
    }[]
  >([]);
  const [configuration, setConfiguration] = useState({
    email: false,
    whatsapp: false,
    automation: false,
  });
  const [loadingHistory, setLoadingHistory] = useState(true);
  const action = useAction();
  const refresh = async () => {
    const result = await api<{
      broadcasts: typeof history;
      configuration: typeof configuration;
      whatsappTemplates?: typeof whatsappTemplates;
    }>("broadcast.list");
    setHistory(result.broadcasts);
    setConfiguration(result.configuration);
    if (result.whatsappTemplates?.length) {
      setWhatsappTemplates(result.whatsappTemplates);
      setWhatsappTemplate((prev) => prev || result.whatsappTemplates![0].name);
    }
    setLoadingHistory(false);
  };
  const refreshTemplates = async () => {
    setRefreshingTemplates(true);
    try {
      const res = await api<{ templates: typeof whatsappTemplates }>(
        "whatsapp.templates",
      );
      if (res?.templates?.length) {
        setWhatsappTemplates(res.templates);
        setWhatsappTemplate((prev) => prev || res.templates[0].name);
      }
    } catch (err) {
      console.warn("Could not refresh WhatsApp templates:", err);
    } finally {
      setRefreshingTemplates(false);
    }
  };

  const processQueueAll = async () => {
    setIsProcessingQueue(true);
    setProcessingSummary(null);
    try {
      let hasMore = true;
      let iterations = 0;
      let totalSent = 0;
      let totalFailed = 0;
      let lastAwaiting = 0;

      while (hasMore && iterations < 15) {
        iterations++;
        const res = await api<{
          processed: number;
          sent: number;
          failed: number;
          awaitingConfiguration?: number;
        }>("broadcast.process");

        totalSent += res?.sent || 0;
        totalFailed += res?.failed || 0;
        lastAwaiting = res?.awaitingConfiguration || 0;

        await refresh();

        if (
          !res ||
          res.processed === 0 ||
          (res.sent === 0 && res.failed === 0)
        ) {
          hasMore = false;
        }
      }

      if (lastAwaiting > 0 && totalSent === 0) {
        setProcessingSummary(
          `⚠️ ${lastAwaiting} message(s) are queued but waiting for WhatsApp or Resend API keys to be configured in Vercel. Please check your environment variables.`,
        );
      } else if (totalSent > 0 || totalFailed > 0) {
        setProcessingSummary(
          `Delivered ${totalSent} external message(s)${totalFailed > 0 ? `, ${totalFailed} failed` : ""}.`,
        );
      }
    } catch (err) {
      console.warn("Queue processing error:", err);
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const [deletingBroadcastId, setDeletingBroadcastId] = useState<string | null>(null);
  const [viewingDeliveriesBroadcastId, setViewingDeliveriesBroadcastId] =
    useState<string | null>(null);
  const [deliveriesList, setDeliveriesList] = useState<
    Array<{
      id: string;
      studentId: string;
      studentName: string;
      channel: "email" | "whatsapp";
      recipient: string;
      status: string;
      providerMessageId?: string | null;
      sentAt?: string | null;
      deliveredAt?: string | null;
      readAt?: string | null;
      lastError?: string | null;
      createdAt: string;
    }>
  >([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState("");

  const toggleViewRecipients = async (broadcastId: string) => {
    if (viewingDeliveriesBroadcastId === broadcastId) {
      setViewingDeliveriesBroadcastId(null);
      return;
    }
    setViewingDeliveriesBroadcastId(broadcastId);
    setLoadingDeliveries(true);
    setRecipientFilter("");
    try {
      const res = await api<typeof deliveriesList>("broadcast.deliveries", {
        id: broadcastId,
      });
      setDeliveriesList(res || []);
    } catch (err) {
      console.warn("Could not load recipients:", err);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const deleteBroadcastItem = async (broadcastId: string) => {
    setDeletingBroadcastId(broadcastId);
    try {
      await api("broadcast.delete", { id: broadcastId });
      setHistory((prev) => prev.filter((item) => item.id !== broadcastId));
      if (viewingDeliveriesBroadcastId === broadcastId) {
        setViewingDeliveriesBroadcastId(null);
      }
    } catch (err) {
      console.warn("Delete broadcast error:", err);
      alert("Failed to delete broadcast. Please try again.");
    } finally {
      setDeletingBroadcastId(null);
    }
  };

  useEffect(() => {
    const hasPending = history.some(
      (item) => item.status === "queued" || item.status === "processing",
    );
    if (!hasPending) return;

    const timer = setInterval(() => {
      void refresh();
    }, 3000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);
  useEffect(() => {
    void refresh().catch(() => setLoadingHistory(false));
    // This panel has no changing inputs; it loads once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleChannel = (channel: string, checked: boolean) =>
    setChannels((current) =>
      checked
        ? [...new Set([...current, channel])]
        : current.filter((item) => item !== channel),
    );
  return (
    <>
      <section className="card">
        <div className="workspace-toolbar">
          <div>
            <h2>Broadcast a message</h2>
            <p className="workspace-note">
              One message can appear in-app and be delivered by email or
              WhatsApp.
            </p>
          </div>
          <div className="broadcast-health" aria-label="Channel status">
            <span className={configuration.email ? "ready" : "waiting"}>
              Email {configuration.email ? "ready" : "needs keys"}
            </span>
            <span className={configuration.whatsapp ? "ready" : "waiting"}>
              WhatsApp {configuration.whatsapp ? "ready" : "needs keys"}
            </span>
          </div>
        </div>
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!channels.length) return;
            void action.run(
              async () => {
                const effectiveTemplateName = isCustomTemplate
                  ? customTemplateName.trim()
                  : whatsappTemplate.trim();
                const activeTemplateObj = whatsappTemplates.find(
                  (t) => t.name === effectiveTemplateName,
                );
                const currentPlaceholders = activeTemplateObj?.bodyText
                  ? parseTemplatePlaceholders(activeTemplateObj.bodyText)
                  : [];
                const whatsappParameters = currentPlaceholders.map((p) => {
                  const val = templateParams[p.num]?.trim();
                  if (!val && p.isNameGreeting) {
                    return "{name}";
                  }
                  return val || "";
                });
                await api("broadcast.send", {
                  title,
                  message,
                  audience,
                  ...(audience === "track" ? { trackId: track } : {}),
                  channels,
                  ...(actionScreen ? { actionPath: actionScreen } : {}),
                  ...(scheduledFor
                    ? { scheduledFor: new Date(scheduledFor).toISOString() }
                    : {}),
                  ...(channels.includes("whatsapp") && effectiveTemplateName
                    ? {
                        whatsappTemplate: effectiveTemplateName,
                        ...(activeTemplateObj?.language
                          ? { whatsappLanguage: activeTemplateObj.language }
                          : {}),
                        ...(activeTemplateObj?.variableCount !== undefined
                          ? {
                              whatsappVariableCount:
                                activeTemplateObj.variableCount,
                            }
                          : {}),
                        ...(whatsappParameters.length > 0
                          ? { whatsappParameters }
                          : {}),
                        ...(activeTemplateObj?.hasUrlButton || effectiveTemplateName === "class_link"
                          ? { whatsappHasUrlButton: true }
                          : {}),
                      }
                    : {}),
                });
                setTitle("");
                setMessage("");
                setActionScreen("");
                setScheduledFor("");
                setIsCustomTemplate(false);
                setCustomTemplateName("");
                setTemplateParams({});
                await refresh();
                void processQueueAll();
              },
              configuration.email || configuration.whatsapp
                ? "Broadcast queued and available channels are being delivered."
                : "Broadcast saved safely. External delivery will begin after the keys are configured.",
            );
          }}
        >
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={160}
              placeholder="Give your announcement a clear title"
            />
          </label>
          <label>
            Message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={5000}
              rows={5}
            />
          </label>
          <div className="grid-2">
            <label>
              Audience
              <select
                value={audience}
                onChange={(event) => {
                  const next = event.target.value as
                    "all" | "track" | "free" | "premium";
                  setAudience(next);
                  if (["free", "premium"].includes(next))
                    setChannels((current) => {
                      const external = current.filter(
                        (channel) => channel !== "in-app",
                      );
                      return external.length ? external : ["email"];
                    });
                }}
              >
                <option value="all">All students</option>
                <option value="track">One career path</option>
                <option value="free">Free students</option>
                <option value="premium">Premium students</option>
              </select>
            </label>
            {audience === "track" ? (
              <label>
                Career path
                <TrackSelect
                  value={track}
                  onChange={(value) => setTrack(value as CareerPathClassId)}
                />
              </label>
            ) : (
              <label>
                Schedule (optional)
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </label>
            )}
          </div>
          {audience === "track" && (
            <label>
              Schedule (optional)
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
            </label>
          )}
          <fieldset>
            <legend>Delivery channels</legend>
            {[
              ["in-app", "In-app notification"],
              ["email", "Email"],
              ["whatsapp", "WhatsApp"],
            ].map(([value, label]) => (
              <label className="check-label" key={value}>
                <input
                  type="checkbox"
                  checked={channels.includes(value)}
                  disabled={
                    value === "in-app" && ["free", "premium"].includes(audience)
                  }
                  onChange={(event) =>
                    toggleChannel(value, event.target.checked)
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          {channels.includes("whatsapp") && (
            <div className="workspace-field">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.3rem",
                }}
              >
                <label
                  htmlFor="whatsapp-template-select"
                  style={{ fontWeight: 600, margin: 0 }}
                >
                  Approved WhatsApp message template
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.55rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                  disabled={refreshingTemplates}
                  onClick={() => void refreshTemplates()}
                  title="Pull latest approved templates directly from your Meta Business account"
                >
                  <RefreshCw
                    size={12}
                    className={refreshingTemplates ? "animate-spin" : ""}
                  />
                  {refreshingTemplates ? "Syncing…" : "Sync from Meta"}
                </button>
              </div>

              {!isCustomTemplate ? (
                <select
                  id="whatsapp-template-select"
                  value={whatsappTemplate}
                  onChange={(event) => {
                    if (event.target.value === "__custom__") {
                      setIsCustomTemplate(true);
                    } else {
                      setWhatsappTemplate(event.target.value);
                      setTemplateParams({});
                    }
                  }}
                >
                  {whatsappTemplates.length === 0 && (
                    <option value="">
                      Uses default (WHATSAPP_BROADCAST_TEMPLATE)
                    </option>
                  )}
                  {whatsappTemplates.map((item) => (
                    <option
                      key={`${item.name}-${item.language}`}
                      value={item.name}
                    >
                      {item.name} ({item.language})
                      {item.category ? ` · ${item.category}` : ""}
                    </option>
                  ))}
                  <option value="__custom__">
                    + Enter custom template name…
                  </option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    value={customTemplateName}
                    onChange={(event) =>
                      setCustomTemplateName(event.target.value)
                    }
                    placeholder="Enter Meta template name (e.g. course_launch)"
                    pattern="[a-z0-9_]+"
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsCustomTemplate(false);
                      if (whatsappTemplates[0]) {
                        setWhatsappTemplate(whatsappTemplates[0].name);
                      }
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Template details, interactive variables, & live preview */}
              {(() => {
                const currentName = isCustomTemplate
                  ? customTemplateName.trim()
                  : whatsappTemplate;
                const selected = whatsappTemplates.find(
                  (t) => t.name === currentName,
                );
                if (!selected?.bodyText) return null;
                const bodyText = selected.bodyText;

                const placeholders = parseTemplatePlaceholders(bodyText);

                const compileText = () =>
                  bodyText.replace(
                    /\{\{(\d+)\}\}/g,
                    (_, numStr: string) => {
                      const num = parseInt(numStr, 10);
                      const val = templateParams[num]?.trim();
                      if (
                        !val &&
                        num === 1 &&
                        /hello|hi|dear/i.test(bodyText)
                      ) {
                        return "Student";
                      }
                      return val || `{{${num}}}`;
                    },
                  );

                return (
                  <div style={{ marginTop: "0.6rem" }}>
                    {/* Live Highlighted Preview */}
                    <aside
                      style={{
                        padding: "0.75rem 0.9rem",
                        fontSize: "0.85rem",
                        background: "rgba(37, 211, 102, 0.08)",
                        border: "1px solid rgba(37, 211, 102, 0.25)",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.4rem",
                        }}
                      >
                        <strong style={{ color: "#128C7E", fontSize: "0.88rem" }}>
                          Live WhatsApp Message Preview
                        </strong>
                        <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                          {placeholders.length === 0
                            ? "Fixed text (no variables)"
                            : `${placeholders.length} variable${placeholders.length === 1 ? "" : "s"}`}
                        </span>
                      </div>
                      <div
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontSize: "0.86rem",
                          lineHeight: "1.5",
                        }}
                      >
                        {bodyText
                          .split(/(\{\{\d+\}\})/g)
                          .map((part, idx) => {
                            const match = part.match(/^\{\{(\d+)\}\}$/);
                            if (!match) return part;
                            const num = parseInt(match[1], 10);
                            const val = templateParams[num]?.trim();
                            const isGreeting =
                              num === 1 &&
                              /hello|hi|dear/i.test(bodyText);
                            const displayVal =
                              val ||
                              (isGreeting
                                ? "Student Name (auto)"
                                : `[${part}]`);
                            return (
                              <mark
                                key={idx}
                                style={{
                                  background: val
                                    ? "rgba(16, 185, 129, 0.25)"
                                    : "rgba(245, 158, 11, 0.25)",
                                  color: val ? "#047857" : "#b45309",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                }}
                              >
                                {displayVal}
                              </mark>
                            );
                          })}
                      </div>

                      {(selected?.hasUrlButton || selected?.name === "class_link") && (
                        <div
                          style={{
                            marginTop: "0.75rem",
                            paddingTop: "0.6rem",
                            borderTop: "1px dashed rgba(37, 211, 102, 0.3)",
                            display: "flex",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              background: "#ffffff",
                              color: "#00a884",
                              fontWeight: 600,
                              fontSize: "0.82rem",
                              padding: "0.35rem 0.9rem",
                              borderRadius: "6px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                              border: "1px solid rgba(0, 168, 132, 0.25)",
                            }}
                          >
                            🔗 Academy Website (auto-linked)
                          </span>
                        </div>
                      )}
                    </aside>

                    {/* Interactive Input Fields for Variables */}
                    {placeholders.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.65rem",
                          padding: "0.85rem 1rem",
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "8px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.65rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <strong style={{ fontSize: "0.88rem" }}>
                            Fill In Template Variables ({placeholders.length})
                          </strong>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                            }}
                            onClick={() => {
                              const compiled = compileText();
                              setMessage(compiled);
                              if (!title) {
                                setTitle(
                                  selected.name
                                    .replace(/_/g, " ")
                                    .replace(/\b\w/g, (c) => c.toUpperCase()),
                                );
                              }
                            }}
                          >
                            ✨ Copy to Title & Message
                          </button>
                        </div>
                        <small style={{ opacity: 0.75, fontSize: "0.75rem" }}>
                          Type your class details, date, time, or link below. The live preview above updates automatically.
                        </small>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: "0.65rem",
                          }}
                        >
                          {placeholders.map((p) => (
                            <label
                              key={p.num}
                              style={{ margin: 0, fontSize: "0.82rem" }}
                            >
                              <span
                                style={{
                                  fontWeight: 600,
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                <span>{p.label}</span>
                                {p.isNameGreeting && (
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      color: "#10b981",
                                    }}
                                  >
                                    Auto-personalized
                                  </span>
                                )}
                              </span>
                              <input
                                type="text"
                                value={templateParams[p.num] ?? ""}
                                placeholder={p.placeholder}
                                onChange={(event) => {
                                  const val = event.target.value;
                                  setTemplateParams((prev) => ({
                                    ...prev,
                                    [p.num]: val,
                                  }));
                                }}
                                style={{ width: "100%" }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <small style={{ display: "block", marginTop: "0.45rem" }}>
                Select an approved template from Meta. You can switch templates anytime without changing code.
              </small>
            </div>
          )}
          <label>
            Link to academy page (optional)
            <select
              value={actionScreen}
              onChange={(event) => setActionScreen(event.target.value)}
            >
              <option value="">No link</option>
              <option value="/app/tracks">Curriculum</option>
              <option value="/app/assignments">Assignments</option>
              <option value="/app/sessions">Live sessions</option>
              <option value="/app/community">Community</option>
            </select>
          </label>
          {(title || message) && (
            <aside className="broadcast-preview" aria-label="Message preview">
              <small>MESSAGE PREVIEW</small>
              <strong>{title || "Your announcement title"}</strong>
              <p>{message || "Your message will appear here."}</p>
              <span>{channels.join(" · ")}</span>
            </aside>
          )}
          <ActionMessage action={action} />
          <div>
            <button
              className="btn btn-primary"
              disabled={action.busy || !channels.length}
            >
              {action.busy
                ? "Creating broadcast…"
                : scheduledFor
                  ? "Schedule broadcast"
                  : "Send broadcast"}
            </button>
          </div>
        </form>
      </section>
      <section className="card">
        <div className="workspace-toolbar">
          <div>
            <h2>Broadcast history</h2>
            <p className="workspace-note">
              Live delivery progress across in-app, email, and WhatsApp.
            </p>
          </div>
          <button
            className="btn btn-secondary btn-small"
            disabled={action.busy || isProcessingQueue}
            onClick={() => void processQueueAll()}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <RefreshCw
              size={12}
              className={isProcessingQueue ? "animate-spin" : ""}
            />
            {isProcessingQueue ? "Dispatching messages…" : "Process queued messages"}
          </button>
        </div>

        {processingSummary && (
          <aside
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              borderRadius: "6px",
              fontSize: "0.85rem",
              background: processingSummary.startsWith("⚠️")
                ? "rgba(245, 158, 11, 0.12)"
                : "rgba(16, 185, 129, 0.12)",
              border: `1px solid ${
                processingSummary.startsWith("⚠️")
                  ? "rgba(245, 158, 11, 0.3)"
                  : "rgba(16, 185, 129, 0.3)"
              }`,
              color: processingSummary.startsWith("⚠️") ? "#d97706" : "#10b981",
            }}
          >
            {processingSummary}
          </aside>
        )}

        <div className="workspace-stack">
          {history.map((item) => {
            const total = item.recipientCount || 0;
            const sent = item.sentCount || 0;
            const failed = item.failedCount || 0;
            const completed = sent + failed;
            const pct =
              total > 0
                ? Math.min(100, Math.round((completed / total) * 100))
                : item.status === "completed"
                  ? 100
                  : 0;
            const isDone = item.status === "completed";
            const isProcessing =
              item.status === "processing" || (isProcessingQueue && !isDone);
            const isQueued = item.status === "queued";
            const isPending = isQueued || isProcessing;

            return (
              <article
                className="workspace-panel"
                key={item.id}
                style={{
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, rgba(255,255,255,0.08))",
                  padding: "1rem",
                }}
              >
                <div className="workspace-toolbar">
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                      {item.title}
                    </h3>
                    <p
                      className="muted"
                      style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}
                    >
                      {item.audience} · {item.channels.join(", ")} ·{" "}
                      {dateLabel(item.scheduledFor)}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        padding: "0.25rem 0.65rem",
                        borderRadius: "999px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        textTransform: "capitalize",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        background: isDone
                          ? "rgba(16, 185, 129, 0.15)"
                          : isProcessing
                            ? "rgba(59, 130, 246, 0.15)"
                            : "rgba(245, 158, 11, 0.15)",
                        color: isDone
                          ? "#10b981"
                          : isProcessing
                            ? "#3b82f6"
                            : "#f59e0b",
                        border: `1px solid ${
                          isDone
                            ? "rgba(16, 185, 129, 0.3)"
                            : isProcessing
                              ? "rgba(59, 130, 246, 0.3)"
                              : "rgba(245, 158, 11, 0.3)"
                        }`,
                      }}
                    >
                      {isProcessing && (
                        <RefreshCw size={11} className="animate-spin" />
                      )}
                      {isDone
                        ? "Completed ✅"
                        : isProcessing
                          ? `Sending (${pct}%)`
                          : `Queued (${pct}%)`}
                    </span>

                    {isPending && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.2rem 0.6rem",
                        }}
                        disabled={isProcessingQueue}
                        onClick={() => void processQueueAll()}
                        title="Process this batch immediately"
                      >
                        ⚡ Send Now
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.6rem",
                        borderColor:
                          viewingDeliveriesBroadcastId === item.id
                            ? "#3b82f6"
                            : undefined,
                        color:
                          viewingDeliveriesBroadcastId === item.id
                            ? "#3b82f6"
                            : undefined,
                      }}
                      onClick={() => void toggleViewRecipients(item.id)}
                      title="View individual recipient delivery status"
                    >
                      {viewingDeliveriesBroadcastId === item.id
                        ? "Hide Recipients"
                        : "📋 View Recipients"}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.6rem",
                        color: "#ef4444",
                        borderColor: "rgba(239, 68, 68, 0.3)",
                      }}
                      disabled={deletingBroadcastId === item.id || isProcessingQueue}
                      onClick={async () => {
                        if (window.confirm(`Delete broadcast "${item.title}"?`)) {
                          await deleteBroadcastItem(item.id);
                        }
                      }}
                      title="Delete this broadcast record"
                    >
                      {deletingBroadcastId === item.id ? "Deleting…" : "🗑️ Delete"}
                    </button>
                  </div>
                </div>

                {/* Visual Live Progress Bar */}
                <div style={{ marginTop: "0.85rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8rem",
                      marginBottom: "0.35rem",
                      color: "var(--text-muted, #9ca3af)",
                    }}
                  >
                    <span>
                      <strong style={{ color: "var(--foreground, #0f172a)" }}>
                        {sent}
                      </strong>{" "}
                      of{" "}
                      <strong style={{ color: "var(--foreground, #0f172a)" }}>
                        {total}
                      </strong>{" "}
                      delivered
                      {failed > 0 && (
                        <span
                          style={{
                            color: "#ef4444",
                            marginLeft: "0.5rem",
                            fontWeight: 600,
                          }}
                        >
                          ({failed} failed)
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: isDone ? "#10b981" : "#3b82f6",
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: "9px",
                      width: "100%",
                      background: "rgba(255, 255, 255, 0.08)",
                      borderRadius: "999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: isDone
                          ? "#10b981"
                          : failed > 0 && sent === 0
                            ? "#ef4444"
                            : "linear-gradient(90deg, #3b82f6 0%, #10b981 100%)",
                        transition: "width 0.4s ease-in-out",
                        borderRadius: "999px",
                      }}
                    />
                  </div>

                  {item.lastError && (
                    <div
                      style={{
                        marginTop: "0.65rem",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        color: "#dc2626",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.4rem",
                      }}
                    >
                      <span>⚠️</span>
                      <span>
                        <strong>Meta error:</strong> {item.lastError}
                      </span>
                    </div>
                  )}

                  {viewingDeliveriesBroadcastId === item.id && (
                    <div
                      style={{
                        marginTop: "1rem",
                        padding: "0.85rem",
                        background: "rgba(0, 0, 0, 0.03)",
                        borderRadius: "8px",
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.65rem",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize: "0.88rem",
                            fontWeight: 700,
                            color: "#111827",
                          }}
                        >
                          📋 Recipient Delivery Breakdown ({deliveriesList.length})
                        </h4>
                        <input
                          type="search"
                          placeholder="Filter name or phone…"
                          value={recipientFilter}
                          onChange={(e) => setRecipientFilter(e.target.value)}
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.6rem",
                            maxWidth: "200px",
                            borderRadius: "4px",
                          }}
                        />
                      </div>

                      {loadingDeliveries ? (
                        <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.5rem 0" }}>
                          Loading recipient delivery records…
                        </p>
                      ) : deliveriesList.length === 0 ? (
                        <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.5rem 0" }}>
                          No delivery records found for this broadcast.
                        </p>
                      ) : (
                        <div
                          style={{
                            maxHeight: "320px",
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.35rem",
                          }}
                        >
                          {deliveriesList
                            .filter((d) => {
                              if (!recipientFilter) return true;
                              const q = recipientFilter.toLowerCase();
                              return (
                                d.studentName.toLowerCase().includes(q) ||
                                d.recipient.toLowerCase().includes(q)
                              );
                            })
                            .map((d) => {
                              const isDelivered =
                                d.status === "delivered" || d.status === "read";
                              const isSent = d.status === "sent";
                              const isFailed = d.status === "failed";
                              return (
                                <div
                                  key={d.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "0.45rem 0.65rem",
                                    background: "#ffffff",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(0, 0, 0, 0.06)",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  <div>
                                    <strong style={{ color: "#111827" }}>
                                      {d.studentName}
                                    </strong>
                                    <span
                                      style={{
                                        marginLeft: "0.5rem",
                                        color: "#6b7280",
                                        fontSize: "0.75rem",
                                      }}
                                    >
                                      {d.channel === "whatsapp" ? "📱 " : "✉️ "}
                                      {d.recipient}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.4rem",
                                    }}
                                  >
                                    <span
                                      style={{
                                        padding: "0.15rem 0.5rem",
                                        borderRadius: "999px",
                                        fontSize: "0.72rem",
                                        fontWeight: 600,
                                        background: isDelivered
                                          ? "rgba(16, 185, 129, 0.15)"
                                          : isSent
                                            ? "rgba(14, 165, 233, 0.15)"
                                            : isFailed
                                              ? "rgba(239, 68, 68, 0.15)"
                                              : "rgba(245, 158, 11, 0.15)",
                                        color: isDelivered
                                          ? "#10b981"
                                          : isSent
                                            ? "#0284c7"
                                            : isFailed
                                              ? "#ef4444"
                                              : "#d97706",
                                      }}
                                    >
                                      {d.status === "read"
                                        ? "👁️ Read"
                                        : d.status === "delivered"
                                          ? "📬 Delivered"
                                          : d.status === "sent"
                                            ? "✅ Sent"
                                            : d.status === "failed"
                                              ? "❌ Failed"
                                              : "⏳ Queued"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!history.length && (
          <Empty
            title={loadingHistory ? "Loading broadcasts…" : "No broadcasts yet"}
          >
            Your first email, WhatsApp or in-app broadcast will appear here.
          </Empty>
        )}
      </section>
    </>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<PlatformSettings>("settings.get")
      .then(setSettings)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Unable to load settings.",
        ),
      );
  }, []);
  return !settings && !error ? (
    <p className="muted">Loading settings…</p>
  ) : error ? (
    <p className="alert" role="alert">
      {error}
    </p>
  ) : (
    <SettingsForm
      key={JSON.stringify(settings)}
      initial={
        settings ?? {
          academyName: "EA Academy",
          enrollmentOpen: true,
          scholarshipCost: PREMIUM_PRICE,
        }
      }
    />
  );
}
function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const [settings, setSettings] = useState(initial);
  const action = useAction();
  return (
    <>
      <section className="card">
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(() =>
              api("settings.save", {
                settings: {
                  ...settings,
                  supportEmail: settings.supportEmail || undefined,
                },
              }),
            );
          }}
        >
          <h2>General details</h2>
          <label>
            Academy name
            <input
              required
              value={settings.academyName ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, academyName: event.target.value })
              }
            />
          </label>
          <label>
            Support email
            <input
              type="email"
              value={settings.supportEmail ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, supportEmail: event.target.value })
              }
            />
          </label>
          <label>
            Public announcement
            <textarea
              value={settings.announcement ?? ""}
              onChange={(event) =>
                setSettings({ ...settings, announcement: event.target.value })
              }
            />
          </label>
          <label>
            WhatsApp contact / community link
            <input
              type="url"
              placeholder="https://wa.me/234... or https://chat.whatsapp.com/..."
              value={settings.whatsappGroupUrl ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  whatsappGroupUrl: event.target.value,
                })
              }
            />
            <small>Direct WhatsApp chat (wa.me/234...) or group invite link sent in welcome emails & messages.</small>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={settings.enrollmentOpen ?? true}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  enrollmentOpen: event.target.checked,
                })
              }
            />
            Accept new student enrollments
          </label>
          <hr className="workspace-divider" />
          <h2>Scholarship fund</h2>
          <div className="grid-2">
            <label>
              Fundraising goal (₦)
              <input
                type="number"
                min="0"
                step="1"
                value={settings.scholarshipGoal ?? ""}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    scholarshipGoal: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Cost per sponsored student (₦)
              <input
                type="number"
                min="1"
                step="1"
                value={settings.scholarshipCost ?? PREMIUM_PRICE}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    scholarshipCost: Number(event.target.value),
                  })
                }
                required
              />
            </label>
          </div>
          <ActionMessage action={action} />
          <div>
            <button className="btn btn-primary" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save academy settings"}
            </button>
          </div>
        </form>
      </section>
      <section className="card">
        <h2>Membership & ownership</h2>
        <p>
          Premium membership:{" "}
          <strong>₦{PREMIUM_PRICE.toLocaleString()} per month</strong>
        </p>
        <p className="muted">
          Premium unlocks every career track. Billing is in naira.
        </p>
        <p>
          Sole academy owner: <strong>EmmanuelAmadin@gmail.com</strong>
        </p>
        <p className="muted">
          The owner can appoint instructors from People & permissions. Ownership
          is protected and cannot be reassigned here.
        </p>
      </section>
    </>
  );
}
