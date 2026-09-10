export type UserRole = "Student" | "Instructor" | "Admin";
export type CareerPathClassId =
  "system-dev" | "creative-media" | "business-growth";
export type MembershipPlan = "Free" | "Premium";
export interface AcademyUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  enrolledClassId: CareerPathClassId;
  membershipPlan: MembershipPlan;
  avatarUrl?: string;
  enrolledAt: string;
  lastActiveAt?: string;
  premiumUntil?: string;
  premiumGranted?: boolean;
  instructorTrackIds?: CareerPathClassId[];
  subscriptionCode?: string;
  countryCode?: string;
  phoneNumber?: string;
  birthday?: { month: number; day: number };
  birthdayChanges?: number;
  timeZone?: string;
  emailNotificationsEnabled?: boolean;
  birthdayEmailEnabled?: boolean;
  whatsappNotificationsEnabled?: boolean;
  birthdayWhatsappEnabled?: boolean;
  whatsappOptedInAt?: string;
  whatsappOptedOutAt?: string;
  communicationConsentVersion?: string;
}
export type MessageChannel = "in-app" | "email" | "whatsapp";
export interface BroadcastSummary {
  id: string;
  title: string;
  message: string;
  audience: "all" | "track" | "free" | "premium";
  trackId?: CareerPathClassId;
  channels: MessageChannel[];
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  scheduledFor: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}
export interface CourseModule {
  id: string;
  classId: CareerPathClassId;
  title: string;
  description: string;
  order: number;
  published: boolean;
  free: boolean;
  lessonCount?: number;
  lessons?: LessonSummary[];
}
export interface LessonSummary {
  id: string;
  title: string;
  duration: string;
  order: number;
  free?: boolean;
}
export interface Lesson {
  id: string;
  moduleId: string;
  classId: CareerPathClassId;
  title: string;
  duration: string;
  videoUrl: string;
  content: string;
  initialCode?: string;
  solutionCode?: string;
  order: number;
  published: boolean;
  free: boolean;
  resources?: { title: string; url: string }[];
  assignmentId?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface Assignment {
  id: string;
  classId: CareerPathClassId;
  title: string;
  description: string;
  dueDate: string;
  totalPoints: number;
  milestones?: { title: string; dueDate: string }[];
  published?: boolean;
  starter?: boolean;
}
export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: CareerPathClassId;
  repoUrl?: string;
  liveUrl?: string;
  writeUp: string;
  attachments?: string[];
  status: "draft" | "submitted" | "under-review" | "graded";
  grade?: number;
  feedback?: string;
  lineFeedback?: { line: number; comment: string }[];
  rubric?: { criterion: string; score: number }[];
  submittedAt: string;
  updatedAt?: string;
  reviewEligible?: boolean;
  reviewPeriod?: string;
}
export interface Progress {
  id: string;
  studentId: string;
  lessonId: string;
  moduleId: string;
  classId: CareerPathClassId;
  completedAt: string;
}
export interface AcademyNotification {
  id: string;
  title: string;
  message: string;
  type: "announcement" | "assignment" | "live-session" | "system";
  targetTrack: CareerPathClassId | "all";
  priority?: "normal" | "high";
  actionScreen?: string;
  createdAt: string;
  pwaPushSent?: boolean;
}
export interface Discussion {
  id: string;
  title: string;
  body: string;
  classId: CareerPathClassId;
  lessonId?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}
export interface CommunityComment {
  id: string;
  parentId: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}
export interface Project {
  id: string;
  title: string;
  description: string;
  url: string;
  classId: CareerPathClassId;
  authorId: string;
  authorName: string;
  votes: number;
  createdAt: string;
}
export interface PortfolioCritique {
  id: string;
  projectId: string;
  studentId: string;
  studentName: string;
  classId: CareerPathClassId;
  status: "requested" | "completed";
  requestedAt: string;
  completedAt?: string;
  feedback?: string;
  reviewedBy?: string;
}
export interface LiveSession {
  id: string;
  title: string;
  description: string;
  classId: CareerPathClassId | "all";
  startsAt: string;
  endsAt: string;
  url: string;
  recordingUrl?: string;
  host: string;
}
export interface Donation {
  id: string;
  donorName: string;
  amount: number;
  anonymous: boolean;
  createdAt: string;
}
export interface PlatformSettings {
  id?: string;
  academyName?: string;
  supportEmail?: string;
  enrollmentOpen?: boolean;
  scholarshipGoal?: number;
  scholarshipCost?: number;
  announcement?: string;
  whatsappGroupUrl?: string;
}
export interface Payment {
  id: string;
  studentId: string;
  amount: number;
  kind: "premium" | "donation" | "shop_item";
  status: string;
  createdAt: string;
  reference: string;
  itemId?: string;
  itemTitle?: string;
}

export type ShopItemType = "course" | "digital_product";

export interface ShopCourseLessonResource {
  title: string;
  url: string;
  size?: string;
}

export interface ShopCourseLesson {
  id: string;
  title: string;
  duration: string;
  videoUrl: string;
  content: string;
  resources?: ShopCourseLessonResource[];
  isFreePreview: boolean;
  order: number;
}

export interface ShopCourseModule {
  id: string;
  title: string;
  description?: string;
  order: number;
  lessons: ShopCourseLesson[];
}

export interface ShopItem {
  id: string;
  slug: string;
  type: ShopItemType;
  title: string;
  subtitle: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  category: string;
  tags: string[];
  badge?: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  whatYouWillLearn: string[];
  requirements?: string[];
  targetAudience?: string[];
  published: boolean;
  featured?: boolean;
  salesCount?: number;
  createdAt: string;
  updatedAt: string;
  // Course specific
  level?: "All Levels" | "Beginner" | "Intermediate" | "Advanced";
  totalDuration?: string;
  certificateEnabled?: boolean;
  curriculum?: ShopCourseModule[];
  // Digital Product specific
  fileUrl?: string;
  fileSize?: string;
  fileFormat?: string;
  version?: string;
  includes?: string[];
}

export interface ShopPurchase {
  id: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  itemId: string;
  itemSlug: string;
  itemTitle: string;
  itemType: ShopItemType;
  amount: number;
  paymentReference: string;
  purchasedAt: string;
}

export interface ShopCourseProgress {
  id: string;
  studentId: string;
  courseId: string;
  completedLessonIds: string[];
  lastLessonId: string;
  completed: boolean;
  completedAt?: string;
  certificateId?: string;
}

export interface ShopCertificate {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  issuedAt: string;
  verificationCode: string;
}
export const TRACKS = [
  {
    id: "system-dev" as const,
    name: "Systems & Development",
    short: "Systems",
    eyebrow: "BUILD WHAT’S NEXT",
    description:
      "Build modern websites, software systems, automated workflows, and reliable database foundations.",
    skills: [
      "Workflow automation",
      "Website development",
      "Software systems",
      "Database management",
    ],
    color: "#eaf0fa",
    icon: "code",
  },
  {
    id: "creative-media" as const,
    name: "Creative Media Studio",
    short: "Creative",
    eyebrow: "MAKE IDEAS MATTER",
    description:
      "Master photo editing, video post-production, AI video creation, and practical digital media production.",
    skills: [
      "Photo editing",
      "Video editing",
      "AI video production",
      "Digital media",
    ],
    color: "#fbefe4",
    icon: "palette",
  },
  {
    id: "business-growth" as const,
    name: "Business Growth & Wealth",
    short: "Business",
    eyebrow: "TURN INSIGHT INTO IMPACT",
    description:
      "Learn digital marketing, business registration, investing, and the systems behind sustainable growth.",
    skills: [
      "Digital marketing",
      "Business name registration",
      "Investing",
      "Business management",
    ],
    color: "#eaf2ec",
    icon: "chart",
  },
];
export const PREMIUM_PRICE = 3000;
export function isPremium(user: AcademyUser | null) {
  return (
    !!user &&
    (user.role !== "Student" ||
      user.premiumGranted === true ||
      (user.membershipPlan === "Premium" &&
        !!user.premiumUntil &&
        Date.parse(user.premiumUntil) > Date.now()))
  );
}
