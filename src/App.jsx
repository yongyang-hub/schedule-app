import { useState } from "react";

const CLINICS = [
  {
    id: "3234", name: "지유의원", tier: 1,
    excludeCountries: [],
    language: ["영어"],
    speed: "빠름", price: "중상",
    specialties: ["리프팅", "보톡스", "필러", "지방분해", "피부", "색소", "스킨부스터"],
    triggers: ["리프팅", "스킨부스터", "색소"],
    consultants: ["Jady"],
    caution: "예약 시 카톡 핀 양식 사용 필수. 가격 민감한 고객 비추천.",
    topEvents: [
      { name: "사각턱 or 주름 보톡스", su: 3288 },
      { name: "종아리·승모근 보톡스", su: 1573 },
      { name: "지방분해 커팅주사", su: 1447 },
      { name: "사적인 인모드", su: 1091 },
    ]
  },
  {
    id: "7493", name: "테이아의원", tier: 2,
    excludeCountries: [],
    language: [],
    speed: "보통", price: "중상",
    specialties: ["리프팅", "필러", "스킨부스터", "보톡스"],
    triggers: ["리프팅", "스킨부스터"],
    consultants: ["Jady", "Candice"],
    caution: "답장 느릴 수 있음. 당일/익일 예약 불가. 색소 레이저 1종 80만원 고가 주의.",
    topEvents: [
      { name: "티타늄리프팅", su: 890 },
      { name: "울쎄라리프팅", su: 736 },
      { name: "인모드 리프팅", su: 294 },
      { name: "민트 실리프팅", su: 164 },
    ]
  },
  {
    id: "3608", name: "청담디어의원", tier: 2,
    excludeCountries: ["대만", "중국"],
    language: ["영어"],
    speed: "보통", price: "중",
    specialties: ["여드름", "리프팅", "필러", "피부"],
    triggers: ["여드름"],
    consultants: ["Jady"],
    caution: "⚠️ 대만·중국 고객 추천 불가. 리프팅 메인 케이스엔 비추천.",
    topEvents: [
      { name: "디어 필러 (턱·팔자·볼·이마)", su: 1612 },
      { name: "디어 커스텀 온다리프팅", su: 1056 },
      { name: "디어 덴서티 300샷", su: 343 },
    ]
  },
  {
    id: "1889", name: "제이필 강남점", tier: 1,
    excludeCountries: [],
    language: ["영어", "태국어"],
    speed: "빠름", price: "저~중",
    specialties: ["보톡스", "필러", "리프팅", "지방분해", "피부", "온다", "레이저"],
    triggers: ["온다", "레이저", "보톡스", "필러"],
    consultants: ["Jady", "Candice", "Primrose"],
    caution: "홍대/강남 지점 구분 필수. 대기 시간 발생 가능. 통역 지원 여부 사전 확인.",
    topEvents: [
      { name: "사각턱 or 주름 보톡스", su: 3288 },
      { name: "종아리·승모근 보톡스", su: 1573 },
      { name: "지방분해 커팅주사", su: 1447 },
      { name: "디테일 필러", su: 1139 },
    ]
  },
  {
    id: "7826", name: "제이필 홍대점", tier: 2,
    excludeCountries: [],
    language: [],
    speed: "빠름", price: "저~중",
    specialties: ["보톡스", "리프팅", "여드름", "필러", "지방분해", "온다", "레이저"],
    triggers: ["온다", "레이저", "보톡스"],
    consultants: ["Candice", "Primrose"],
    caution: "강남점과 가격 차이 있음. 지점 명시 필수. 통역 지원 여부 사전 확인.",
    topEvents: [
      { name: "사각턱 or 주름 보톡스", su: 365 },
      { name: "풀페이스 윤곽 지방분해주사", su: 211 },
      { name: "아그네스로 여드름 근본 파괴", su: 134 },
    ]
  },
  {
    id: "5857", name: "우유빛의원", tier: 2,
    excludeCountries: [],
    language: [],
    speed: "느림", price: "중상",
    specialties: ["눈밑", "팔자", "피부", "리쥬란", "색소", "레이저"],
    triggers: ["눈밑", "팔자", "리쥬란"],
    consultants: ["Candice", "Primrose"],
    caution: "⚠️ 통역 별도 배정 필요 (태국/영어). 답장 느림. 이벤트 없음.",
    topEvents: [
      { name: "환공포 리쥬란힐러", su: 1717 },
      { name: "쥬베룩&자가혈 눈밑꺼짐주사", su: 1344 },
      { name: "팔자주름 완성 (필러+쥬베룩+실)", su: 832 },
    ]
  },
  {
    id: "802", name: "모즈의원", tier: 2,
    excludeCountries: [],
    language: [],
    speed: "보통", price: "중",
    specialties: ["리프팅", "실리프팅", "팔자", "지방분해", "목주름"],
    triggers: ["실리프팅", "목주름"],
    consultants: ["Candice"],
    caution: "해외카드 결제 시 2% 추가. 유명 원장 찾는 고객에게 추천 적합.",
    topEvents: [
      { name: "팔자필프팅 (팔자필러+잼버실리프팅)", su: 1216 },
      { name: "촘촘 울쎄라피프라임 리프팅", su: 910 },
      { name: "청담 온다리프팅 초특가", su: 608 },
    ]
  },
  {
    id: "5524", name: "오앤의원", tier: 2,
    excludeCountries: [],
    language: [],
    speed: "보통", price: "중",
    specialties: ["리프팅", "줄기세포"],
    triggers: ["리프팅", "올리지오", "큐어젯", "소프웨이브"],
    consultants: ["Candice"],
    caution: "반응이 시크할 수 있음. 올리지오·큐어젯·소프웨이브 등 희귀 기기 보유 강점.",
    topEvents: []
  },
  {
    id: "1860", name: "우리성형외과의원", tier: 1,
    excludeCountries: ["태국", "중국"],
    language: [],
    speed: "빠름", price: "중",
    specialties: ["리프팅", "보톡스", "필러", "피부"],
    triggers: ["리프팅", "보톡스", "필러"],
    consultants: ["Candice"],
    caution: "⚠️ 태국·중국 고객 추천 불가. 여러 시술 한 번에 원하는 고객에 강점.",
    topEvents: []
  },
  {
    id: "5826", name: "유픽 홍대점", tier: 1,
    excludeCountries: [],
    language: ["태국어"],
    speed: "빠름", price: "저",
    specialties: ["보톡스", "필러", "피부", "스킨부스터"],
    triggers: ["입술필러", "필러", "보톡스"],
    consultants: ["Candice", "Primrose"],
    caution: "울쎄라(Prime) 불가. VAT 미포함 안내 필요. 이벤트 매월 업데이트 확인.",
    topEvents: []
  },
  {
    id: "5663", name: "유픽 강남점", tier: 2,
    excludeCountries: [],
    language: ["태국어"],
    speed: "빠름", price: "저",
    specialties: ["보톡스", "필러", "피부", "스킨부스터"],
    triggers: ["입술필러", "필러", "보톡스"],
    consultants: ["Candice", "Primrose"],
    caution: "울쎄라(Prime) 불가. VAT 미포함 안내 필요. 이벤트 매월 업데이트 확인.",
    topEvents: []
  },
  {
    id: "6890", name: "톡스앤필 신논현점", tier: 2,
    excludeCountries: ["중국"],
    language: ["태국어"],
    speed: "빠름", price: "중",
    specialties: ["보톡스", "필러", "스킨부스터", "리프팅", "피부"],
    triggers: ["보톡스", "필러", "스킨부스터"],
    consultants: ["Primrose"],
    caution: "⚠️ 중국 고객 추천 불가. 이벤트 매월 업데이트 확인.",
    topEvents: [
      { name: "사각턱 보톡스 국산 50유닛", su: 1279 },
      { name: "리쥬란 힐러 2cc", su: 887 },
    ]
  },
  {
    id: "46", name: "플라덴성형외과", tier: 1,
    excludeCountries: [],
    language: ["영어"],
    speed: "빠름", price: "중",
    specialties: ["지방분해", "필러", "리프팅", "리쥬란"],
    triggers: ["지방분해", "볼뉴머", "리쥬란"],
    consultants: ["Candice", "Primrose"],
    caution: "울쎄라 Prime / 온다 없음. 신사역 위치. 태국어는 통역 별도 필요.",
    topEvents: [
      { name: "팔·허벅지 지방분해 뽑기주사", su: 7804 },
      { name: "얼굴지방분해 뽑기주사", su: 1519 },
      { name: "플라덴 필러", su: 580 },
    ]
  },
  {
    id: "6681", name: "홍대셀레나의원", tier: 2,
    excludeCountries: [],
    language: [],
    speed: "빠름", price: "중",
    specialties: ["리프팅", "제모", "피부"],
    triggers: ["리프팅", "레이저리프팅", "울쎄라"],
    consultants: ["Primrose"],
    caution: "⚠️ 통역 없음. 태국/영어 고객 배정 주의.",
    topEvents: [
      { name: "브라질리언 제모 5회", su: 1755 },
      { name: "V라인 슈링크유니버스", su: 571 },
      { name: "이중턱·심부볼 인모드", su: 273 },
    ]
  },
];

const SPECIALTY_OPTIONS = [
  { label: "리프팅", tags: ["리프팅", "실리프팅"] },
  { label: "보톡스 / 필러", tags: ["보톡스", "필러"] },
  { label: "여드름", tags: ["여드름"] },
  { label: "눈밑 / 팔자", tags: ["눈밑", "팔자"] },
  { label: "지방분해", tags: ["지방분해"] },
  { label: "피부 / 스킨부스터", tags: ["피부", "스킨부스터", "리쥬란"] },
  { label: "색소 / 리쥬란", tags: ["색소", "리쥬란", "피부"] },
  { label: "실리프팅 / 목주름", tags: ["실리프팅", "목주름"] },
  { label: "제모", tags: ["제모"] },
  { label: "입술 필러", tags: ["입술필러", "필러"] },
  { label: "온다 / 레이저", tags: ["온다", "레이저"] },
];

function scoreClinic(clinic, form) {
  let pts = 0;
  const warns = [];

  if (clinic.excludeCountries?.length) {
    const ex = clinic.excludeCountries;
    if (form.language === "태국어" && ex.includes("태국")) return null;
    if (form.language === "중국어" && ex.includes("중국")) return null;
    if (form.country === "중국" && ex.includes("중국")) return null;
    if (form.country === "대만" && ex.includes("대만")) return null;
  }

  if (form.language === "태국어") {
    if (clinic.language.includes("태국어")) pts += 30;
    else { warns.push("⚠️ 태국어 통역 별도 배정 필요"); pts -= 5; }
  } else if (form.language === "영어") {
    if (clinic.language.includes("영어")) pts += 30;
    else { warns.push("⚠️ 영어 통역 별도 배정 필요"); pts -= 5; }
  } else if (form.language === "중국어") {
    if (clinic.language.includes("중국어")) pts += 30;
    else { warns.push("⚠️ 중국어 통역 별도 배정 필요"); pts -= 5; }
  }

  if (form.schedule === "당일/익일") {
    if (clinic.speed === "빠름") pts += 25;
    else if (clinic.speed === "느림") pts -= 20;
    else pts += 5;
  } else {
    pts += 10;
  }

  if (form.specialty) {
    const opt = SPECIALTY_OPTIONS.find(o => o.label === form.specialty);
    const tags = opt?.tags || [];
    if (tags.some(t => clinic.triggers.includes(t))) pts += 30;
    else if (tags.some(t => clinic.specialties.includes(t))) pts += 20;
    else pts -= 15;
  }

  if (form.budget === "가성비") {
    if (clinic.price === "저" || clinic.price === "저~중") pts += 10;
    else if (clinic.price === "중상") pts -= 5;
  } else if (form.budget === "결과우선") {
    if (clinic.price === "중상") pts += 10;
  }

  if (clinic.tier === 1) pts += 5;

  return { pts, warns };
}

const CONSULTANT_COLOR = {
  Jady: "bg-violet-100 text-violet-700",
  Candice: "bg-pink-100 text-pink-700",
  Primrose: "bg-emerald-100 text-emerald-700"
};

export default function App() {
  const [form, setForm] = useState({ language: "", country: "", schedule: "", specialty: "", budget: "" });
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState({});

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setResults(null); };

  const recommend = () => {
    const scored = CLINICS
      .map(c => { const r = scoreClinic(c, form); return r ? { ...c, ...r } : null; })
      .filter(Boolean)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 3);
    setResults(scored);
    setExpanded({});
  };

  const reset = () => {
    setForm({ language: "", country: "", schedule: "", specialty: "", budget: "" });
    setResults(null);
  };

  const ready = form.language && form.schedule && form.specialty;

  const Chip = ({ val, cur, onClick }) => (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
        cur === val
          ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
      }`}>
      {val}
    </button>
  );

  const medals = ["🥇", "🥈", "🥉"];
  const tierBadge = t => t === 1 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500";
  const speedColor = s => s === "빠름" ? "text-emerald-600" : s === "느림" ? "text-red-500" : "text-gray-500";

  return (
    <div className="min-h-screen bg-slate-50 p-4" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="max-w-xl mx-auto space-y-4">

        <div className="pt-2 pb-1">
          <h1 className="text-xl font-bold text-gray-900">🏥 클리닉 추천 도구</h1>
          <p className="text-xs text-gray-400 mt-0.5">계약 병원 기준 · 2–3개 추천 · 우선순위: 언어 → 일정 → 시술 → 예산</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              1 고객 언어 <span className="text-red-400 normal-case font-normal">필수</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {["태국어", "영어", "중국어"].map(v => (
                <Chip key={v} val={v} cur={form.language} onClick={() => set("language", v)} />
              ))}
            </div>
          </div>

          {form.language === "중국어" && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                ↳ 고객 국적 <span className="text-gray-400 normal-case font-normal">(제한 병원 필터)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {["중국", "대만", "기타"].map(v => (
                  <Chip key={v} val={v} cur={form.country} onClick={() => set("country", v)} />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              2 예약 일정 <span className="text-red-400 normal-case font-normal">필수</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {["당일/익일", "3일 이상"].map(v => (
                <Chip key={v} val={v} cur={form.schedule} onClick={() => set("schedule", v)} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              3 주요 고민 <span className="text-red-400 normal-case font-normal">필수</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {SPECIALTY_OPTIONS.map(o => (
                <Chip key={o.label} val={o.label} cur={form.specialty} onClick={() => set("specialty", o.label)} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              4 예산 감도 <span className="text-gray-400 normal-case font-normal">선택</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {["가성비", "결과우선", "무관"].map(v => (
                <Chip key={v} val={v} cur={form.budget} onClick={() => set("budget", v)} />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={recommend} disabled={!ready}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm ${
                ready ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}>
              추천 보기
            </button>
            <button onClick={reset}
              className="px-4 py-3 rounded-xl text-sm text-gray-400 border border-gray-200 hover:bg-gray-50">
              초기화
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 px-1">
              ✅ <strong>{results.length}개 추천</strong> — 국가 제한 병원 자동 제외
            </p>

            {results.map((c, i) => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-base font-bold text-gray-900">{medals[i]} {c.name}</span>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierBadge(c.tier)}`}>
                          Tier {c.tier}
                        </span>
                        <span className={`text-xs font-medium ${speedColor(c.speed)}`}>응대 {c.speed}</span>
                        <span className="text-xs text-gray-400">💰 {c.price}</span>
                        {c.language.map(l => (
                          <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            {l === "태국어" ? "🇹🇭" : l === "영어" ? "🇺🇸" : l === "중국어" ? "🇨🇳" : ""} {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {c.consultants.map(n => (
                        <span key={n} className={`text-xs px-2 py-0.5 rounded-full ${CONSULTANT_COLOR[n] || "bg-gray-100 text-gray-500"}`}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>

                  {c.warns.map((w, wi) => (
                    <p key={wi} className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 mb-1">{w}</p>
                  ))}

                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5">{c.caution}</p>
                </div>

                {c.topEvents.length > 0 && (
                  <div className="border-t border-gray-50">
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}
                      className="w-full px-4 py-2 text-xs text-gray-400 hover:text-gray-500 flex justify-between hover:bg-gray-50">
                      <span>📊 인기 이벤트 (참고용)</span>
                      <span>{expanded[c.id] ? "▲" : "▼"}</span>
                    </button>
                    {expanded[c.id] && (
                      <div className="px-4 pb-3 space-y-1">
                        {c.topEvents.map((e, ei) => (
                          <div key={ei} className="flex justify-between text-xs">
                            <span className="text-gray-500 truncate flex-1 mr-2">{e.name}</span>
                            <span className="text-gray-300 shrink-0">SU {e.su.toLocaleString()}</span>
                          </div>
                        ))}
                        <p className="text-xs text-gray-300 pt-1">* 2025 강남언니 기준 · 추천 로직에 반영 안 됨</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
