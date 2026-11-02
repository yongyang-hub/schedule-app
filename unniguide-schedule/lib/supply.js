// 대면 상담 공급량(슬롯) 계산 공용 로직.
// workload.js와 마찬가지로 React·Firebase에 의존하지 않는 순수 함수만 둔다.
//
// ── 정의 ─────────────────────────────────────────────────────────────
//  · 공급 = 그날 대면 상담(OFF-Con) 근무 인원 × 1인당 하루 슬롯 수 (언어권별)
//  · 반차(VAC-AM/VAC-PM)는 나머지 반나절을 대면으로 본다 → 0.5인
//    (스케줄 셀이 반차 하나뿐이라 남은 반나절이 온라인인지는 알 수 없다. 온라인 전담자는 제외)
//  · 온라인 상담(ON-Con)·휴가·OFF·대기·온보딩은 0
//  · 한 사람의 슬롯을 어느 언어권 공급으로 볼지는 기간별로 지정할 수 있다. 태국어 상담사가 태국 수요
//    부족으로 영어 상담을 받는 식의 운영이 흔해서, 근무표 언어로만 나누면 실제와 어긋나기 때문이다.
//    우선순위: 주 지정(그 주만) → 가장 최근 월 지정(그 달부터 다음 지정 전까지) → 근무표 주 언어
//    1인당 슬롯 수도 지정된 언어권 설정을 따른다.
//  · 온보딩·미합류 기간(activeDate·joinDate 이전, ONBD·ALT 셀)은 공급으로 세지 않는다
//  · 1인당 슬롯은 평일·토요일을 따로 둔다 (30분 슬롯, 평일 18:30·토 16:30 마감, 점심 1시간 제외)
import { isClosedSunday, weeksOf } from "./workload.js";

export const SUPPLY_LANGS = ["영미", "중국/대만", "태국", "일본"];

// 코드에 박아 둔 기본 지정 (근무표 이름 기준). 관리자가 앱에서 같은 기간을 지정하면 그쪽이 우선한다.
//   프림 — 2026-09부터 태국 수요 부족으로 영어 상담을 받고 있어 영어 공급으로 본다
export const LANG_ASSIGN_DEFAULTS = {
  "프림": { months: { "2026-09": "영미" } },
};

const pad2 = n => String(n).padStart(2, "0");
export const monthKeyOf = (y, m) => `${y}-${pad2(m)}`;
// 주 키 = 그 주 일요일 날짜 (주는 일~토, workload.js weeksOf와 같은 기준)
export function weekKeyOf(y, m, d) {
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - t.getDay());
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

// 코드 기본값 + 관리자 지정(DB) 합치기. 반환: { [staffId]: { months: {YYYY-MM: lang}, weeks: {YYYY-MM-DD: lang} } }
export function mergeLangAssign(staff, saved) {
  const out = {};
  staff.forEach(s => {
    const def = LANG_ASSIGN_DEFAULTS[s.name] || {};
    const db = saved?.[s.id] || {};
    out[s.id] = {
      months: { ...(def.months || {}), ...(db.months || {}) },
      weeks:  { ...(def.weeks  || {}), ...(db.weeks  || {}) },
    };
  });
  return out;
}

// 지정 값 = 언어권 이름, 또는 BASE_LANG("근무표 주 언어로 되돌림" — 코드 기본값·이전 달 지정을 끊을 때)
export const BASE_LANG = "base";
const validAssign = v => v === BASE_LANG || SUPPLY_LANGS.includes(v);

// 그날 그 사람을 어느 언어권 공급으로 볼지 + 근거. src = "week" | "month" | "base"
export function resolveLang(s, assign, y, m, d) {
  const a = assign?.[s.id];
  const pick = v => (v === BASE_LANG ? s.lang : v);
  const wk = a?.weeks?.[weekKeyOf(y, m, d)];
  if (validAssign(wk)) return { lang: pick(wk), src: "week" };
  const ym = monthKeyOf(y, m);
  const key = Object.keys(a?.months || {}).filter(k => k <= ym && validAssign(a.months[k])).sort().pop();
  if (key) return { lang: pick(a.months[key]), src: "month", from: key };
  return { lang: s.lang, src: "base" };
}

// 10:00~18:30 시작 슬롯 18개, 토요일 10:00~16:30 시작 14개에서 점심 휴식 1시간(2슬롯)을 뺀 값
export const DEFAULT_SLOTS = { weekday: 16, saturday: 12 };

// 저장된 설정이 일부만 있어도 빈 칸은 기본값으로 채운다.
export function normalizeSupplySettings(raw) {
  const out = {};
  SUPPLY_LANGS.forEach(lg => {
    const r = raw?.[lg] || {};
    out[lg] = {
      weekday:  Number.isFinite(+r.weekday)  && r.weekday  !== "" ? +r.weekday  : DEFAULT_SLOTS.weekday,
      saturday: Number.isFinite(+r.saturday) && r.saturday !== "" ? +r.saturday : DEFAULT_SLOTS.saturday,
    };
  });
  return out;
}

export function faceWeight(st) {
  if (st === "OFF-Con") return 1;
  if (st === "VAC-AM" || st === "VAC-PM") return 0.5;
  return 0;
}

// 한 달치 언어권별·일자별 공급.
//   cal         → makeCalendar 결과
//   staff       → staffList
//   statusOf    → (staff, d) => 상태 문자열
//   isActiveOn  → (staff, d) => 정상 근무 구간인지 (미합류·온보딩이면 false)
//   settings    → normalizeSupplySettings 결과
//   assign      → mergeLangAssign 결과 (없으면 근무표 주 언어)
// 반환: { byDay: { [d]: { [lang]: { heads, slots } } }, byStaff: { [id]: { [d]: { heads, slots, lang } } },
//         weeks: [...], month: { [lang]: { heads, slots } } }
export function computeSupply(cal, { staff, statusOf, isActiveOn = () => true, settings, assign = {} }) {
  const consultants = staff.filter(s => s.type === "consultant" && !s.onlineOnly && SUPPLY_LANGS.includes(s.lang));
  const empty = () => Object.fromEntries(SUPPLY_LANGS.map(lg => [lg, { heads: 0, slots: 0 }]));
  const add = (acc, src) => SUPPLY_LANGS.forEach(lg => { acc[lg].heads += src[lg].heads; acc[lg].slots += src[lg].slots; });

  const byDay = {};
  const byStaff = Object.fromEntries(consultants.map(s => [s.id, {}]));
  for (let d = 1; d <= cal.days; d++) {
    const row = empty();
    if (!cal.isOffDay(d) && !isClosedSunday(cal.y, cal.m, d)) {
      consultants.forEach(s => {
        if (!isActiveOn(s, d)) return;
        const w = faceWeight(statusOf(s, d));
        if (!w) return;
        const { lang } = resolveLang(s, assign, cal.y, cal.m, d);
        const slots = w * (cal.dow(d) === 6 ? settings[lang].saturday : settings[lang].weekday);
        byStaff[s.id][d] = { heads: w, slots, lang };
        row[lang].heads += w;
        row[lang].slots += slots;
      });
    }
    byDay[d] = row;
  }

  const weeks = weeksOf(cal).map(wk => {
    const tot = empty();
    wk.days.forEach(d => add(tot, byDay[d]));
    return { ...wk, supply: tot };
  });
  const month = empty();
  for (let d = 1; d <= cal.days; d++) add(month, byDay[d]);

  return { byDay, byStaff, weeks, month };
}
