// 주 1회(월요일 아침) "이번 달 근무일수 미달 예상" Slack 알림.
// Vercel Cron이 호출 (vercel.json 참고). daily-digest와 마찬가지로 AI 에이전트를 거치지 않는
// 순수 서버 코드이며, 비밀값은 전부 Vercel 환경변수로 관리한다 (코드에 평문 없음).
//
// 왜 필요한가 — 월~토 6일 운영에 각자 주 1일을 쉬어 주 5일을 맞추는데, 공휴일이 토요일에
// 걸리거나 연휴가 길면 그 주 운영일이 5일 밑으로 내려간다. 일요일이 휴무라 보충할 자리도 없어
// 월 총량을 못 채우는 사람이 생긴다. 월말에 손으로 찾지 말고 미리 잡아서 휴가로 처리하게 한다.
//
// 계산 규칙은 앱 화면과 똑같이 lib/workload.js 하나만 쓴다.
import {
  makeCalendar, computeBaseline, capacityNotes, evaluatePerson, getDays,
} from "../lib/workload.js";

// 이름 -> Slack 사용자 ID. 매핑이 있으면 @태그로, 없으면 이름 그대로 표시.
// daily-digest.js의 같은 맵과 함께 관리할 것 (신규 입사자 추가 시 양쪽 모두).
const NAME_TO_SLACK_ID = {
  "라라": "U0AM4JE6BBK",
  "헤일리": "U0B0BAUN067",
  "오브리": "U0B219DE2KD",
  "제이디": "U0A850X4CCB",
  "렉시": "U0B28GM6QGK",
  "루미": "U0ALRM2LD7C",
  "캔디스": "U09MK8A3WDC",
  "프림": "U0976S66G93",
  "페니": "U0AEG8Q6AAJ",
  "짜니": "U0AFCJNPVS4",
  "모카": "U0B5A1GFJGY",
  "케브": "U09DYUPULGM",
  "윤": "U01PMBJG4CV",
  "마미": "U0BFHSLCJQ3",
  "용": "U09U5QR0JL8",
};
const mention = name => (NAME_TO_SLACK_ID[name] ? `<@${NAME_TO_SLACK_ID[name]}>` : name);

async function signIn() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SCHEDULE_BOT_EMAIL,
        password: process.env.SCHEDULE_BOT_PASSWORD,
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`Firebase sign-in failed: ${res.status} ${await res.text()}`);
  return (await res.json()).idToken;
}

async function dbGet(token, path) {
  const res = await fetch(`${process.env.FIREBASE_DB_URL}/${path}.json?auth=${token}`);
  if (!res.ok) throw new Error(`DB read failed (${path}): ${res.status} ${await res.text()}`);
  return res.json();
}

// 앱의 phaseOf와 같은 판정 — 미합류(pre) / 온보딩(onboard) / 정상(active)
const dateNum = (y, m, d) => y * 10000 + m * 100 + d;
function isActiveOn(s, y, m, d) {
  const dn = dateNum(y, m, d);
  if (s.joinDate && dn < s.joinDate) return false;
  if (s.activeDate && dn < s.activeDate) return false;
  return true;
}

async function buildReport() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const mkey = `${year}-${String(month).padStart(2, "0")}`;

  const token = await signIn();
  const [staffRaw, schedule, altRaw, cancelledRaw] = await Promise.all([
    dbGet(token, "staffList"),
    dbGet(token, `schedule/${mkey}`),
    dbGet(token, `altHolidays/${mkey}`),
    dbGet(token, `cancelledHolidays/${mkey}`),
  ]);
  if (!schedule) return null; // 아직 이번 달 표가 없으면 보낼 게 없다

  const alt = new Set(altRaw ? Object.values(altRaw) : []);
  const cancelled = new Set(cancelledRaw ? Object.values(cancelledRaw) : []);
  const cal = makeCalendar(year, month, { alt, cancelled });
  const base = computeBaseline(cal);
  const notes = capacityNotes(cal);

  const shortfalls = [];
  for (const s of (staffRaw || []).filter(x => x && x.active)) {
    const r = evaluatePerson(cal, {
      statusOf: d => (schedule[s.id] || {})[d],
      isActiveOn: d => isActiveOn(s, year, month, d),
      fromDay: today,
    });
    if (r.diff < 0 && r.actual > 0) shortfalls.push({ name: s.name, ...r });
  }
  shortfalls.sort((a, b) => b.needVac - a.needVac || a.diff - b.diff);

  const remaining = getDays(year, month) - today + 1;
  const lines = [`🗓️ *${month}월 근무일수 점검* — 남은 ${remaining}일`, ""];
  lines.push(
    `*기준 근무일수* ${base.required}일 (평일 ${base.weekdays}일` +
      (base.pubOnWeekday ? ` − 공휴일 ${base.pubOnWeekday}일` : "") +
      (base.altOnWeekday ? ` − 지정휴일 ${base.altOnWeekday}일` : "") + ")"
  );
  if (base.altOnWeekday > 0) {
    lines.push(`  └ 일반 사무직 기준(${base.statutory}일)보다 ${base.altOnWeekday}일 적습니다`);
  }

  if (notes.length) {
    lines.push("");
    lines.push("*이번 달 구조적 제약*");
    notes.forEach(n => lines.push(`• ${n.msg}`));
  }

  lines.push("");
  if (!shortfalls.length) {
    lines.push("*미달 예상* 없음 — 전원 기준 충족 중입니다 ✅");
  } else {
    const urgent = shortfalls.filter(f => f.needVac > 0);
    const fixable = shortfalls.filter(f => f.needVac === 0);
    if (urgent.length) {
      lines.push("*휴가 처리 필요* — 남은 운영일로는 채울 수 없습니다");
      urgent.forEach(f => lines.push(`• ${mention(f.name)} ${f.actual}/${f.required}일 (−${-f.diff}) → 휴가 ${f.needVac}일 필요`));
    }
    if (fixable.length) {
      if (urgent.length) lines.push("");
      lines.push("*보충 가능* — 남은 빈 운영일을 근무로 돌리면 채워집니다");
      fixable.forEach(f => lines.push(`• ${mention(f.name)} ${f.actual}/${f.required}일 (−${-f.diff}) → 빈 운영일 ${f.openLeft}일`));
    }
  }

  return lines.join("\n");
}

export default async function handler(req, res) {
  // Vercel Cron이 자동으로 붙이는 Authorization 헤더로 외부 무단 호출 차단
  const authHeader = req.headers["authorization"];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  let text;
  try {
    text = await buildReport();
  } catch (e) {
    text = `근무일수 점검 생성 실패: ${e.message}`;
  }

  if (text === null) {
    res.status(200).json({ ok: true, skipped: "no_schedule" });
    return;
  }

  try {
    const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "근무표 점검" }),
    });
    if (!slackRes.ok) {
      res.status(502).json({ error: "slack_webhook_failed", status: slackRes.status });
      return;
    }
  } catch (e) {
    res.status(502).json({ error: "slack_webhook_error", message: e.message });
    return;
  }

  res.status(200).json({ ok: true, text });
}
