
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue } from 'firebase/database';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

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

export async function dbGet(path) { const snap = await get(ref(db, path)); return snap.exists() ? snap.val() : null; }

export async function dbSet(path, value) { await set(ref(db, path), value); }

export function dbListen(path, callback) { return onValue(ref(db, path), snap => callback(snap.exists() ? snap.val() : null)); }

export function authListen(callback) { return onAuthStateChanged(auth, callback); }

export async function authLogin(email, password) { return signInWithEmailAndPassword(auth, email, password); }

export async function authLogout() { return signOut(auth); }

