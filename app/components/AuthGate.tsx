"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

type Status = "checking" | "sending" | "ready" | "error";

function getRedirectTo() {
  // ✅ Production: uses Vercel env var
  // ✅ Dev: falls back to current origin (localhost)
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string>("");

  const isLoginRoute = useMemo(() => path === "/login", [path]);

  useEffect(() => {
    let mounted = true;

    async function check() {
      setStatus("checking");

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        setStatus("error");
        setMsg(error.message);
        return;
      }

      if (!data.session) {
        // Not logged in → show login UI (and optionally route to /login)
        if (!isLoginRoute) router.replace("/login");
        setStatus("ready");
        return;
      }

      // Logged in → if you're on /login, bounce to dashboard
      if (isLoginRoute) router.replace("/");
      setStatus("ready");
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session) {
        if (!isLoginRoute) router.replace("/login");
      } else {
        if (isLoginRoute) router.replace("/");
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, isLoginRoute]);

  async function sendMagicLink() {
    const e = email.trim();
    if (!e) return;

    setStatus("sending");
    setMsg("");

    const redirectTo = getRedirectTo();

    console.log("MAGIC LINK redirectTo =", redirectTo);

    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: {
        // ✅ THIS is the fix (prevents localhost links in prod)
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }

    setStatus("ready");
    setMsg("✅ Check your email for the magic link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // While checking session
  if (status === "checking") {
    return <div style={{ padding: 24, opacity: 0.7 }}>Loading...</div>;
  }

  // If not logged in, show login UI (works on /login route)
  // NOTE: This assumes /login just renders children; AuthGate will show this instead.
  // If your /login page is a dedicated UI, you can remove this entire block.
  if (path === "/login") {
    return (
      <div style={{ padding: 28, maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 20,
            padding: 24,
            background: "white",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>
            Sign in
          </div>
          <div style={{ opacity: 0.7, marginBottom: 14 }}>
            This is a private app. Sign in to view and edit your data.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #d9d9d9",
                borderRadius: 14,
                outline: "none",
                fontSize: 16,
              }}
            />
            <button
              onClick={sendMagicLink}
              disabled={status === "sending"}
              style={{
                border: "none",
                borderRadius: 14,
                padding: "12px 14px",
                fontWeight: 900,
                color: "white",
                background: "black",
                cursor: "pointer",
              }}
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>

            <div style={{ marginTop: 6, fontWeight: 700 }}>
              🔒 Please sign in
            </div>

            {msg ? (
              <div
                style={{
                  marginTop: 6,
                  color: msg.startsWith("✅") ? "#047857" : "#b91c1c",
                  fontWeight: 700,
                }}
              >
                {msg}
              </div>
            ) : null}

            {/* Optional: show where redirects go (handy while debugging) */}
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
              Redirect target: {process.env.NEXT_PUBLIC_SITE_URL || "(uses current site URL)"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in → render app
  return (
    <>
      {/* Optional small sign-out button while you test */}
      {/* Remove if you already have sign out in your header */}
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 50 }}>
        <button
          onClick={signOut}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 999,
            padding: "10px 14px",
            fontWeight: 900,
            background: "white",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>

      {children}
    </>
  );
}