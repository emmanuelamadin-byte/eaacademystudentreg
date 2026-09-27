import type {
  AcademyUser,
  Donation,
  Payment,
  PlatformSettings,
  ShopItem,
  ShopPurchase,
} from "./types";

export type RevenueStream =
  | "course"
  | "digital_product"
  | "premium"
  | "donation";

export type RevenuePeriod = "all" | "today" | "7d" | "30d" | "month" | "year";

export interface RevenueTransaction {
  id: string;
  reference: string;
  stream: RevenueStream;
  amount: number;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  studentId?: string;
  itemId?: string;
  itemTitle: string;
  anonymous?: boolean;
}

export interface StreamSummary {
  stream: RevenueStream;
  label: string;
  revenue: number;
  allTimeRevenue: number;
  count: number;
  allTimeCount: number;
  averageAmount: number;
  sharePercent: number;
}

export interface ItemRevenuePerformance {
  id: string;
  title: string;
  type: "course" | "digital_product";
  category: string;
  price: number;
  published: boolean;
  includedInPremium: boolean;
  periodSales: number;
  periodRevenue: number;
  allTimeSales: number;
  allTimeRevenue: number;
  shareOfStoreRevenue: number;
}

export interface RevenueAnalyticsSummary {
  period: RevenuePeriod;
  totalRevenue: number;
  totalTransactions: number;
  allTimeRevenue: number;
  allTimeTransactions: number;
  storeRevenue: number;
  streams: Record<RevenueStream, StreamSummary>;
  streamList: StreamSummary[];
  itemPerformance: ItemRevenuePerformance[];
  transactions: RevenueTransaction[];
  allTransactions: RevenueTransaction[];
  metrics: {
    publishedCoursesCount: number;
    totalCoursesCount: number;
    publishedProductsCount: number;
    totalProductsCount: number;
    activePaidMembersCount: number;
    complimentaryMembersCount: number;
    recurringSubscribersCount: number;
    scholarshipGoal: number;
    scholarshipCost: number;
    scholarshipGoalPercent: number;
    scholarsSupportedCount: number;
  };
}

export const STREAM_LABELS: Record<RevenueStream, string> = {
  course: "Courses",
  digital_product: "Digital products",
  premium: "Premium memberships",
  donation: "Scholarship donations",
};

export function buildUnifiedRevenueLedger(input: {
  payments: Payment[];
  shopPurchases?: ShopPurchase[];
  donations?: Donation[];
  users?: AcademyUser[];
  shopItems?: ShopItem[];
}): RevenueTransaction[] {
  const {
    payments = [],
    shopPurchases = [],
    donations = [],
    users = [],
    shopItems = [],
  } = input;

  const userById = new Map(users.map((u) => [u.id, u]));
  const itemById = new Map(shopItems.map((item) => [item.id, item]));

  const purchaseByRef = new Map<string, ShopPurchase>();
  for (const sp of shopPurchases) {
    if (
      sp.paymentReference &&
      sp.paymentReference !== "PREMIUM_BENEFIT" &&
      Number(sp.amount) > 0
    ) {
      purchaseByRef.set(sp.paymentReference, sp);
    }
  }

  const donationByRef = new Map<string, Donation>();
  for (const d of donations) {
    if (d.id) {
      donationByRef.set(d.id, d);
    }
  }

  const seenReferences = new Set<string>();
  const ledger: RevenueTransaction[] = [];

  for (const p of payments) {
    if (p.status !== "success") continue;
    const amount = Number(p.amount || 0);
    if (amount <= 0) continue;

    const ref = p.reference || p.id;
    if (!ref || seenReferences.has(ref)) continue;
    seenReferences.add(ref);

    const user = p.studentId ? userById.get(p.studentId) : undefined;

    if (p.kind === "premium") {
      ledger.push({
        id: ref,
        reference: ref,
        stream: "premium",
        amount,
        createdAt: p.createdAt,
        customerName: user?.name || "Academy Member",
        customerEmail: user?.email || "",
        studentId: p.studentId,
        itemTitle: "Premium Membership",
      });
    } else if (p.kind === "donation") {
      const donation = donationByRef.get(ref);
      const anonymous = Boolean(donation?.anonymous);
      ledger.push({
        id: ref,
        reference: ref,
        stream: "donation",
        amount,
        createdAt: p.createdAt || donation?.createdAt || "",
        customerName: anonymous
          ? "Anonymous supporter"
          : donation?.donorName || user?.name || "Supporter",
        customerEmail: anonymous ? "" : user?.email || "",
        studentId: p.studentId,
        itemTitle: "Scholarship Fund Donation",
        anonymous,
      });
    } else {
      // shop_item
      const purchase = purchaseByRef.get(ref);
      const itemId = purchase?.itemId || p.itemId;
      const item = itemId ? itemById.get(itemId) : undefined;
      const itemType = purchase?.itemType || item?.type || "course";
      const stream: RevenueStream =
        itemType === "digital_product" ? "digital_product" : "course";
      const itemTitle =
        purchase?.itemTitle ||
        p.itemTitle ||
        item?.title ||
        (stream === "digital_product" ? "Digital Product" : "Standalone Course");

      ledger.push({
        id: ref,
        reference: ref,
        stream,
        amount,
        createdAt: p.createdAt || purchase?.purchasedAt || "",
        customerName: purchase?.studentName || user?.name || "Student",
        customerEmail: purchase?.studentEmail || user?.email || "",
        studentId: purchase?.studentId || p.studentId,
        itemId,
        itemTitle,
      });
    }
  }

  // Include any paid shopPurchases whose reference wasn't in payments
  for (const sp of shopPurchases) {
    if (sp.paymentReference === "PREMIUM_BENEFIT") continue;
    const amount = Number(sp.amount || 0);
    if (amount <= 0) continue;
    const ref = sp.paymentReference || sp.id;
    if (!ref || seenReferences.has(ref)) continue;
    seenReferences.add(ref);

    const user = sp.studentId ? userById.get(sp.studentId) : undefined;
    const item = sp.itemId ? itemById.get(sp.itemId) : undefined;
    const stream: RevenueStream =
      (sp.itemType || item?.type) === "digital_product"
        ? "digital_product"
        : "course";

    ledger.push({
      id: ref,
      reference: ref,
      stream,
      amount,
      createdAt: sp.purchasedAt || "",
      customerName: sp.studentName || user?.name || "Student",
      customerEmail: sp.studentEmail || user?.email || "",
      studentId: sp.studentId,
      itemId: sp.itemId,
      itemTitle:
        sp.itemTitle ||
        item?.title ||
        (stream === "digital_product" ? "Digital Product" : "Standalone Course"),
    });
  }

  // Include any donations whose id wasn't in payments
  for (const d of donations) {
    const amount = Number(d.amount || 0);
    if (amount <= 0 || !d.id || seenReferences.has(d.id)) continue;
    seenReferences.add(d.id);

    ledger.push({
      id: d.id,
      reference: d.id,
      stream: "donation",
      amount,
      createdAt: d.createdAt || "",
      customerName: d.anonymous
        ? "Anonymous supporter"
        : d.donorName || "Supporter",
      customerEmail: "",
      itemTitle: "Scholarship Fund Donation",
      anonymous: Boolean(d.anonymous),
    });
  }

  return ledger.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

export function filterTransactionsByPeriod(
  transactions: RevenueTransaction[],
  period: RevenuePeriod,
  nowMs = Date.now(),
): RevenueTransaction[] {
  if (period === "all") return transactions;

  const nowDate = new Date(nowMs);
  let cutoffMs = 0;

  if (period === "today") {
    cutoffMs = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
    ).getTime();
  } else if (period === "7d") {
    cutoffMs = nowMs - 7 * 86400000;
  } else if (period === "30d") {
    cutoffMs = nowMs - 30 * 86400000;
  } else if (period === "month") {
    cutoffMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  } else if (period === "year") {
    cutoffMs = new Date(nowDate.getFullYear(), 0, 1).getTime();
  }

  return transactions.filter((tx) => {
    if (!tx.createdAt) return false;
    const parsed = Date.parse(tx.createdAt);
    return !Number.isNaN(parsed) && parsed >= cutoffMs && parsed <= nowMs + 86400000;
  });
}

export function summarizeRevenueAnalytics(input: {
  payments: Payment[];
  shopPurchases?: ShopPurchase[];
  donations?: Donation[];
  users?: AcademyUser[];
  shopItems?: ShopItem[];
  settings?: PlatformSettings | null;
  period?: RevenuePeriod;
  nowMs?: number;
}): RevenueAnalyticsSummary {
  const {
    payments = [],
    shopPurchases = [],
    donations = [],
    users = [],
    shopItems = [],
    settings = null,
    period = "all",
    nowMs = Date.now(),
  } = input;

  const allTransactions = buildUnifiedRevenueLedger({
    payments,
    shopPurchases,
    donations,
    users,
    shopItems,
  });

  const transactions = filterTransactionsByPeriod(
    allTransactions,
    period,
    nowMs,
  );

  const totalRevenue = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const allTimeRevenue = allTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  const streamKeys: RevenueStream[] = [
    "course",
    "digital_product",
    "premium",
    "donation",
  ];

  const streams = {} as Record<RevenueStream, StreamSummary>;

  for (const key of streamKeys) {
    const periodTx = transactions.filter((tx) => tx.stream === key);
    const allTx = allTransactions.filter((tx) => tx.stream === key);
    const rev = periodTx.reduce((sum, tx) => sum + tx.amount, 0);
    const allRev = allTx.reduce((sum, tx) => sum + tx.amount, 0);
    const count = periodTx.length;
    const allTimeCount = allTx.length;

    streams[key] = {
      stream: key,
      label: STREAM_LABELS[key],
      revenue: rev,
      allTimeRevenue: allRev,
      count,
      allTimeCount,
      averageAmount: count > 0 ? Math.round(rev / count) : 0,
      sharePercent:
        totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0,
    };
  }

  const storeRevenue =
    streams.course.revenue + streams.digital_product.revenue;

  // Build per-item performance breakdown
  const itemMap = new Map<
    string,
    {
      id: string;
      title: string;
      type: "course" | "digital_product";
      category: string;
      price: number;
      published: boolean;
      includedInPremium: boolean;
      periodSales: number;
      periodRevenue: number;
      allTimeSales: number;
      allTimeRevenue: number;
    }
  >();

  for (const item of shopItems) {
    itemMap.set(item.id, {
      id: item.id,
      title: item.title,
      type: item.type === "digital_product" ? "digital_product" : "course",
      category: item.category || "General",
      price: Number(item.price || 0),
      published: Boolean(item.published),
      includedInPremium: Boolean(item.includedInPremium),
      periodSales: 0,
      periodRevenue: 0,
      allTimeSales: 0,
      allTimeRevenue: 0,
    });
  }

  for (const tx of allTransactions) {
    if (tx.stream !== "course" && tx.stream !== "digital_product") continue;
    const key = tx.itemId || `title:${tx.itemTitle}`;
    let entry = itemMap.get(key);
    if (!entry) {
      entry = {
        id: key,
        title: tx.itemTitle,
        type: tx.stream,
        category: "Store",
        price: tx.amount,
        published: true,
        includedInPremium: false,
        periodSales: 0,
        periodRevenue: 0,
        allTimeSales: 0,
        allTimeRevenue: 0,
      };
      itemMap.set(key, entry);
    }
    entry.allTimeSales += 1;
    entry.allTimeRevenue += tx.amount;
  }

  for (const tx of transactions) {
    if (tx.stream !== "course" && tx.stream !== "digital_product") continue;
    const key = tx.itemId || `title:${tx.itemTitle}`;
    const entry = itemMap.get(key);
    if (entry) {
      entry.periodSales += 1;
      entry.periodRevenue += tx.amount;
    }
  }

  const itemPerformance: ItemRevenuePerformance[] = Array.from(itemMap.values())
    .map((entry) => ({
      ...entry,
      shareOfStoreRevenue:
        storeRevenue > 0
          ? Math.round((entry.periodRevenue / storeRevenue) * 100)
          : 0,
    }))
    .sort((a, b) => {
      if (b.periodRevenue !== a.periodRevenue) {
        return b.periodRevenue - a.periodRevenue;
      }
      if (b.allTimeRevenue !== a.allTimeRevenue) {
        return b.allTimeRevenue - a.allTimeRevenue;
      }
      return a.title.localeCompare(b.title);
    });

  // Compute student & catalog context metrics
  const students = users.filter((u) => u.role === "Student");
  const activePaidMembersCount = students.filter(
    (s) =>
      !s.premiumGranted &&
      s.membershipPlan === "Premium" &&
      Boolean(s.premiumUntil) &&
      Date.parse(s.premiumUntil!) > nowMs,
  ).length;
  const complimentaryMembersCount = students.filter(
    (s) => Boolean(s.premiumGranted),
  ).length;
  const recurringSubscribersCount = students.filter((s) =>
    Boolean(s.subscriptionCode),
  ).length;

  const courses = shopItems.filter((i) => i.type === "course");
  const products = shopItems.filter((i) => i.type === "digital_product");

  const scholarshipGoal = Number(settings?.scholarshipGoal || 0);
  const scholarshipCost = Number(settings?.scholarshipCost || 3000);
  const donationAllTime = streams.donation.allTimeRevenue;

  return {
    period,
    totalRevenue,
    totalTransactions: transactions.length,
    allTimeRevenue,
    allTimeTransactions: allTransactions.length,
    storeRevenue,
    streams,
    streamList: streamKeys.map((k) => streams[k]),
    itemPerformance,
    transactions,
    allTransactions,
    metrics: {
      publishedCoursesCount: courses.filter((c) => c.published).length,
      totalCoursesCount: courses.length,
      publishedProductsCount: products.filter((p) => p.published).length,
      totalProductsCount: products.length,
      activePaidMembersCount,
      complimentaryMembersCount,
      recurringSubscribersCount,
      scholarshipGoal,
      scholarshipCost,
      scholarshipGoalPercent:
        scholarshipGoal > 0
          ? Math.min(100, Math.round((donationAllTime / scholarshipGoal) * 100))
          : 0,
      scholarsSupportedCount:
        scholarshipCost > 0
          ? Math.floor(donationAllTime / scholarshipCost)
          : complimentaryMembersCount,
    },
  };
}
