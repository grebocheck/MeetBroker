import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, ApiError } from "./lib/api";
import { I18nProvider, resolveBrowserLocale, useI18n } from "./lib/i18n";
import { navigate, usePath } from "./lib/router";
import type { Locale, User } from "./types";
import { AppShell } from "./components/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { BrandMark } from "./components/BrandMark";

export function App() {
  const path = usePath();
  const auth = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User }>("/api/auth/me"),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 401) && count < 1,
  });
  const user = auth.data?.user;
  const publicLocale: Locale = resolveBrowserLocale(
    window.localStorage.getItem("meetbroker.locale") ?? navigator.language,
  );

  useEffect(() => {
    if (user && (path.startsWith("/login") || path.startsWith("/register"))) {
      navigate("/calendar", true);
    }
  }, [path, user]);

  if (auth.isLoading) {
    return (
      <I18nProvider locale={publicLocale}>
        <div className="splash">
          <BrandMark />
          <div>
            <strong>MeetBroker</strong>
            <SplashMessage />
          </div>
        </div>
      </I18nProvider>
    );
  }

  if (!user) {
    document.documentElement.lang = publicLocale;
    return (
      <I18nProvider locale={publicLocale}>
        <AuthPage path={path} />
      </I18nProvider>
    );
  }

  const resolvedTheme =
    user.theme === "SYSTEM"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : user.theme.toLowerCase();
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.lang = user.locale;

  return (
    <I18nProvider locale={user.locale}>
      {!user.emailVerified || !user.approved ? (
        <PendingApprovalPage user={user} />
      ) : (
        <AppShell user={user} path={path} />
      )}
    </I18nProvider>
  );
}

function SplashMessage() {
  const { t } = useI18n();
  return <span>{t("app.loadingWorkspace")}</span>;
}
