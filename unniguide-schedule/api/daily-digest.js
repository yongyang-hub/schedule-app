// 매일 아침 언니가이드 근무표 -> "오늘 출근 명단" Slack 알림.
// Vercel Cron이 매일 이 라우트를 호출 (vercel.json 참고). AI 에이전트를 거치지 않는
// 순수 서버 코드이며, 비밀값은 전부 Vercel 환경변수로 관리한다 (코드에 평문 없음).
// 방 배정 로직은 재설계 예정이라 방 번호는 표시하지 않는다.

const LANG_LABEL = { "영미": "영어", "중국/대만": "중국/대만", "태국": "태국", "일본": "일본" };

// 이름 -> Slack 사용자 ID. 매핑이 있으면 @태그로, 없으면 이름 그대로 표시.
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

function mention(name) {
  const id = NAME_TO_SLACK_ID[name];
  return id ? `<@${id}>` : name;
}

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
  const data = await res.json();
  return data.idToken;
}

async function dbGet(token, path) {
  const res = await fetch(`${process.env.FIREBASE_DB_URL}/${path}.json?auth=${token}`);
  if (!res.ok) throw new Error(`DB read failed (${path}): ${res.status} ${await res.text()}`);
  return res.json();
}

async function buildDigest() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekdayKo = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];
  const mkey = `${year}-${String(month).padStart(2, "0")}`;

  const token = await signIn();
  const [staffRaw, schedule] = await Promise.all([
    dbGet(token, "staffList"),
    dbGet(token, `schedule/${mkey}`),
  ]);
  const staff = staffRaw || [];

  const active = staff.filter((s) => s.active);
  const statusOf = (sid) => ((schedule || {})[sid] || [])[day];

  const floor1 = [];
  const floor2 = [];
  const workingByLang = {};
  const onlineOnly = [];
  const onVacation = [];
  for (const s of active) {
    const st = statusOf(s.id);
    if (s.type === "concierge") {
      if (st === "R1") floor1.push(mention(s.name));
      else if (st === "R2") floor2.push(mention(s.name));
      else if (st === "VAC") onVacation.push(mention(s.name));
      continue;
    }
    if (st === "VAC") {
      onVacation.push(mention(s.name));
      continue;
    }
    if (!st || st === "OFF") continue;
    if (s.onlineOnly) {
      onlineOnly.push(mention(s.name));
      continue;
    }
    const lg = s.lang || "기타";
    const label =
      st === "OFF-Con" ? `${mention(s.name)}(대면)` : st === "ON-Con" ? `${mention(s.name)}(온라인)` : `${mention(s.name)}(${st})`;
    (workingByLang[lg] = workingByLang[lg] || []).push(label);
  }

  const lines = [`📅 *${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}(${weekdayKo}) 출근 명단*`, ""];
  lines.push(`*1층 컨시어지:* ${floor1.length ? floor1.join(", ") : "없음"}`);
  lines.push(`*2층 컨시어지:* ${floor2.length ? floor2.join(", ") : "없음"}`);
  for (const lg of ["영미", "중국/대만", "태국", "일본"]) {
    const names = workingByLang[lg];
    if (names && names.length) lines.push(`*${LANG_LABEL[lg] || lg}:* ${names.join(", ")}`);
  }
  if (onlineOnly.length) lines.push(`*온라인 전담:* ${onlineOnly.join(", ")}`);
  lines.push("");
  lines.push(`*휴가:* ${onVacation.length ? onVacation.join(", ") : "없음"}`);

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
    text = await buildDigest();
  } catch (e) {
    text = `출근 명단 생성 실패: ${e.message}`;
  }

  try {
    const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        username: "출근 알리미",
      }),
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
