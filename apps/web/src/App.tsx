import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { api, ApiError } from "./lib/api";
import {
  buildDocumentTitle,
  type ApplicationState,
} from "./lib/document-title";
import { I18nProvider, resolveBrowserLocale, useI18n } from "./lib/i18n";
import { navigate, usePath } from "./lib/router";
import type { Locale, User } from "./types";
import { BrandMark } from "./components/BrandMark";

const AppShell = lazy(() =>
  import("./components/AppShell").then((module) => ({
    default: module.AppShell,
  })),
);
const AuthPage = lazy(() =>
  import("./pages/AuthPage").then((module) => ({
    default: module.AuthPage,
  })),
);
const PendingApprovalPage = lazy(() =>
  import("./pages/PendingApprovalPage").then((module) => ({
    default: module.PendingApprovalPage,
  })),
);

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
  const applicationState: ApplicationState = auth.isLoading
    ? "LOADING"
    : !user
      ? "ANONYMOUS"
      : !user.emailVerified
        ? "EMAIL_VERIFICATION"
        : !user.approved
          ? "APPROVAL"
          : "READY";
  const activeLocale = user?.locale ?? publicLocale;

  useEffect(() => {
    if (user && (path.startsWith("/login") || path.startsWith("/register"))) {
      navigate("/calendar", true);
    }
  }, [path, user]);

  const resolvedTheme = user
    ? user.theme === "SYSTEM"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : user.theme.toLowerCase()
    : null;
  useEffect(() => {
    document.documentElement.lang = activeLocale;
    document.title = buildDocumentTitle(activeLocale, path, applicationState);
    if (resolvedTheme) {
      document.documentElement.dataset.theme = resolvedTheme;
    }
  }, [activeLocale, applicationState, path, resolvedTheme]);

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
    return (
      <I18nProvider locale={publicLocale}>
        <Suspense fallback={<AppSplash />}>
          <AuthPage path={path} />
        </Suspense>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider locale={user.locale}>
      <Suspense fallback={<AppSplash />}>
        {!user.emailVerified || !user.approved ? (
          <PendingApprovalPage user={user} />
        ) : (
          <AppShell user={user} path={path} />
        )}
      </Suspense>
    </I18nProvider>
  );
}

function AppSplash() {
  return (
    <div className="splash">
      <BrandMark />
      <div>
        <strong>MeetBroker</strong>
        <SplashMessage />
      </div>
    </div>
  );
}

function SplashMessage() {
  const { t } = useI18n();
  return <span>{t("app.loadingWorkspace")}</span>;
}
