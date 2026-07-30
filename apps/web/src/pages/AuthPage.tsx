import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/error-message";
import { useI18n } from "../lib/i18n";
import { Link, navigate } from "../lib/router";
import type { User } from "../types";
import { BrandMark } from "../components/BrandMark";

export function AuthPage({ path }: { path: string }) {
  if (path.startsWith("/register")) return <Register />;
  if (path.startsWith("/verify-email")) return <VerifyEmail />;
  return <Login />;
}

function AuthFrame({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand brand--auth">
          <BrandMark />
          <span>MeetBroker</span>
        </div>
        <div className="auth-story__content">
          <span className="eyebrow">{t("auth.storyEyebrow")}</span>
          <h1>{t("auth.storyTitle")}</h1>
          <p>{t("auth.storyBody")}</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview__head">
            <span />
            <span />
            <span />
          </div>
          <div className="auth-preview__grid">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div>
            <span className="eyebrow">{t("auth.corporateAccess")}</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

function Login() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const registrationStatus = new URLSearchParams(window.location.search).get(
    "registered"
  );
  const [email, setEmail] = useState("user@meetbroker.local");
  const [password, setPassword] = useState("User12345!");
  const login = useMutation({
    mutationFn: () =>
      api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(["me"], { user });
      navigate("/calendar", true);
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <AuthFrame
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
    >
      <form className="form-stack" onSubmit={submit}>
        {registrationStatus && (
          <div className="form-success" role="status">
            {registrationStatus === "verify"
              ? t("auth.registeredVerify")
              : t("auth.registeredReady")}
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>{t("auth.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        {login.error && (
          <div className="form-error" role="alert">
            {errorMessage(login.error, t, "auth.loginError")}
          </div>
        )}
        <button className="button button--primary button--wide" disabled={login.isPending}>
          {login.isPending ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>
      <p className="auth-switch">
        {t("auth.noAccount")}{" "}
        <Link href="/register">{t("auth.register")}</Link>
      </p>
    </AuthFrame>
  );
}

function Register() {
  const { t } = useI18n();
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: ""
  });
  const register = useMutation({
    mutationFn: () =>
      api<{ verificationRequired: boolean }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: ({ verificationRequired }) => {
      navigate(
        verificationRequired
          ? "/login?registered=verify"
          : "/login?registered=ready",
        true
      );
    }
  });

  return (
    <AuthFrame
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          register.mutate();
        }}
      >
        {(["name", "email", "password"] as const).map((field) => (
          <label className="field" key={field}>
            <span>
              {field === "name"
                ? t("auth.name")
                : field === "email"
                  ? "Email"
                  : t("auth.password")}
            </span>
            <input
              type={field === "password" ? "password" : field}
              value={values[field]}
              onChange={(event) =>
                setValues({ ...values, [field]: event.target.value })
              }
              minLength={field === "password" ? 8 : undefined}
              maxLength={field === "password" ? 72 : undefined}
              required
            />
          </label>
        ))}
        {register.error && (
          <div className="form-error" role="alert">
            {errorMessage(register.error, t, "auth.registerError")}
          </div>
        )}
        <button
          className="button button--primary button--wide"
          disabled={register.isPending}
        >
          {register.isPending ? t("auth.creating") : t("auth.register")}
        </button>
      </form>
      <p className="auth-switch">
        {t("auth.haveAccount")} <Link href="/login">{t("auth.signIn")}</Link>
      </p>
    </AuthFrame>
  );
}

function VerifyEmail() {
  const { t } = useI18n();
  const token = new URLSearchParams(window.location.search).get("token");
  const verification = useMutation({
    mutationFn: () =>
      api<void>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      })
  });

  return (
    <AuthFrame
      title={t("auth.verifyTitle")}
      subtitle={t("auth.verifySubtitle")}
    >
      {verification.isSuccess ? (
        <div className="success-panel">
          <strong>{t("auth.verifiedTitle")}</strong>
          <span>{t("auth.verifiedBody")}</span>
          <Link className="button button--primary" href="/login">
            {t("auth.toLogin")}
          </Link>
        </div>
      ) : (
        <div className="form-stack">
          {verification.error && (
            <div className="form-error">
              {errorMessage(
                verification.error,
                t,
                "auth.invalidVerification",
              )}
            </div>
          )}
          <button
            className="button button--primary button--wide"
            disabled={!token || verification.isPending}
            onClick={() => verification.mutate()}
          >
            {verification.isPending
              ? t("auth.verifying")
              : t("auth.verifyEmail")}
          </button>
        </div>
      )}
    </AuthFrame>
  );
}
