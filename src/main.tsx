import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, createMemoryRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import "@fontsource-variable/heebo";
import "./index.css";
import { AppShell } from "./ui/shell";
import { RequireMode } from "./screens/guards";
import { FeedScreen } from "./screens/feed";
import { PostScreen } from "./screens/post";
import { StoryViewer } from "./screens/stories";
import { TagScreen } from "./screens/tag";
import { DiscoverScreen } from "./screens/discover";
import { BusinessScreen } from "./screens/business";
import { ProfessionalScreen } from "./screens/professional";
import { BookingScreen } from "./screens/booking";
import { AppointmentsScreen, AppointmentDetailScreen } from "./screens/appointments";
import { ReviewScreen } from "./screens/review";
import { SavedScreen } from "./screens/saved";
import { ProfileScreen } from "./screens/profile";
import { SettingsScreen } from "./screens/settings";
import { MessagesScreen, ConversationScreen } from "./screens/messages";
import { NotificationsScreen } from "./screens/notifications";
import { SignInScreen } from "./screens/signin";
import { DemoScreen } from "./screens/demo";
import { ComposerScreen } from "./screens/composer";
import { ManageHome } from "./screens/manage/home";
import { CalendarScreen } from "./screens/manage/calendar";
import { BizAppointmentsScreen, BizAppointmentDetail } from "./screens/manage/appointments";
import { CustomersScreen, CustomerDetail } from "./screens/manage/customers";
import { ServicesScreen } from "./screens/manage/services";
import { StaffScreen } from "./screens/manage/staff";
import { ContentScreen } from "./screens/manage/content";
import { AnalyticsScreen } from "./screens/manage/analytics";
import { BizSettingsScreen } from "./screens/manage/settings";
import { BizReviewsScreen } from "./screens/manage/reviews";
import { PromoteScreen } from "./screens/manage/promote";
import { AdminScreen } from "./screens/admin";
import { BizShell } from "./biz/ui";
import { BizLoginScreen } from "./biz/screens/Login";
import { OnboardingScreen } from "./biz/screens/Onboarding";
import { ActivityScreen } from "./biz/screens/Activity";
import { CalendarScreen as BizCalendarScreen } from "./biz/screens/Calendar";
import { CustomersScreen as BizCustomersScreen, CustomerDetailScreen } from "./biz/screens/Customers";
import { WaitlistScreen } from "./biz/screens/Waitlist";
import { InboxScreen } from "./biz/screens/Messages";
import { ReportsScreen } from "./biz/screens/Reports";
import { TourScreen } from "./biz/screens/Tour";
import { BizSettingsScreen as ProSettingsScreen } from "./biz/screens/Settings";
import { PublicBookingScreen } from "./biz/screens/PublicBooking";

const routes: RouteObject[] = [
  // Beautigo Pro — business management on Supabase (or the in-browser preview)
  { path: "/biz/login", element: <BizLoginScreen /> },
  {
    path: "/biz",
    element: <BizShell />,
    children: [
      { index: true, element: <ActivityScreen /> },
      { path: "onboarding", element: <OnboardingScreen /> },
      { path: "calendar", element: <BizCalendarScreen /> },
      { path: "customers", element: <BizCustomersScreen /> },
      { path: "customers/:id", element: <CustomerDetailScreen /> },
      { path: "waitlist", element: <WaitlistScreen /> },
      { path: "messages", element: <InboxScreen /> },
      { path: "messages/:id", element: <InboxScreen /> },
      { path: "reports", element: <ReportsScreen /> },
      { path: "tour", element: <TourScreen /> },
      { path: "settings", element: <ProSettingsScreen /> },
      { path: "*", element: <Navigate to="/biz" replace /> },
    ],
  },
  { path: "/p/:slug", element: <PublicBookingScreen /> },
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <FeedScreen /> },
      { path: "/post/:postId", element: <PostScreen /> },
      { path: "/story/:businessId", element: <StoryViewer /> },
      { path: "/tag/:tag", element: <TagScreen /> },
      { path: "/discover", element: <DiscoverScreen /> },
      { path: "/b/:businessId", element: <BusinessScreen /> },
      { path: "/pro/:proId", element: <ProfessionalScreen /> },
      { path: "/book/:businessId", element: <BookingScreen /> },
      { path: "/saved", element: <SavedScreen /> },
      { path: "/appointments", element: <AppointmentsScreen /> },
      { path: "/appointments/:id", element: <AppointmentDetailScreen /> },
      { path: "/review/:appointmentId", element: <ReviewScreen /> },
      { path: "/profile", element: <ProfileScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
      { path: "/messages", element: <MessagesScreen /> },
      { path: "/messages/:id", element: <ConversationScreen /> },
      { path: "/notifications", element: <NotificationsScreen /> },
      { path: "/signin", element: <SignInScreen /> },
      { path: "/demo", element: <DemoScreen /> },
      { path: "/create", element: <RequireMode modes={["business"]}><ComposerScreen /></RequireMode> },
      {
        path: "/manage",
        element: <RequireMode modes={["business", "staff"]} />,
        children: [
          { index: true, element: <ManageHome /> },
          { path: "calendar", element: <CalendarScreen /> },
          { path: "appointments", element: <BizAppointmentsScreen /> },
          { path: "appointments/:id", element: <BizAppointmentDetail /> },
          { path: "customers", element: <RequireMode modes={["business"]}><CustomersScreen /></RequireMode> },
          { path: "customers/:id", element: <RequireMode modes={["business"]}><CustomerDetail /></RequireMode> },
          { path: "services", element: <RequireMode modes={["business"]}><ServicesScreen /></RequireMode> },
          { path: "staff", element: <RequireMode modes={["business"]}><StaffScreen /></RequireMode> },
          { path: "content", element: <RequireMode modes={["business"]}><ContentScreen /></RequireMode> },
          { path: "analytics", element: <RequireMode modes={["business"]}><AnalyticsScreen /></RequireMode> },
          { path: "reviews", element: <RequireMode modes={["business"]}><BizReviewsScreen /></RequireMode> },
          { path: "promote", element: <RequireMode modes={["business"]}><PromoteScreen /></RequireMode> },
          { path: "settings", element: <RequireMode modes={["business"]}><BizSettingsScreen /></RequireMode> },
        ],
      },
      { path: "/admin/*", element: <RequireMode modes={["admin"]}><AdminScreen /></RequireMode> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

// Hebrew RTL even when the page is embedded in a host document that does not set it
document.documentElement.lang = "he";
document.documentElement.dir = "rtl";

// The hosted demo runs inside a sandboxed frame where URL hashes are not shareable, so it uses an in-memory router.
const router = import.meta.env.VITE_ROUTER === "memory" ? createMemoryRouter(routes) : createHashRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
