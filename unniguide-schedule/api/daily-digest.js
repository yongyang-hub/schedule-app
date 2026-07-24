// 매일 아침 언니가이드 근무표 -> "오늘 출근 명단" Slack 알림.
// Vercel Cron이 매일 이 라우트를 호출 (vercel.json 참고). AI 에이전트를 거치지 않는
// 순수 서버 코드이며, 비밀값은 전부 Vercel 환경변수로 관리한다 (코드에 평문 없음).

const ROOMS = [1, 2, 4, 5, 6, 7, 8];
const ZONE_ROOMS = { "영미": [1, 2, 4], "중국/대만": [5, 6], "태국": [7, 8] };
const CONSULT_ORDER = ["제이디", "오브리", "렉시", "페니", "캔디스", "루미", "짜니", "프림", "마미"];
const LANG_LABEL = { "영미": "영어", "중국/대만": "중국/대만", "태국": "태국", "일본": "일본" };
const LANG_EMOJI = { "영미": "🇺🇸", "중국/대만": "🇨🇳", "태국": "🇹🇭", "일본": "🇯🇵" };

function consultOrd(name) {
  const i = CONSULT_ORDER.indexOf(name);
  return i < 0 ? 999 : i;
}

// App.jsx의 roomMap useMemo 로직을 그대로 재현 (개인별 고정 홈룸 + 정원 초과분 동적배정 + 관리자 강제배치)
function buildRoomMap(staff, schedule, overrides, today) {
  const consultants = staff.filter((s) => s.active && s.type === "consultant" && !s.onlineOnly);
  const ordered = [...consultants].sort((a, b) => consultOrd(a.name) - consultOrd(b.name));

  const home = {};
  const homeUsed = new Set();
  for (const s of ordered) {
    if (homeUsed.size >= ROOMS.length) break;
    const zonePref = (ZONE_ROOMS[s.lang] || []).filter((r) => !homeUsed.has(r));
    const anyFree = ROOMS.filter((r) => !homeUsed.has(r));
    const pick = zonePref.length ? zonePref[0] : anyFree[0];
    if (pick != null) {
      home[s.id] = pick;
      homeUsed.add(pick);
    }
  }

  const map = {};
  consultants.forEach((s) => {
    map[s.id] = {};
  });
  const prev = {};
  for (let d = 1; d <= today; d++) {
    const face = consultants
      .filter((s) => (schedule[s.id] || [])[d] === "OFF-Con")
      .sort((a, b) => consultOrd(a.name) - consultOrd(b.name));
    const used = new Set();
    face.forEach((s) => {
      if (home[s.id] != null && !used.has(home[s.id])) {
        map[s.id][d] = home[s.id];
        used.add(home[s.id]);
        prev[s.id] = home[s.id];
      }
    });
    face.forEach((s) => {
      if (map[s.id][d] != null) return;
      if (prev[s.id] != null && !used.has(prev[s.id])) {
        map[s.id][d] = prev[s.id];
        used.add(prev[s.id]);
      }
    });
    face.forEach((s) => {
      if (map[s.id][d] != null) return;
      const freeAll = ROOMS.filter((r) => !used.has(r));
      const freeZone = (ZONE_ROOMS[s.lang] || []).filter((r) => !used.has(r));
      const pick = freeZone.length ? freeZone[0] : freeAll[0];
      if (pick != null) {
        map[s.id][d] = pick;
        used.add(pick);
      } else {
        map[s.id][d] = 0;
      }
    });
    face.forEach((s) => {
      if (map[s.id][d]) prev[s.id] = map[s.id][d];
    });
  }

  Object.keys(overrides || {}).forEach((sid) => {
    map[sid] = map[sid] || {};
    Object.entries(overrides[sid] || {}).forEach(([day, room]) => {
      map[sid][day] = room;
    });
  });

  return map;
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
  const [staffRaw, schedule, overrides] = await Promise.all([
    dbGet(token, "staffList"),
    dbGet(token, `schedule/${mkey}`),
    dbGet(token, `roomOverrides/${mkey}`),
  ]);
  const staff = staffRaw || [];

  const active = staff.filter((s) => s.active);
  const roomMap = buildRoomMap(active, schedule || {}, overrides || {}, day);
  const statusOf = (sid) => ((schedule || {})[sid] || [])[day];

  const workingConcierge = [];
  const workingByLang = {};
  const onlineOnly = [];
  const onVacation = [];
  for (const s of active) {
    const st = statusOf(s.id);
    if (s.type === "concierge") {
      if (st && st !== "OFF" && st !== "") {
        if (st === "VAC") onVacation.push(s.name);
        else workingConcierge.push(s.name);
      }
      continue;
    }
    if (st === "VAC") {
      onVacation.push(s.name);
      continue;
    }
    if (!st || st === "OFF") continue;
    if (s.onlineOnly) {
      onlineOnly.push(s.name);
      continue;
    }
    const lg = s.lang || "기타";
    const room = (roomMap[s.id] || {})[day];
    const label =
      st === "OFF-Con" && room
        ? `${s.name}(대면 no.${room})`
        : st === "ON-Con"
        ? `${s.name}(온라인)`
        : `${s.name}(${st})`;
    (workingByLang[lg] = workingByLang[lg] || []).push(label);
  }

  const faceCount = active.filter(
    (s) => s.type === "consultant" && !s.onlineOnly && statusOf(s.id) === "OFF-Con"
  ).length;
  const short = active.filter(
    (s) =>
      s.type === "consultant" &&
      !s.onlineOnly &&
      statusOf(s.id) === "OFF-Con" &&
      !(roomMap[s.id] || {})[day]
  ).length;

  const lines = [`📋 ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}(${weekdayKo}) 출근 명단`, ""];
  lines.push(`🏨 컨시어지: ${workingConcierge.length ? workingConcierge.join(", ") : "없음"}`);
  for (const lg of ["영미", "중국/대만", "태국", "일본"]) {
    const names = workingByLang[lg];
    if (names && names.length) lines.push(`${LANG_EMOJI[lg] || ""} ${LANG_LABEL[lg] || lg}: ${names.join(", ")}`);
  }
  if (onlineOnly.length) lines.push(`🌏 온라인 전담: ${onlineOnly.join(", ")}`);
  lines.push("");
  lines.push(`🏖️ 휴가: ${onVacation.length ? onVacation.join(", ") : "없음"}`);
  lines.push(`⚠️ 방 부족: ${short === 0 ? "없음" : `${short}명 (대면 ${faceCount}/${ROOMS.length})`}`);

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
    text = `⚠️ 출근 명단 생성 실패: ${e.message}`;
  }

  try {
    const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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
