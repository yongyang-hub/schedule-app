
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue } from 'firebase/database';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);

const db = getDatabase(app);
const auth = getAuth(app);
// 브라우저 탭/창을 닫으면 세션이 사라지도록 — 다시 열면 재로그인 필요
setPersistence(auth, browserSessionPersistence).catch(() => {});

export async function dbGet(path) { const snap = await get(ref(db, path)); return snap.exists() ? snap.val() : null; }

export async function dbSet(path, value) { await set(ref(db, path), value); }

export function dbListen(path, callback) { return onValue(ref(db, path), snap => callback(snap.exists() ? snap.val() : null)); }

export function authListen(callback) { return onAuthStateChanged(auth, callback); }

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: 'healingpaper.com' }); // 계정 선택창에 healingpaper.com 계정만 뜨도록 힌트 (실제 검증은 로그인 후 이메일 도메인 체크 + DB 규칙에서 이중으로 함)

export async function authGoogleLogin() { return signInWithPopup(auth, googleProvider); }

export async function authLogout() { return signOut(auth); }

