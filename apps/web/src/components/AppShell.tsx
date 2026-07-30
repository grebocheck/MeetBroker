import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType, SVGProps } from "react";
import { api } from "../lib/api";
import { localeOptions, useI18n } from "../lib/i18n";
import { Link, navigate } from "../lib/router";
import type { Capability, NotificationsResponse, User } from "../types";
import type { MessageKey } from "../locales/uk";
import { AdminPage } from "../pages/AdminPage";
import { BookingListPage } from "../pages/BookingListPage";
import { CalendarPage } from "../pages/CalendarPage";
import { EventsPage } from "../pages/EventsPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { MyMeetingsPage } from "../pages/MyMeetingsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { Avatar } from "./Avatar";
import { BrandMark } from "./BrandMark";
import {
  BellIcon,
  CalendarIcon,
  GlobeIcon,
  ListIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
  UsersIcon,
} from "./Icons";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  admin?: boolean;
}

function currentRoute(path: string): string {
  return path.split("?")[0];
}

const capabilityKeys: Record<Capability, MessageKey> = {
  BOOKING_CREATE: "capability.BOOKING_CREATE",
  BOOKING_CANCEL_OWN: "capability.BOOKING_CANCEL_OWN",
  SCHEDULE_VIEW: "capability.SCHEDULE_VIEW",
  ACCOUNT_LOGIN: "capability.ACCOUNT_LOGIN",
};

export function AppShell({ user, path }: { user: User; path: string }) {
  const { dateLocale, locale, t } = useI18n();
  const queryClient = useQueryClient();
  const notificationSummary = useQuery({
    queryKey: ["notifications", "summary"],
    queryFn: () =>
      api<NotificationsResponse>("/api/notifications?page=1&limit=1"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unreadCount = notificationSummary.data?.unreadCount ?? 0;
  const logout = useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", true);
    },
  });
  const quickSettings = useMutation({
    mutationFn: (next: Partial<Pick<User, "locale" | "theme">>) =>
      api<{ user: User }>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(next),
      }),
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
  });
  const darkTheme =
    user.theme === "DARK" ||
    (user.theme === "SYSTEM" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const activeLocale =
    localeOptions.find((option) => option.value === locale) ?? localeOptions[1];
  const route = currentRoute(path);
  const items: NavItem[] = [
    { href: "/my-calendar", label: t("myMeetings"), icon: CalendarIcon },
    { href: "/calendar", label: t("calendar"), icon: CalendarIcon },
    { href: "/bookings", label: t("myBookings"), icon: ListIcon },
    { href: "/events", label: t("openEvents"), icon: UsersIcon },
    {
      href: "/notifications",
      label: t("notifications"),
      icon: BellIcon,
    },
    { href: "/profile", label: t("profile"), icon: SettingsIcon },
    {
      href: "/admin",
      label: t("administration"),
      icon: ShieldIcon,
      admin: true,
    },
  ];

  let content = <CalendarPage user={user} />;
  if (route === "/my-calendar") content = <MyMeetingsPage user={user} />;
  if (route === "/bookings") content = <BookingListPage user={user} />;
  if (route === "/events") content = <EventsPage user={user} />;
  if (route === "/notifications") content = <NotificationsPage />;
  if (route === "/profile") content = <ProfilePage user={user} />;
  if (route.startsWith("/admin") && user.role === "ADMIN") {
    content = <AdminPage />;
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">
        {t("shell.skipToContent")}
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/calendar">
          <BrandMark />
          <span>MeetBroker</span>
        </Link>

        <span className="nav-caption">{t("shell.workspace")}</span>
        <nav className="main-nav" aria-label={t("shell.mainNavigation")}>
          {items
            .filter((item) => !item.admin || user.role === "ADMIN")
            .map((item) => {
              const Icon = item.icon;
              const active =
                route === item.href ||
                (item.href === "/admin" && route.startsWith("/admin"));
              return (
                <Link
                  href={item.href}
                  className={`nav-item${active ? " nav-item--active" : ""}`}
                  key={item.href}
                >
                  <Icon />
                  <span>{item.label}</span>
                  {item.href === "/notifications" && unreadCount > 0 && (
                    <strong
                      className="nav-badge"
                      aria-label={t("notifications.unreadCount", {
                        count: unreadCount,
                      })}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </strong>
                  )}
                </Link>
              );
            })}
        </nav>

        <div
          className="sidebar-utilities"
          aria-label={t("shell.quickSettings")}
        >
          <button
            className="utility-control"
            disabled={quickSettings.isPending}
            onClick={() =>
              quickSettings.mutate({ theme: darkTheme ? "LIGHT" : "DARK" })
            }
            title={darkTheme ? t("shell.enableLight") : t("shell.enableDark")}
            aria-label={
              darkTheme ? t("shell.enableLight") : t("shell.enableDark")
            }
          >
            {darkTheme ? <SunIcon /> : <MoonIcon />}
            <span>
              {darkTheme ? t("shell.lightTheme") : t("shell.darkTheme")}
            </span>
          </button>
          <details className="language-control">
            <summary
              className="utility-control"
              title={t("shell.chooseLanguage")}
            >
              <GlobeIcon />
              <span>{activeLocale.shortLabel}</span>
            </summary>
            <div className="language-menu" role="menu">
              <span>{t("shell.chooseLanguage")}</span>
              {localeOptions.map((option) => (
                <button
                  className={locale === option.value ? "is-active" : ""}
                  disabled={quickSettings.isPending}
                  onClick={() => {
                    if (locale === option.value) return;
                    quickSettings.mutate(
                      { locale: option.value },
                      {
                        onSuccess: () => {
                          window.localStorage.setItem(
                            "meetbroker.locale",
                            option.value,
                          );
                          window.location.reload();
                        },
                      },
                    );
                  }}
                  role="menuitem"
                  key={option.value}
                >
                  {option.label} <strong>{option.shortLabel}</strong>
                </button>
              ))}
            </div>
          </details>
        </div>

        <div className="sidebar-profile">
          <Avatar
            name={user.name}
            preset={user.avatarPreset}
            url={user.avatarUrl}
          />
          <div className="sidebar-profile__copy">
            <strong>{user.name}</strong>
            <span>
              {user.role === "ADMIN" ? t("shell.admin") : t("shell.employee")}
            </span>
          </div>
          <button
            className="icon-button"
            onClick={() => logout.mutate()}
            title={t("signOut")}
            aria-label={t("signOut")}
          >
            <LogOutIcon />
          </button>
        </div>
      </aside>
      <main className="app-main" id="main-content" tabIndex={-1}>
        {Boolean(user.activeRestrictions?.length) && (
          <aside className="access-notice" aria-label={t("access.noticeTitle")}>
            <strong>{t("access.noticeTitle")}</strong>
            <div>
              {user.activeRestrictions?.map((restriction) => (
                <span key={restriction.id}>
                  {t(capabilityKeys[restriction.capability])} ·{" "}
                  {restriction.reason}
                  {restriction.expiresAt
                    ? ` · ${t("access.until", {
                        date: new Intl.DateTimeFormat(dateLocale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(restriction.expiresAt)),
                      })}`
                    : ` · ${t("access.unlimited")}`}
                </span>
              ))}
            </div>
          </aside>
        )}
        {content}
      </main>
    </div>
  );
}
