import type { Deps } from "./handlers.js";
import { supabaseStore } from "./store.js";

/** Production wiring: environment variables configured in Vercel. */
export function deps(): Deps {
  const missing = ["APP_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_STATE_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return {
    env: {
      APP_URL: process.env.APP_URL!,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
      OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET!,
      CRON_SECRET: process.env.CRON_SECRET,
    },
    store: supabaseStore(),
    fetch,
  };
}

/** Turns configuration errors into a readable 500 instead of a crash. */
export function route(fn: (d: Deps, req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(deps(), req);
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "content-type": "application/json" } });
    }
  };
}
