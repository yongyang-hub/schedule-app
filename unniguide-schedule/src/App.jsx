import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { dbGet, dbSet, dbListen } from "./firebase";

const STAFF_DEFAULT = [
  { id: 1,  name: "시아",    nameEn: "Sia",       type: "concierge",  lang: null,        active: true },
  { id: 2,  name: "라라",    nameEn: "Lara",      type: "concierge",  lang: null,        active: true },
  { id: 3,  name: "케브",    nameEn: "Kev",       type: "concierge",  lang: null,        active: true },
  { id: 4,  name: "용",      nameEn: "Yong",      type: "concierge",  lang: null,        active: true },
  { id: 5,  name: "짜니",    nameEn: "Janee",     type: "consultant", lang: "태국",      active: true },
  { id: 6,  name: "페니",    nameEn: "Penny",     type: "consultant", lang: "태국",      active: true },
  { id: 7,  name: "프림",    nameEn: "Prim",      type: "consultant", lang: "태국",      active: true },
  { id: 8,  name: "제이디",  nameEn: "Jady",      type: "consultant", lang: "영미",      active: true },
  { id: 9,  name: "안드레아",nameEn: "Andrea",    type: "consultant", lang: "영미",      active: false },
  { id: 10, name: "클렙초바",nameEn: "Kleptsova", type: "consultant", lang: "영미",      active: false },
  { id: 11, name: "루미",    nameEn: "Rumi",      type: "consultant", lang: "중국/대만", active: true },
  { id: 12, name: "캔디스",  nameEn: "Candice",   type: "consultant", lang: "중국/대만", active: true },
];

const STATUS_CONFIG = {
  "R1":      { label: "1층 리셉션",    color: "#4A90D9", bg: "#EBF4FF", short: "1층" },
  "R2":      { label: "2층 리셉션",    color: "#2E7D9A", bg: "#E0F4F8", short: "2층" },
  "ON-Con":  { label: "온라인 상담",   color: "#2E7D4F", bg: "#E6F5EC", short: "온라인" },
  "OFF-Con": { label: "대면 상담",     color: "#7D5A2E", bg: "#FDF3E6", short: "대면" },
  "OFF":     { label: "휴무",          color: "#E53935", bg: "#FFEBEE", short: "OFF" },
  "ALT":     { label: "대기 및 미합류",color: "#F57C00", bg: "#FFF3E0", short: "대기" },
  "ONBD":    { label: "온보딩",        color: "#7B1FA2", bg: "#F3E5F5", short: "온보딩" },
  "":        { label: "-",            color: "#BBB",    bg: "#F5F5F5", short: "" },
};

const DAYS_KO     = ["일","월","화","수","목","금","토"];
const LANG_GROUPS = ["영미","중국/대만","태국"];
const GROUPS = [
  { label: "🏨 컨시어지",             types: ["concierge"],  langs: null },
  { label: "🇺🇸 영미 컨설턴트",       types: ["consultant"], langs: ["영미"] },
  { label: "🇨🇳 중국/대만 컨설턴트",  types: ["consultant"], langs: ["중국/대만"] },
  { label: "🇹🇭 태국 컨설턴트",       types: ["consultant"], langs: ["태국"] },
];

const font = "'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕','Nanum Gothic',sans-serif";
const C = {
  orange:"#FF6A3B", orangeLight:"#FFF0EB", orangeMid:"#FFD5C8",
  plum:"#330C2E",   plumLight:"#F3EAF2",   plumMid:"#7A3472",
  ivory:"#FBF9F1",  black:"#0D0D0D",       grey:"#929292",
};

const getDays     = (y, m) => new Date(y, m, 0).getDate();
const getFirstDow = (y, m) => new Date(y, m - 1, 1).getDay();

// 대한민국 공휴일 (연도 → 월 → 일 배열)
const KR_HOLIDAYS = {
  2026: {
    1:  [1],              // 신정
    2:  [16, 17, 18],     // 설날 연휴
    3:  [1],              // 삼일절
    5:  [5, 24],          // 어린이날, 부처님오신날
    6:  [6],              // 현충일
    8:  [15],             // 광복절
    9:  [24, 25, 26],     // 추석 연휴
    10: [3, 9],           // 개천절, 한글날
    12: [25],             // 성탄절
  },
};

const HOLIDAY_NAMES = {
  "2026-1-1":   "신정",
  "2026-2-16":  "설날 전날",
  "2026-2-17":  "설날",
  "2026-2-18":  "설날 다음날",
  "2026-3-1":   "삼일절",
  "2026-5-5":   "어린이날",
  "2026-5-24":  "부처님오신날",
  "2026-6-6":   "현충일",
  "2026-8-15":  "광복절",
  "2026-9-24":  "추석 전날",
  "2026-9-25":  "추석",
  "2026-9-26":  "추석 다음날",
  "2026-10-3":  "개천절",
  "2026-10-9":  "한글날",
  "2026-12-25": "성탄절",
};

function initSchedule(staff, y, m) {
  const d = getDays(y, m), s = {};
  const pubHols = new Set(KR_HOLIDAYS[y]?.[m] || []);
  staff.forEach(st => {
    s[st.id] = {};
    for (let i = 1; i <= d; i++) {
      const dow = new Date(y, m - 1, i).getDay();
      s[st.id][i] = (dow === 0 || pubHols.has(i)) ? "OFF" : "";
    }
  });
  return s;
}

function getMarchData(staff) {
  const b = initSchedule(staff, 2026, 3), d = 31;
  const fill = (id, fn) => { if (!b[id]) return; for (let i = 1; i <= d; i++) { const w = new Date(2026, 2, i).getDay(); b[id][i] = fn(i, w); } };
  fill(1,  (i, w) => w === 0 ? "OFF" : i === 8 || i === 22 ? "OFF" : "R1");
  fill(2,  (i, w) => w === 0 ? "OFF" : i <= 7 ? "" : "R1");
  fill(3,  (i, w) => w === 0 ? "OFF" : "R1");
  fill(4,  (i, w) => w === 0 ? "OFF" : "R2");
  fill(5,  (i, w) => w === 0 ? "OFF" : i === 7 ? "OFF" : "OFF-Con");
  fill(6,  (i, w) => w === 0 ? "OFF" : "OFF-Con");
  fill(7,  (i, w) => w === 0 || w === 6 ? "OFF" : i === 7 ? "OFF" : "ON-Con");
  fill(8,  (i, w) => w === 0 ? "OFF" : "OFF-Con");
  fill(11, (i, w) => w === 0 || i <= 6 || i === 23 ? "OFF" : "OFF-Con");
  fill(12, (i, w) => w === 0 || w === 6 ? "OFF" : "OFF-Con");
  return b;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Firebase 경로 헬퍼
const fbSchedule  = (y, m) => `schedule/${y}-${String(m).padStart(2, "0")}`;
const fbStaff     = ()      => `staffList`;
const fbAlt       = (y, m) => `altHolidays/${y}-${String(m).padStart(2, "0")}`;
const fbCancelled = (y, m) => `cancelledHolidays/${y}-${String(m).padStart(2, "0")}`;
const fbLogs      = (y, m) => `logs/${y}-${String(m).padStart(2, "0")}`;

export default function App() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [staffList,    setStaffList]    = useState(STAFF_DEFAULT);
  const [schedule,     setSchedule]     = useState(null);
  const [altHolidays,       setAltHolidays]       = useState(new Set());
  const [cancelledHolidays, setCancelledHolidays] = useState(new Set());
  const [editCell,     setEditCell]     = useState(null);
  const [view,         setView]         = useState("table");
  const [bulkModal,    setBulkModal]    = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [addModal,     setAddModal]     = useState(false);
  const [newStaff,     setNewStaff]     = useState({ name: "", nameEn: "", type: "consultant", lang: "영미" });
  const [longPressTarget, setLongPressTarget] = useState(null);
  const [dayPopup,  setDayPopup]  = useState(null);
  const [logs,      setLogs]      = useState([]);
  const [showLogs,  setShowLogs]  = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [userName,  setUserName]  = useState(() => localStorage.getItem("ug_username") || "");
  const [userNameInput, setUserNameInput] = useState("");
  const longPressTimer     = useRef(null);
  const cellLongPressTimer = useRef(null);
  const cellLongPressed    = useRef(false);
  const unsubRefs = useRef([]);

  const days         = getDays(year, month);
  const activeStaff  = staffList.filter(s => s.active);
  const displayStaff = showInactive ? staffList : activeStaff;

  const pubHolsThisMonth = new Set(KR_HOLIDAYS[year]?.[month] || []);
  const allHolidays = useMemo(() => {
    const h = new Set([...altHolidays]);
    pubHolsThisMonth.forEach(d => { if (!cancelledHolidays.has(d)) h.add(d); });
    return h;
  }, [altHolidays, pubHolsThisMonth, cancelledHolidays]);

  // 실시간 구독
  useEffect(() => {
    setLoading(true);
    unsubRefs.current.forEach(fn => fn());
    unsubRefs.current = [];

    const u1 = dbListen(fbSchedule(year, month), val => {
      if (val) {
        const norm = {};
        Object.keys(val).forEach(sid => {
          norm[sid] = {};
          Object.keys(val[sid]).forEach(d => { norm[sid][d] = val[sid][d]; });
        });
        setSchedule(norm);
      } else {
        const init = initSchedule(staffList, year, month);
        setSchedule(init);
        dbSet(fbSchedule(year, month), init).catch(() => {});
      }
      setLoading(false);
    });
    const u2 = dbListen(fbStaff(), val => { if (val) setStaffList(val); });
    const u3 = dbListen(fbAlt(year, month), val => {
      setAltHolidays(new Set(val ? Object.values(val) : []));
    });
    const u3b = dbListen(fbCancelled(year, month), val => {
      setCancelledHolidays(new Set(val ? Object.values(val) : []));
    });
    const u4 = dbListen(fbLogs(year, month), val => {
      if (val) setLogs(Object.values(val).sort((a, b) => b.ts - a.ts).slice(0, 100));
    });

    unsubRefs.current = [u1, u2, u3, u3b, u4];
    return () => unsubRefs.current.forEach(fn => fn());
  }, [year, month]);

  async function addLog(action) {
    const entry = { user: userName, action, ts: Date.now() };
    try {
      const cur = (await dbGet(fbLogs(year, month))) || {};
      const arr = Object.values(cur).sort((a, b) => b.ts - a.ts).slice(0, 99);
      const next = {};
      [entry, ...arr].forEach((e, i) => { next[i] = e; });
      await dbSet(fbLogs(year, month), next);
    } catch (e) {}
  }

  async function saveSchedule(newSched) {
    setSchedule(newSched);
    try { await dbSet(fbSchedule(year, month), newSched); } catch (e) {}
  }

  async function setStatus(sid, day, st) {
    const prev = schedule[sid]?.[day] ?? "";
    const s = staffList.find(x => x.id == sid);
    await saveSchedule({ ...schedule, [sid]: { ...schedule[sid], [day]: st } });
    await addLog(`${s?.name}(${s?.nameEn}) ${month}/${day} : ${STATUS_CONFIG[prev]?.label || "비우기"} → ${STATUS_CONFIG[st]?.label || "비우기"}`);
  }

  function toggleHoliday(d) {
    const isPub       = pubHolsThisMonth.has(d);
    const isCancelled = cancelledHolidays.has(d);
    const isAlt       = altHolidays.has(d);

    if (isPub) {
      // 공휴일: 취소 ↔ 복원
      setCancelledHolidays(prev => {
        const next = new Set(prev);
        if (isCancelled) {
          next.delete(d);
          const ns = { ...schedule };
          staffList.forEach(st => { if (ns[st.id]) ns[st.id] = { ...ns[st.id], [d]: "OFF" }; });
          saveSchedule(ns);
          addLog(`${month}/${d} 공휴일 복원 (전원 OFF)`);
        } else {
          next.add(d);
          addLog(`${month}/${d} 공휴일 취소`);
        }
        const arr = {}; [...next].forEach((v, i) => (arr[i] = v));
        dbSet(fbCancelled(year, month), arr).catch(() => {});
        return next;
      });
    } else {
      // 수동 휴일: 추가 ↔ 해제
      setAltHolidays(prev => {
        const next = new Set(prev);
        if (isAlt) {
          next.delete(d);
          addLog(`${month}/${d} 휴일 해제`);
        } else {
          next.add(d);
          const ns = { ...schedule };
          staffList.forEach(st => { if (ns[st.id]) ns[st.id] = { ...ns[st.id], [d]: "OFF" }; });
          saveSchedule(ns);
          addLog(`${month}/${d} 휴일 지정 (전원 OFF)`);
        }
        const arr = {}; [...next].forEach((v, i) => (arr[i] = v));
        dbSet(fbAlt(year, month), arr).catch(() => {});
        return next;
      });
    }
  }

  function isWorkDay(staffId, d) {
    const st = schedule?.[staffId]?.[d];
    return !!(st && st !== "OFF" && st !== "");
  }

  const overtimeMap = useMemo(() => {
    if (!schedule) return {};
    const res = {};
    staffList.forEach(s => {
      let ot = 0;
      for (let d = 1; d <= days; ) {
        const dow = new Date(year, month - 1, d).getDay();
        const wk = [];
        for (let i = 0; i < 7 - dow && d + i <= days; i++) wk.push(d + i);
        const worked = wk.filter(day => isWorkDay(s.id, day)).length;
        if (worked > 5) ot += worked - 5;
        d += wk.length;
      }
      res[s.id] = ot;
    });
    return res;
  }, [schedule, days, year, month, staffList]);

  const warnings = useMemo(() => {
    if (!schedule) return [];
    const w = [];
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow === 0 || allHolidays.has(d)) continue;
      const conWorking = activeStaff.filter(s => s.type === "concierge")
        .filter(s => schedule[s.id]?.[d] && !["OFF", ""].includes(schedule[s.id][d]));
      if (conWorking.length === 0) w.push({ day: d, msg: "컨시어지 미배치" });
      else if (conWorking.length === 1) w.push({ day: d, msg: "컨시어지 1명 (2명 필요)" });
      LANG_GROUPS.forEach(lg => {
        const ls = activeStaff.filter(s => s.lang === lg);
        const ws = ls.filter(s => schedule[s.id]?.[d] && !["OFF", ""].includes(schedule[s.id][d]));
        const hasFace = ls.some(s => schedule[s.id]?.[d] === "OFF-Con");
        if (!hasFace) w.push({ day: d, msg: `${lg} 배치 주의` });
        if (ws.length > 0 && ws.every(s => ["ONBD", "ON-Con"].includes(schedule[s.id][d])))
          w.push({ day: d, msg: `${lg} 숙련도 주의`, soft: true });
      });
    }
    return w;
  }, [schedule, year, month, days, activeStaff, allHolidays]);

  const warnDays = new Set(warnings.map(w => w.day));

  async function changeMonth(delta) {
    let m = month + delta, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setYear(y); setMonth(m); setLoading(true);
  }

  async function applyBulk({ staffIds, days: dList, status, fixedOffDays: offDays = [] }) {
    const ns = { ...schedule };
    staffIds.forEach(sid => {
      ns[sid] = { ...ns[sid] };
      dList.forEach(d => { ns[sid][d] = status; });
      offDays.forEach(d => { ns[sid][d] = "OFF"; });
    });
    await saveSchedule(ns);
    const names = staffIds.map(id => staffList.find(s => s.id == id)?.name).join(", ");
    await addLog(`일괄입력: ${names} / ${dList.length}일 ${STATUS_CONFIG[status]?.label || "비우기"}${offDays.length > 0 ? ` + OFF ${offDays.length}일` : ""}`);
  }

  async function deactivateStaff(id) {
    const s = staffList.find(x => x.id === id);
    const nl = staffList.map(st => st.id === id ? { ...st, active: false } : st);
    setStaffList(nl);
    await dbSet(fbStaff(), nl);
    await addLog(`${s?.name}(${s?.nameEn}) 합류 미확정으로 변경`);
    setLongPressTarget(null);
  }

  async function activateStaff(id) {
    const s = staffList.find(x => x.id === id);
    const nl = staffList.map(st => st.id === id ? { ...st, active: true } : st);
    setStaffList(nl);
    await dbSet(fbStaff(), nl);
    if (!schedule[id]) {
      const ns = { ...schedule, [id]: {} };
      for (let d = 1; d <= days; d++) ns[id][d] = new Date(year, month - 1, d).getDay() === 0 ? "OFF" : "";
      await saveSchedule(ns);
    }
    await addLog(`${s?.name}(${s?.nameEn}) 근무표 복귀`);
  }

  async function addNewStaff() {
    if (!newStaff.name.trim()) return;
    const id = Date.now();
    const s = { ...newStaff, id, active: true };
    const nl = [...staffList, s];
    setStaffList(nl);
    await dbSet(fbStaff(), nl);
    const ns = { ...schedule, [id]: {} };
    for (let d = 1; d <= days; d++) ns[id][d] = new Date(year, month - 1, d).getDay() === 0 ? "OFF" : "";
    await saveSchedule(ns);
    await addLog(`신규 직원 추가: ${s.name}(${s.nameEn})`);
    setAddModal(false);
    setNewStaff({ name: "", nameEn: "", type: "consultant", lang: "영미" });
  }

  function downloadBackup() {
    const backup = {
      version: 1, exportedAt: new Date().toISOString(), exportedBy: userName,
      year, month, staffList, schedule, altHolidays: [...altHolidays], logs,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `언니가이드_근무표_${year}${String(month).padStart(2, "0")}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`📦 백업 다운로드`);
  }

  const dayHeaders  = Array.from({ length: days }, (_, i) => { const d = i + 1, dow = new Date(year, month - 1, d).getDay(); return { d, dow }; });
  const roleLabel   = s => s.type === "concierge" ? "컨시어지" : "컨설턴트";

  // ── 이름 입력 화면 ────────────────────────────────────────────
  if (!userName) {
    return (
      <div style={{ fontFamily: font, background: C.ivory, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 300, boxShadow: "0 4px 20px rgba(51,12,46,0.12)", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: C.plum, marginBottom: 6 }}>언니가이드 근무표</div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 20 }}>한글 발음을 입력해주세요</div>
          <input value={userNameInput} onChange={e => setUserNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && userNameInput.trim()) { localStorage.setItem("ug_username", userNameInput.trim()); setUserName(userNameInput.trim()); } }}
            style={{ width: "100%", border: `2px solid ${C.plumMid}40`, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: font, boxSizing: "border-box", outline: "none", marginBottom: 12 }}
            placeholder="예) 제이디, 프림, 캔디스" autoFocus />
          <button onClick={() => { if (userNameInput.trim()) { localStorage.setItem("ug_username", userNameInput.trim()); setUserName(userNameInput.trim()); } }}
            style={{ width: "100%", background: C.plum, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: font }}>
            입장하기
          </button>
        </div>
      </div>
    );
  }

  // ── 로딩 화면 ─────────────────────────────────────────────────
  if (loading || !schedule) {
    return (
      <div style={{ fontFamily: font, background: C.ivory, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 32 }}>⏳</div>
        <div style={{ color: C.plum, fontWeight: 700 }}>데이터 불러오는 중...</div>
      </div>
    );
  }

  // ── 메인 화면 ─────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: font, background: C.ivory, minHeight: "100vh", padding: 14 }}>

      {/* Header */}
      <div style={{ background: C.plum, borderRadius: 14, padding: "16px 20px", marginBottom: 12, boxShadow: "0 2px 12px rgba(51,12,46,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>언니가이드 근무표</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Btn onClick={() => changeMonth(-1)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff" }}>‹</Btn>
            <span style={{ fontWeight: 700, fontSize: 15, minWidth: 72, textAlign: "center", color: "#fff" }}>{year}년 {month}월</span>
            <Btn onClick={() => changeMonth(1)}  style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff" }}>›</Btn>
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            👤 {userName}
            <span style={{ marginLeft: 8, cursor: "pointer", opacity: 0.7 }} onClick={() => { localStorage.removeItem("ug_username"); setUserName(""); }}>변경</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn onClick={() => setBulkModal({})} style={{ background: C.orange, border: "none", color: "#fff" }}>📝 일괄 입력</Btn>
          <Btn onClick={() => setView(v => v === "table" ? "calendar" : "table")} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff" }}>{view === "table" ? "📅 캘린더" : "📊 테이블"}</Btn>
          <Btn onClick={() => setShowInactive(v => !v)} style={{ background: showInactive ? C.orangeLight : "rgba(255,255,255,0.12)", color: showInactive ? C.orange : "#fff", border: "none" }}>
            {showInactive ? "📋 전체 보기 중" : "📋 합류 대기 포함"}
          </Btn>
          <Btn onClick={() => setAddModal(true)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff" }}>+ 직원 추가</Btn>
          <Btn onClick={() => setShowLogs(v => !v)} style={{ background: showLogs ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)", border: "none", color: "#fff" }}>
            🕒 로그{logs.length > 0 && <span style={{ background: C.orange, borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 3 }}>{logs.length}</span>}
          </Btn>
          <Btn onClick={downloadBackup} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff" }}>💾 백업</Btn>
        </div>
      </div>

      {/* 로그 패널 */}
      {showLogs && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", maxHeight: 220, overflowY: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.plum, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            🕒 조작 로그 <span style={{ fontSize: 11, color: C.grey, fontWeight: 400 }}>최근 {logs.length}건 (실시간)</span>
          </div>
          {logs.length === 0 && <div style={{ color: C.grey, fontSize: 12, textAlign: "center", padding: "12px 0" }}>아직 조작 내역이 없어요</div>}
          {logs.map((log, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #F5F5F5", fontSize: 12 }}>
              <span style={{ background: C.plumLight, color: C.plumMid, borderRadius: 6, padding: "2px 7px", fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{log.user}</span>
              <span style={{ color: C.grey, whiteSpace: "nowrap", fontSize: 11 }}>{fmtTime(log.ts)}</span>
              <span style={{ color: C.black, flex: 1 }}>{log.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* 공휴일 배너 */}
      {pubHolsThisMonth.size > 0 && (
        <div style={{ background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: "#C62828", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>🎌 공휴일:</strong>
          {[...pubHolsThisMonth].sort((a, b) => a - b).map(d => {
            const cancelled = cancelledHolidays.has(d);
            const name = HOLIDAY_NAMES[`${year}-${month}-${d}`] || "";
            return (
              <span key={d}
                onClick={() => toggleHoliday(d)}
                style={{ background: cancelled ? "#EEE" : "#FFCDD2", borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: "pointer", color: cancelled ? "#999" : "#B71C1C", textDecoration: cancelled ? "line-through" : "none" }}
                title={cancelled ? "클릭하면 공휴일 복원" : "클릭하면 공휴일 취소"}>
                {month}/{d}{name ? ` ${name}` : ""}({DAYS_KO[new Date(year, month - 1, d).getDay()]}){cancelled ? " (취소됨)" : ""}
              </span>
            );
          })}
        </div>
      )}

      {/* 수동 휴일 배너 */}
      {altHolidays.size > 0 && (
        <div style={{ background: C.orangeLight, border: `1px solid ${C.orangeMid}`, borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.orange, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>📌 지정 휴일:</strong>
          {[...altHolidays].sort((a, b) => a - b).map(d => (
            <span key={d} style={{ background: C.orangeMid, borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: "pointer", color: C.plum }}
              onClick={() => toggleHoliday(d)}>{month}/{d}({DAYS_KO[new Date(year, month - 1, d).getDay()]}) ✕</span>
          ))}
        </div>
      )}

      {/* 합류 미확정 */}
      {!showInactive && staffList.some(s => !s.active) && (
        <div style={{ background: C.plumLight, borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.plumMid, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>⏳ 합류 미확정:</strong>
          {staffList.filter(s => !s.active).map(s => (
            <span key={s.id} style={{ background: "#fff", border: `1px solid ${C.plumMid}50`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontWeight: 600 }}
              onClick={() => activateStaff(s.id)}>{s.name} {s.nameEn} ({s.lang || "컨시어지"}) ＋</span>
          ))}
        </div>
      )}

      {/* 배치 주의 */}
      {warnings.length > 0 && (
        <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: "#6D4C00" }}>
          <strong>⚠️ 배치 주의</strong>
          <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 5 }}>
            {warnings.slice(0, 12).map((w, i) => (
              <span key={i} style={{ background: w.soft ? C.orangeLight : "#FFE082", color: w.soft ? C.orange : "#6D4C00", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>
                {month}/{w.day} {w.msg}
              </span>
            ))}
            {warnings.length > 12 && <span style={{ color: C.grey }}>+{warnings.length - 12}건</span>}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10, alignItems: "center" }}>
        {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([k, v]) => (
          <span key={k} style={{ background: v.bg, color: v.color, border: `1px solid ${v.color}50`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{v.short || v.label}</span>
        ))}
        <span style={{ background: "#FFCDD2", color: "#B71C1C", border: "1px solid #FFCDD2", borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>🎌 공휴일</span>
        <span style={{ background: C.orangeLight, color: C.orange, border: `1px solid ${C.orangeMid}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>📌 지정휴일</span>
        <span style={{ fontSize: 11, color: C.grey, marginLeft: 4 }}>날짜 클릭 → 휴일 설정/취소</span>
      </div>

      {/* 테이블 */}
      {view === "table" && (
        <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <table style={{ borderCollapse: "collapse", background: "#fff", fontSize: 11, width: "100%" }}>
            <thead>
              <tr>
                <th style={th("80px")}>직책</th>
                <th style={th("72px")}>이름</th>
                {dayHeaders.map(({ d, dow }) => {
                  const isPub       = pubHolsThisMonth.has(d) && !cancelledHolidays.has(d);
                  const isAlt       = altHolidays.has(d);
                  const isHol       = isPub || isAlt;
                  return (
                    <th key={d} onClick={() => setDayPopup(d)}
                      style={{ ...th("32px"), background: isPub ? "#FFCDD2" : isAlt ? "#C8E6C9" : warnDays.has(d) ? "#FFF3CD" : dow === 0 ? "#FFEBEE" : dow === 6 ? "#E3F2FD" : "#F0F4FF", color: isPub ? "#B71C1C" : isAlt ? "#2E7D32" : dow === 0 ? "#E53935" : dow === 6 ? "#1565C0" : "#444", cursor: "pointer" }}>
                      <div style={{ fontWeight: 800 }}>{d}</div>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>{DAYS_KO[dow]}</div>
                      {isPub ? <div style={{ fontSize: 9 }}>🎌</div> : isAlt ? <div style={{ fontSize: 9 }}>📌</div> : warnDays.has(d) ? <div style={{ fontSize: 9 }}>⚠</div> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {GROUPS.flatMap((g, gi) => {
                const members = displayStaff.filter(s => g.types.includes(s.type) && (!g.langs || g.langs.includes(s.lang)));
                if (!members.length) return [];
                const gcols = ["#E8F0FE", "#FFF3E0", "#F3E5F5", "#E8F5E9"];
                return [
                  <tr key={`g${gi}`}>
                    <td colSpan={2 + days} style={{ background: gcols[gi % gcols.length], fontWeight: 800, fontSize: 11, padding: "5px 10px", color: "#333", borderBottom: "1px solid #DDD" }}>{g.label}</td>
                  </tr>,
                  ...members.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #F0F0F0", opacity: s.active ? 1 : 0.55 }}>
                      <td style={{ padding: "5px 8px", color: "#666", fontSize: 10, whiteSpace: "nowrap", background: "#FAFAFA", fontWeight: 500 }}>
                        {roleLabel(s)}{!s.active && " (미확정)"}
                      </td>
                      <td style={{ padding: "5px 6px", fontWeight: 800, whiteSpace: "nowrap", fontSize: 11, textAlign: "center", background: "#FAFAFA", cursor: "pointer", userSelect: "none" }}
                        onClick={() => setBulkModal({ preStaff: s.id })}
                        onMouseDown={() => { longPressTimer.current = setTimeout(() => setLongPressTarget(s.id), 600); }}
                        onMouseUp={() => clearTimeout(longPressTimer.current)}
                        onMouseLeave={() => clearTimeout(longPressTimer.current)}
                        onTouchStart={() => { longPressTimer.current = setTimeout(() => setLongPressTarget(s.id), 600); }}
                        onTouchEnd={() => clearTimeout(longPressTimer.current)}>
                        <div>{s.name}</div>
                        <div style={{ fontSize: 9, color: "#999", fontWeight: 600 }}>{s.nameEn}</div>
                        {overtimeMap[s.id] > 0 && (
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: "#E53935", borderRadius: 4, padding: "1px 4px", marginTop: 2, lineHeight: 1.4 }}>
                            초과 +{overtimeMap[s.id]}일
                          </div>
                        )}
                      </td>
                      {dayHeaders.map(({ d, dow }) => {
                        const st  = schedule[s.id]?.[d] ?? "";
                        const cfg = STATUS_CONFIG[st] || STATUS_CONFIG[""];
                        const isPub  = pubHolsThisMonth.has(d) && !cancelledHolidays.has(d);
                        const isAlt  = altHolidays.has(d);
                        const isEdit = editCell?.sid == s.id && editCell?.day === d;
                        return (
                          <td key={d}
                            onClick={() => {
                              if (cellLongPressed.current) return;
                              const cur = schedule[s.id]?.[d] ?? "";
                              setStatus(s.id, d, cur === "OFF" ? "" : "OFF");
                            }}
                            onDoubleClick={() => setEditCell({ sid: s.id, day: d })}
                            onMouseDown={() => {
                              cellLongPressed.current = false;
                              cellLongPressTimer.current = setTimeout(() => {
                                cellLongPressed.current = true;
                                setEditCell({ sid: s.id, day: d });
                              }, 600);
                            }}
                            onMouseUp={() => clearTimeout(cellLongPressTimer.current)}
                            onMouseLeave={() => clearTimeout(cellLongPressTimer.current)}
                            onTouchStart={() => {
                              cellLongPressed.current = false;
                              cellLongPressTimer.current = setTimeout(() => {
                                cellLongPressed.current = true;
                                setEditCell({ sid: s.id, day: d });
                              }, 600);
                            }}
                            onTouchEnd={() => clearTimeout(cellLongPressTimer.current)}
                            onTouchMove={() => clearTimeout(cellLongPressTimer.current)}
                            style={{ background: isEdit ? "#FFF9C4" : st ? cfg.bg : isPub ? "#FFEBEE" : isAlt ? "#F1F8E9" : dow === 0 ? "#FFEBEE" : dow === 6 ? "#E3F2FD" : "#fff", color: cfg.color, fontWeight: 700, fontSize: 10, textAlign: "center", cursor: "pointer", padding: "4px 1px", border: isEdit ? "2px solid #FFC107" : "1px solid #F0F0F0", userSelect: "none", minWidth: 30 }}
                            title={`${s.name} ${month}/${d} ${cfg.label} | 클릭=OFF토글 / 길게누르기=상태선택`}>
                            {cfg.short}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "calendar" && <CalendarView year={year} month={month} days={days} schedule={schedule} warnings={warnings} staff={displayStaff} altHolidays={allHolidays} onDayClick={setDayPopup} />}

      {/* 날짜 팝업 */}
      {dayPopup && (() => {
        const dow         = new Date(year, month - 1, dayPopup).getDay();
        const isPub       = pubHolsThisMonth.has(dayPopup);
        const isCancelled = cancelledHolidays.has(dayPopup);
        const isAlt       = altHolidays.has(dayPopup);
        const holName     = HOLIDAY_NAMES[`${year}-${month}-${dayPopup}`] || "";
        const activePub   = isPub && !isCancelled;
        return (
          <Modal onClose={() => setDayPopup(null)}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>
                {activePub ? "🎌" : isAlt ? "📌" : dow === 0 ? "🔴" : "📅"}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{month}월 {dayPopup}일 ({DAYS_KO[dow]})</div>
              {holName && <div style={{ fontSize: 12, color: "#B71C1C", marginTop: 2, fontWeight: 700 }}>{holName}</div>}
              {activePub && <div style={{ fontSize: 12, color: "#B71C1C", marginTop: 4, fontWeight: 600 }}>공휴일</div>}
              {isPub && isCancelled && <div style={{ fontSize: 12, color: "#999", marginTop: 4, fontWeight: 600 }}>공휴일 (취소됨)</div>}
              {isAlt && <div style={{ fontSize: 12, color: "#2E7D32", marginTop: 4, fontWeight: 600 }}>지정 휴일</div>}
            </div>

            {/* 공휴일 취소/복원 */}
            {isPub && (
              isCancelled ? (
                <>
                  <div style={{ fontSize: 12, color: "#555", textAlign: "center", background: "#E8F5E9", borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    공휴일을 복원하면 모든 직원이 <strong>OFF</strong> 처리됩니다.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: "#B71C1C", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    🎌 공휴일 복원
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#555", textAlign: "center", background: "#FFF3E0", borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    공휴일을 취소하면 일반 근무일로 처리됩니다.<br />개인 스케줄은 직접 수정해주세요.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: "#E65100", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    ✕ 공휴일 취소 (근무일로 변경)
                  </button>
                </>
              )
            )}

            {/* 수동 휴일 해제 / 지정 */}
            {!isPub && (
              isAlt ? (
                <>
                  <div style={{ fontSize: 12, color: "#555", textAlign: "center", background: "#FFF3E0", borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    해제하면 일반 근무일로 처리됩니다.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: "#E65100", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    ✕ 휴일 해제
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#555", textAlign: "center", background: "#E8F5E9", borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    휴일로 지정하면 모든 직원이 자동으로 <strong>OFF</strong> 처리됩니다.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: "#2E7D32", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    📌 휴일로 지정
                  </button>
                </>
              )
            )}

            <button onClick={() => setDayPopup(null)} style={{ width: "100%", background: "#EEE", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>닫기</button>
          </Modal>
        );
      })()}

      {/* 셀 편집 팝업 */}
      {editCell && (
        <Modal onClose={() => setEditCell(null)}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
            {displayStaff.find(s => s.id == editCell.sid)?.name} — {month}/{editCell.day}({DAYS_KO[new Date(year, month - 1, editCell.day).getDay()]})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([k, v]) => {
              const sel = schedule[editCell.sid]?.[editCell.day] === k;
              return <button key={k} onClick={() => { setStatus(editCell.sid, editCell.day, k); setEditCell(null); }} style={{ background: sel ? v.color : v.bg, color: sel ? "#fff" : v.color, border: `2px solid ${v.color}`, borderRadius: 8, padding: "7px 8px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: font }}>{v.label}</button>;
            })}
            <button onClick={() => { setStatus(editCell.sid, editCell.day, ""); setEditCell(null); }} style={{ gridColumn: "1/-1", background: "#F5F5F5", color: "#888", border: "2px solid #DDD", borderRadius: 8, padding: "7px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>비우기 (-)</button>
          </div>
        </Modal>
      )}

      {/* 길게 누르기 팝업 */}
      {longPressTarget && (() => {
        const s = staffList.find(x => x.id === longPressTarget);
        return (
          <Modal onClose={() => setLongPressTarget(null)}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{s?.active ? "😴" : "✅"}</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{s?.name} <span style={{ color: "#999", fontWeight: 600 }}>{s?.nameEn}</span></div>
            </div>
            {s?.active ? (
              <>
                <div style={{ fontSize: 12, color: "#666", textAlign: "center", marginBottom: 14, background: "#FFF3E0", borderRadius: 8, padding: "8px 12px" }}>근무표에서 제외하고 <strong>합류 미확정</strong>으로 이동합니다.</div>
                <button onClick={() => deactivateStaff(longPressTarget)} style={{ width: "100%", background: "#E53935", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>합류 미확정으로 내리기</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#666", textAlign: "center", marginBottom: 14, background: "#E8F5E9", borderRadius: 8, padding: "8px 12px" }}><strong>합류 미확정</strong> 상태입니다.</div>
                <button onClick={() => { activateStaff(longPressTarget); setLongPressTarget(null); }} style={{ width: "100%", background: "#2E7D32", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>근무표에 다시 추가</button>
              </>
            )}
            <button onClick={() => setLongPressTarget(null)} style={{ width: "100%", background: "#EEE", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>취소</button>
          </Modal>
        );
      })()}

      {/* 직원 추가 팝업 */}
      {addModal && (
        <Modal onClose={() => setAddModal(false)}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>+ 직원 추가</div>
          <label style={lbl}>이름 (한글)</label>
          <input value={newStaff.name} onChange={e => setNewStaff(p => ({ ...p, name: e.target.value }))} style={inp(font)} placeholder="예: 홍길동" />
          <label style={lbl}>이름 (영문)</label>
          <input value={newStaff.nameEn} onChange={e => setNewStaff(p => ({ ...p, nameEn: e.target.value }))} style={inp(font)} placeholder="예: Hong" />
          <label style={lbl}>언어권</label>
          <select value={newStaff.lang || ""} onChange={e => setNewStaff(p => ({ ...p, lang: e.target.value || null }))} style={inp(font)}>
            <option value="">없음 (컨시어지)</option>
            <option value="영미">영미</option>
            <option value="중국/대만">중국/대만</option>
            <option value="태국">태국</option>
          </select>
          <label style={lbl}>유형</label>
          <select value={newStaff.type} onChange={e => setNewStaff(p => ({ ...p, type: e.target.value }))} style={inp(font)}>
            <option value="concierge">컨시어지</option>
            <option value="consultant">컨설턴트</option>
          </select>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={addNewStaff} style={{ flex: 1, background: C.plum, color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font }}>추가</button>
            <button onClick={() => setAddModal(false)} style={{ flex: 1, background: "#EEE", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>취소</button>
          </div>
        </Modal>
      )}

      {/* 일괄 입력 */}
      {bulkModal && (
        <BulkModal staff={displayStaff} days={days} month={month} year={year} preStaff={bulkModal.preStaff}
          onApply={async cfg => { await applyBulk(cfg); setBulkModal(null); }}
          onClose={() => setBulkModal(null)} font={font} />
      )}
    </div>
  );
}

// ── BulkModal ─────────────────────────────────────────────────
function BulkModal({ staff, days, month, year, preStaff, onApply, onClose, font }) {
  const [step, setStep] = useState(1);
  const [selStaff, setSelStaff] = useState(preStaff ? [preStaff] : []);
  const [dateFrom, setDateFrom] = useState(1);
  const [dateTo,   setDateTo]   = useState(days);
  const [fixedOffDows, setFixedOffDows] = useState([0]);
  const [status, setStatus] = useState("OFF-Con");

  const toggleStaff = id  => setSelStaff(p => p.includes(id)  ? p.filter(x => x !== id)  : [...p, id]);
  const toggleDow   = dow => setFixedOffDows(p => p.includes(dow) ? p.filter(x => x !== dow) : [...p, dow]);

  const from = Math.min(dateFrom, dateTo), to = Math.max(dateFrom, dateTo);

  const workDays = (() => {
    const a = [];
    for (let d = from; d <= to; d++) {
      const w = new Date(year, month - 1, d).getDay();
      if (fixedOffDows.includes(w)) continue;
      a.push(d);
    }
    return a;
  })();

  const fixedOffDays = (() => {
    const a = [];
    for (let d = from; d <= to; d++) {
      const w = new Date(year, month - 1, d).getDay();
      if (fixedOffDows.includes(w)) a.push(d);
    }
    return a;
  })();

  const stepLabels = ["① 직원 선택", "② 날짜 범위", "③ 상태 선택"];

  return (
    <Modal onClose={onClose} wide>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>📝 일정 일괄 입력</div>
      <div style={{ display: "flex", marginBottom: 18, borderRadius: 8, overflow: "hidden", border: "1px solid #DDE3F0" }}>
        {stepLabels.map((l, i) => (
          <button key={i} onClick={() => setStep(i + 1)}
            style={{ flex: 1, padding: "8px 4px", background: step === i + 1 ? C.plum : step > i + 1 ? "#D0E8FF" : "#F5F7FF", color: step === i + 1 ? "#fff" : step > i + 1 ? "#2060A0" : "#AAA", fontWeight: 700, fontSize: 11, border: "none", cursor: "pointer", fontFamily: font, borderRight: i < 2 ? "1px solid #DDE3F0" : "none" }}>
            {l}{step > i + 1 ? " ✓" : ""}
          </button>
        ))}
      </div>

      {step === 1 && (
        <>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>근무 일정을 넣을 직원을 선택하세요.</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            <button onClick={() => setSelStaff(staff.map(s => s.id))} style={chipStyle("#E3F2FD", "#1565C0", false, font)}>전체 선택</button>
            <button onClick={() => setSelStaff([])} style={chipStyle("#EEE", "#777", false, font)}>전체 해제</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {staff.map(s => {
              const sel = selStaff.includes(s.id);
              return (
                <button key={s.id} onClick={() => toggleStaff(s.id)}
                  style={{ background: sel ? C.plum : "#F0F4FF", color: sel ? "#fff" : "#444", border: `2px solid ${sel ? C.plum : "#C8D8F0"}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                  {s.name} <span style={{ fontSize: 10, opacity: 0.8 }}>{s.nameEn}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => selStaff.length && setStep(2)}
            style={{ width: "100%", background: selStaff.length ? C.plum : "#CCC", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: selStaff.length ? "pointer" : "not-allowed", fontFamily: font }}>
            다음 → {selStaff.length ? `${selStaff.length}명 선택됨` : "직원을 선택하세요"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>적용할 날짜 범위를 설정하세요.</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{month}월 시작일</label>
              <input type="number" min={1} max={days} value={dateFrom} onChange={e => setDateFrom(Math.max(1, Math.min(days, +e.target.value)))} style={inp(font)} />
            </div>
            <div style={{ paddingTop: 22, color: "#999", fontSize: 18 }}>~</div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{month}월 종료일</label>
              <input type="number" min={1} max={days} value={dateTo} onChange={e => setDateTo(Math.max(1, Math.min(days, +e.target.value)))} style={inp(font)} />
            </div>
          </div>
          <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6D4C00", marginBottom: 8 }}>
              📌 고정 휴무 <span style={{ fontWeight: 400, color: "#999" }}>— 매주 반복 OFF (일요일 자동 제외)</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["일", 0], ["토", 6], ["월", 1], ["화", 2], ["수", 3], ["목", 4], ["금", 5]].map(([name, dow]) => {
                const sel = fixedOffDows.includes(dow);
                return (
                  <button key={dow} onClick={() => toggleDow(dow)}
                    style={{ flex: 1, background: sel ? "#E53935" : "#F5F5F5", color: sel ? "#fff" : dow === 0 ? "#E53935" : dow === 6 ? "#1565C0" : "#555", border: `2px solid ${sel ? "#E53935" : dow === 0 ? "#FFCDD2" : dow === 6 ? "#90CAF9" : "#DDD"}`, borderRadius: 8, padding: "6px 0", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                    {name}
                  </button>
                );
              })}
            </div>
            {fixedOffDows.length > 0 && (
              <div style={{ fontSize: 11, color: "#E65100", marginTop: 8, fontWeight: 600 }}>
                → {fixedOffDows.map(d => ["일", "월", "화", "수", "목", "금", "토"][d]).join(", ")}요일 ({fixedOffDays.length}일) 자동 OFF
              </div>
            )}
          </div>
          <div style={{ background: "#F0F8FF", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#4A90D9", marginBottom: 14, fontWeight: 600 }}>
            📅 {month}/{from} ~ {month}/{to} → 근무 <strong>{workDays.length}일</strong>
            {fixedOffDays.length > 0 && <span style={{ color: "#E53935" }}> + 고정 휴무 <strong>{fixedOffDays.length}일</strong> OFF</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, background: "#EEE", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>← 이전</button>
            <button onClick={() => workDays.length && setStep(3)} style={{ flex: 2, background: workDays.length ? C.plum : "#CCC", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontWeight: 800, fontSize: 13, cursor: workDays.length ? "pointer" : "not-allowed", fontFamily: font }}>다음 →</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>근무 날에 적용할 상태를 선택하세요.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
            {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([k, v]) => (
              <button key={k} onClick={() => setStatus(k)}
                style={{ background: status === k ? v.color : v.bg, color: status === k ? "#fff" : v.color, border: `2px solid ${v.color}`, borderRadius: 8, padding: "8px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                {v.label}
              </button>
            ))}
            <button onClick={() => setStatus("")}
              style={{ gridColumn: "1/-1", background: status === "" ? "#888" : "#F5F5F5", color: status === "" ? "#fff" : "#888", border: "2px solid #CCC", borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
              비우기 (-)
            </button>
          </div>
          <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 14, lineHeight: 1.8 }}>
            <strong>📋 적용 요약</strong><br />
            👤 <strong>{staff.filter(s => selStaff.includes(s.id)).map(s => s.name).join(", ")}</strong><br />
            📅 <strong>{month}/{from} ~ {month}/{to}</strong><br />
            🏷 근무 {workDays.length}일 → <strong style={{ color: STATUS_CONFIG[status]?.color }}>{STATUS_CONFIG[status]?.label || "비우기"}</strong>
            {fixedOffDays.length > 0 && <><br />😴 고정 휴무 <strong style={{ color: "#E53935" }}>{fixedOffDays.length}일 OFF</strong></>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(2)} style={{ flex: 1, background: "#EEE", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>← 이전</button>
            <button onClick={() => onApply({ staffIds: selStaff, days: workDays, status, fixedOffDays })}
              style={{ flex: 2, background: "#2E7D32", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font }}>
              ✅ {selStaff.length}명 적용
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── CalendarView ──────────────────────────────────────────────
function CalendarView({ year, month, days, schedule, warnings, staff, altHolidays, onDayClick }) {
  const firstDow = getFirstDow(year, month);
  const warnMap  = {};
  warnings.forEach(w => { if (!warnMap[w.day]) warnMap[w.day] = []; warnMap[w.day].push(w.msg); });
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = new Date();

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, marginBottom: 6 }}>
        {DAYS_KO.map((d, i) => <div key={i} style={{ textAlign: "center", fontWeight: 800, fontSize: 12, color: i === 0 ? "#E53935" : i === 6 ? "#1565C0" : "#555" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dow     = new Date(year, month - 1, d).getDay();
          const isAlt   = altHolidays.has(d);
          const working = staff.filter(s => schedule[s.id]?.[d] && !["OFF", ""].includes(schedule[s.id][d]));
          const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;
          return (
            <div key={d} onClick={() => onDayClick(d)}
              style={{ border: `2px solid ${warnMap[d] ? "#FFB300" : isToday ? C.plum : isAlt ? "#66BB6A" : "#E8ECF0"}`, borderRadius: 8, padding: "5px 6px", minHeight: 80, background: isAlt ? "#F1F8E9" : isToday ? C.plumLight : dow === 0 ? "#FFF5F5" : "#FAFAFA", cursor: "pointer" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: isAlt ? "#2E7D32" : dow === 0 ? "#E53935" : dow === 6 ? "#1565C0" : "#222", marginBottom: 3, display: "flex", justifyContent: "space-between" }}>
                {d} {isAlt ? "🔄" : warnMap[d] ? "⚠️" : ""}
              </div>
              {working.slice(0, 4).map(s => {
                const cfg = STATUS_CONFIG[schedule[s.id][d]] || STATUS_CONFIG[""];
                return <div key={s.id} style={{ fontSize: 9, background: cfg.bg, color: cfg.color, borderRadius: 3, padding: "1px 3px", marginBottom: 2, fontWeight: 700, display: "flex", justifyContent: "space-between" }}><span>{s.name}</span><span>{cfg.short}</span></div>;
              })}
              {working.length > 4 && <div style={{ fontSize: 9, color: "#999" }}>+{working.length - 4}명</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────
function Modal({ children, onClose, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: wide ? 520 : 280, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── 공통 스타일 헬퍼 ──────────────────────────────────────────
const Btn = ({ children, onClick, style = {} }) => (
  <button onClick={onClick} style={{ background: C.plumLight, border: `1px solid ${C.plumMid}40`, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: C.plum, fontFamily: font, ...style }}>{children}</button>
);
const th = w => ({ padding: "5px 3px", textAlign: "center", fontWeight: 800, fontSize: 11, background: "#F0F4FF", borderBottom: "2px solid #D0D8F0", borderRight: "1px solid #E8ECF0", minWidth: w, maxWidth: w, position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap", cursor: "pointer" });
const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 5, marginTop: 10 };
const inp = f => ({ width: "100%", border: "1px solid #DDD", borderRadius: 7, padding: "7px 10px", fontSize: 13, fontFamily: f, boxSizing: "border-box", outline: "none" });
const chipStyle = (bg, color, sel, font) => ({ background: bg, color, border: `2px solid ${sel ? color : "transparent"}`, borderRadius: 7, padding: "4px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font });
