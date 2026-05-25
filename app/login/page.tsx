"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }

      window.location.href = "/";
    } catch (loginError) {
      console.error("Failed to sign in:", loginError);
      setError("A network error occurred while signing in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-[13px]">
      <section className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad shadow-sm">
        <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase">
          SubTrack Pro
        </p>
        <h1 className="mt-2 text-[25px] font-semibold text-on-surface">
          Sign in
        </h1>

        <form onSubmit={handleSubmit} className="mt-[21px] space-y-[13px]">
          <label className="block">
            <span className="mb-2 block text-label-md font-semibold text-on-surface">
              Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-label-md font-semibold text-on-surface">
              Password
            </span>
            <div className="relative">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-[13px] pr-11 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </label>

          {error ? (
            <div className="rounded-lg border border-error/20 bg-error-container ui-button-pad text-[11px] text-error">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary ui-control-pad text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
