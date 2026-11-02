// 대면 상담 공급량(슬롯) 계산 공용 로직.
// workload.js와 마찬가지로 React·Firebase에 의존하지 않는 순수 함수만 둔다.
//
// ── 정의 ─────────────────────────────────────────────────────────────
//  · 공급 = 그날 대면 상담(OFF-Con) 근무 인원 × 1인당 하루 슬롯 수 (언어권별)
//  · 반차(VAC-AM/VAC-PM)는 나머지 반나절을 대면으로 본다 → 0.5인
//    (스케줄 셀이 반차 하나뿐이라 남은 반나절이 온라인인지는 알 수 없다. 온라인 전담자는 제외)
//  · 온라인 상담(ON-Con)·휴가·OFF·대기·온보딩은 0
//  · 한 사람의 슬롯을 언어권에 나눠 담는 비율(share)은 관리자가 고정할 수 있다. 태국어 상담사가
//    태국 수요 부족으로 영어 상담을 받는 식의 운영이 흔해서, 근무표 언어로만 나누면 실제와 어긋난다.
//    비율 우선순위: 관리자 고정값 → 근무표 주 언어 100%
//    보조 언어(altLangs)는 자동으로 나누지 않는다 — 한 사람을 두 언어권에 겹쳐 세면 총량이 부풀기 때문
//  · 1인당 슬롯은 평일·토요일을 따로 둔다 (30분 슬롯, 평일 18:30·토 16:30 마감, 점심 1시간 제외)
import { isClosedSunday, weeksOf } from "./workload.js";

export const SUPPLY_LANGS = ["영미", "중국/대만", "태국", "일본"];

// 관리자 고정값(퍼센트) → 비율. 합이 0이면 null.
export function shareFromPercent(pct) {
  const tot = SUPPLY_LANGS.reduce((n, lg) => n + (+pct?.[lg] || 0), 0);
  if (!tot) return null;
  return Object.fromEntries(SUPPLY_LANGS.map(lg => [lg, (+pct[lg] || 0) / tot]));
}

export const primaryShare = s => Object.fromEntries(SUPPLY_LANGS.map(lg => [lg, lg === s.lang ? 1 : 0]));

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
//   isActiveOn  → (staff, d) => 정상 근무 구간인지
//   settings    → normalizeSupplySettings 결과
//   shareOf     → (staff) => { [lang]: 비율 } (합 1). 없으면 근무표 주 언어 100%
// 반환: { byDay: { [d]: { [lang]: { heads, slots } } }, byStaff: { [id]: { [d]: { heads, slots } } },
//         weeks: [...], month: { [lang]: { heads, slots } } }
export function computeSupply(cal, { staff, statusOf, isActiveOn = () => true, settings, shareOf = primaryShare }) {
  const consultants = staff.filter(s => s.type === "consultant" && !s.onlineOnly && SUPPLY_LANGS.includes(s.lang));
  const shares = Object.fromEntries(consultants.map(s => [s.id, shareOf(s) || primaryShare(s)]));
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
        // 슬롯 수는 사람의 하루 단위(주 언어 설정)로 정하고, 언어권에는 비율로 나눠 담는다
        const slots = w * (cal.dow(d) === 6 ? settings[s.lang].saturday : settings[s.lang].weekday);
        byStaff[s.id][d] = { heads: w, slots };
        SUPPLY_LANGS.forEach(lg => {
          const f = shares[s.id][lg];
          if (!f) return;
          row[lg].heads += w * f;
          row[lg].slots += slots * f;
        });
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

  return { byDay, byStaff, shares, weeks, month };
}
