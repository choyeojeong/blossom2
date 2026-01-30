// src/utils/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anon, {
  auth: {
    // ✅ 로그인 세션을 로컬에 저장해서 새로고침/재접속에도 유지
    persistSession: true,
    // ✅ 토큰 자동 갱신 (장시간 켜두는 학원 운영에 필수)
    autoRefreshToken: true,
    // ✅ OAuth 같은 리다이렉트 사용 시를 대비 (없어도 되지만 켜두는 게 안전)
    detectSessionInUrl: true,
    // ✅ 여러 탭/창에서 세션 공유
    multiTab: true,
  },
});
