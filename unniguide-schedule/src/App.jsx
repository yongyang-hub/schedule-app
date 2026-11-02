import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { dbGet, dbSet, dbListen, authListen, authGoogleLogin, authLogout } from "./firebase";
import {
  KR_HOLIDAYS, getDays, isClosedSunday, closedSundaysOf,
  makeCalendar, computeBaseline, capacityNotes, evaluatePerson, breakdownText,
} from '../lib/workload.js';
import { SUPPLY_LANGS, DEFAULT_SLOTS, normalizeSupplySettings, computeSupply, shareFromPercent } from '../lib/supply.js';

const ALLOWED_EMAIL_DOMAIN = "healingpaper.com";
const ADMIN_EMAILS = ["yong.yang@healingpaper.com", "moka.lee@healingpaper.com"];
const INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000; // 8시간 무활동 시 자동 로그아웃
const LAST_ACTIVITY_KEY = "ug_last_activity";

// 예전 이메일/비밀번호 계정 → 한글 이름 (최초 프로필 설정 시 이름 자동완성용, 소스오브트루스는 아님)
const EMAIL_TO_NAME = {
  "yong.yang@healingpaper.com":     "용",
  "aubrey.plouf@healingpaper.com":  "오브리",
  "jady.hong@healingpaper.com":     "제이디",
  "lexi.kliautsova@healingpaper.com": "렉시",
  "lumi.liu@healingpaper.com":      "루미",
  "candice.xin@healingpaper.com":   "캔디스",
  "primrose.sa@healingpaper.com":   "프림",
  "penny.chavairin@healingpaper.com": "페니",
  "janee.kaewmanee@healingpaper.com": "짜니",
  "moka.lee@healingpaper.com":      "모카",
  "kev.choi@healingpaper.com":      "케브",
  "yun.jang@healingpaper.com":      "윤",
  "lara.thun@healingpaper.com":     "라라",
};

const STAFF_DEFAULT = [
  { id: 1,  name: "시아",    nameEn: "Sia",       type: "concierge",  lang: null,        active: true },
  { id: 2,  name: "라라",    nameEn: "Lara",      type: "concierge",  lang: null,        active: true, email: "lara.thun@healingpaper.com" },
  { id: 3,  name: "케브",    nameEn: "Kev",       type: "concierge",  lang: null,        active: true, email: "kev.choi@healingpaper.com" },
  { id: 4,  name: "용",      nameEn: "Yong",      type: "concierge",  lang: null,        active: true, email: "yong.yang@healingpaper.com" },
  { id: 5,  name: "짜니",    nameEn: "Janee",     type: "consultant", lang: "태국",      active: true, email: "janee.kaewmanee@healingpaper.com" },
  { id: 6,  name: "페니",    nameEn: "Penny",     type: "consultant", lang: "영미",      altLangs: ["태국"], active: true, email: "penny.chavairin@healingpaper.com" },
  { id: 7,  name: "프림",    nameEn: "Prim",      type: "consultant", lang: "태국",      active: true, email: "primrose.sa@healingpaper.com" },
  { id: 8,  name: "제이디",  nameEn: "Jady",      type: "consultant", lang: "영미",      onlineOnly: true, active: true, email: "jady.hong@healingpaper.com" },
  { id: 9,  name: "안드레아",nameEn: "Andrea",    type: "consultant", lang: "영미",      active: false },
  { id: 10, name: "클렙초바",nameEn: "Kleptsova", type: "consultant", lang: "영미",      active: false },
  { id: 11, name: "루미",    nameEn: "Rumi",      type: "consultant", lang: "중국/대만", active: true, email: "lumi.liu@healingpaper.com" },
  { id: 12, name: "캔디스",  nameEn: "Candice",   type: "consultant", lang: "중국/대만", active: true, email: "candice.xin@healingpaper.com" },
  { id: 13, name: "마미",    nameEn: "Mami",      type: "consultant", lang: "일본",      active: true, email: "mami.yun@healingpaper.com" },
];

// 배경은 모두 흰색으로 통일하고, 의미는 글자 색으로만 구분 (화사한 화이트 톤)
const STATUS_CONFIG = {
  "R1":      { label: "1층 컨시어지",  color: "#330C2E", bg: "#FFFFFF", short: "1층" },
  "R2":      { label: "2층 컨시어지",  color: "#7A3472", bg: "#FFFFFF", short: "2층" },
  "ON-Con":  { label: "온라인 상담",   color: "#E5572B", bg: "#FFFFFF", short: "온라인" },
  "OFF-Con": { label: "대면 상담",     color: "#D94A1F", bg: "#FFFFFF", short: "대면" },
  "OFF":     { label: "휴무",          color: "#B3B3B3", bg: "#FFFFFF", short: "OFF" },
  "VAC":     { label: "휴가",          color: "#717171", bg: "#FFFFFF", short: "휴가" },
  "VAC-AM":  { label: "오전 반차",     color: "#717171", bg: "#FFFFFF", short: "오전반" },
  "VAC-PM":  { label: "오후 반차",     color: "#717171", bg: "#FFFFFF", short: "오후반" },
  "ALT":     { label: "대기 및 미합류",color: "#B3B3B3", bg: "#FFFFFF", short: "대기" },
  "ONBD":    { label: "온보딩",        color: "#7A3472", bg: "#FFFFFF", short: "온보딩" },
  "":        { label: "-",            color: "#C8C8C8", bg: "#FFFFFF", short: "" },
};

const DAYS_KO     = ["일","월","화","수","목","금","토"];
const LANG_GROUPS = ["영미","중국/대만","태국","일본"];
const LANG_LABEL  = { "영미": "영어", "중국/대만": "중국어", "태국": "태국어", "일본": "일본어" };
const LANG_MIN    = { "영미": 2, "중국/대만": 1, "태국": 1, "일본": 1 }; // 일자별 언어권 최소 배치 (복지 기준)
const ROOMS       = [1, 2, 4, 5, 6, 7, 8]; // 상담방 (3번 = 워킹룸이라 제외, 총 7개)
// 언어권별 "선호" 방 — 더 이상 고정 홈룸이 아니라 동적 배정 시 우선순위 힌트로만 사용 (아래 roomMap 참고)
const ZONE_ROOMS  = { "영미": [1, 2, 4], "중국/대만": [5, 6], "태국": [7, 8] };
const CONSULT_ORDER = ["제이디", "오브리", "렉시", "페니", "캔디스", "루미", "짜니", "프림", "마미"]; // 표시·배정 우선순위
const consultOrd = (name) => { const i = CONSULT_ORDER.indexOf(name); return i < 0 ? 999 : i; };
const ROOM_FROM   = 202607; // 방 배정 로직 적용 시작월(YYYYMM). 이전 달은 이전 버전(방 번호 미표시)
const GROUPS = [
  { label: "컨시어지",            types: ["concierge"],  langs: null },
  { label: "영어 컨설턴트",        types: ["consultant"], langs: ["영미"] },
  { label: "중국/대만 컨설턴트",   types: ["consultant"], langs: ["중국/대만"] },
  { label: "태국 컨설턴트",        types: ["consultant"], langs: ["태국"] },
  { label: "일본어 컨설턴트",      types: ["consultant"], langs: ["일본"] },
];

const font = "'SUIT','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
// 언니가이드 BI 팔레트 — Orange(포인트) · Plum/Ivory(보조) · 모노톤 그레이
const C = {
  orange:"#FF6A3B", orangeDark:"#D94A1F", orangeLight:"#FFF0EB", orangeMid:"#FFD5C8",
  plum:"#330C2E",   plumLight:"#F3EAF2",  plumMid:"#7A3472",
  ivory:"#FBF9F1",  white:"#FFFFFF",      black:"#0D0D0D",      grey:"#929292",
  line:"#E8E8E8",   g1:"#F5F5F5", g2:"#D4D4D4", g3:"#B3B3B3", g5:"#717171", g6:"#4F4F4F", g7:"#2E2E2E",
};

const getFirstDow = (y, m) => new Date(y, m - 1, 1).getDay();

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
      s[st.id][i] = (isClosedSunday(y, m, i) || pubHols.has(i) || !st.active) ? "OFF" : (st.onlineOnly ? "ON-Con" : "");
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
const fbRoomOverride = (y, m) => `roomOverrides/${y}-${String(m).padStart(2, "0")}`;
const fbUserProfile  = (uid)   => `userProfiles/${uid}`;
const fbJoinRequests = ()      => `joinRequests`;
const fbSupplySettings = ()    => `supplySettings`; // 언어권별 상담사 1인당 하루 슬롯 수 (관리자 설정)
const fbShareOverrides = ()    => `supplyShareOverrides`; // { [staffId]: { [언어권]: % } } — 상담 언어 비율 관리자 고정값

// 신규 로그인 사용자가 1차로 선택할 수 있는 역할 — GROUPS/LANG_GROUPS와 동일한 분류
const ROLE_OPTIONS = [
  { key: "concierge", label: "컨시어지",        type: "concierge", lang: null },
  { key: "영미",      label: "영어 컨설턴트",     type: "consultant", lang: "영미" },
  { key: "중국/대만",  label: "중국/대만 컨설턴트", type: "consultant", lang: "중국/대만" },
  { key: "태국",      label: "태국 컨설턴트",     type: "consultant", lang: "태국" },
  { key: "일본",      label: "일본어 컨설턴트",    type: "consultant", lang: "일본" },
];

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
  const [staffModal,   setStaffModal]   = useState(null); // null | { mode:"add" } | { mode:"edit", staff }
  const [deleteArmed,  setDeleteArmed]  = useState(false);
  const [longPressTarget, setLongPressTarget] = useState(null);
  const [dayPopup,  setDayPopup]  = useState(null);
  const [logs,      setLogs]      = useState([]);
  const [showLogs,  setShowLogs]  = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [roomOverrides, setRoomOverrides] = useState({}); // { [staffId]: { [day]: roomNumber } } — 강제배치
  const [authUser,    setAuthUser]    = useState(undefined); // undefined=확인중 · null=미로그인 · object=로그인됨
  const [domainError, setDomainError] = useState("");
  const [loginBusy,   setLoginBusy]   = useState(false);
  const [userProfile, setUserProfile] = useState(undefined); // undefined=확인중 · null=최초로그인(설정 필요) · object={koreanName,englishName}
  const [profileForm,   setProfileForm]   = useState({ koreanName: "", englishName: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [joinRequests,  setJoinRequests]  = useState({}); // { [uid]: {email,koreanName,englishName,roleKey,roleLabel,type,lang,status,createdAt} }
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [supplySettingsRaw, setSupplySettingsRaw] = useState(null);
  const [shareOverrides, setShareOverrides] = useState({});
  const userName = userProfile?.koreanName || "";
  const isAdmin = !!(authUser && ADMIN_EMAILS.includes(authUser.email));
  const myStaff = (authUser && staffList.find(s => s.email && s.email === authUser.email)) || null;
  const myJoinRequest = (authUser && joinRequests[authUser.uid]) || null;
  const pendingJoinRequests = Object.entries(joinRequests || {}).filter(([, r]) => r.status === "pending");
  const canEditStaff = sid => isAdmin || (myStaff && myStaff.id == sid); // 관리자는 전체, 일반 직원은 본인 줄만

  useEffect(() => authListen(setAuthUser), []);

  // 8시간 무활동 시 자동 로그아웃 — 마지막 활동 시각을 localStorage에 기록해두고
  // 활동 이벤트·주기적 체크·탭 복귀 시 체크에서 기준 초과하면 즉시 로그아웃
  useEffect(() => {
    if (!authUser) return;

    const markActivity = () => localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    const checkInactivity = () => {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
      if (Date.now() - last > INACTIVITY_LIMIT_MS) authLogout();
    };

    markActivity();
    checkInactivity();

    let throttled = false;
    const onActivity = () => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => { throttled = false; }, 30000); // 활동 기록은 30초에 한 번만
      markActivity();
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkInactivity);
    const interval = setInterval(checkInactivity, 60 * 1000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", checkInactivity);
      clearInterval(interval);
    };
  }, [authUser]);

  // 로그인 상태가 바뀌면: 도메인 검증 후 프로필(userProfiles/{uid}) 조회
  useEffect(() => {
    if (authUser === undefined) return;
    if (!authUser) { setUserProfile(undefined); return; }
    if (!authUser.email || !authUser.email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      setDomainError(`${ALLOWED_EMAIL_DOMAIN} 계정으로만 로그인할 수 있습니다.`);
      authLogout();
      return;
    }
    setDomainError("");
    dbGet(fbUserProfile(authUser.uid)).then(profile => {
      if (profile) {
        setUserProfile(profile);
      } else {
        setUserProfile(null);
        setProfileForm({ koreanName: EMAIL_TO_NAME[authUser.email] || "", englishName: "" });
      }
    });
  }, [authUser]);

  async function handleGoogleLogin() {
    setDomainError("");
    setLoginBusy(true);
    try {
      await authGoogleLogin();
    } catch (err) {
      if (err?.code !== "auth/popup-closed-by-user") {
        setDomainError(`로그인에 실패했습니다 (${err?.code || err?.message || "알 수 없는 오류"}). 다시 시도해주세요.`);
      }
    } finally {
      setLoginBusy(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (!profileForm.koreanName.trim() || !profileForm.englishName.trim()) return;
    setProfileSaving(true);
    const profile = { koreanName: profileForm.koreanName.trim(), englishName: profileForm.englishName.trim(), email: authUser.email, createdAt: Date.now() };
    try {
      await dbSet(fbUserProfile(authUser.uid), profile);
      setUserProfile(profile);
    } finally {
      setProfileSaving(false);
    }
  }
  const longPressTimer     = useRef(null);
  const cellLongPressTimer = useRef(null);
  const cellLongPressed    = useRef(false);
  const unsubRefs = useRef([]);

  const days         = getDays(year, month);
  const activeStaff  = staffList.filter(s => s.active);
  const displayStaff = showInactive ? staffList : activeStaff;
  const ym = year * 100 + month;
  const dateNum = (y, m, d) => y * 10000 + m * 100 + d;
  const phaseAt = (s, y, m, d) => {            // pre(미합류) / onboard(온보딩) / active(대면)
    const dn = dateNum(y, m, d);
    if (s.joinDate && dn < s.joinDate) return "pre";
    if (s.activeDate && dn < s.activeDate) return "onboard";
    return "active";
  };
  const phaseOf = (s, d) => phaseAt(s, year, month, d); // 현재 월 기준
  const roomReady = ym >= ROOM_FROM;                    // 방 배정 로직은 2026-07부터

  const pubHolsThisMonth = new Set(KR_HOLIDAYS[year]?.[month] || []);
  const allHolidays = useMemo(() => {
    const h = new Set([...altHolidays]);
    pubHolsThisMonth.forEach(d => { if (!cancelledHolidays.has(d)) h.add(d); });
    return h;
  }, [altHolidays, pubHolsThisMonth, cancelledHolidays]);

  // 실시간 구독 (로그인 후에만 — DB 규칙이 인증된 사용자만 허용)
  useEffect(() => {
    if (!authUser) return;
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
        // 일요일 전면 휴무 정규화 — SUNDAY_CLOSE 이후 일요일에 이미 저장돼 있던 근무 셀을 OFF로 덮어쓴다.
        // 바뀐 게 있을 때만 DB에 되써서, 리스너가 다시 돌아도 두 번째부터는 no-op이 된다.
        const sunOff = closedSundaysOf(year, month);
        let sunFixed = false;
        if (sunOff.length) {
          Object.keys(norm).forEach(sid => {
            sunOff.forEach(d => { if (norm[sid][d] !== "OFF") { norm[sid][d] = "OFF"; sunFixed = true; } });
          });
        }
        setSchedule(norm);
        if (sunFixed) dbSet(fbSchedule(year, month), norm).catch(() => {});
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
    const u6 = dbListen(fbRoomOverride(year, month), val => setRoomOverrides(val || {}));
    const u7 = dbListen(fbJoinRequests(), val => setJoinRequests(val || {}));
    const u8 = dbListen(fbSupplySettings(), val => setSupplySettingsRaw(val));
    const u9 = dbListen(fbShareOverrides(), val => setShareOverrides(val || {}));

    unsubRefs.current = [u1, u2, u3, u3b, u4, u6, u7, u8, u9];
    return () => unsubRefs.current.forEach(fn => fn());
  }, [year, month, authUser]);

  async function setRoomOverride(sid, day, room) {
    const next = { ...roomOverrides, [sid]: { ...(roomOverrides[sid] || {}) } };
    if (room) next[sid][day] = room; else delete next[sid][day];
    if (Object.keys(next[sid]).length === 0) delete next[sid];
    setRoomOverrides(next);
    try { await dbSet(fbRoomOverride(year, month), next); } catch (e) {}
    const s = staffList.find(x => x.id == sid);
    await addLog(room ? `${s?.name} ${month}/${day} 방 강제지정: ${room}번` : `${s?.name} ${month}/${day} 방 강제지정 해제`);
  }

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
    // 미운영 일요일은 전체 공통 OFF 고정 — 다른 상태로 바꾸려는 시도는 무시한다.
    if (isClosedSunday(year, month, day) && st !== "OFF") return;
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

  // ── 소정근로일수 · 미달 알림 ──────────────────────────────────────────
  // 계산 규칙은 lib/workload.js 한 곳에 있다 (앱과 서버 알림이 같은 기준을 쓰도록).
  const cal = useMemo(
    () => makeCalendar(year, month, { alt: altHolidays, cancelled: cancelledHolidays }),
    [year, month, altHolidays, cancelledHolidays]
  );
  const baseline = useMemo(() => computeBaseline(cal), [cal]);
  const capacityAlerts = useMemo(() => capacityNotes(cal), [cal]);

  // 이번 달을 보고 있으면 보충 가능일은 오늘 이후만 센다
  const fromDay = useMemo(() => {
    const now = new Date();
    return (now.getFullYear() === year && now.getMonth() + 1 === month) ? now.getDate() : 1;
  }, [year, month]);

  const workloadMap = useMemo(() => {
    if (!schedule) return {};
    const res = {};
    staffList.forEach(s => {
      // 비활성(퇴사·휴직)은 이후 전 일자가 OFF로 채워져 있어 부족이 과하게 잡힌다 — 배지 제외.
      if (!s.active) { res[s.id] = null; return; }
      res[s.id] = evaluatePerson(cal, {
        statusOf:   d => schedule?.[s.id]?.[d],
        isActiveOn: d => phaseOf(s, d) === "active",
        fromDay,
      });
    });
    return res;
  }, [schedule, staffList, cal, fromDay]);

  // 부족한 사람만 추려 알림으로 — 아직 안 짜인 달은 대상에서 뺀다.
  const shortfalls = useMemo(() => activeStaff
    .map(s => ({ s, w: workloadMap[s.id] }))
    .filter(({ w }) => w && w.diff < 0 && w.actual > 0)
    .map(({ s, w }) => ({ id: s.id, name: s.name, short: -w.diff, openLeft: w.openLeft, needVac: w.needVac, detail: breakdownText(w), actual: w.actual, required: w.required }))
    .sort((a, b) => b.needVac - a.needVac || b.short - a.short),
    [activeStaff, workloadMap]);


  // ── 대면 상담 공급량 (관리자 화면) ── 계산 규칙은 lib/supply.js, 지난 달 추이는 SupplyView가 따로 불러온다
  const supplySettings = useMemo(() => normalizeSupplySettings(supplySettingsRaw), [supplySettingsRaw]);

  async function saveShareOverride(sid, pct) {
    const s = staffList.find(x => x.id == sid);
    await dbSet(`${fbShareOverrides()}/${sid}`, pct || null);
    await addLog(pct
      ? `${s?.name} 상담 언어 비율 고정: ` + SUPPLY_LANGS.filter(lg => +pct[lg]).map(lg => `${LANG_LABEL[lg]} ${pct[lg]}%`).join(", ")
      : `${s?.name} 상담 언어 비율 고정 해제 (근무표 언어 기준)`);
  }

  async function saveSupplySettings(next) {
    const norm = normalizeSupplySettings(next);
    await dbSet(fbSupplySettings(), norm);
    await addLog(`1인당 하루 슬롯 설정 변경: ` + SUPPLY_LANGS.map(lg => `${LANG_LABEL[lg]} 평일 ${norm[lg].weekday}·토 ${norm[lg].saturday}`).join(", "));
  }

  // 상담방 배정 — 온라인 전담(onlineOnly) 제외한 대면 상담사에게 상담방(ROOMS) 배정.
  // 1) 홈룸: 대면 담당 인원이 방 수(7) 이내인 동안은 CONSULT_ORDER 순으로 개인별 고정방 배정(이동 0).
  //    같은 언어권 선호 방을 우선 쓰되, 자기 언어권 방이 다 찼으면 다른 언어권 여유 방으로 스필오버
  //    (예전처럼 언어권별로 방을 딱 잘라 나누면 총량은 남는데 특정 언어권만 모자란 경우가 생겨서 개선).
  // 2) 정원 초과분(홈룸 없는 인원)은 매일 "전일 방 유지 우선 + 같은 언어권 선호"로 동적 배정.
  // 3) 강제배치(roomOverrides)가 있으면 최종적으로 덮어씀 (관리자가 직접 지정, 중복 허용).
  const roomMap = useMemo(() => {
    if (!schedule) return {};
    const consultants = staffList.filter(s => s.active && s.type === "consultant" && !s.onlineOnly);
    const ordered = [...consultants].sort((a, b) => consultOrd(a.name) - consultOrd(b.name));

    const home = {};
    const homeUsed = new Set();
    ordered.forEach(s => {
      if (homeUsed.size >= ROOMS.length) return;
      const zonePref = (ZONE_ROOMS[s.lang] || []).filter(r => !homeUsed.has(r));
      const anyFree  = ROOMS.filter(r => !homeUsed.has(r));
      const pick = zonePref.length ? zonePref[0] : anyFree[0];
      if (pick != null) { home[s.id] = pick; homeUsed.add(pick); }
    });

    const map = {}; consultants.forEach(s => { map[s.id] = {}; });
    const prev = {};
    for (let d = 1; d <= days; d++) {
      const face = consultants.filter(s => schedule[s.id]?.[d] === "OFF-Con" && phaseAt(s, year, month, d) === "active")
        .sort((a, b) => consultOrd(a.name) - consultOrd(b.name));
      const used = new Set();
      face.forEach(s => { // 홈룸 보유자: 자기 방 (이동 0)
        if (home[s.id] != null && !used.has(home[s.id])) { map[s.id][d] = home[s.id]; used.add(home[s.id]); prev[s.id] = home[s.id]; }
      });
      face.forEach(s => { // 홈룸 없는 인원: 전일 방 유지 우선
        if (map[s.id][d] != null) return;
        if (prev[s.id] != null && !used.has(prev[s.id])) { map[s.id][d] = prev[s.id]; used.add(prev[s.id]); }
      });
      face.forEach(s => { // 그다음: 같은 언어권 선호, 없으면 남는 방 아무거나
        if (map[s.id][d] != null) return;
        const freeAll = ROOMS.filter(r => !used.has(r));
        const freeZone = (ZONE_ROOMS[s.lang] || []).filter(r => !used.has(r));
        const pick = freeZone.length ? freeZone[0] : freeAll[0];
        if (pick != null) { map[s.id][d] = pick; used.add(pick); }
        else map[s.id][d] = 0; // 방 부족
      });
      face.forEach(s => { if (map[s.id][d]) prev[s.id] = map[s.id][d]; });
    }

    Object.keys(roomOverrides).forEach(sid => { // 강제배치 최종 적용
      if (!map[sid]) map[sid] = {};
      Object.entries(roomOverrides[sid] || {}).forEach(([day, room]) => { map[sid][day] = room; });
    });

    return map;
  }, [schedule, staffList, days, ym, roomOverrides]);

  // 방 중복 사용 — 강제배치로 같은 날 같은 방을 두 명이 쓰게 된 경우 표시용
  const roomDupByDay = useMemo(() => {
    const dup = {};
    for (let d = 1; d <= days; d++) {
      const counts = {};
      Object.values(roomMap).forEach(byDay => { const r = byDay?.[d]; if (r) counts[r] = (counts[r] || 0) + 1; });
      dup[d] = new Set(Object.keys(counts).filter(r => counts[r] > 1).map(Number));
    }
    return dup;
  }, [roomMap, days]);

  const warnings = useMemo(() => {
    if (!schedule) return [];
    const w = [];
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (isClosedSunday(year, month, d) || allHolidays.has(d)) continue;
      const notWorking = ["OFF", "VAC", ""];
      const conWorking = activeStaff.filter(s => s.type === "concierge" && phaseOf(s, d) === "active")
        .filter(s => schedule[s.id]?.[d] && !notWorking.includes(schedule[s.id][d]));
      if (conWorking.length === 0) w.push({ day: d, msg: "컨시어지 미배치" });
      else if (conWorking.length === 1) w.push({ day: d, msg: "컨시어지 1명 (2명 필요)" });
      LANG_GROUPS.forEach(lg => {
        // 주언어 + 보조 언어(altLangs)를 모두 해당 언어 케파로 인정 (페니 = 영어+태국)
        const ls = activeStaff.filter(s => (s.lang === lg || (s.altLangs || []).includes(lg)) && phaseOf(s, d) === "active");
        const working = ls.filter(s => schedule[s.id]?.[d] && !notWorking.includes(schedule[s.id][d]));
        const min = LANG_MIN[lg] ?? 1;
        if (working.length < min) {
          const hasVacInGroup = ls.some(s => schedule[s.id]?.[d] === "VAC");
          w.push({ day: d, msg: `${LANG_LABEL[lg] || lg} ${working.length}/${min}명`, operational: hasVacInGroup });
        }
      });

      // 방 부족 — 대면(OFF-Con) 인원 중 방을 못 받은(0) 사람이 있는 날. 강제배치로 채워지면 자동으로 사라짐.
      if (year * 100 + month >= ROOM_FROM) {
        const faceToday = activeStaff.filter(s => s.type === "consultant" && !s.onlineOnly && phaseOf(s, d) === "active" && schedule[s.id]?.[d] === "OFF-Con");
        const shortCount = faceToday.filter(s => !roomMap[s.id]?.[d]).length;
        if (shortCount > 0) w.push({ day: d, msg: `방 부족 (대면 ${faceToday.length}/${ROOMS.length})`, operational: true });
      }
    }
    return w;
  }, [schedule, year, month, days, activeStaff, allHolidays, roomMap]);

  const warnDays = new Set(warnings.map(w => w.day));

  // 이번주 하이라이트 — 실제 오늘이 속한 주(일~토)만, 조회 중인 월이 이번달일 때만 표시
  const weeklyHighlights = useMemo(() => {
    if (!schedule) return null;
    const nowD = new Date();
    if (nowD.getFullYear() !== year || nowD.getMonth() + 1 !== month) return null;
    const weekStart = nowD.getDate() - nowD.getDay();
    const weekEnd = weekStart + 6;
    const weekDays = [];
    for (let d = 1; d <= days; d++) if (d >= weekStart && d <= weekEnd) weekDays.push(d);

    const vacations = [];
    activeStaff.forEach(s => {
      weekDays.forEach(d => {
        const st = schedule[s.id]?.[d];
        if (st === "VAC" || st === "VAC-AM" || st === "VAC-PM") {
          vacations.push({ name: s.name, day: d, label: STATUS_CONFIG[st]?.short || st });
        }
      });
    });

    const weekWarnings = warnings.filter(w => weekDays.includes(w.day));

    return { weekDays, vacations, weekWarnings };
  }, [schedule, year, month, days, activeStaff, warnings]);

  async function changeMonth(delta) {
    let m = month + delta, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setYear(y); setMonth(m); setLoading(true);
  }

  async function applyBulk({ staffIds, days: dList, status, fixedOffDays: offDays = [] }) {
    const ns = { ...schedule };
    // 미운영 일요일이 범위에 섞여 들어와도 근무로 찍히지 않게 OFF로 돌린다.
    const isSunOff = d => isClosedSunday(year, month, d);
    staffIds.forEach(sid => {
      ns[sid] = { ...ns[sid] };
      dList.forEach(d => { ns[sid][d] = isSunOff(d) ? "OFF" : status; });
      offDays.forEach(d => { ns[sid][d] = "OFF"; });
    });
    await saveSchedule(ns);
    const names = staffIds.map(id => staffList.find(s => s.id == id)?.name).join(", ");
    const applied = dList.filter(d => !isSunOff(d)).length;
    await addLog(`일괄입력: ${names} / ${applied}일 ${STATUS_CONFIG[status]?.label || "비우기"}${offDays.length > 0 ? ` + OFF ${offDays.length}일` : ""}`);
  }

  // 비활성 처리되는 사람의 "오늘 이후" 스케줄을 전부 OFF로 반영 (그 이전 근무 이력은 그대로 보존).
  // 현재 조회 중인 달이 실제 이번달이면 그 달만 즉시 패치, 이미 존재하는 미래 달들도 전부 OFF로 채움.
  async function blankFutureToOff(id) {
    const now = new Date();
    const ry = now.getFullYear(), rm = now.getMonth() + 1, rd = now.getDate();
    const isViewedRealMonth = year === ry && month === rm;
    if (isViewedRealMonth) {
      const ns = { ...schedule, [id]: { ...(schedule[id] || {}) } };
      for (let d = rd; d <= days; d++) ns[id][d] = "OFF";
      await saveSchedule(ns);
    } else {
      const daysInRealMonth = getDays(ry, rm);
      const personSched = { ...((await dbGet(fbSchedule(ry, rm))) || {})[id] };
      for (let d = rd; d <= daysInRealMonth; d++) personSched[d] = "OFF";
      await dbSet(`${fbSchedule(ry, rm)}/${id}`, personSched);
    }
    const curKey = `${ry}-${String(rm).padStart(2, "0")}`;
    const allSchedules = (await dbGet("schedule")) || {};
    for (const mkey of Object.keys(allSchedules)) {
      if (mkey <= curKey) continue; // 과거·이번달은 위에서 이미 처리했거나 건드리지 않음
      const [fy, fm] = mkey.split("-").map(Number);
      const daysInMonth = getDays(fy, fm);
      const personSched = {};
      for (let d = 1; d <= daysInMonth; d++) personSched[d] = "OFF";
      await dbSet(`schedule/${mkey}/${id}`, personSched);
    }
  }

  async function deactivateStaff(id, { onLeave = false } = {}) {
    const s = staffList.find(x => x.id === id);
    const nl = staffList.map(st => st.id === id ? { ...st, active: false, onLeave } : st);
    setStaffList(nl);
    await dbSet(fbStaff(), nl);
    await blankFutureToOff(id);
    await addLog(`${s?.name}(${s?.nameEn}) ${onLeave ? "휴직 처리" : "합류 미확정으로 변경"} (이전 근무 이력 보존, 이후 전부 OFF)`);
    setLongPressTarget(null);
  }

  async function activateStaff(id) {
    const s = staffList.find(x => x.id === id);
    const nl = staffList.map(st => st.id === id ? { ...st, active: true, onLeave: false } : st);
    setStaffList(nl);
    await dbSet(fbStaff(), nl);
    if (!schedule[id]) {
      const ns = { ...schedule, [id]: {} };
      for (let d = 1; d <= days; d++) ns[id][d] = isClosedSunday(year, month, d) ? "OFF" : "";
      await saveSchedule(ns);
    }
    await addLog(`${s?.name}(${s?.nameEn}) 근무표 복귀`);
  }

  async function saveStaff(data, editId) {
    if (!data.name.trim()) return;
    const clean = { ...data, altLangs: (data.altLangs || []).filter(l => l !== data.lang) };
    if (editId) {
      const s = staffList.find(x => x.id === editId);
      const nl = staffList.map(st => st.id === editId ? { ...st, ...clean } : st);
      setStaffList(nl);
      await dbSet(fbStaff(), nl);
      await addLog(`직원 정보 수정: ${clean.name}(${clean.nameEn})`);
    } else {
      const id = Date.now();
      const s = { ...clean, id, active: true };
      const nl = [...staffList, s];
      setStaffList(nl);
      await dbSet(fbStaff(), nl);
      const ns = { ...schedule, [id]: {} };
      for (let d = 1; d <= days; d++) ns[id][d] = isClosedSunday(year, month, d) ? "OFF" : "";
      await saveSchedule(ns);
      await addLog(`신규 직원 추가: ${s.name}(${s.nameEn})`);
    }
    setStaffModal(null);
  }

  // 신규 로그인 사용자의 1차 역할 선택 → 승인 대기 상태로 등록
  async function submitJoinRequest(roleKey) {
    const role = ROLE_OPTIONS.find(r => r.key === roleKey);
    if (!role || !authUser || !userProfile) return;
    setRoleSubmitting(true);
    try {
      const req = {
        uid: authUser.uid, email: authUser.email,
        koreanName: userProfile.koreanName, englishName: userProfile.englishName,
        roleKey: role.key, roleLabel: role.label, type: role.type, lang: role.lang,
        status: "pending", createdAt: Date.now(),
      };
      await dbSet(`${fbJoinRequests()}/${authUser.uid}`, req);
      setJoinRequests(p => ({ ...p, [authUser.uid]: req }));
    } finally {
      setRoleSubmitting(false);
    }
  }

  // 관리자: 가입 신청 승인 → staffList에 신규 직원으로 등록 (saveStaff의 신규 추가 로직과 동일)
  async function approveJoinRequest(uid) {
    const req = joinRequests[uid];
    if (!req) return;
    try {
      const id = Date.now();
      const s = { id, name: req.koreanName, nameEn: req.englishName, type: req.type, lang: req.lang ?? null, active: true, email: req.email };
      const nl = [...staffList, s];
      await dbSet(fbStaff(), nl); // DB 저장 먼저 — 성공해야만 화면 상태를 바꾸고 승인 처리로 넘어감
      setStaffList(nl);
      const ns = { ...schedule, [id]: {} };
      for (let d = 1; d <= days; d++) ns[id][d] = isClosedSunday(year, month, d) ? "OFF" : "";
      await dbSet(fbSchedule(year, month), ns);
      setSchedule(ns);
      await dbSet(`${fbJoinRequests()}/${uid}/status`, "approved");
      setJoinRequests(p => ({ ...p, [uid]: { ...req, status: "approved" } }));
      await addLog(`가입 승인: ${req.koreanName}(${req.englishName}) - ${req.roleLabel}`);
    } catch (e) {
      alert(`승인 처리 중 오류가 발생했습니다: ${e.message}\n다시 시도해주세요.`);
    }
  }

  async function rejectJoinRequest(uid) {
    const req = joinRequests[uid];
    if (!req) return;
    try {
      await dbSet(`${fbJoinRequests()}/${uid}/status`, "rejected");
      setJoinRequests(p => ({ ...p, [uid]: { ...req, status: "rejected" } }));
      await addLog(`가입 거절: ${req.koreanName}(${req.englishName})`);
    } catch (e) {
      alert(`거절 처리 중 오류가 발생했습니다: ${e.message}\n다시 시도해주세요.`);
    }
  }

  async function deleteStaff(id) {
    const s = staffList.find(x => x.id === id);
    const nl = staffList.filter(st => st.id !== id);
    setStaffList(nl);
    await dbSet(fbStaff(), nl);
    if (schedule[id]) {
      const ns = { ...schedule };
      delete ns[id];
      await saveSchedule(ns);
    }
    await addLog(`직원 완전 삭제: ${s?.name}(${s?.nameEn})`);
    setLongPressTarget(null);
    setDeleteArmed(false);
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
    addLog(`백업 다운로드`);
  }

  const dayHeaders  = Array.from({ length: days }, (_, i) => { const d = i + 1, dow = new Date(year, month - 1, d).getDay(); return { d, dow }; });
  const roleLabel   = s => s.type === "concierge" ? "컨시어지" : "컨설턴트";
  const realToday = new Date();
  const isCurrentRealMonth = realToday.getFullYear() === year && realToday.getMonth() + 1 === month;

  // ── 인증 확인 중 ──────────────────────────────────────────────
  if (authUser === undefined) {
    return (
      <div style={{ fontFamily: font, background: C.white, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.grey, fontWeight: 600, fontSize: 13 }}>확인 중…</div>
      </div>
    );
  }

  // ── 로그인 화면 ───────────────────────────────────────────────
  if (!authUser) {
    return (
      <AuthShell>
        <div style={{ fontWeight: 800, fontSize: 22, color: C.black, marginBottom: 6, letterSpacing: "-0.02em" }}>로그인</div>
        <div style={{ fontSize: 13, color: C.grey, marginBottom: 24 }}>언니가이드 근무앱에 오신 걸 환영합니다.</div>
        {domainError && <div style={{ fontSize: 12, color: "#D94A1F", marginBottom: 12 }}>{domainError}</div>}
        <button onClick={handleGoogleLogin} disabled={loginBusy}
          style={{ width: "100%", background: C.orange, color: C.white, border: "none", borderRadius: 10, padding: "13px", fontWeight: 800, fontSize: 14, cursor: loginBusy ? "default" : "pointer", fontFamily: font, opacity: loginBusy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <GoogleG size={16} />
          {loginBusy ? "로그인 중…" : "Google로 로그인"}
        </button>
        <div style={{ fontSize: 12, color: C.grey, marginTop: 14 }}>{ALLOWED_EMAIL_DOMAIN} 계정으로 로그인하세요.</div>
      </AuthShell>
    );
  }

  // ── 프로필 확인 중 ────────────────────────────────────────────
  if (userProfile === undefined) {
    return (
      <AuthShell>
        <div style={{ color: C.grey, fontWeight: 600, fontSize: 13, textAlign: "center" }}>확인 중…</div>
      </AuthShell>
    );
  }

  // ── 최초 로그인: 이름 설정 화면 ───────────────────────────────
  if (userProfile === null) {
    return (
      <AuthShell>
        <form onSubmit={saveProfile}>
          <div style={{ fontWeight: 800, fontSize: 22, color: C.black, marginBottom: 6, letterSpacing: "-0.02em" }}>처음 오셨네요!</div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 24 }}>근무표에 표시할 이름을 설정해주세요.</div>
          <input value={profileForm.koreanName} onChange={e => setProfileForm(p => ({ ...p, koreanName: e.target.value }))}
            style={{ width: "100%", border: `1px solid ${C.g2}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: font, boxSizing: "border-box", outline: "none", marginBottom: 8 }}
            placeholder="한글 이름 (예: 라라)" autoFocus />
          <input value={profileForm.englishName} onChange={e => setProfileForm(p => ({ ...p, englishName: e.target.value }))}
            style={{ width: "100%", border: `1px solid ${C.g2}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: font, boxSizing: "border-box", outline: "none", marginBottom: 12 }}
            placeholder="영어 이름 (예: Lara)" />
          <button type="submit" disabled={profileSaving || !profileForm.koreanName.trim() || !profileForm.englishName.trim()}
            style={{ width: "100%", background: C.orange, color: C.white, border: "none", borderRadius: 10, padding: "13px", fontWeight: 800, fontSize: 14, cursor: profileSaving ? "default" : "pointer", fontFamily: font, opacity: profileSaving ? 0.6 : 1 }}>
            {profileSaving ? "저장 중…" : "시작하기"}
          </button>
        </form>
      </AuthShell>
    );
  }

  // ── 로딩 화면 ─────────────────────────────────────────────────
  if (loading || !schedule) {
    return (
      <div style={{ fontFamily: font, background: C.white, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
        <div style={{ color: C.black, fontWeight: 700, fontSize: 15 }}>데이터 불러오는 중</div>
        <div style={{ color: C.grey, fontWeight: 500, fontSize: 12 }}>잠시만 기다려 주세요</div>
      </div>
    );
  }

  // ── 역할 미배정: 역할 선택 또는 관리자 승인 대기 ──────────────
  if (!isAdmin && !myStaff) {
    if (myJoinRequest && myJoinRequest.status === "pending") {
      return (
        <AuthShell>
          <div style={{ fontWeight: 800, fontSize: 22, color: C.black, marginBottom: 6, letterSpacing: "-0.02em" }}>승인 대기 중</div>
          <div style={{ fontSize: 13, color: C.grey, marginBottom: 24, lineHeight: 1.7 }}>
            신청하신 역할 <strong style={{ color: C.black }}>{myJoinRequest.roleLabel}</strong>을(를) 관리자가 확인하고 있어요.<br />승인되면 자동으로 근무표에 반영됩니다.
          </div>
          <span style={{ fontSize: 12, color: C.grey, cursor: "pointer", textDecoration: "underline" }} onClick={() => authLogout()}>로그아웃</span>
        </AuthShell>
      );
    }
    return (
      <AuthShell>
        <div style={{ fontWeight: 800, fontSize: 22, color: C.black, marginBottom: 6, letterSpacing: "-0.02em" }}>역할을 선택해주세요</div>
        <div style={{ fontSize: 13, color: C.grey, marginBottom: 20, lineHeight: 1.6 }}>
          {myJoinRequest?.status === "rejected" && <span style={{ color: "#D94A1F" }}>이전 신청이 승인되지 않았어요. 다시 선택해주세요.<br /></span>}
          본인의 담당 역할을 선택하면 관리자 승인 후 근무표에 등록됩니다.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ROLE_OPTIONS.map(r => (
            <button key={r.key} onClick={() => submitJoinRequest(r.key)} disabled={roleSubmitting}
              style={{ width: "100%", background: C.white, color: C.black, border: `1px solid ${C.g2}`, borderRadius: 10, padding: "12px 14px", fontWeight: 700, fontSize: 14, cursor: roleSubmitting ? "default" : "pointer", fontFamily: font, textAlign: "left", opacity: roleSubmitting ? 0.6 : 1 }}>
              {r.label}
            </button>
          ))}
        </div>
        <span style={{ display: "inline-block", marginTop: 20, fontSize: 12, color: C.grey, cursor: "pointer", textDecoration: "underline" }} onClick={() => authLogout()}>로그아웃</span>
      </AuthShell>
    );
  }

  // ── 메인 화면 ─────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: font, background: C.white, minHeight: "100vh", padding: 14 }}>

      {/* Header */}
      <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 18px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/unni-arrow.png" alt="언니가이드" style={{ width: 26, height: 26, objectFit: "contain" }} />
            <span style={{ fontSize: 19, fontWeight: 800, color: C.black, letterSpacing: "-0.02em" }}>
              언니가이드 <span style={{ color: C.orange }}>근무표</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Btn onClick={() => changeMonth(-1)}>‹</Btn>
            <span style={{ fontWeight: 700, fontSize: 15, minWidth: 72, textAlign: "center", color: C.black }}>{year}년 {month}월</span>
            <Btn onClick={() => changeMonth(1)}>›</Btn>
          </div>
          <span style={{ fontSize: 11, color: C.grey }}>
            {userName}{isAdmin && <span style={{ marginLeft: 6, background: C.plum, color: C.white, borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>관리자</span>}
            <span style={{ marginLeft: 8, cursor: "pointer", textDecoration: "underline" }} onClick={() => authLogout()}>로그아웃</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn onClick={() => setBulkModal({})} style={{ background: C.orange, border: "none", color: C.white }}>일괄 입력</Btn>
          <Btn onClick={() => setView(v => v === "table" ? "calendar" : "table")}>{view === "calendar" ? "테이블 보기" : "캘린더 보기"}</Btn>
          {isAdmin && (
            <Btn onClick={() => setShowInactive(v => !v)} style={showInactive ? { background: C.black, color: C.white, border: "none" } : {}}>
              {showInactive ? "전체 보기 중" : "합류 대기 포함"}
            </Btn>
          )}
          {isAdmin && (
            <Btn onClick={() => setView(v => v === "supply" ? "table" : "supply")} style={view === "supply" ? { background: C.black, color: C.white, border: "none" } : {}}>
              공급 슬롯
            </Btn>
          )}
          {isAdmin && <Btn onClick={() => setStaffModal({ mode: "add" })}>직원 추가</Btn>}
          {isAdmin && (
            <Btn onClick={() => setShowApprovals(v => !v)} style={pendingJoinRequests.length > 0 ? { background: C.orange, border: "none", color: C.white } : {}}>
              가입 승인{pendingJoinRequests.length > 0 && <span style={{ background: C.white, color: C.orange, borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 5, fontWeight: 800 }}>{pendingJoinRequests.length}</span>}
            </Btn>
          )}
          <Btn onClick={() => setShowLogs(v => !v)} style={showLogs ? { background: C.g1 } : {}}>
            로그{logs.length > 0 && <span style={{ background: C.orange, color: C.white, borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 5 }}>{logs.length}</span>}
          </Btn>
          <Btn onClick={downloadBackup}>백업</Btn>
        </div>
      </div>

      {/* 이번주 하이라이트 */}
      {weeklyHighlights && (
        <div style={{ background: C.plumLight, border: `1px solid ${C.plumMid}40`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: C.plum }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            이번주 하이라이트 <span style={{ fontWeight: 600, color: C.g5 }}>({month}/{weeklyHighlights.weekDays[0]} ~ {month}/{weeklyHighlights.weekDays[weeklyHighlights.weekDays.length - 1]})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div><strong>휴가·반차</strong>: {weeklyHighlights.vacations.length === 0 ? "없음" : weeklyHighlights.vacations.map(v => `${v.name}(${month}/${v.day} ${v.label})`).join(", ")}</div>
            <div><strong>배치 주의</strong>: {weeklyHighlights.weekWarnings.length === 0 ? "없음" : `${weeklyHighlights.weekWarnings.length}건 · ` + weeklyHighlights.weekWarnings.slice(0, 6).map(w => `${month}/${w.day} ${w.msg}`).join(", ") + (weeklyHighlights.weekWarnings.length > 6 ? ` 외 ${weeklyHighlights.weekWarnings.length - 6}건` : "")}</div>
            {isAdmin && (
              <div><strong>가입 승인 대기</strong>: {pendingJoinRequests.length === 0 ? "없음" : `${pendingJoinRequests.length}건 · ` + pendingJoinRequests.map(([, r]) => `${r.koreanName}(${r.roleLabel})`).join(", ")}</div>
            )}
          </div>
        </div>
      )}

      {/* 로그 패널 */}
      {showLogs && (
        <div style={{ background: C.white, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${C.line}`, maxHeight: 220, overflowY: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.black, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            조작 로그 <span style={{ fontSize: 11, color: C.grey, fontWeight: 400 }}>최근 {logs.length}건 (실시간)</span>
          </div>
          {logs.length === 0 && <div style={{ color: C.grey, fontSize: 12, textAlign: "center", padding: "12px 0" }}>아직 조작 내역이 없어요</div>}
          {logs.map((log, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0", borderBottom: `1px solid ${C.g1}`, fontSize: 12 }}>
              <span style={{ background: C.g1, color: C.g6, borderRadius: 6, padding: "2px 7px", fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{log.user}</span>
              <span style={{ color: C.grey, whiteSpace: "nowrap", fontSize: 11 }}>{fmtTime(log.ts)}</span>
              <span style={{ color: C.black, flex: 1 }}>{log.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* 가입 승인 패널 (관리자 전용) */}
      {isAdmin && showApprovals && (
        <div style={{ background: C.white, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${C.line}`, maxHeight: 300, overflowY: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.black, marginBottom: 10 }}>가입 승인 대기</div>
          {pendingJoinRequests.length === 0 && <div style={{ color: C.grey, fontSize: 12, textAlign: "center", padding: "12px 0" }}>대기 중인 신청이 없어요</div>}
          {pendingJoinRequests.map(([uid, req]) => (
            <div key={uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.g1}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.black }}>{req.koreanName} <span style={{ color: C.g4, fontWeight: 600 }}>{req.englishName}</span></div>
                <div style={{ fontSize: 11, color: C.grey }}>{req.email} · 신청 역할: {req.roleLabel}</div>
              </div>
              <button onClick={() => approveJoinRequest(uid)} style={{ background: C.black, color: C.white, border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: font }}>승인</button>
              <button onClick={() => rejectJoinRequest(uid)} style={{ background: C.white, color: C.g5, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>거절</button>
            </div>
          ))}
        </div>
      )}

      {/* 공휴일 배너 */}
      {pubHolsThisMonth.size > 0 && (
        <div style={{ background: C.orangeLight, border: `1px solid ${C.orangeMid}`, borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.orangeDark, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>공휴일</strong>
          {[...pubHolsThisMonth].sort((a, b) => a - b).map(d => {
            const cancelled = cancelledHolidays.has(d);
            const name = HOLIDAY_NAMES[`${year}-${month}-${d}`] || "";
            return (
              <span key={d}
                onClick={() => { if (isAdmin) toggleHoliday(d); }}
                style={{ background: cancelled ? C.g1 : C.orangeMid, borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: isAdmin ? "pointer" : "default", color: cancelled ? C.grey : C.orangeDark, textDecoration: cancelled ? "line-through" : "none" }}
                title={isAdmin ? (cancelled ? "클릭하면 공휴일 복원" : "클릭하면 공휴일 취소") : undefined}>
                {month}/{d}{name ? ` ${name}` : ""}({DAYS_KO[new Date(year, month - 1, d).getDay()]}){cancelled ? " (취소됨)" : ""}
              </span>
            );
          })}
        </div>
      )}

      {/* 수동 휴일 배너 */}
      {altHolidays.size > 0 && (
        <div style={{ background: C.plumLight, border: `1px solid ${C.plumMid}33`, borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.plum, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>지정 휴일</strong>
          {[...altHolidays].sort((a, b) => a - b).map(d => (
            <span key={d} style={{ background: C.white, border: `1px solid ${C.plumMid}40`, borderRadius: 6, padding: "2px 8px", fontWeight: 700, cursor: isAdmin ? "pointer" : "default", color: C.plum }}
              onClick={() => { if (isAdmin) toggleHoliday(d); }}>{month}/{d}({DAYS_KO[new Date(year, month - 1, d).getDay()]}){isAdmin ? " ×" : ""}</span>
          ))}
        </div>
      )}

      {/* 합류 미확정 */}
      {!showInactive && staffList.some(s => !s.active) && (
        <div style={{ background: C.g1, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.g6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>합류 미확정</strong>
          {staffList.filter(s => !s.active).map(s => (
            <span key={s.id} style={{ background: C.white, border: `1px solid ${C.g2}`, borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontWeight: 600, color: C.black }}
              onClick={() => activateStaff(s.id)}>{s.name} {s.nameEn} ({s.lang || "컨시어지"}){s.onLeave && <span style={{ color: C.orangeDark }}> · 휴직</span>} +</span>
          ))}
        </div>
      )}

      {/* 배치 주의 */}
      {warnings.length > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.g2}`, borderRadius: 10, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.g6 }}>
          <strong style={{ color: C.black }}>배치 주의</strong>
          <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 5 }}>
            {warnings.slice(0, 12).map((w, i) => (
              <span key={i} style={{
                background: w.operational ? C.orangeLight : C.g1,
                color:      w.operational ? C.orangeDark  : w.soft ? C.grey : C.g6,
                border:     w.operational ? `1px solid ${C.orangeMid}` : `1px solid ${C.line}`,
                borderRadius: 5, padding: "2px 7px", fontWeight: 600
              }}>
                {w.operational && "운영 주의 · "}{month}/{w.day} {w.msg}
              </span>
            ))}
            {warnings.length > 12 && <span style={{ color: C.grey }}>+{warnings.length - 12}건</span>}
          </div>
        </div>
      )}

      {/* 근무일수 미달 알림 — 월말에 손으로 찾지 않도록 미리 띄운다 */}
      {(capacityAlerts.length > 0 || shortfalls.length > 0) && (
        <div style={{ background: C.orangeLight, border: `1px solid ${C.orangeMid}`, borderRadius: 10, padding: "9px 14px", marginBottom: 10, fontSize: 12, color: C.g7 }}>
          <strong style={{ color: C.orangeDark }}>근무일수 주의</strong>
          {capacityAlerts.length > 0 && (
            <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 5 }}>
              {capacityAlerts.map(n => (
                <span key={n.key} style={{ background: C.white, border: `1px solid ${C.orangeMid}`, color: C.orangeDark, borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>{n.msg}</span>
              ))}
            </div>
          )}
          {shortfalls.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              {shortfalls.map(f => (
                <span key={f.id}
                  title={`${f.name} — ${f.detail} = ${f.actual}일 / 기준 ${f.required}일. ` + (f.needVac > 0
                    ? `남은 운영일 중 비어 있는 날이 ${f.openLeft}일뿐이라 ${f.needVac}일은 휴가로 처리해야 총량이 맞습니다.`
                    : `남은 운영일 중 ${f.openLeft}일이 비어 있어 근무로 돌리면 채울 수 있습니다.`)}
                  style={{
                    background: f.needVac > 0 ? C.plum : C.white,
                    color:      f.needVac > 0 ? C.white : C.g6,
                    border: `1px solid ${f.needVac > 0 ? C.plum : C.line}`,
                    borderRadius: 5, padding: "2px 8px", fontWeight: 700,
                  }}>
                  {f.name} {f.actual}/{f.required}일 ({f.detail})
                  {f.needVac > 0 ? ` → 휴가 처리 필요 ${f.needVac}일` : ` → 보충 가능 (빈 운영일 ${f.openLeft}일)`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 기준 근무일수 — 초과/부족 배지의 비교 기준. 지정휴일을 넣으면 법정 기준보다 내려간다. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10, fontSize: 11, color: C.g6, fontWeight: 600 }}>
        <span style={{ background: C.ivory, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 9px" }}>
          {month}월 기준 근무일수 <strong style={{ color: C.black }}>{baseline.required}일</strong>
        </span>
        <span style={{ color: C.grey }}>
          평일 {baseline.weekdays}일
          {baseline.pubOnWeekday > 0 && ` − 공휴일 ${baseline.pubOnWeekday}일`}
          {baseline.altOnWeekday > 0 && ` − 지정휴일 ${baseline.altOnWeekday}일`}
          {" "}· 토·일은 기준에서 제외 (주5일 사무직 기준)
        </span>
        {baseline.altOnWeekday > 0 && (
          <span style={{ background: C.plumLight, color: C.plum, border: `1px solid ${C.plumMid}33`, borderRadius: 6, padding: "3px 9px" }}
            title={`법정 공휴일만 반영하면 ${baseline.statutory}일. 지정휴일(대체공휴일 포함) ${baseline.altOnWeekday}일을 더 빼서 ${baseline.required}일이 됐습니다.`}>
            일반 사무직 기준({baseline.statutory}일)보다 {baseline.altOnWeekday}일 적음
          </span>
        )}
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10, alignItems: "center" }}>
        {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([k, v]) => (
          <span key={k} style={{ background: v.bg, color: v.color, border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{v.label}</span>
        ))}
        <span style={{ background: C.orangeLight, color: C.orangeDark, border: `1px solid ${C.orangeMid}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>공휴일</span>
        <span style={{ background: C.plumLight, color: C.plum, border: `1px solid ${C.plumMid}33`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>지정휴일</span>
        <span style={{ background: C.white, color: C.orangeDark, border: `1px solid ${C.orangeMid}`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>운영 주의</span>
        <span style={{ fontSize: 11, color: C.grey, marginLeft: 4 }}>날짜 클릭 → 휴일 설정/취소</span>
        <span style={{ fontSize: 11, color: C.grey, marginLeft: 4 }}>대면 셀 숫자 = 상담방 번호 (3번 = 워킹룸 제외)</span>
      </div>

      {/* 테이블 */}
      {view === "table" && (
        <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.line}` }}>
          <table style={{ borderCollapse: "collapse", background: C.white, fontSize: 11, width: "100%" }}>
            <thead>
              <tr>
                <th style={th("80px")}>직책</th>
                <th style={th("72px")}>이름</th>
                {dayHeaders.map(({ d, dow }) => {
                  const isPub       = pubHolsThisMonth.has(d) && !cancelledHolidays.has(d);
                  const isAlt       = altHolidays.has(d);
                  const isClosed    = isPub || isAlt || isClosedSunday(year, month, d); // 미운영 일요일·공휴일·지정휴일 = 미운영
                  const dot         = isPub ? C.orange : isAlt ? C.plumMid : warnDays.has(d) ? C.orangeDark : null;
                  const isToday     = isCurrentRealMonth && realToday.getDate() === d;
                  return (
                    <th key={d} onClick={() => setDayPopup(d)}
                      style={{ ...th("32px"), background: isToday ? C.orange : isClosed ? C.g1 : C.white, color: isToday ? C.white : isClosed ? C.grey : C.g7, cursor: "pointer", boxShadow: isToday ? `inset 0 0 0 2px ${C.orangeDark}` : "none" }}>
                      <div style={{ fontWeight: 800 }}>{d}</div>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>{DAYS_KO[dow]}</div>
                      <div style={{ height: 5, marginTop: 1, display: "flex", justifyContent: "center" }}>
                        {dot && <span style={{ width: 4, height: 4, borderRadius: "50%", background: isToday ? C.white : dot, display: "inline-block" }} />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {GROUPS.flatMap((g, gi) => {
                const members = displayStaff.filter(s => g.types.includes(s.type) && (!g.langs || g.langs.includes(s.lang)))
                  .sort((a, b) => consultOrd(a.name) - consultOrd(b.name));
                if (!members.length) return [];
                return [
                  <tr key={`g${gi}`}>
                    <td colSpan={2 + days} style={{ background: C.g1, fontWeight: 800, fontSize: 11, padding: "5px 10px", color: C.black, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                      <span style={{ display: "inline-block", width: 3, height: 11, background: C.orange, borderRadius: 2, marginRight: 7, verticalAlign: "-1px" }} />{g.label}
                    </td>
                  </tr>,
                  ...members.map(s => {
                    const phs = dayHeaders.map(({ d }) => phaseOf(s, d));
                    const anyActive = phs.includes("active");
                    const suffix = !anyActive ? (phs.every(p => p === "pre") ? " (미합류)" : " (온보딩)") : (!s.active ? " (미확정)" : "");
                    return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${C.g1}`, opacity: (s.active && anyActive) ? 1 : 0.5 }}>
                      <td style={{ padding: "5px 8px", color: C.g5, fontSize: 10, whiteSpace: "nowrap", background: C.white, fontWeight: 500 }}>
                        {roleLabel(s)}{suffix}
                      </td>
                      <td style={{ padding: "5px 6px", fontWeight: 800, whiteSpace: "nowrap", fontSize: 11, textAlign: "center", background: C.white, cursor: canEditStaff(s.id) ? "pointer" : "default", userSelect: "none", color: C.black, borderRight: `2px solid ${C.line}` }}
                        onClick={() => { if (canEditStaff(s.id)) setBulkModal({ preStaff: s.id }); }}
                        onMouseDown={() => { if (isAdmin) longPressTimer.current = setTimeout(() => setLongPressTarget(s.id), 600); }}
                        onMouseUp={() => clearTimeout(longPressTimer.current)}
                        onMouseLeave={() => clearTimeout(longPressTimer.current)}
                        onTouchStart={() => { if (isAdmin) longPressTimer.current = setTimeout(() => setLongPressTarget(s.id), 600); }}
                        onTouchEnd={() => clearTimeout(longPressTimer.current)}>
                        <div>{s.name}</div>
                        <div style={{ fontSize: 9, color: C.g4, fontWeight: 600 }}>{s.nameEn}</div>
                        {s.altLangs?.length > 0 && (
                          <div style={{ fontSize: 8, color: C.plumMid, fontWeight: 800, marginTop: 1 }}
                            title={`보조 언어: ${s.altLangs.map(l => LANG_LABEL[l] || l).join(", ")}`}>
                            +{s.altLangs.map(l => LANG_LABEL[l] || l).join("·")}
                          </div>
                        )}
                        {workloadMap[s.id] && workloadMap[s.id].diff !== 0 && (
                          <div title={`${breakdownText(workloadMap[s.id])} = ${workloadMap[s.id].actual}일 / 기준 ${workloadMap[s.id].required}일`}
                            style={{ fontSize: 9, fontWeight: 800, color: C.white, background: workloadMap[s.id].diff > 0 ? C.orange : C.plumMid, borderRadius: 4, padding: "1px 4px", marginTop: 2, lineHeight: 1.4 }}>
                            {workloadMap[s.id].diff > 0 ? `초과 +${workloadMap[s.id].diff}일` : `부족 −${-workloadMap[s.id].diff}일`}
                          </div>
                        )}
                      </td>
                      {dayHeaders.map(({ d, dow }) => {
                        const ph = phaseOf(s, d);
                        if (ph === "pre") return (
                          <td key={d} style={{ background: C.g1, color: C.g3, fontWeight: 600, fontSize: 9, textAlign: "center", padding: "4px 1px", border: `1px solid ${C.g1}`, userSelect: "none", minWidth: 30 }}>미합류</td>
                        );
                        if (ph === "onboard") { const oc = STATUS_CONFIG["ONBD"]; return (
                          <td key={d} title={`${s.name} ${month}/${d} 온보딩`} style={{ background: C.plumLight, color: oc.color, fontWeight: 700, fontSize: 9, textAlign: "center", padding: "4px 1px", border: `1px solid ${C.g1}`, userSelect: "none", minWidth: 30 }}>{oc.short}</td>
                        ); }
                        const st  = schedule[s.id]?.[d] ?? "";
                        const cfg = STATUS_CONFIG[st] || STATUS_CONFIG[""];
                        const isPub  = pubHolsThisMonth.has(d) && !cancelledHolidays.has(d);
                        const isAlt  = altHolidays.has(d);
                        const isClosed = isPub || isAlt || isClosedSunday(year, month, d); // 미운영일 → 컬럼 전체 옅은 회색
                        const isEdit = editCell?.sid == s.id && editCell?.day === d;
                        const room = roomMap[s.id]?.[d];
                        const isOverride = roomOverrides[s.id]?.[d] != null;
                        const isDup = room && roomDupByDay[d]?.has(room);
                        // 미운영 일요일은 전체 공통 OFF라 개별 수정 불가
                        const closedSun = isClosedSunday(year, month, d);
                        const editable = canEditStaff(s.id) && !closedSun;
                        return (
                          <td key={d}
                            onClick={() => {
                              if (!editable || cellLongPressed.current) return;
                              const cur = schedule[s.id]?.[d] ?? "";
                              setStatus(s.id, d, cur === "OFF" ? "" : "OFF");
                            }}
                            onDoubleClick={() => { if (editable) setEditCell({ sid: s.id, day: d }); }}
                            onMouseDown={() => {
                              if (!editable) return;
                              cellLongPressed.current = false;
                              cellLongPressTimer.current = setTimeout(() => {
                                cellLongPressed.current = true;
                                setEditCell({ sid: s.id, day: d });
                              }, 600);
                            }}
                            onMouseUp={() => clearTimeout(cellLongPressTimer.current)}
                            onMouseLeave={() => clearTimeout(cellLongPressTimer.current)}
                            onTouchStart={() => {
                              if (!editable) return;
                              cellLongPressed.current = false;
                              cellLongPressTimer.current = setTimeout(() => {
                                cellLongPressed.current = true;
                                setEditCell({ sid: s.id, day: d });
                              }, 600);
                            }}
                            onTouchEnd={() => clearTimeout(cellLongPressTimer.current)}
                            onTouchMove={() => clearTimeout(cellLongPressTimer.current)}
                            style={{ background: isEdit ? C.orangeLight : isClosed ? C.g1 : C.white, color: isDup ? C.orangeDark : cfg.color, fontWeight: 700, fontSize: 10, textAlign: "center", cursor: editable ? "pointer" : "default", padding: "4px 1px", border: isEdit ? `2px solid ${C.orange}` : isDup ? `1px solid ${C.orangeDark}` : `1px solid ${C.g1}`, userSelect: "none", minWidth: 30 }}
                            title={`${s.name} ${month}/${d} ${cfg.label}${st === "OFF-Con" && roomReady && room ? ` · ${room}번방${isOverride ? " (강제지정)" : ""}${isDup ? " · 중복사용" : ""}` : ""}${editable ? " | 클릭=OFF토글 / 더블클릭 또는 길게누르기=상태선택" : closedSun ? " | 일요일 미운영 (전체 공통 OFF)" : " | 읽기 전용 (본인 근무만 수정 가능)"}`}>
                            {st === "OFF-Con" ? ((roomReady && room) ? `대면(no.${room}${isOverride ? "🔒" : ""})` : "대면") : cfg.short}
                          </td>
                        );
                      })}
                    </tr>
                  ); }),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "supply" && isAdmin && (
        <SupplyView year={year} month={month} cal={cal} staffList={staffList} schedule={schedule} phaseAt={phaseAt}
          settings={supplySettings} onSaveSettings={saveSupplySettings}
          overrides={shareOverrides} onSaveOverride={saveShareOverride} />
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
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: C.black }}>{month}월 {dayPopup}일 ({DAYS_KO[dow]})</div>
              {holName && <div style={{ fontSize: 12, color: C.orangeDark, marginTop: 4, fontWeight: 700 }}>{holName}</div>}
              {activePub && <div style={{ fontSize: 12, color: C.orangeDark, marginTop: 4, fontWeight: 600 }}>공휴일</div>}
              {isPub && isCancelled && <div style={{ fontSize: 12, color: C.grey, marginTop: 4, fontWeight: 600 }}>공휴일 (취소됨)</div>}
              {isAlt && <div style={{ fontSize: 12, color: C.plum, marginTop: 4, fontWeight: 600 }}>지정 휴일</div>}
            </div>

            {/* 공휴일 취소/복원 */}
            {isAdmin && isPub && (
              isCancelled ? (
                <>
                  <div style={{ fontSize: 12, color: C.g6, textAlign: "center", background: C.g1, borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    공휴일을 복원하면 모든 직원이 <strong>OFF</strong> 처리됩니다.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: C.orange, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    공휴일 복원
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: C.g6, textAlign: "center", background: C.g1, borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    공휴일을 취소하면 일반 근무일로 처리됩니다.<br />개인 스케줄은 직접 수정해주세요.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: C.black, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    공휴일 취소 (근무일로 변경)
                  </button>
                </>
              )
            )}

            {/* 수동 휴일 해제 / 지정 */}
            {isAdmin && !isPub && (
              isAlt ? (
                <>
                  <div style={{ fontSize: 12, color: C.g6, textAlign: "center", background: C.g1, borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    해제하면 일반 근무일로 처리됩니다.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: C.black, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    휴일 해제
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: C.g6, textAlign: "center", background: C.plumLight, borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
                    휴일로 지정하면 모든 직원이 자동으로 <strong>OFF</strong> 처리됩니다.
                  </div>
                  <button onClick={() => { toggleHoliday(dayPopup); setDayPopup(null); }}
                    style={{ width: "100%", background: C.plum, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>
                    휴일로 지정
                  </button>
                </>
              )
            )}

            <button onClick={() => setDayPopup(null)} style={{ width: "100%", background: C.white, border: `1px solid ${C.g2}`, color: C.black, borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>닫기</button>
          </Modal>
        );
      })()}

      {/* 셀 편집 팝업 */}
      {editCell && canEditStaff(editCell.sid) && (
        <Modal onClose={() => setEditCell(null)}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: C.black }}>
            {displayStaff.find(s => s.id == editCell.sid)?.name} — {month}/{editCell.day}({DAYS_KO[new Date(year, month - 1, editCell.day).getDay()]})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([k, v]) => {
              const sel = schedule[editCell.sid]?.[editCell.day] === k;
              return <button key={k} onClick={() => { setStatus(editCell.sid, editCell.day, k); setEditCell(null); }} style={{ background: sel ? v.color : v.bg, color: sel ? C.white : v.color, border: `2px solid ${sel ? v.color : C.line}`, borderRadius: 8, padding: "8px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: font }}>{v.label}</button>;
            })}
            <button onClick={() => { setStatus(editCell.sid, editCell.day, ""); setEditCell(null); }} style={{ gridColumn: "1/-1", background: C.g1, color: C.g5, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>비우기 (-)</button>
          </div>

          {isAdmin && roomReady && schedule[editCell.sid]?.[editCell.day] === "OFF-Con" && (() => {
            const curOverride = roomOverrides[editCell.sid]?.[editCell.day];
            const autoRoom = roomMap[editCell.sid]?.[editCell.day];
            return (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.black, marginBottom: 4 }}>방 강제지정</div>
                <div style={{ fontSize: 11, color: C.g4, marginBottom: 8 }}>
                  자동배정: {autoRoom ? `${autoRoom}번` : "부족(배정 불가)"} — 지정하면 이 값을 무시하고 아래 방을 강제로 씁니다 (중복 허용).
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 8 }}>
                  {ROOMS.map(r => (
                    <button key={r} onClick={() => setRoomOverride(editCell.sid, editCell.day, r)}
                      style={{ background: curOverride === r ? C.black : C.white, color: curOverride === r ? C.white : C.black, border: `1px solid ${curOverride === r ? C.black : C.g2}`, borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                      {r}번
                    </button>
                  ))}
                </div>
                {curOverride != null && (
                  <button onClick={() => setRoomOverride(editCell.sid, editCell.day, null)}
                    style={{ width: "100%", background: C.white, color: C.g5, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                    강제지정 해제 (자동배정으로 되돌리기)
                  </button>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 길게 누르기 팝업 */}
      {longPressTarget && isAdmin && (() => {
        const s = staffList.find(x => x.id === longPressTarget);
        const closePopup = () => { setLongPressTarget(null); setDeleteArmed(false); };
        return (
          <Modal onClose={closePopup}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.black }}>{s?.name} <span style={{ color: C.g4, fontWeight: 600 }}>{s?.nameEn}</span></div>
            </div>

            <button onClick={() => { setStaffModal({ mode: "edit", staff: s }); closePopup(); }} style={{ width: "100%", background: C.black, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>정보 수정 (언어·이름)</button>

            {s?.active ? (
              <>
                <div style={{ fontSize: 12, color: C.g6, textAlign: "center", marginBottom: 14, background: C.g1, borderRadius: 8, padding: "8px 12px", lineHeight: 1.6 }}>
                  근무표에서 제외됩니다. <strong>이전 근무 이력은 보존</strong>되고, 오늘 이후 일정은 전부 OFF로 반영됩니다.
                </div>
                <button onClick={() => deactivateStaff(longPressTarget, { onLeave: true })} style={{ width: "100%", background: C.orange, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>휴직 처리 (기존 직원)</button>
                <button onClick={() => deactivateStaff(longPressTarget, { onLeave: false })} style={{ width: "100%", background: C.white, color: C.black, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>합류 미확정으로 내리기 (신규 합류 보류)</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: C.g6, textAlign: "center", marginBottom: 14, background: C.g1, borderRadius: 8, padding: "8px 12px" }}><strong>{s?.onLeave ? "휴직" : "합류 미확정"}</strong> 상태입니다.</div>
                <button onClick={() => { activateStaff(longPressTarget); closePopup(); }} style={{ width: "100%", background: C.orange, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>근무표에 다시 추가</button>
              </>
            )}

            {/* 완전 삭제 (2단계 확인) */}
            {deleteArmed ? (
              <div style={{ background: C.g1, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.black, textAlign: "center", marginBottom: 10, fontWeight: 600, lineHeight: 1.6 }}>
                  <strong>{s?.name}</strong> 님을 완전히 삭제합니다.<br />근무 기록까지 제거되며 되돌릴 수 없어요.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setDeleteArmed(false)} style={{ flex: 1, background: C.white, border: `1px solid ${C.g2}`, color: C.black, borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>취소</button>
                  <button onClick={() => deleteStaff(longPressTarget)} style={{ flex: 1, background: C.black, color: C.white, border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font }}>완전 삭제</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setDeleteArmed(true)} style={{ width: "100%", background: C.white, color: C.g5, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, marginBottom: 8 }}>완전 삭제</button>
            )}

            <button onClick={closePopup} style={{ width: "100%", background: C.white, border: `1px solid ${C.g2}`, color: C.black, borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>닫기</button>
          </Modal>
        );
      })()}

      {/* 직원 추가 / 수정 팝업 */}
      {staffModal && (
        <StaffFormModal mode={staffModal.mode} initial={staffModal.staff}
          onSave={saveStaff} onClose={() => setStaffModal(null)} font={font} />
      )}

      {/* 일괄 입력 */}
      {bulkModal && (
        <BulkModal staff={isAdmin ? displayStaff : (myStaff ? [myStaff] : [])} days={days} month={month} year={year} preStaff={bulkModal.preStaff}
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
  const [fixedOffDows, setFixedOffDows] = useState([]);
  const [status, setStatus] = useState("OFF-Con");

  const toggleStaff = id  => setSelStaff(p => p.includes(id)  ? p.filter(x => x !== id)  : [...p, id]);
  const toggleDow   = dow => setFixedOffDows(p => p.includes(dow) ? p.filter(x => x !== dow) : [...p, dow]);

  const from = Math.min(dateFrom, dateTo), to = Math.max(dateFrom, dateTo);

  const workDays = (() => {
    const a = [];
    for (let d = from; d <= to; d++) {
      const w = new Date(year, month - 1, d).getDay();
      if (fixedOffDows.includes(w)) continue;
      if (isClosedSunday(year, month, d)) continue; // 미운영 일요일은 근무일에서 제외 (아래 OFF로 처리)
      a.push(d);
    }
    return a;
  })();

  const fixedOffDays = (() => {
    const a = [];
    for (let d = from; d <= to; d++) {
      const w = new Date(year, month - 1, d).getDay();
      if (fixedOffDows.includes(w) || isClosedSunday(year, month, d)) a.push(d);
    }
    return a;
  })();

  // 선택 범위에 미운영 일요일이 몇 개 들어있는지 — 안내 문구용
  const closedSunInRange = (() => {
    let n = 0;
    for (let d = from; d <= to; d++) if (isClosedSunday(year, month, d)) n++;
    return n;
  })();

  const stepLabels = ["1. 직원 선택", "2. 날짜 범위", "3. 상태 선택"];

  return (
    <Modal onClose={onClose} wide>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, color: C.black }}>일정 일괄 입력</div>
      <div style={{ display: "flex", marginBottom: 18, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.line}` }}>
        {stepLabels.map((l, i) => (
          <button key={i} onClick={() => setStep(i + 1)}
            style={{ flex: 1, padding: "8px 4px", background: step === i + 1 ? C.black : step > i + 1 ? C.g2 : C.g1, color: step === i + 1 ? C.white : step > i + 1 ? C.g7 : C.g4, fontWeight: 700, fontSize: 11, border: "none", cursor: "pointer", fontFamily: font, borderRight: i < 2 ? `1px solid ${C.line}` : "none" }}>
            {l}
          </button>
        ))}
      </div>

      {step === 1 && (
        <>
          <div style={{ fontSize: 12, color: C.g6, marginBottom: 8 }}>근무 일정을 넣을 직원을 선택하세요.</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            <button onClick={() => setSelStaff(staff.map(s => s.id))} style={chipStyle(C.g1, C.black, false, font)}>전체 선택</button>
            <button onClick={() => setSelStaff([])} style={chipStyle(C.g1, C.g5, false, font)}>전체 해제</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {staff.map(s => {
              const sel = selStaff.includes(s.id);
              return (
                <button key={s.id} onClick={() => toggleStaff(s.id)}
                  style={{ background: sel ? C.black : C.white, color: sel ? C.white : C.black, border: `1px solid ${sel ? C.black : C.g2}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                  {s.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{s.nameEn}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => selStaff.length && setStep(2)}
            style={{ width: "100%", background: selStaff.length ? C.orange : C.g2, color: C.white, border: "none", borderRadius: 8, padding: "11px", fontWeight: 800, fontSize: 13, cursor: selStaff.length ? "pointer" : "not-allowed", fontFamily: font }}>
            다음 {selStaff.length ? `· ${selStaff.length}명 선택됨` : "· 직원을 선택하세요"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 12, color: C.g6, marginBottom: 12 }}>적용할 날짜 범위를 설정하세요.</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{month}월 시작일</label>
              <input type="number" min={1} max={days} value={dateFrom} onChange={e => setDateFrom(Math.max(1, Math.min(days, +e.target.value)))} style={inp(font)} />
            </div>
            <div style={{ paddingTop: 22, color: C.g3, fontSize: 18 }}>~</div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{month}월 종료일</label>
              <input type="number" min={1} max={days} value={dateTo} onChange={e => setDateTo(Math.max(1, Math.min(days, +e.target.value)))} style={inp(font)} />
            </div>
          </div>
          <div style={{ background: C.g1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.black, marginBottom: 8 }}>
              고정 휴무 (OFF 선호 요일) <span style={{ fontWeight: 400, color: C.g4 }}>— 선택한 요일을 매주 반복 OFF</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["일", 0], ["토", 6], ["월", 1], ["화", 2], ["수", 3], ["목", 4], ["금", 5]].map(([name, dow]) => {
                const sel = fixedOffDows.includes(dow);
                return (
                  <button key={dow} onClick={() => toggleDow(dow)}
                    style={{ flex: 1, background: sel ? C.black : C.white, color: sel ? C.white : C.g6, border: `1px solid ${sel ? C.black : C.g2}`, borderRadius: 8, padding: "6px 0", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                    {name}
                  </button>
                );
              })}
            </div>
            {fixedOffDows.length > 0 && (
              <div style={{ fontSize: 11, color: C.g6, marginTop: 8, fontWeight: 600 }}>
                {fixedOffDows.map(d => ["일", "월", "화", "수", "목", "금", "토"][d]).join(", ")}요일 선택됨 → 자동 OFF
              </div>
            )}
            {closedSunInRange > 0 && (
              <div style={{ fontSize: 11, color: C.g6, marginTop: 6, fontWeight: 600 }}>
                일요일 {closedSunInRange}일은 미운영이라 선택과 무관하게 자동 OFF
              </div>
            )}
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.g6, marginBottom: 14, fontWeight: 600 }}>
            {month}/{from} ~ {month}/{to} → 근무 <strong style={{ color: C.black }}>{workDays.length}일</strong>
            {fixedOffDays.length > 0 && <span> + 휴무 <strong style={{ color: C.black }}>{fixedOffDays.length}일</strong> OFF</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, background: C.white, border: `1px solid ${C.g2}`, color: C.black, borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>이전</button>
            <button onClick={() => workDays.length && setStep(3)} style={{ flex: 2, background: workDays.length ? C.orange : C.g2, color: C.white, border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: workDays.length ? "pointer" : "not-allowed", fontFamily: font }}>다음</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ fontSize: 12, color: C.g6, marginBottom: 10 }}>근무 날에 적용할 상태를 선택하세요.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
            {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([k, v]) => (
              <button key={k} onClick={() => setStatus(k)}
                style={{ background: status === k ? v.color : v.bg, color: status === k ? C.white : v.color, border: `2px solid ${status === k ? v.color : C.line}`, borderRadius: 8, padding: "8px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                {v.label}
              </button>
            ))}
            <button onClick={() => setStatus("")}
              style={{ gridColumn: "1/-1", background: status === "" ? C.g5 : C.g1, color: status === "" ? C.white : C.g5, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
              비우기 (-)
            </button>
          </div>
          <div style={{ background: C.g1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 14, lineHeight: 1.8, color: C.g6 }}>
            <strong style={{ color: C.black }}>적용 요약</strong><br />
            직원 · <strong style={{ color: C.black }}>{staff.filter(s => selStaff.includes(s.id)).map(s => s.name).join(", ")}</strong><br />
            기간 · <strong style={{ color: C.black }}>{month}/{from} ~ {month}/{to}</strong><br />
            근무 {workDays.length}일 → <strong style={{ color: C.black }}>{STATUS_CONFIG[status]?.label || "비우기"}</strong>
            {fixedOffDays.length > 0 && <><br />휴무 <strong style={{ color: C.black }}>{fixedOffDays.length}일 OFF</strong></>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(2)} style={{ flex: 1, background: C.white, border: `1px solid ${C.g2}`, color: C.black, borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>이전</button>
            <button onClick={() => onApply({ staffIds: selStaff, days: workDays, status, fixedOffDays })}
              style={{ flex: 2, background: C.orange, color: C.white, border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font }}>
              {selStaff.length}명 적용
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── StaffFormModal (직원 추가 / 수정) ─────────────────────────
function StaffFormModal({ mode, initial, onSave, onClose, font }) {
  const isEdit = mode === "edit";
  const [f, setF] = useState(() => ({
    name:     initial?.name     || "",
    nameEn:   initial?.nameEn   || "",
    type:     initial?.type     || "consultant",
    lang:     initial?.lang ?? "영미",
    altLangs: initial?.altLangs || [],
    onlineOnly: initial?.onlineOnly || false,
  }));
  const set      = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleAlt = lg    => setF(p => ({ ...p, altLangs: p.altLangs.includes(lg) ? p.altLangs.filter(x => x !== lg) : [...p.altLangs, lg] }));
  const altOptions = LANG_GROUPS.filter(lg => lg !== f.lang); // 주언어 제외한 나머지

  return (
    <Modal onClose={onClose}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14, color: C.black }}>{isEdit ? "직원 정보 수정" : "직원 추가"}</div>
      <label style={lbl}>이름 (한글)</label>
      <input value={f.name} onChange={e => set("name", e.target.value)} style={inp(font)} placeholder="예: 홍길동" />
      <label style={lbl}>이름 (영문)</label>
      <input value={f.nameEn} onChange={e => set("nameEn", e.target.value)} style={inp(font)} placeholder="예: Hong" />
      <label style={lbl}>주 언어권</label>
      <select value={f.lang || ""} onChange={e => set("lang", e.target.value || null)} style={inp(font)}>
        <option value="">없음 (컨시어지)</option>
        {LANG_GROUPS.map(lg => <option key={lg} value={lg}>{lg}</option>)}
      </select>
      <label style={lbl}>보조 언어 <span style={{ fontWeight: 400, color: C.g4 }}>— 추가 담당 가능 언어 (케파에 정식 인원 포함)</span></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {altOptions.map(lg => {
          const sel = f.altLangs.includes(lg);
          return (
            <button key={lg} type="button" onClick={() => toggleAlt(lg)}
              style={{ background: sel ? C.orange : C.white, color: sel ? C.white : C.black, border: `1px solid ${sel ? C.orange : C.g2}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font }}>
              {LANG_LABEL[lg] || lg}
            </button>
          );
        })}
        {altOptions.length === 0 && <span style={{ fontSize: 11, color: C.g4 }}>선택 가능한 보조 언어가 없습니다.</span>}
      </div>
      <label style={lbl}>유형</label>
      <select value={f.type} onChange={e => set("type", e.target.value)} style={inp(font)}>
        <option value="concierge">컨시어지</option>
        <option value="consultant">컨설턴트</option>
      </select>
      {f.type === "consultant" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: C.g6, cursor: "pointer" }}>
          <input type="checkbox" checked={f.onlineOnly} onChange={e => set("onlineOnly", e.target.checked)} />
          온라인 전담 <span style={{ color: C.g4 }}>— 항상 온라인 상담만, 대면(상담방) 배정 대상에서 제외</span>
        </label>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => onSave(f, isEdit ? initial.id : undefined)} style={{ flex: 1, background: C.orange, color: C.white, border: "none", borderRadius: 8, padding: "10px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font }}>{isEdit ? "저장" : "추가"}</button>
        <button onClick={onClose} style={{ flex: 1, background: C.white, border: `1px solid ${C.g2}`, color: C.black, borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: font }}>취소</button>
      </div>
    </Modal>
  );
}

// ── CalendarView ──────────────────────────────────────────────
// ── 공급 슬롯 (관리자 전용) ───────────────────────────────────
// 공급 = 근무표의 대면 근무 인원 × 1인당 하루 슬롯 (lib/supply.js)
//   언어권별 공급은 근무표 주 언어 기준이고, 실제로 다른 언어를 주로 받는 상담사는 관리자가 비율을 고정한다.
// 지난 달 추이는 근무표 원본(schedule/·altHolidays/·cancelledHolidays/)을 한 번씩 읽어 같은 규칙으로 계산한다.
const SUPPLY_HISTORY_MONTHS = 6; // 월·주 추이에 보여줄 기간 (조회 중인 달 포함)

function SupplyView({ year, month, cal, staffList, schedule, phaseAt, settings, onSaveSettings, overrides, onSaveOverride }) {
  const [draft, setDraft]     = useState(settings);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [history, setHistory] = useState(null); // { "YYYY-MM": { y, m, schedule, alt, cancelled } } — 조회 중인 달 제외
  const [shareEdit, setShareEdit] = useState(null); // { sid, pct }
  useEffect(() => { if (!dirty) setDraft(settings); }, [settings, dirty]);

  const ymKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
  const pastMonths = useMemo(() => {
    const out = [];
    for (let i = SUPPLY_HISTORY_MONTHS - 1; i >= 1; i--) {
      const t = new Date(year, month - 1 - i, 1);
      out.push({ y: t.getFullYear(), m: t.getMonth() + 1 });
    }
    return out;
  }, [year, month]);

  useEffect(() => {
    let alive = true;
    setHistory(null);
    Promise.all(pastMonths.map(({ y, m }) => Promise.all([
      dbGet(fbSchedule(y, m)), dbGet(fbAlt(y, m)), dbGet(fbCancelled(y, m)),
    ]).then(([sch, alt, can]) => [ymKey(y, m), {
      y, m, schedule: sch, alt: new Set(alt ? Object.values(alt) : []), cancelled: new Set(can ? Object.values(can) : []),
    }]))).then(entries => { if (alive) setHistory(Object.fromEntries(entries)); })
      .catch(() => { if (alive) setHistory({}); });
    return () => { alive = false; };
  }, [pastMonths]);

  const shareInfo = s => {
    const fixed = shareFromPercent(overrides?.[s.id]);
    return fixed ? { share: fixed, src: "고정" } : { share: null, src: "기본" };
  };
  const supplyOf = (c, sch, y, m) => computeSupply(c, {
    staff: staffList,
    statusOf:   (s, d) => sch?.[s.id]?.[d],
    isActiveOn: (s, d) => phaseAt(s, y, m, d) === "active",
    settings,
    shareOf: s => shareInfo(s).share,
  });

  // 조회 중인 달은 실시간 근무표, 지난 달은 불러온 원본으로 계산 → 월 순서대로
  const monthly = useMemo(() => {
    const out = [];
    pastMonths.forEach(({ y, m }) => {
      const h = history?.[ymKey(y, m)];
      if (!h?.schedule) { out.push({ y, m, supply: null }); return; }
      out.push({ y, m, supply: supplyOf(makeCalendar(y, m, { alt: h.alt, cancelled: h.cancelled }), h.schedule, y, m) });
    });
    out.push({ y: year, m: month, supply: supplyOf(cal, schedule, year, month), current: true });
    return out;
  }, [history, pastMonths, cal, schedule, staffList, settings, overrides]);
  const cur = monthly[monthly.length - 1].supply;

  // 주 단위(일~토, 일요일은 휴무라 사실상 월~토) — 월 경계를 넘어 이어 붙인다.
  const weekly = useMemo(() => {
    const days = [];
    monthly.forEach(({ y, m, supply }) => {
      if (!supply) return;
      Object.entries(supply.byDay).forEach(([d, row]) => days.push({ date: new Date(y, m - 1, +d), row }));
    });
    const weeks = [];
    days.forEach(({ date, row }) => {
      const start = new Date(date); start.setDate(date.getDate() - date.getDay());
      const key = start.getTime();
      let wk = weeks[weeks.length - 1];
      if (!wk || wk.key !== key) { wk = { key, start, end: date, n: 0, tot: Object.fromEntries(SUPPLY_LANGS.map(lg => [lg, { heads: 0, slots: 0 }])) }; weeks.push(wk); }
      wk.end = date; wk.n++;
      SUPPLY_LANGS.forEach(lg => { wk.tot[lg].heads += row[lg].heads; wk.tot[lg].slots += row[lg].slots; });
    });
    // 불러온 기간 앞뒤에서 잘린 주
    if (days.length && days[0].date.getDay() !== 0) weeks[0].partial = true;
    if (days.length && days[days.length - 1].date.getDay() !== 6) weeks[weeks.length - 1].partial = true;
    return weeks.reverse();
  }, [monthly]);

  const total = o => SUPPLY_LANGS.reduce((n, lg) => n + o[lg].slots, 0);
  const totalHeads = o => SUPPLY_LANGS.reduce((n, lg) => n + o[lg].heads, 0);
  const num = v => (Number.isInteger(v) ? v : +v.toFixed(1)).toLocaleString();
  const pct = f => Math.round(f * 100);
  const md = dt => `${dt.getMonth() + 1}/${dt.getDate()}`;
  const card = { background: C.white, borderRadius: 12, padding: 14, border: `1px solid ${C.line}`, marginBottom: 12 };
  const title = { fontWeight: 800, fontSize: 13, color: C.black, marginBottom: 8 };
  const sub = { fontWeight: 500, color: C.grey, fontSize: 11 };
  const td = { padding: "5px 8px", borderBottom: `1px solid ${C.g1}`, fontSize: 12, textAlign: "right", whiteSpace: "nowrap" };
  const tdL = { ...td, textAlign: "left", fontWeight: 700 };
  const thS = { ...td, fontWeight: 800, color: C.g6, background: C.g1, borderBottom: `1px solid ${C.g2}` };
  // 언어권별 "슬롯 (인원)" 셀 + 전체
  const langCells = o => [
    <td key="tot" style={{ ...td, fontWeight: 900, background: C.ivory }}>{num(total(o))}<span style={{ color: C.grey, fontWeight: 500, fontSize: 10 }}> ({num(totalHeads(o))})</span></td>,
    ...SUPPLY_LANGS.map(lg => (
      <td key={lg} style={td}><strong>{num(o[lg].slots)}</strong><span style={{ color: C.grey, fontSize: 10 }}> ({num(o[lg].heads)})</span></td>
    )),
  ];
  const langHeads = [
    <th key="tot" style={thS}>전체</th>,
    ...SUPPLY_LANGS.map(lg => <th key={lg} style={thS}>{LANG_LABEL[lg]}</th>),
  ];

  async function save() {
    setSaving(true);
    try { await onSaveSettings(draft); setDirty(false); }
    catch (e) { alert(`저장하지 못했어요: ${e.message}`); }
    finally { setSaving(false); }
  }
  async function saveShare(sid, pctMap) {
    try { await onSaveOverride(sid, pctMap); setShareEdit(null); }
    catch (e) { alert(`저장하지 못했어요: ${e.message}`); }
  }

  const consultants = staffList
    .filter(s => s.active && s.type === "consultant")
    .sort((a, b) => consultOrd(a.name) - consultOrd(b.name));

  return (
    <div>
      {/* 1인당 하루 슬롯 설정 */}
      <div style={card}>
        <div style={title}>상담사 1인당 하루 슬롯 <span style={sub}>30분 슬롯 · 점심 휴식 1시간 고정 제외 · 기본값 평일 {DEFAULT_SLOTS.weekday} · 토 {DEFAULT_SLOTS.saturday}</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {SUPPLY_LANGS.map(lg => (
            <div key={lg} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.g6, marginBottom: 4 }}>{LANG_LABEL[lg]} 상담사</div>
              {["weekday", "saturday"].map(k => (
                <label key={k} style={{ fontSize: 11, color: C.g5, marginRight: 8 }}>
                  {k === "weekday" ? "평일 " : "토 "}
                  <input type="number" min={0} value={draft[lg][k]}
                    onChange={e => { setDirty(true); setDraft(p => ({ ...p, [lg]: { ...p[lg], [k]: e.target.value } })); }}
                    style={{ width: 46, border: `1px solid ${C.g2}`, borderRadius: 6, padding: "3px 5px", fontSize: 12, fontFamily: font }} />
                </label>
              ))}
            </div>
          ))}
          <Btn onClick={save} style={dirty ? { background: C.orange, color: C.white, border: "none" } : { opacity: 0.5 }}>{saving ? "저장 중…" : "저장"}</Btn>
          {dirty && <Btn onClick={() => { setDraft(settings); setDirty(false); }}>되돌리기</Btn>}
        </div>
        <div style={{ fontSize: 11, color: C.grey, marginTop: 8, lineHeight: 1.6 }}>
          공급 = 그날 대면 상담 인원 × 1인당 슬롯. 반차는 0.5명, 온라인 상담·휴가·대기·온보딩은 0명입니다. 표의 괄호는 대면 연인원(명·일)입니다.
        </div>
      </div>

      {/* 월 추이 */}
      <div style={card}>
        <div style={title}>월별 제공 슬롯 <span style={sub}>최근 {SUPPLY_HISTORY_MONTHS}개월 · 슬롯 (대면 연인원)</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ ...thS, textAlign: "left" }}>월</th>{langHeads}</tr></thead>
            <tbody>
              {[...monthly].reverse().map(({ y, m, supply, current }) => (
                <tr key={`${y}-${m}`} style={current ? { background: C.orangeLight } : {}}>
                  <td style={tdL}>{y !== year ? `${y}년 ` : ""}{m}월{current && <span style={{ color: C.orangeDark, fontWeight: 600 }}> (조회 중)</span>}</td>
                  {supply ? langCells(supply.month)
                    : <td colSpan={SUPPLY_LANGS.length + 1} style={{ ...td, textAlign: "center", color: C.g3 }}>{history ? "근무표 없음" : "불러오는 중…"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 주 추이 */}
      <div style={card}>
        <div style={title}>주별 제공 슬롯 <span style={sub}>일~토 기준 (일요일 휴무) · 최근 주가 위</span></div>
        <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ ...thS, textAlign: "left" }}>주</th>{langHeads}</tr></thead>
            <tbody>
              {weekly.map(wk => (
                <tr key={wk.key}>
                  <td style={tdL}>{md(wk.start)}~{md(wk.end)}{wk.partial && <span style={{ color: C.grey, fontWeight: 500 }}> (일부)</span>}</td>
                  {langCells(wk.tot)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 일별 (조회 중인 달) */}
      <div style={card}>
        <div style={title}>{month}월 일별 제공 슬롯 <span style={sub}>슬롯 (대면 인원)</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={{ ...thS, textAlign: "left" }}>날짜</th>{langHeads}</tr></thead>
            <tbody>
              {Object.entries(cur.byDay).map(([d, row]) => {
                const dow = new Date(year, month - 1, +d).getDay();
                const closed = total(row) === 0;
                return (
                  <tr key={d} style={closed ? { background: C.g1, color: C.g3 } : {}}>
                    <td style={tdL}>{month}/{d}({DAYS_KO[dow]})</td>
                    {closed ? <td colSpan={SUPPLY_LANGS.length + 1} style={{ ...td, textAlign: "center" }}>미운영</td> : langCells(row)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상담사별 */}
      <div style={card}>
        <div style={title}>{month}월 상담사별 공급 · 언어 비율</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...thS, textAlign: "left" }}>상담사</th>
              <th style={{ ...thS, textAlign: "left" }}>공급 언어 비율</th>
              <th style={thS}>대면 근무일</th>
              <th style={thS}>공급 슬롯</th>
            </tr></thead>
            <tbody>
              {consultants.map(s => {
                const per = cur.byStaff[s.id] || {};
                const heads = Object.values(per).reduce((n, v) => n + v.heads, 0);
                const slots = Object.values(per).reduce((n, v) => n + v.slots, 0);
                const share = cur.shares[s.id];
                const info = shareInfo(s);
                const editing = shareEdit?.sid === s.id;
                return (
                  <tr key={s.id}>
                    <td style={tdL}>{s.name}<div style={{ fontSize: 10, color: C.grey, fontWeight: 500 }}>{LANG_LABEL[s.lang] || s.lang}{s.onlineOnly ? " · 온라인 전담" : ""}</div></td>
                    <td style={{ ...td, textAlign: "left" }}>
                      {s.onlineOnly || !share ? <span style={{ color: C.g3 }}>대면 공급 없음</span> : editing ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {SUPPLY_LANGS.map(lg => (
                            <label key={lg} style={{ fontSize: 11 }}>{LANG_LABEL[lg]}
                              <input type="number" min={0} max={100} value={shareEdit.pct[lg]}
                                onChange={e => setShareEdit(p => ({ ...p, pct: { ...p.pct, [lg]: e.target.value } }))}
                                style={{ width: 40, marginLeft: 2, border: `1px solid ${C.g2}`, borderRadius: 6, padding: "2px 4px", fontSize: 11, fontFamily: font }} />%
                            </label>
                          ))}
                          <Btn onClick={() => saveShare(s.id, Object.fromEntries(SUPPLY_LANGS.map(lg => [lg, +shareEdit.pct[lg] || 0])))} style={{ padding: "2px 8px", fontSize: 11 }}>고정</Btn>
                          {info.src === "고정" && <Btn onClick={() => saveShare(s.id, null)} style={{ padding: "2px 8px", fontSize: 11 }}>해제</Btn>}
                          <span style={{ fontSize: 11, color: C.grey, cursor: "pointer" }} onClick={() => setShareEdit(null)}>취소</span>
                        </span>
                      ) : (
                        <span style={{ cursor: "pointer" }} title="클릭해서 비율 고정"
                          onClick={() => setShareEdit({ sid: s.id, pct: Object.fromEntries(SUPPLY_LANGS.map(lg => [lg, pct(share[lg])])) })}>
                          <span style={{ background: info.src === "고정" ? C.plum : C.g1, color: info.src === "고정" ? C.white : C.g5, borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 800, marginRight: 6 }}>{info.src}</span>
                          {SUPPLY_LANGS.filter(lg => share[lg] >= 0.005).map(lg => `${LANG_LABEL[lg]} ${pct(share[lg])}%`).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td style={td}>{heads ? num(heads) : ""}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{slots ? num(slots) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: C.grey, marginTop: 6, lineHeight: 1.6 }}>
          기본은 근무표 주 언어 100%입니다. 태국어 상담사가 영어를 주로 받는 것처럼 실제 상담 언어가 다르면 비율을 클릭해 고정하세요 — 모든 달의 계산에 같이 반영됩니다.
        </div>
      </div>
    </div>
  );
}

function CalendarView({ year, month, days, schedule, warnings, staff, altHolidays, onDayClick }) {
  const firstDow = getFirstDow(year, month);
  const warnMap  = {};
  warnings.forEach(w => { if (!warnMap[w.day]) warnMap[w.day] = []; warnMap[w.day].push(w.msg); });
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayRow = isCurrentMonth ? Math.floor((firstDow + today.getDate() - 1) / 7) : -1;

  return (
    <div style={{ background: C.white, borderRadius: 12, padding: 14, border: `1px solid ${C.line}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, marginBottom: 6 }}>
        {DAYS_KO.map((d, i) => <div key={i} style={{ textAlign: "center", fontWeight: 800, fontSize: 12, color: i === 0 ? C.grey : i === 6 ? C.g5 : C.g6 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dow     = new Date(year, month - 1, d).getDay();
          const isAlt   = altHolidays.has(d);
          const working = staff.filter(s => schedule[s.id]?.[d] && !["OFF", ""].includes(schedule[s.id][d]));
          const isToday = isCurrentMonth && today.getDate() === d;
          const inTodayRow = todayRow === Math.floor(i / 7);
          const isClosed = isAlt || isClosedSunday(year, month, d); // 미운영일(일요일·휴일)
          return (
            <div key={d} onClick={() => onDayClick(d)}
              style={{ border: `${isToday ? 2 : 1}px solid ${isToday ? C.orange : C.line}`, borderRadius: 8, padding: "5px 6px", minHeight: 80, background: isClosed ? C.g1 : inTodayRow ? C.orangeLight : C.white, cursor: "pointer" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: isClosed ? C.grey : C.black, marginBottom: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{d}</span>
                {(isAlt || warnMap[d]) && <span style={{ width: 5, height: 5, borderRadius: "50%", background: isAlt ? C.plumMid : C.orangeDark, display: "inline-block" }} />}
              </div>
              {working.slice(0, 4).map(s => {
                const cfg = STATUS_CONFIG[schedule[s.id][d]] || STATUS_CONFIG[""];
                return <div key={s.id} style={{ fontSize: 9, background: cfg.bg, color: cfg.color, borderRadius: 3, padding: "1px 3px", marginBottom: 2, fontWeight: 700, display: "flex", justifyContent: "space-between", border: `1px solid ${C.line}` }}><span>{s.name}</span><span>{cfg.short}</span></div>;
              })}
              {working.length > 4 && <div style={{ fontSize: 9, color: C.grey }}>+{working.length - 4}명</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AuthShell (로그인/최초 프로필 설정 화면 공통 레이아웃) ─────
function AuthShell({ children }) {
  return (
    <div style={{ fontFamily: font, minHeight: "100vh", display: "flex" }}>
      <style>{`@media (max-width: 760px) { .auth-side-panel { display: none !important; } }`}</style>
      <div className="auth-side-panel" style={{
        flex: "0 0 42%", minHeight: "100vh", position: "relative", padding: 32,
        background: `linear-gradient(135deg, ${C.orangeMid} 0%, ${C.orange} 55%, #E5572B 100%)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/unni-arrow.png" alt="" style={{ width: 22, height: 22 }} />
          <span style={{ color: C.white, fontWeight: 800, fontSize: 12, letterSpacing: "0.06em" }}>언니가이드 근무앱</span>
        </div>
        <div style={{ position: "absolute", left: 32, bottom: 36 }}>
          <div style={{ color: C.white, fontWeight: 900, fontSize: 30, letterSpacing: "-0.02em" }}>언니가이드</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 13, marginTop: 4 }}>언니가이드 직원 근태기록</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: "100vh", background: C.white, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: 320 }}>
          <img src="/unni-arrow.png" alt="언니가이드" style={{ width: 40, height: 40, marginBottom: 24 }} />
          {children}
        </div>
      </div>
    </div>
  );
}

function GoogleG({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 12.9 4.5 3.5 13.9 3.5 25S12.9 45.5 24 45.5c11 0 20-8.9 20-20 0-1.7-.2-3.4-.4-5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5c-7.6 0-14.1 4.3-17.4 10.6z"/>
      <path fill="#4CAF50" d="M24 45.5c5.4 0 10.3-1.9 14-5.1l-6.5-5.4c-2 1.4-4.6 2.3-7.5 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.9 41.1 16.4 45.5 24 45.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.5 5.4C40.8 36.4 44 31.3 44 25c0-1.7-.2-3.4-.4-4.5z"/>
    </svg>
  );
}

// ── Modal ─────────────────────────────────────────────────────
function Modal({ children, onClose, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(13,13,13,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 14, padding: 22, width: wide ? 520 : 300, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(13,13,13,0.18)" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── 공통 스타일 헬퍼 ──────────────────────────────────────────
const Btn = ({ children, onClick, style = {} }) => (
  <button onClick={onClick} style={{ background: C.white, border: `1px solid ${C.g2}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: 13, color: C.black, fontFamily: font, ...style }}>{children}</button>
);
const th = w => ({ padding: "5px 3px", textAlign: "center", fontWeight: 800, fontSize: 11, background: C.g1, borderBottom: `1px solid ${C.g2}`, borderRight: `1px solid ${C.line}`, minWidth: w, maxWidth: w, position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap", cursor: "pointer", color: C.g7 });
const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: "#2E2E2E", marginBottom: 5, marginTop: 10 };
const inp = f => ({ width: "100%", border: "1px solid #D4D4D4", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: f, boxSizing: "border-box", outline: "none" });
const chipStyle = (bg, color, sel, font) => ({ background: bg, color, border: `1px solid ${sel ? color : "#D4D4D4"}`, borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: font });
