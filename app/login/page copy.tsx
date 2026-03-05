"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function sendLink() {
    setStatus("Sending magic link...");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
      },
    });
    if (error) {
      setStatus(`❌ ${error.message}`);
      return;
    }
    setStatus("✅ Check your email for the sign-in link.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 18 }}>
      <div
        style={{
          borderRadius: 20,
          padding: 18,
          background: "linear-gradient(90deg, #7c3aed, #db2777)",
          color: "white",
          fontWeight: 900,
          fontSize: 22,
        }}
      >
        Zepbound Tracker Login
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 20, padding: 18, marginTop: 14, background: "white" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Email</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
        />

        <button
          onClick={sendLink}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(90deg, #2563eb, #7c3aed)",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Send Magic Link
        </button>

        {status ? <div style={{ marginTop: 10, opacity: 0.8 }}>{status}</div> : null}
      </div>
    </div>
  );
}