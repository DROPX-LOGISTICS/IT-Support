// Cloudflare entry point. Pages are served by the built Next.js worker; the two daily jobs that vercel.json
// schedules on Vercel are run here by Cloudflare cron triggers (same times, same routes, same secret).
import handler from "./.open-next/worker.js";

const JOBS = { "30 3 * * *": "/api/cron/daily-updates", "0 4 * * *": "/api/cron/maintenance" };

export default {
  fetch: (request, env, ctx) => handler.fetch(request, env, ctx),
  async scheduled(controller, env, ctx) {
    const path = JOBS[controller.cron];
    if (!path || !env.CRON_SECRET || !env.APP_URL) return;
    const res = await handler.fetch(new Request(`${env.APP_URL.replace(/\/+$/, "")}${path}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }), env, ctx);
    console.log(`cron ${path}: ${res.status}`);
  },
};
