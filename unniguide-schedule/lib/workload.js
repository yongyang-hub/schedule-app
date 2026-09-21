// 근무일수 계산 공용 로직.
// 앱 화면(src/App.jsx)과 서버 알림(api/*)이 같은 기준을 쓰도록 한 곳에 모아둔다.
// React·Firebase에 의존하지 않는 순수 함수만 둘 것 — 양쪽에서 그대로 import 한다.
//
// ── 운영 원칙 ────────────────────────────────────────────────────────
//  · 월~토 6일 운영, 일요일 휴무. 각자 주 1일 쉬어 주 5일 근무.
//  · 월 총 근무일수는 일반 힐링페이퍼 직원(월~금 사무직)과 동일하게 맞춘다.
//  · 공휴일이 토요일에 걸리거나 연휴가 길면 그 주 운영일이 5일 밑으로 내려가,
//    아무리 붙여도 총량을 못 채우는 사람이 생긴다. 일요일이 휴무라 보충할 자리도 없다.
//    → 그런 사람을 미리 잡아 "휴가 처리 필요"까지 계산해 알린다.

// 일요일 운영 구간: SUNDAY_OPEN(포함) ~ SUNDAY_CLOSE(미포함) 사이의 일요일만 근무일.
// 그 밖의 일요일은 전체 공통 미운영 — 자동 OFF · 회색 처리 · 근무일수 계산에서 제외.
// 2026-09-01부터 일요일 전면 휴무로 정책 변경. 그 이전(6/14~8/30) 근무 이력은 그대로 보존한다.
export const SUNDAY_OPEN = 20260613;
export const SUNDAY_CLOSE = 20260901;

// 대한민국 공휴일 (연도 → 월 → 일 배열)
export const KR_HOLIDAYS = {
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

export const getDays = (y, m) => new Date(y, m, 0).getDate();
const ymdKey = (y, m, d) => y * 10000 + m * 100 + d;

export function isClosedSunday(y, m, d) {
  if (new Date(y, m - 1, d).getDay() !== 0) return false;
  const k = ymdKey(y, m, d);
  return k < SUNDAY_OPEN || k >= SUNDAY_CLOSE;
}

// SUNDAY_CLOSE 이후의 일요일 — 이미 저장된 셀을 OFF로 정규화할 때 쓴다(과거 이력은 대상 아님).
export function closedSundaysOf(y, m) {
  const out = [];
  for (let d = 1; d <= getDays(y, m); d++) {
    if (new Date(y, m - 1, d).getDay() === 0 && ymdKey(y, m, d) >= SUNDAY_CLOSE) out.push(d);
  }
  return out;
}

// 근무일수로 인정되는 날 = 실제 출근 + 휴가 + 반차. OFF·빈칸·대기·온보딩은 제외.
// 휴가와 반차를 1일로 세는 이유: 기준이 "일반 사무직과 같은 월 총 근무일수"이고,
// 연차는 소정근로일에 포함되는 유급휴가라 쓴다고 미달이 아니기 때문이다.
// (못 채우는 사람에게 휴가를 쓰게 하는 실제 운영과도 맞물린다.)
// 다만 총량만 보면 실제 출근이 며칠인지 가려지므로, 아래 evaluatePerson이 내역을 따로 돌려준다.
export const countsAsWorked = st => !!st && !["OFF", "", "ALT", "ONBD"].includes(st);
export const isVacation = st => st === "VAC";
export const isHalfDay = st => st === "VAC-AM" || st === "VAC-PM";

// 근무일수 내역을 사람이 읽는 한 줄로. 앱 배지와 Slack 알림이 같은 문구를 쓴다.
export function breakdownText(r) {
  const parts = [`출근 ${r.attended}일`];
  if (r.halfDays) parts.push(`반차 ${r.halfDays}일`);
  if (r.vacDays) parts.push(`휴가 ${r.vacDays}일`);
  return parts.join(" · ");
}

// 한 달치 달력 컨텍스트. alt=지정휴일(대체공휴일 포함), cancelled=취소된 공휴일.
export function makeCalendar(y, m, { alt = new Set(), cancelled = new Set() } = {}) {
  const days = getDays(y, m);
  const pub = new Set(KR_HOLIDAYS[y]?.[m] || []);
  const dow = d => new Date(y, m - 1, d).getDay();
  const isPubHoliday = d => pub.has(d) && !cancelled.has(d);
  const isWeekday = d => dow(d) !== 0 && dow(d) !== 6;
  // 운영하지 않는 날 — 미운영 일요일 · 공휴일 · 지정휴일
  const isOffDay = d => isClosedSunday(y, m, d) || isPubHoliday(d) || alt.has(d);
  return { y, m, days, dow, alt, isPubHoliday, isWeekday, isOffDay };
}

// 주 단위로 쪼갠다(일~토). 월 경계에서 잘린 주는 partial=true.
export function weeksOf(cal) {
  const out = [];
  for (let d = 1; d <= cal.days; ) {
    const start = cal.dow(d);
    const wk = [];
    for (let i = 0; i < 7 - start && d + i <= cal.days; i++) wk.push(d + i);
    out.push({ days: wk, partial: wk.length < 7 });
    d += wk.length;
  }
  return out;
}

// 월 기준 근무일수와 그 산출 내역.
//   기준일수 = 평일(월~금) − 평일에 걸린 공휴일 − 평일에 걸린 지정휴일
// 토·일을 빼는 건 "며칠을 채워야 하는가"의 총량만 보기 때문이다. 화~토 근무자도 주 5일이면 맞는다.
// 지정휴일을 넣을수록 일반 사무직 기준(statutory)보다 내려가므로 그 차이도 함께 돌려준다.
export function computeBaseline(cal) {
  let weekdays = 0, pubOnWeekday = 0, altOnWeekday = 0;
  for (let d = 1; d <= cal.days; d++) {
    if (!cal.isWeekday(d)) continue;
    weekdays++;
    if (cal.isPubHoliday(d)) pubOnWeekday++;
    else if (cal.alt.has(d)) altOnWeekday++;
  }
  const statutory = weekdays - pubOnWeekday;
  return { weekdays, pubOnWeekday, altOnWeekday, statutory, required: statutory - altOnWeekday };
}

// 스케줄과 무관하게 달력만으로 정해지는 제약.
export function capacityNotes(cal) {
  const notes = [];
  // 토요일에 걸린 공휴일: 월~금 근무자에겐 영향이 없지만, 그 주 토요일 근무자는 1일이 빈다.
  // 기준일수는 토요일을 애초에 세지 않으므로 이 하루는 어디서도 벌충되지 않는다.
  for (let d = 1; d <= cal.days; d++) {
    if (cal.dow(d) === 6 && cal.isPubHoliday(d)) {
      notes.push({ key: `sat${d}`, msg: `${cal.m}/${d}(토) 공휴일 — 이 주 토요일 근무자는 총 근무일수가 1일 빕니다` });
    }
  }
  // 운영일이 5일 미만인 주: 전원이 그 주 5일을 못 채운다.
  // 월 경계에서 잘린 주는 이 달만 보고 판단할 수 없어 제외한다 (부족분은 월 총량 비교에서 잡힌다).
  for (const wk of weeksOf(cal)) {
    if (wk.partial) continue;
    const open = wk.days.filter(d => !cal.isOffDay(d));
    if (open.length < 5) {
      notes.push({
        key: `wk${wk.days[0]}`,
        msg: `${cal.m}/${wk.days[0]}~${wk.days[wk.days.length - 1]} 운영일 ${open.length}일 — 전원 이 주 ${5 - open.length}일 부족`,
      });
    }
  }
  return notes;
}

// 한 사람의 근무일수 평가.
//   statusOf(d)   → 그 날 스케줄 상태 문자열
//   isActiveOn(d) → 그 날 정상 근무 구간인지 (미합류·온보딩 제외)
//   fromDay       → 보충 가능일을 셀 시작일 (이번 달이면 오늘, 아니면 1)
export function evaluatePerson(cal, { statusOf, isActiveOn = () => true, fromDay = 1 }) {
  let required = 0, attended = 0, halfDays = 0, vacDays = 0;
  for (let d = 1; d <= cal.days; d++) {
    if (!isActiveOn(d)) continue;
    // 기준: 평일 중 공휴일·지정휴일이 아닌 날
    if (cal.isWeekday(d) && !cal.isPubHoliday(d) && !cal.alt.has(d)) required++;
    // 실적: 미운영 일요일은 셀 수 없고, 나머지는 스케줄 그대로.
    // 셋 다 1일로 합산하되 어디서 온 1일인지는 따로 남긴다.
    if (isClosedSunday(cal.y, cal.m, d)) continue;
    const st = statusOf(d);
    if (isVacation(st)) vacDays++;
    else if (isHalfDay(st)) halfDays++;
    else if (countsAsWorked(st)) attended++;
  }
  const actual = attended + halfDays + vacDays;
  const diff = actual - required;

  // 앞으로 근무로 돌릴 수 있는 날 — 주 5일 상한을 넘겨 채우라고 할 수는 없으므로
  // 주 단위로 "5일까지 남은 여유"와 "실제 비어 있는 운영일" 중 작은 쪽만 인정한다.
  let openLeft = 0;
  for (const wk of weeksOf(cal)) {
    const usable = wk.days.filter(d => d >= fromDay && isActiveOn(d) && !cal.isOffDay(d));
    if (!usable.length) continue;
    // 주 5일 상한은 그 주 전체에 걸리므로 이미 지난 날의 근무도 함께 센다
    const worked = wk.days.filter(d => isActiveOn(d) && !isClosedSunday(cal.y, cal.m, d) && countsAsWorked(statusOf(d))).length;
    const empty = usable.filter(d => { const st = statusOf(d); return !st || st === "OFF"; }).length;
    openLeft += Math.min(Math.max(0, 5 - worked), empty);
  }

  const short = Math.max(0, -diff);
  return { required, actual, attended, halfDays, vacDays, diff, openLeft, needVac: Math.max(0, short - openLeft) };
}
