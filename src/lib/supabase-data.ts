type Row = Record<string, unknown>;

export type CollectionSpec = {
  table: string;
  schema?: "public" | "private";
  primary: string[];
};

const specs: Record<string, CollectionSpec> = {
  users: { table: "profiles", primary: ["id"] },
  modules: { table: "course_modules", primary: ["id"] },
  lessons: { table: "lessons", primary: ["id"] },
  assignments: { table: "assignments", primary: ["id"] },
  submissions: { table: "submissions", primary: ["id"] },
  progress: {
    table: "lesson_progress",
    primary: ["student_id", "lesson_id"],
  },
  notifications: { table: "notifications", primary: ["id"] },
  discussions: { table: "discussions", primary: ["id"] },
  comments: { table: "comments", primary: ["id"] },
  projects: { table: "community_projects", primary: ["id"] },
  votes: {
    table: "project_votes",
    primary: ["student_id", "project_id"],
  },
  projectCritiques: {
    table: "portfolio_critiques",
    primary: ["project_id"],
  },
  sessions: { table: "live_sessions", primary: ["id"] },
  sessionLinks: { table: "session_links", primary: ["session_id"] },
  trackProfiles: { table: "track_profiles", primary: ["track_id"] },
  settings: { table: "platform_settings", primary: ["id"] },
  payments: { table: "payments", primary: ["reference"] },
  donations: { table: "donations", primary: ["id"] },
  billingCustomers: {
    table: "billing_customers",
    primary: ["customer_code"],
  },
  billingIntents: { table: "billing_intents", primary: ["reference"] },
  pushTokens: { table: "push_tokens", primary: ["token_hash"] },
  transcripts: { table: "transcripts", primary: ["id"] },
  reviewUsage: {
    table: "review_usage",
    schema: "private",
    primary: ["student_id", "period"],
  },
  critiqueUsage: {
    table: "critique_usage",
    schema: "private",
    primary: ["student_id", "period"],
  },
  rateLimits: {
    table: "rate_limits",
    schema: "private",
    primary: ["user_id", "action"],
  },
  shopItems: { table: "shop_items", primary: ["id"] },
  shopPurchases: { table: "shop_purchases", primary: ["id"] },
  shopCourseProgress: { table: "shop_course_progress", primary: ["id"] },
  shopCertificates: { table: "shop_certificates", primary: ["id"] },
};

const fields: Record<string, Record<string, string>> = {
  users: {
    name: "full_name",
    avatarUrl: "avatar_url",
    enrolledClassId: "primary_track",
    membershipPlan: "membership_plan",
    premiumUntil: "premium_until",
    premiumGranted: "premium_granted",
    instructorTrackIds: "instructor_track_ids",
    subscriptionCode: "subscription_code",
    countryCode: "country_code",
    phoneNumber: "phone_number",
    birthdayChanges: "birthday_change_count",
    timeZone: "time_zone",
    emailNotificationsEnabled: "email_notifications_enabled",
    birthdayEmailEnabled: "birthday_email_enabled",
    whatsappNotificationsEnabled: "whatsapp_notifications_enabled",
    birthdayWhatsappEnabled: "birthday_whatsapp_enabled",
    whatsappOptedInAt: "whatsapp_opted_in_at",
    whatsappOptedOutAt: "whatsapp_opted_out_at",
    communicationConsentVersion: "communication_consent_version",
    enrolledAt: "enrolled_at",
    lastActiveAt: "last_active_at",
    updatedAt: "updated_at",
  },
  modules: {
    classId: "track_id",
    order: "position",
    free: "is_free",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  lessons: {
    moduleId: "module_id",
    classId: "track_id",
    assignmentId: "assignment_id",
    videoUrl: "video_url",
    initialCode: "initial_code",
    solutionCode: "solution_code",
    order: "position",
    free: "is_free",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  assignments: {
    classId: "track_id",
    dueDate: "due_at",
    totalPoints: "total_points",
    starter: "is_starter",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  submissions: {
    assignmentId: "assignment_id",
    studentId: "student_id",
    studentName: "student_name",
    classId: "track_id",
    repoUrl: "repo_url",
    liveUrl: "live_url",
    writeUp: "write_up",
    attachments: "attachment_paths",
    lineFeedback: "line_feedback",
    gradedBy: "graded_by",
    submittedAt: "submitted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    reviewEligible: "review_eligible",
    reviewPeriod: "review_period",
  },
  progress: {
    studentId: "student_id",
    lessonId: "lesson_id",
    moduleId: "module_id",
    classId: "track_id",
    completedAt: "completed_at",
  },
  notifications: {
    targetTrack: "target_track",
    actionScreen: "action_path",
    pwaPushSent: "push_sent",
    pushDelivered: "push_delivered",
    createdAt: "created_at",
  },
  discussions: {
    classId: "track_id",
    lessonId: "lesson_id",
    authorId: "author_id",
    authorName: "author_name",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  comments: {
    discussionId: "discussion_id",
    projectId: "project_id",
    authorId: "author_id",
    authorName: "author_name",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  projects: {
    url: "project_url",
    classId: "track_id",
    authorId: "author_id",
    authorName: "author_name",
    votes: "vote_count",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  votes: {
    projectId: "project_id",
    studentId: "student_id",
    createdAt: "created_at",
  },
  projectCritiques: {
    id: "project_id",
    projectId: "project_id",
    studentId: "student_id",
    studentName: "student_name",
    classId: "track_id",
    requestedAt: "requested_at",
    completedAt: "completed_at",
    reviewedBy: "reviewed_by",
    updatedAt: "updated_at",
  },
  sessions: {
    classId: "track_id",
    startsAt: "starts_at",
    endsAt: "ends_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  sessionLinks: {
    id: "session_id",
    url: "meeting_url",
    recordingUrl: "recording_url",
    updatedAt: "updated_at",
  },
  trackProfiles: {
    id: "track_id",
    classId: "track_id",
    instructorName: "instructor_name",
    instructorBio: "instructor_bio",
    instructorAvatarUrl: "instructor_avatar_url",
    updatedAt: "updated_at",
  },
  settings: {
    academyName: "academy_name",
    supportEmail: "support_email",
    enrollmentOpen: "enrollment_open",
    scholarshipGoal: "scholarship_goal",
    scholarshipCost: "scholarship_cost",
    whatsappGroupUrl: "whatsapp_group_url",
    updatedAt: "updated_at",
  },
  payments: {
    id: "reference",
    studentId: "student_id",
    paidAt: "paid_at",
    createdAt: "created_at",
  },
  donations: { donorName: "donor_name", createdAt: "created_at" },
  billingCustomers: {
    id: "customer_code",
    customerCode: "customer_code",
    studentId: "student_id",
    planCode: "plan_code",
    subscriptionCode: "subscription_code",
    updatedAt: "updated_at",
  },
  billingIntents: {
    id: "reference",
    studentId: "student_id",
    amount: "amount_kobo",
    planCode: "plan_code",
    donorName: "donor_name",
    itemId: "item_id",
    itemTitle: "item_title",
    itemType: "item_type",
    itemSlug: "item_slug",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  pushTokens: {
    id: "token_hash",
    studentId: "student_id",
    classId: "track_id",
    updatedAt: "updated_at",
  },
  reviewUsage: {
    studentId: "student_id",
    count: "request_count",
    submissionIds: "submission_ids",
    updatedAt: "updated_at",
  },
  critiqueUsage: {
    studentId: "student_id",
    count: "request_count",
    projectIds: "project_ids",
    updatedAt: "updated_at",
  },
  rateLimits: {
    userId: "user_id",
    name: "action",
    count: "request_count",
    until: "window_ends_at",
  },
  shopItems: {
    compareAtPrice: "compare_at_price",
    thumbnailUrl: "thumbnail_url",
    previewVideoUrl: "preview_video_url",
    whatYouWillLearn: "what_you_will_learn",
    targetAudience: "target_audience",
    salesCount: "sales_count",
    totalDuration: "total_duration",
    certificateEnabled: "certificate_enabled",
    fileUrl: "file_url",
    fileSize: "file_size",
    fileFormat: "file_format",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  shopPurchases: {
    studentId: "student_id",
    studentEmail: "student_email",
    studentName: "student_name",
    itemId: "item_id",
    itemSlug: "item_slug",
    itemTitle: "item_title",
    itemType: "item_type",
    paymentReference: "payment_reference",
    purchasedAt: "purchased_at",
    createdAt: "created_at",
  },
  shopCourseProgress: {
    studentId: "student_id",
    courseId: "course_id",
    completedLessonIds: "completed_lesson_ids",
    lastLessonId: "last_lesson_id",
    completedAt: "completed_at",
    certificateId: "certificate_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  shopCertificates: {
    studentId: "student_id",
    studentName: "student_name",
    courseId: "course_id",
    courseTitle: "course_title",
    issuedAt: "issued_at",
    verificationCode: "verification_code",
    createdAt: "created_at",
  },
};

export function collectionSpec(name: string, id?: string): CollectionSpec {
  if (name === "settings" && id === "community") {
    return { table: "community_settings", primary: ["id"] };
  }
  const spec = specs[name];
  if (!spec) throw new Error(`Unknown academy collection: ${name}`);
  return spec;
}

export function databaseField(name: string, field: string) {
  if (name === "comments" && field === "parentId") return "parent_id";
  return fields[name]?.[field] || field;
}

export function rowFromDatabase(name: string, source: Row): Row {
  const reverse = Object.fromEntries(
    Object.entries(fields[name] || {}).map(([app, db]) => [db, app]),
  );
  const result: Row = {};
  for (const [key, value] of Object.entries(source)) {
    result[reverse[key] || key] = value === null ? undefined : value;
  }
  if (name === "users") {
    result.birthday =
      source.birth_month && source.birth_day
        ? { month: source.birth_month, day: source.birth_day }
        : undefined;
    delete result.birth_month;
    delete result.birth_day;
  }
  if (name === "modules" && Array.isArray(source.lessons)) {
    const lessons = source.lessons
      .map((lesson) => rowFromDatabase("lessons", lesson as Row))
      .filter((lesson) => lesson.published === true)
      .map(({ id, title, duration, order, free }) => ({
        id,
        title,
        duration,
        order,
        free,
      }));
    result.lessons = lessons;
    result.lessonCount = lessons.length;
  }
  if (name === "comments") {
    result.parentId = source.discussion_id || source.project_id;
  }
  if (name === "progress") {
    result.id = `${source.student_id}_${source.lesson_id}`;
  }
  if (name === "votes") {
    result.id = `${source.student_id}_${source.project_id}`;
  }
  if (name === "rateLimits" && typeof source.window_ends_at === "string") {
    result.until = Date.parse(source.window_ends_at);
  }
  if (name === "projectCritiques") result.id = source.project_id;
  if (name === "payments") result.id = source.reference;
  if (name === "settings") {
    for (const field of ["scholarshipGoal", "scholarshipCost"] as const) {
      if (result[field] !== undefined) result[field] = Number(result[field]);
    }
  }
  if (name === "shopItems") {
    if (result.price !== undefined) result.price = Number(result.price);
    if (result.compareAtPrice !== undefined)
      result.compareAtPrice = Number(result.compareAtPrice);
    if (result.salesCount !== undefined)
      result.salesCount = Number(result.salesCount);
  }
  if (name === "shopPurchases") {
    if (result.amount !== undefined) result.amount = Number(result.amount);
  }
  return result;
}

export function rowToDatabase(name: string, source: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || key === "lessonCount" || key === "lessons")
      continue;
    if ((name === "progress" || name === "votes") && key === "id") continue;
    if (name === "users" && key === "birthday") {
      const birthday = value as { month?: number; day?: number };
      result.birth_month = birthday?.month;
      result.birth_day = birthday?.day;
      continue;
    }
    if (name === "comments" && key === "parentId") continue;
    if (name === "rateLimits" && key === "until") {
      result.window_ends_at = new Date(Number(value)).toISOString();
      continue;
    }
    result[databaseField(name, key)] = value;
  }
  return result;
}

export function documentFilters(name: string, id: string) {
  if (name === "settings" && (id === "public" || id === "community")) {
    return { id: true };
  }
  if (name === "progress") {
    const [studentId, lessonId] = id.split("_");
    return { student_id: studentId, lesson_id: lessonId };
  }
  if (name === "votes") {
    const [studentId, projectId] = id.split("_");
    return { student_id: studentId, project_id: projectId };
  }
  if (name === "reviewUsage" || name === "critiqueUsage") {
    const split = id.lastIndexOf("_");
    return { student_id: id.slice(0, split), period: id.slice(split + 1) };
  }
  if (name === "rateLimits") {
    const split = id.indexOf("_");
    return { user_id: id.slice(0, split), action: id.slice(split + 1) };
  }
  const spec = collectionSpec(name, id);
  return { [spec.primary[0]]: id };
}

export function selectionFor(name: string) {
  return name === "modules" ? "*, lessons(*)" : "*";
}

const LESSON_METADATA_COLUMNS = [
  "id",
  "module_id",
  "track_id",
  "title",
  "duration",
  "position",
  "published",
  "is_free",
].join(",");

const SHOP_ITEM_CLIENT_COLUMNS = [
  "id",
  "slug",
  "type",
  "title",
  "subtitle",
  "description",
  "price",
  "compare_at_price",
  "category",
  "tags",
  "badge",
  "thumbnail_url",
  "preview_video_url",
  "what_you_will_learn",
  "requirements",
  "target_audience",
  "published",
  "featured",
  "sales_count",
  "level",
  "total_duration",
  "certificate_enabled",
  "curriculum",
  "file_size",
  "file_format",
  "version",
  "includes",
  "created_at",
  "updated_at",
].join(",");

/**
 * Browser queries must not use `*` on lessons. Supabase intentionally grants
 * the public roles access to lesson metadata but keeps video URLs, notes,
 * resources, and solution code behind the authenticated academy API.
 */
export function clientSelectionFor(name: string) {
  if (name === "modules") {
    return [
      "id",
      "track_id",
      "title",
      "description",
      "position",
      "published",
      "is_free",
      "created_at",
      "updated_at",
      `lessons(${LESSON_METADATA_COLUMNS})`,
    ].join(",");
  }
  if (name === "lessons") return LESSON_METADATA_COLUMNS;
  if (name === "shopItems") return SHOP_ITEM_CLIENT_COLUMNS;
  return "*";
}
