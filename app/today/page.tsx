"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Entry = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  week_number: number;
  day_in_week: number; // Tue=1 ... Mon=7

  weight: number | null;
  steps: number | null;
  calories: number | null;
  protein: number | null;
  fiber: number | null;
  fat: number | null;
  carbs: number | null;
  mood: string | null;

  is_injection_day: boolean;
  dose_mg: number | null;
  injection_site: string | null;
};

type Exercise = {
  id: string;
  entry_id: string;
  exercise_type: string;
  minutes: number | null;
  created_at?: string;
};

const WEEK1_START = "2025-12-30"; // Tue

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function asISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Tue=1 ... Mon=7
function dayInWeekFromISO(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const js = d.getDay(); // Sun=0 Mon=1 Tue=2 ... Sat=6
  // Convert to Tue=1 ... Mon=7
  // Tue(2)->1, Wed(3)->2, Thu(4)->3, Fri(5)->4, Sat(6)->5, Sun(0)->6, Mon(1)->7
  const map: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6, 1: 7 };
  return map[js];
}

function weekNumberFromISO(iso: string) {
  const start = new Date(WEEK1_START + "T00:00:00");
  const d = new Date(iso + "T00:00:00");
  const diffMs = d.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

function nOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const num = Number(t);
  return Number.isFinite(num) ? num : null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

const injectionSites = [
  "",
  "Left Abdomen",
  "Right Abdomen",
  "Left Thigh",
  "Right Thigh",
  "Left Arm",
  "Right Arm",
  "Other",
];

export default function AddEntryPage() {
    const [userId, setUserId] = useState<string | null>(null);
    const [sessionChecked, setSessionChecked] = useState(false);
    const [signedIn, setSignedIn] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);

  // Load session once + keep it updated
  useEffect(() => {
    let sub: any;

    (async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setUserId(session?.user?.id ?? null);
      });

      sub = listener.subscription;
    })();

    return () => sub?.unsubscribe?.();
  }, []);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error" | "ok">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [date, setDate] = useState<string>(isoToday());

  const [entryId, setEntryId] = useState<string | null>(null);

  // entry fields (form)
  const [weight, setWeight] = useState<string>("");
  const [steps, setSteps] = useState<string>("");
  const [calories, setCalories] = useState<string>("");
  const [protein, setProtein] = useState<string>("");
  const [fiber, setFiber] = useState<string>("");
  const [fat, setFat] = useState<string>("");
  const [carbs, setCarbs] = useState<string>("");
  const [mood, setMood] = useState<string>("");

  const [isInjectionDay, setIsInjectionDay] = useState<boolean>(false);
  const [doseMg, setDoseMg] = useState<string>("");
  const [injectionSite, setInjectionSite] = useState<string>("");

  // exercises for selected date
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exType, setExType] = useState<string>("");
  const [exMinutes, setExMinutes] = useState<string>("");

  const weekNumber = useMemo(() => weekNumberFromISO(date), [date]);
  const dayInWeek = useMemo(() => dayInWeekFromISO(date), [date]);

  // Load entry + exercises whenever date changes
  useEffect(() => {
    let ignore = false;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (ignore) return;

      setSignedIn(!!data.session);
      setSessionChecked(true);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setSessionChecked(true);
    });

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  
  useEffect(() => {
    async function load() {
      setStatus("loading");
      setErrorMsg("");

      // Load entry by unique entry_date
      if (!userId) {
        setStatus("error");
        setErrorMsg("Please sign in first.");
        return;
      }

      const { data: row, error } = await supabase
        .from("entries")
        .select("*")
        .eq("user_id", userId)
        .eq("entry_date", date)
        .maybeSingle();

      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }

      if (!row) {
        // New entry (blank)
        setEntryId(null);
        setWeight("");
        setSteps("");
        setCalories("");
        setProtein("");
        setFiber("");
        setFat("");
        setCarbs("");
        setMood("");
        setIsInjectionDay(false);
        setDoseMg("");
        setInjectionSite("");
        setExercises([]);
        setStatus("ok");
        return;
      }

      const e = row as Entry;
      setEntryId(e.id);
      setWeight(e.weight?.toString() ?? "");
      setSteps(e.steps?.toString() ?? "");
      setCalories(e.calories?.toString() ?? "");
      setProtein(e.protein?.toString() ?? "");
      setFiber(e.fiber?.toString() ?? "");
      setFat(e.fat?.toString() ?? "");
      setCarbs(e.carbs?.toString() ?? "");
      setMood(e.mood ?? "");
      setIsInjectionDay(!!e.is_injection_day);
      setDoseMg(e.dose_mg?.toString() ?? "");
      setInjectionSite(e.injection_site ?? "");

      // Load exercises by entry_id
      const { data: exRows, error: exErr } = await supabase
        .from("exercises")
        .select("*")
        .eq("user_id", userId)
        .eq("entry_id", e.id)
        .order("created_at", { ascending: false });

      if (exErr) {
        setStatus("error");
        setErrorMsg(exErr.message);
        return;
      }

      setExercises((exRows ?? []) as Exercise[]);
      setStatus("ok");
    }

    load();
  }, [date, userId]);

  async function refresh() {
    // trigger by changing date to itself (quick hack)
    setDate((d) => d);
  }

  async function saveEntry() {
    setStatus("saving");
    setErrorMsg("");

    if (!userId) {
  setStatus("error");
  setErrorMsg("Please sign in first.");
  return;
}

    const payload = {
      user_id: userId,              // ✅ ADD THIS
      entry_date: date,
      week_number: weekNumber,
      day_in_week: dayInWeek,

      weight: nOrNull(weight),
      steps: nOrNull(steps),
      calories: nOrNull(calories),
      protein: nOrNull(protein),
      fiber: nOrNull(fiber),
      fat: nOrNull(fat),
      carbs: nOrNull(carbs),
      mood: mood.trim() ? mood.trim() : null,

      is_injection_day: isInjectionDay,
      dose_mg: isInjectionDay ? nOrNull(doseMg) : null,
      injection_site: isInjectionDay ? (injectionSite || null) : null,
    };

    // Upsert on unique key (entry_date)
    const { data, error } = await supabase
      .from("entries")
      .upsert(payload, { onConflict: "entry_date" })
      .select("*")
      .single();

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    const saved = data as Entry;
    setEntryId(saved.id);

    // If user turned off injection day, clear local fields
    if (!isInjectionDay) {
      setDoseMg("");
      setInjectionSite("");
    }

    // Reload exercises (in case entry id changed from null to real)
    const { data: exRows, error: exErr } = await supabase
      .from("exercises")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_id", saved.id)
      .order("created_at", { ascending: false });

    if (exErr) {
      setStatus("error");
      setErrorMsg(exErr.message);
      return;
    }

    setExercises((exRows ?? []) as Exercise[]);
    setStatus("ok");
  }

  async function deleteEntry() {
    if (!entryId) return;

    const ok = confirm("Delete this entry (and its exercises)?");
    if (!ok) return;

    setStatus("saving");
    setErrorMsg("");

    // delete exercises first (FK-safe even if you don’t have FK constraints)
    const { error: exErr } = await supabase.from("exercises").delete().eq("user_id", userId).eq("entry_id", entryId);
    if (exErr) {
      setStatus("error");
      setErrorMsg(exErr.message);
      return;
    }

    const { error } = await supabase.from("entries").delete().eq("user_id", userId).eq("id", entryId);
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    // reset to blank
    setEntryId(null);
    setWeight("");
    setSteps("");
    setCalories("");
    setProtein("");
    setFiber("");
    setFat("");
    setCarbs("");
    setMood("");
    setIsInjectionDay(false);
    setDoseMg("");
    setInjectionSite("");
    setExercises([]);
    setStatus("ok");
  }

  async function addExercise() {
    if (!userId) {
      alert("Please sign in first.");
      return;
    }
    
    if (!entryId) {
      alert("Save the entry first (so it has an ID), then add exercises.");
      return;
    }
    const t = exType.trim();
    if (!t) return;

    setStatus("saving");
    setErrorMsg("");

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        user_id: userId,
        entry_id: entryId,
        exercise_type: t,
        minutes: nOrNull(exMinutes),
      })
      .select("*")
      .single();

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    setExercises((prev) => [data as Exercise, ...prev]);
    setExType("");
    setExMinutes("");
    setStatus("ok");
  }

  async function deleteExercise(exId: string) {
    const ok = confirm("Delete this exercise?");
    if (!ok) return;

    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("exercises").delete().eq("user_id", userId).eq("id", exId);
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    setExercises((prev) => prev.filter((x) => x.id !== exId));
    setStatus("ok");
  }

  return (

    <div style={{ padding: 28, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>Add / Edit Entry</div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>Pick a date, then save, edit, or delete.</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>
          {status === "loading" || status === "saving" ? "⏳ Working..." : status === "ok" ? "✅ Ready" : status === "error" ? "❌ Error" : ""}
        </div>
        {status === "error" ? <div style={{ color: "#b91c1c" }}>{errorMsg}</div> : null}
        <button onClick={refresh} style={ghostBtn}>
          Refresh
        </button>
      </div>

      <div style={{ height: 16 }} />

      {/* Entry Form */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={label}>Date</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
            </div>

            <div style={miniBox}>
              <div style={miniLabel}>Week</div>
              <div style={miniValue}>W{weekNumber}</div>
            </div>

            <div style={miniBox}>
              <div style={miniLabel}>Day</div>
              <div style={miniValue}>D{dayInWeek}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={saveEntry} style={primaryBtn} disabled={status === "saving" || status === "loading"}>
              Save
            </button>
            <button onClick={deleteEntry} style={dangerBtn} disabled={!entryId || status === "saving" || status === "loading"}>
              Delete
            </button>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={grid4}>
          <Field labelTxt="Weight (lbs)" value={weight} setValue={setWeight} />
          <Field labelTxt="Steps" value={steps} setValue={setSteps} />
          <Field labelTxt="Calories" value={calories} setValue={setCalories} />
          <div>
            <div style={label}>Mood</div>
            <input value={mood} onChange={(e) => setMood(e.target.value)} style={input} placeholder="good / ok / etc" />
          </div>

          <Field labelTxt="Protein (g)" value={protein} setValue={setProtein} />
          <Field labelTxt="Fiber (g)" value={fiber} setValue={setFiber} />
          <Field labelTxt="Fat (g)" value={fat} setValue={setFat} />
          <Field labelTxt="Carbs (g)" value={carbs} setValue={setCarbs} />
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
            <input type="checkbox" checked={isInjectionDay} onChange={(e) => setIsInjectionDay(e.target.checked)} />
            Injection day
          </label>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", opacity: isInjectionDay ? 1 : 0.5 }}>
            <div>
              <div style={label}>Dose (mg)</div>
              <input
                value={doseMg}
                onChange={(e) => setDoseMg(e.target.value)}
                style={input}
                placeholder="e.g., 5"
                disabled={!isInjectionDay}
              />
            </div>

            <div>
              <div style={label}>Injection site</div>
              <select value={injectionSite} onChange={(e) => setInjectionSite(e.target.value)} style={input} disabled={!isInjectionDay}>
                {injectionSites.map((s) => (
                  <option key={s || "__"} value={s}>
                    {s || "—"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      {/* Exercises */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Exercises (for this date)</div>
          <div style={{ opacity: 0.7 }}>{exercises.length} logged</div>
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px", gap: 12, alignItems: "end" }}>
          <div>
            <div style={label}>Type</div>
            <input value={exType} onChange={(e) => setExType(e.target.value)} style={input} placeholder="Yoga / Resistance Bands / Walking..." />
          </div>
          <div>
            <div style={label}>Minutes</div>
            <input value={exMinutes} onChange={(e) => setExMinutes(e.target.value)} style={input} placeholder="20" />
          </div>
          <button onClick={addExercise} style={ghostBtn} disabled={status === "saving" || status === "loading"}>
            + Add
          </button>
        </div>

        <div style={{ height: 12 }} />

        {entryId ? (
          exercises.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {exercises.map((ex) => (
                <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid #eee", borderRadius: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 900 }}>{ex.exercise_type}</div>
                    <div style={{ opacity: 0.7 }}>{ex.minutes != null ? `${ex.minutes} min` : ""}</div>
                  </div>
                  <button onClick={() => deleteExercise(ex.id)} style={tinyDangerBtn}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>No exercises yet.</div>
          )
        ) : (
          <div style={{ opacity: 0.7 }}>Save this entry first, then add exercises.</div>
        )}
      </div>
    </div>
  );
}

function Field({ labelTxt, value, setValue }: { labelTxt: string; value: string; setValue: (v: string) => void }) {
  return (
    <div>
      <div style={label}>{labelTxt}</div>
      <input value={value} onChange={(e) => setValue(e.target.value)} style={input} />
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 20,
  padding: 18,
  background: "white",
};

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const label: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  marginBottom: 6,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d9d9d9",
  borderRadius: 12,
  outline: "none",
};

const miniBox: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 14,
  padding: "10px 12px",
  minWidth: 90,
};

const miniLabel: React.CSSProperties = { fontSize: 12, opacity: 0.7, fontWeight: 700 };
const miniValue: React.CSSProperties = { fontSize: 18, fontWeight: 900 };

const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 900,
  color: "white",
  background: "linear-gradient(90deg, #2563eb, #7c3aed)",
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 900,
  color: "#991b1b",
  background: "#fff",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 900,
  background: "#fff",
  cursor: "pointer",
};

const tinyDangerBtn: React.CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 900,
  color: "#991b1b",
  background: "#fff",
  cursor: "pointer",
};

const pillBtn: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 999,
  padding: "8px 12px",
  fontWeight: 900,
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
};