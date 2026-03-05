"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const [msg, setMsg] = useState("Signing you in...");

  useEffect(() => {
    let mounted = true;

    async function run() {
      // For OTP magic links, Supabase sets session via URL hash automatically
      // because detectSessionInUrl=true. We just wait briefly and then go home.
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      if (data.session) {
        window.location.replace("/"); // go to dashboard
      } else {
        // If session isn't ready yet, wait a moment then retry once
        setTimeout(async () => {
          const { data: retry } = await supabase.auth.getSession();
          if (retry.session) window.location.replace("/");
          else setMsg("Login link expired or invalid. Please request a new one.");
        }, 800);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  return <div style={{ padding: 24, opacity: 0.8 }}>{msg}</div>;
}