// Browser-side auth helpers (Vite). Only the project URL and the PUBLISHABLE key are used here; never the secret key.
// .env.local:  VITE_SUPABASE_URL=https://<ref>.supabase.co   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
// Syntax-checked only (needs a browser): node --check browser-auth.js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/` } }); // session is null until the email is confirmed
export const logIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const logOut = () => supabase.auth.signOut();
export const forgotPassword = (email) =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login/reset/` }); // same message whether or not the account exists
export const setNewPassword = (password) => supabase.auth.updateUser({ password }); // only on the recovery page, after PASSWORD_RECOVERY
export const continueWithGoogle = () =>
  supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/` } });

let accessToken = null; // keep the JWT in memory; TOKEN_REFRESHED keeps it fresh
export function watchAuth(onChange) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => { // keep this callback fast; no awaited supabase calls inside
    accessToken = session?.access_token ?? null;
    if (event === "PASSWORD_RECOVERY") location.assign("/login/reset/");
    setTimeout(() => onChange(event, session), 0);
  });
  return () => data.subscription.unsubscribe();
}

// Call a Netlify Function with the access token. The Function re-verifies it; the UI role check is cosmetic only.
export const callFunction = (path, init = {}) =>
  fetch(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${accessToken}`, "x-requested-with": "beachday" } });
