// src/utils/auth.js

const KEY = "blossom2_auth_v1";

export function isAuthed() {
  return sessionStorage.getItem(KEY) === "1";
}

export function loginWithSimpleIdPw(id, pw) {
  const ok = id === "sanbon" && pw === "471466";
  if (ok) sessionStorage.setItem(KEY, "1");
  return ok;
}

export function logout() {
  sessionStorage.removeItem(KEY);
}
