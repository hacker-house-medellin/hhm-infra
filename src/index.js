const ALLOWED = new Set(["/healthz", "/edge/config"]);
export default { async fetch(request, env) { const url = new URL(request.url); if (!ALLOWED.has(url.pathname)) return new Response("not found", {status:404}); if (url.pathname === "/healthz") return Response.json({service:"hhm-infra",status:"ok"}); return Response.json({proxying:"disabled",apiOriginConfigured:Boolean(env.API_ORIGIN)}); } };
