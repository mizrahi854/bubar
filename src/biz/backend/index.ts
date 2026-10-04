import type { Backend } from "./types";
import { supabaseBackend } from "./supabase";
import { previewBackend } from "./preview";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Real Supabase when configured (Vercel env vars), otherwise the in-browser preview. */
export const backend: Backend & { simulate?: () => Promise<string>; reset?: () => void } = url && key ? supabaseBackend(url, key) : previewBackend();
export const isPreview = backend.mode === "preview";
export * from "./types";
