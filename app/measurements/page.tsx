"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type MeasurementRow = {
  id: string;
  measure_date: string; // YYYY-MM-DD
  neck: number | null;
  shoulder: number | null;
  chest: number | null;
  waist: number | null;
  abdomen: number | null;
  hip: number | null;
  l_bicep: number | null;
  r_bicep: number | null;
  l_thigh: number | null;
  r_thigh: number | null;
  l_calf: number | null;
  r_calf: number | null;
};

const FIELDS: { key: keyof MeasurementRow; label: string; hint?: string }[] = [
  { key: "neck", label: "Neck" },
  { key: "shoulder", label: "Shoulder" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "abdomen", label: "Abdomen" },
  { key: "hip", label: "Hip" },
  { key: "l_bicep", label: "Left Bicep", hint: "l_bicep" },
  { key: "r_bicep", label: "Right Bicep", hint: "r_bicep" },
  { key: "l_thigh", label: "Left Thigh", hint: "l_thigh" },
  { key: "r_thigh", label: "Right Thigh", hint: "r_thigh" },
  { key: "l_calf", label: "Left Calf", hint: "l_calf" },
  { key: "r_calf", label: "Right Calf", hint: "r_calf" },
];

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDateLong(iso: string) {
  // 2026-03-04 -> Mar 4, 2026
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function toNumOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function deltaColor(delta: number | null) {
  if (delta == null) return "#6b7280"; // gray-500
  if (delta < 0) return "#047857"; // emerald-700 (good = smaller)
  if (delta > 0) return "#b45309"; // amber-700
  return "#6b7280";
}

function deltaText(delta: number | null) {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export default function MeasurementsPage() {
  const [status, setStatus] = useState<string>("Loading...");
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(isoToday());

  // form state: store as strings for inputs
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) init[f.key as string] = "";
    return init;
  });

  async function loadAll() {
    try {
      setStatus("Loading...");
      const { data, error } = await supabase
        .from("measurements")
        .select("*")
        .order("measure_date", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as MeasurementRow[]);
      setStatus("✅ Loaded");
    } catch (e: any) {
      console.error(e);
      setStatus(`❌ ${e?.message ?? "Load failed"}`);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When date changes OR rows reload, populate form from existing row (if any)
  useEffect(() => {
    const existing = rows.find((r) => r.measure_date === selectedDate);
    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = existing ? (existing[f.key] as any) : null;
      next[f.key as string] = v == null ? "" : String(v);
    }
    setForm(next);
  }, [selectedDate, rows]);

  // Pick 5 columns total: latest 4 + oldest 1 (unique dates)
  const displayed = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.measure_date.localeCompare(a.measure_date)); // latest first
    if (sorted.length === 0) return [];

    const newest = sorted.slice(0, 4);
    const oldest = sorted[sorted.length - 1];

    const map = new Map<string, MeasurementRow>();
    for (const r of newest) map.set(r.measure_date, r);
    map.set(oldest.measure_date, oldest);

    const out = Array.from(map.values()).sort((a, b) => b.measure_date.localeCompare(a.measure_date));
    return out;
  }, [rows]);

  // For each displayed date, compare to the next column to the right (older)
  const displayedWithOlder = useMemo(() => {
    const cols = displayed;
    return cols.map((r, i) => ({
      row: r,
      older: i + 1 < cols.length ? cols[i + 1] : null,
    }));
  }, [displayed]);

  async function save() {
    setSaving(true);
    try {
      // Build payload
      const payload: any = { measure_date: selectedDate };
      for (const f of FIELDS) {
        payload[f.key] = toNumOrNull(form[f.key as string] ?? "");
      }

      const { error } = await supabase.from("measurements").upsert(payload, {
        onConflict: "measure_date",
      });

      if (error) throw error;

      await loadAll();
      setStatus("✅ Saved");
    } catch (e: any) {
      console.error(e);
      setStatus(`❌ ${e?.message ?? "Save failed"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
      {/* Top header (single set of nav — no duplicates) */}
      
      <div style={{ height: 18 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Measurements</div>
        <div style={{ opacity: 0.7, fontSize: 14 }}>Track weekly measurements (cm). Latest shown first.</div>
      </div>

      <div style={{ marginTop: 10, marginBottom: 14, fontWeight: 700 }}>{status}</div>

      {/* Add/Edit box (fixed formatting) */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 18,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>Add / Edit</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Date</div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "10px 12px",
                fontWeight: 800,
              }}
            />
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "none",
                color: "white",
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                background: "linear-gradient(90deg, #111827, #111827)",
              }}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {FIELDS.map((f) => (
            <div key={f.key as string}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75, marginBottom: 6 }}>{f.label}</div>
              <input
                inputMode="decimal"
                placeholder="—"
                value={form[f.key as string] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key as string]: e.target.value }))}
                style={{
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontWeight: 800,
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
          Tip: pick a date above. If a measurement exists for that date, it will auto-fill for editing.
        </div>
      </div>

      <div style={{ height: 16 }} />

      {/* Pivot table */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 18,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>All Measurements</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Showing latest 4 dates + oldest 1 date. Δ compares each date to the next column (older) on the right.
          </div>
        </div>

        <div style={{ height: 10 }} />

        {displayedWithOlder.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.7 }}>No measurements yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 860 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      fontSize: 12,
                      opacity: 0.75,
                      borderBottom: "1px solid #f1f5f9",
                      position: "sticky",
                      left: 0,
                      background: "white",
                      zIndex: 2,
                    }}
                  >
                    Measurement
                  </th>

                  {displayedWithOlder.map((col, idx) => (
                    <th
                      key={col.row.measure_date}
                      colSpan={2}
                      style={{
                        textAlign: "center",
                        padding: "10px 10px",
                        fontSize: 12,
                        fontWeight: 900,
                        borderBottom: "1px solid #f1f5f9",
                        background: "white",
                        borderLeft: idx === 0 ? "none" : "1px solid #e5e7eb", // subtle vertical divider between date groups
                      }}
                    >
                      {col.row.measure_date}
                      <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 800 }}>{fmtDateLong(col.row.measure_date)}</div>
                    </th>
                  ))}
                </tr>

                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      fontSize: 11,
                      opacity: 0.6,
                      borderBottom: "1px solid #f1f5f9",
                      position: "sticky",
                      left: 0,
                      background: "white",
                      zIndex: 2,
                    }}
                  />
                  {displayedWithOlder.map((col, idx) => (
                    <FragmentKey key={`sub-${col.row.measure_date}`}>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 10px",
                          fontSize: 11,
                          opacity: 0.6,
                          borderBottom: "1px solid #f1f5f9",
                          background: "white",
                          borderLeft: idx === 0 ? "none" : "1px solid #e5e7eb",
                        }}
                      >
                        Val
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 10px",
                          fontSize: 11,
                          opacity: 0.6,
                          borderBottom: "1px solid #f1f5f9",
                          background: "white",
                        }}
                      >
                        Δ
                      </th>
                    </FragmentKey>
                  ))}
                </tr>
              </thead>

              <tbody>
                {FIELDS.map((f) => (
                  <tr key={f.key as string} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td
                      style={{
                        padding: "12px 10px",
                        borderBottom: "1px solid #f8fafc",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                        minWidth: 180,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{f.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.55 }}>{f.hint ?? String(f.key)}</div>
                    </td>

                    {displayedWithOlder.map((col, idx) => {
                      const val = col.row[f.key] as number | null;
                      const olderVal = col.older ? ((col.older[f.key] as any) as number | null) : null;
                      const delta = val != null && olderVal != null ? Math.round((val - olderVal) * 10) / 10 : null;

                      return (
                        <FragmentKey key={`${col.row.measure_date}-${String(f.key)}`}>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "12px 10px",
                              borderBottom: "1px solid #f8fafc",
                              fontWeight: 900,
                              borderLeft: idx === 0 ? "none" : "1px solid #e5e7eb", // subtle divider between dates
                              whiteSpace: "nowrap",
                            }}
                          >
                            {val == null ? "—" : val}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "12px 10px",
                              borderBottom: "1px solid #f8fafc",
                              fontWeight: 900,
                              color: deltaColor(delta),
                              whiteSpace: "nowrap",
                            }}
                          >
                            {deltaText(delta)}
                          </td>
                        </FragmentKey>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
          Note: for measurements, negative Δ is usually “good” (smaller). That’s why negatives are green.
        </div>
      </div>

      <div style={{ height: 22 }} />
    </div>
  );
}

/**
 * Simple helper so we can return multiple <th>/<td> with a single key.
 * (JSX.Fragment doesn't accept key when returned as a component unless we wrap it.)
 */
function FragmentKey({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function NavLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        fontWeight: 900,
        color: active ? "#111827" : "#374151",
        opacity: active ? 1 : 0.85,
        borderBottom: active ? "2px solid #7c3aed" : "2px solid transparent",
        paddingBottom: 8,
      }}
    >
      {label}
    </Link>
  );
}