import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ComponentType, SVGProps } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Link, navigate } from "../lib/router";
import type { User } from "../types";
import { AdminPage } from "../pages/AdminPage";
import { BookingListPage } from "../pages/BookingListPage";
import { CalendarPage } from "../pages/CalendarPage";
import { EventsPage } from "../pages/EventsPage";
import { NotificationsPage } from "../pages/NotificationsPage";
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
  UsersIcon
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

export function AppShell({ user, path }: { user: User; path: string }) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", true);
    }
  });
  const quickSettings = useMutation({
    mutationFn: (next: Partial<Pick<User, "locale" | "theme">>) =>
      api<{ user: User }>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(next)
      }),
    onSuccess: (data) => queryClient.setQueryData(["me"], data)
  });
  const darkTheme =
    user.theme === "DARK" ||
    (user.theme === "SYSTEM" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const route = currentRoute(path);
  const items: NavItem[] = [
    { href: "/calendar", label: t("calendar"), icon: CalendarIcon },
    { href: "/bookings", label: t("myBookings"), icon: ListIcon },
    { href: "/events", label: t("openEvents"), icon: UsersIcon },
    {
      href: "/notifications",
      label: t("notifications"),
      icon: BellIcon
    },
    { href: "/profile", label: t("profile"), icon: SettingsIcon },
    {
      href: "/admin",
      label: t("administration"),
      icon: ShieldIcon,
      admin: true
    }
  ];

  let content = <CalendarPage user={user} />;
  if (route === "/bookings") content = <BookingListPage user={user} />;
  if (route === "/events") content = <EventsPage user={user} />;
  if (route === "/notifications") content = <NotificationsPage />;
  if (route === "/profile") content = <ProfilePage user={user} />;
  if (route.startsWith("/admin") && user.role === "ADMIN") {
    content = <AdminPage />;
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link className="brand" href="/calendar">
          <BrandMark />
          <span>MeetBroker</span>
        </Link>

        <span className="nav-caption">Робочий простір</span>
        <nav className="main-nav" aria-label="Основна навігація">
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
                </Link>
              );
            })}
        </nav>

        <div className="sidebar-utilities" aria-label="Швидкі налаштування">
          <button
            className="utility-control"
            disabled={quickSettings.isPending}
            onClick={() =>
              quickSettings.mutate({ theme: darkTheme ? "LIGHT" : "DARK" })
            }
            title={darkTheme ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
            aria-label={
              darkTheme ? "Увімкнути світлу тему" : "Увімкнути темну тему"
            }
          >
            {darkTheme ? <SunIcon /> : <MoonIcon />}
            <span>{darkTheme ? "Світла" : "Темна"}</span>
          </button>
          <details className="language-control">
            <summary
              className="utility-control"
              title={locale === "uk" ? "Вибрати мову" : "Choose language"}
            >
              <GlobeIcon />
              <span>{locale === "uk" ? "UA" : "EN"}</span>
            </summary>
            <div className="language-menu" role="menu">
              <span>{locale === "uk" ? "Вибір мови" : "Choose language"}</span>
              <button
                className={locale === "uk" ? "is-active" : ""}
                disabled={quickSettings.isPending}
                onClick={() => {
                  if (locale === "uk") return;
                  quickSettings.mutate(
                    { locale: "uk" },
                    { onSuccess: () => window.location.reload() }
                  );
                }}
                role="menuitem"
              >
                Українська <strong>UA</strong>
              </button>
              <button
                className={locale === "en" ? "is-active" : ""}
                disabled={quickSettings.isPending}
                onClick={() => {
                  if (locale === "en") return;
                  quickSettings.mutate(
                    { locale: "en" },
                    { onSuccess: () => window.location.reload() }
                  );
                }}
                role="menuitem"
              >
                English <strong>EN</strong>
              </button>
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
            <span>{user.role === "ADMIN" ? "Адміністратор" : "Співробітник"}</span>
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
      <main className="app-main">{content}</main>
    </div>
  );
}
