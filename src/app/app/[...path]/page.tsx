"use client";
import { use, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAcademy } from "@/components/academy-provider";
import { Loading, EmptyState } from "@/components/ui";
const Learning = dynamic(() => import("@/features/learning"), {
  loading: Loading,
});
const Admin = dynamic(() => import("@/features/admin"), { loading: Loading });
const Community = dynamic(() => import("@/features/community"), {
  loading: Loading,
});
const Billing = dynamic(() => import("@/features/billing"), {
  loading: Loading,
});
const Account = dynamic(() => import("@/features/account"), {
  loading: Loading,
});
const ShopStudio = dynamic(
  () => import("@/features/shop-studio").then((m) => m.ShopStudio),
  { loading: Loading },
);
const StudentLibrary = dynamic(
  () => import("@/features/library").then((m) => m.StudentLibrary),
  { loading: Loading },
);
const CoursePlayer = dynamic(
  () => import("@/features/course-player").then((m) => m.CoursePlayer),
  { loading: Loading },
);
export default function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = use(params);
  const [section, id] = path;
  const { user } = useAcademy();
  if (
    [
      "admin",
      "users",
      "courses",
      "submissions",
      "notifications",
      "settings",
    ].includes(section)
  ) {
    const allowed =
      user?.role === "Admin" ||
      (user?.role === "Instructor" &&
        ["courses", "submissions"].includes(section));
    if (!allowed)
      return (
        <EmptyState
          title="This area is for academy staff"
          action={
            <Link href="/app/dashboard" className="btn btn-primary">
              Your workspace
            </Link>
          }
        >
          Your learning space is ready for you.
        </EmptyState>
      );
    return <Admin section={section} id={id} />;
  }
  if (
    ["dashboard", "classes", "tracks", "lesson", "assignments", "transcript"].includes(
      section,
    )
  )
    return (
      <div className="learning-surface">
        <Learning section={section} id={id} />
      </div>
    );
  if (["community", "showcase", "sessions"].includes(section))
    return <Community section={section} id={id} />;
  if (section === "shop-studio") {
    if (user?.role !== "Admin") {
      return (
        <EmptyState
          title="This area is for academy administrators"
          action={
            <Link href="/app/dashboard" className="btn btn-primary">
              Your workspace
            </Link>
          }
        >
          Manage your courses and digital materials.
        </EmptyState>
      );
    }
    return <ShopStudio />;
  }
  if (section === "library") return <StudentLibrary />;
  if (section === "learn-course") {
    if (!id) {
      return (
        <EmptyState
          title="Select a course to begin"
          action={
            <Link href="/app/library" className="btn btn-primary">
              My Library
            </Link>
          }
        />
      );
    }
    return <CoursePlayer courseId={id} />;
  }
  if (section === "billing")
    return (
      <Suspense fallback={<Loading />}>
        <Billing />
      </Suspense>
    );
  if (section === "account") return <Account />;
  return (
    <EmptyState
      title="This page could not be found"
      action={
        <Link href="/app/dashboard" className="btn btn-primary">
          Back to overview
        </Link>
      }
    />
  );
}
