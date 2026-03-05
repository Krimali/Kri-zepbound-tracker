import "./globals.css";
import Link from "next/link";
import AuthGate from "./components/AuthGate";

export const metadata = {
  title: "Zepbound Journey",
  description: "Track your transformation",
};

function Tab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        textDecoration: "none",
        fontWeight: 800,
        color: "#111827",
      }}
    >
      {label}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#ffffff", color: "#111827" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 18px 40px" }}>
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>Zepbound Journey</div>
              <div style={{ opacity: 0.7, marginTop: 2 }}>Track your transformation 🎉</div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Link
                href="/journey?export=1"
                style={{
                  padding: "12px 16px",
                  borderRadius: 999,
                  background: "#2563eb",
                  color: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                ⬇️ Export
              </Link>

              <Link
                href="/today"
                style={{
                  padding: "12px 16px",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #7c3aed, #db2777)",
                  color: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                }}
              >
                + Add Entry
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <Tab href="/" label="🏠 Dashboard" />
            <Tab href="/measurements" label="📏 Measurements" />
            <Tab href="/journey" label="🗺️ My Journey" />
          </div>

          <div style={{ height: 16 }} />

          {/* Page content */}
          {children}
        </div>
      </body>
    </html>
  );
}