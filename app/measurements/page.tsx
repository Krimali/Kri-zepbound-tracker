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

const FIELDS: { key: keyof MeasurementRow; label: string }[] = [
  { key: "neck", label: "Neck" },
  { key: "shoulder", label: "Shoulder" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "abdomen", label: "Abdomen" },
  { key: "hip", label: "Hip" },
  { key: "l_bicep", label: "Left Bicep" },
  { key: "r_bicep", label: "Right Bicep" },
  { key: "l_thigh", label: "Left Thigh" },
  { key: "r_thigh", label: "Right Thigh" },
  { key: "l_calf", label: "Left Calf" },
  { key: "r_calf", label: "Right Calf" },
];

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDateLong(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toNumOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function deltaColor(delta: number | null) {
  if (delta == null) return "#6b7280";
  if (delta < 0) return "#047857";
  if (delta > 0) return "#b45309";
  return "#6b7280";
}

function deltaText(delta: number | null) {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function buildEmptyForm() {
  const init: Record<string, string> = {};
  for (const f of FIELDS) init[f.key as string] = "";
  return init;
}

export default function MeasurementsPage() {
  const [status, setStatus] = useState<string>("Loading...");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(isoToday());

  const [form, setForm] = useState<Record<string, string>>(buildEmptyForm);

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
  }, []);

  useEffect(() => {
    const existing = rows.find((r) => r.measure_date === selectedDate);
    if (!existing) {
      setForm(buildEmptyForm());
      return;
    }

    const next: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = existing[f.key] as number | null;
      next[f.key as string] = v == null ? "" : String(v);
    }
    setForm(next);
  }, [selectedDate, rows]);

  const selectedExisting = useMemo(
    () => rows.find((r) => r.measure_date === selectedDate) ?? null,
    [rows, selectedDate]
  );

  const displayed = useMemo(() => {
    const sorted = [...rows].sort((a, b) =>
      b.measure_date.localeCompare(a.measure_date)
    );
    if (sorted.length === 0) return [];

    const newest = sorted.slice(0, 4);
    const oldest = sorted[sorted.length - 1];

    const map = new Map<string, MeasurementRow>();
    for (const r of newest) map.set(r.measure_date, r);
    map.set(oldest.measure_date, oldest);

    return Array.from(map.values()).sort((a, b) =>
      b.measure_date.localeCompare(a.measure_date)
    );
  }, [rows]);

  const displayedWithOlder = useMemo(() => {
    return displayed.map((row, i) => ({
      row,
      older: i + 1 < displayed.length ? displayed[i + 1] : null,
    }));
  }, [displayed]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = { measure_date: selectedDate };
      for (const f of FIELDS) {
        payload[f.key] = toNumOrNull(form[f.key as string] ?? "");
      }

      const { error } = await supabase.from("measurements").upsert(payload, {
        onConflict: "measure_date",
      });

      if (error) throw error;

      await loadAll();
      setForm(buildEmptyForm());
      setSelectedDate(isoToday());
      setStatus("✅ Saved");
    } catch (e: any) {
      console.error(e);
      setStatus(`❌ ${e?.message ?? "Save failed"}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow() {
    if (!selectedExisting) {
      setStatus("No record for selected date.");
      return;
    }

    const ok = confirm(`Delete measurement for ${selectedDate}?`);
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("measurements")
        .delete()
        .eq("measure_date", selectedDate);

      if (error) throw error;

      await loadAll();
      setForm(buildEmptyForm());
      setSelectedDate(isoToday());
      setStatus("✅ Deleted");
    } catch (e: any) {
      console.error(e);
      setStatus(`❌ ${e?.message ?? "Delete failed"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 12px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 900 }}>Measurements</div>
      </div>

      <div style={{ marginBottom: 12, fontWeight: 800 }}>{status}</div>

      {/* Add / Edit */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>Add / Edit</div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Date</div>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={dateInputStyle}
            />

            <button
              onClick={save}
              disabled={saving}
              style={{
                ...primaryBtnStyle,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              onClick={deleteRow}
              disabled={!selectedExisting || saving}
              style={{
                ...dangerBtnStyle,
                opacity: !selectedExisting || saving ? 0.5 : 1,
                cursor: !selectedExisting || saving ? "not-allowed" : "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {FIELDS.map((f) => (
            <div key={f.key as string}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 }}>
                {f.label}
              </div>
              <input
                inputMode="decimal"
                placeholder="—"
                value={form[f.key as string] ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    [f.key as string]: e.target.value,
                  }))
                }
                style={fieldInputStyle}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 14 }} />

      {/* All measurements */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          padding: 16,
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>All Measurements</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Latest 4 dates + oldest 1 date. Δ compares to the next older date on the right.
          </div>
        </div>

        {displayedWithOlder.length === 0 ? (
          <div style={{ padding: "10px 0", opacity: 0.7 }}>No measurements yet.</div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #eef2f7",
              borderRadius: 16,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 860,
                background: "white",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      fontSize: 12,
                      opacity: 0.75,
                      borderBottom: "1px solid #eef2f7",
                      background: "white",
                      position: "sticky",
                      left: 0,
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
                        padding: "12px 10px",
                        fontSize: 13,
                        fontWeight: 900,
                        borderBottom: "1px solid #eef2f7",
                        background: "white",
                        borderLeft: idx === 0 ? "none" : "1px solid #e5e7eb",
                      }}
                    >
                      {fmtDateLong(col.row.measure_date)}
                    </th>
                  ))}
                </tr>

                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      fontSize: 11,
                      opacity: 0.55,
                      borderBottom: "1px solid #eef2f7",
                      background: "white",
                      position: "sticky",
                      left: 0,
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
                          opacity: 0.55,
                          borderBottom: "1px solid #eef2f7",
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
                          opacity: 0.55,
                          borderBottom: "1px solid #eef2f7",
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
                  <tr key={f.key as string}>
                    <td
                      style={{
                        padding: "12px 10px",
                        borderBottom: "1px solid #f3f4f6",
                        background: "white",
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        minWidth: 180,
                        fontWeight: 900,
                        color: "#111827",
                      }}
                    >
                      {f.label}
                    </td>

                    {displayedWithOlder.map((col, idx) => {
                      const val = col.row[f.key] as number | null;
                      const olderVal = col.older ? ((col.older[f.key] as any) as number | null) : null;
                      const delta =
                        val != null && olderVal != null
                          ? Math.round((val - olderVal) * 10) / 10
                          : null;

                      return (
                        <FragmentKey key={`${col.row.measure_date}-${String(f.key)}`}>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "12px 10px",
                              borderBottom: "1px solid #f3f4f6",
                              fontWeight: 900,
                              borderLeft: idx === 0 ? "none" : "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {val == null ? "—" : val}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "12px 10px",
                              borderBottom: "1px solid #f3f4f6",
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
          Negative Δ is usually “good” for body measurements, so negatives are shown in green.
        </div>
      </div>
    </div>
  );
}

function FragmentKey({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const dateInputStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 800,
};

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 800,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  color: "white",
  fontWeight: 900,
  background: "#111827",
};

const dangerBtnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontWeight: 900,
  background: "#fff",
};