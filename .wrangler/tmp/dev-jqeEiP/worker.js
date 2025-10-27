var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-outqRx/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/worker.js
var ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
];
function addCORSHeaders(response, origin) {
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);
  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "3600");
  }
  return response;
}
__name(addCORSHeaders, "addCORSHeaders");
async function verifyTurnstile(token, secret) {
  if (!token || !secret) {
    return { success: false, error_codes: ["missing_token_or_secret"] };
  }
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        secret,
        response: token
      })
    });
    if (!response.ok) {
      throw new Error(`Turnstile API returned ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return { success: false, error_codes: ["verification_error"] };
  }
}
__name(verifyTurnstile, "verifyTurnstile");
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}
__name(getHostname, "getHostname");
async function enrichDomain(url, env) {
  const enrichment = {
    url,
    hostname: getHostname(url),
    https: url.startsWith("https://"),
    tls_verified: false,
    hsts_present: false,
    security_headers: {},
    is_cloudflare: false,
    dns_resolvable: false,
    radar_data: null,
    enrichment_timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow"
    }).catch(() => null);
    if (headResponse) {
      enrichment.tls_verified = headResponse.ok || headResponse.status < 500;
      enrichment.is_cloudflare = headResponse.headers.get("Server")?.toLowerCase().includes("cloudflare") || headResponse.headers.get("CF-RAY") !== null;
      const hsts = headResponse.headers.get("Strict-Transport-Security");
      const csp = headResponse.headers.get("Content-Security-Policy");
      const xframe = headResponse.headers.get("X-Frame-Options");
      enrichment.hsts_present = !!hsts;
      if (csp)
        enrichment.security_headers.csp = csp.substring(0, 100);
      if (xframe)
        enrichment.security_headers.x_frame_options = xframe;
    }
    if (env.RADAR_API_KEY) {
      enrichment.radar_data = await getRadarData(enrichment.hostname, env.RADAR_API_KEY);
    }
    enrichment.dns_resolvable = enrichment.tls_verified;
  } catch (error) {
    console.warn("Domain enrichment warning:", error.message);
  }
  return enrichment;
}
__name(enrichDomain, "enrichDomain");
async function getRadarData(hostname, apiKey) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/radar/domain?domain=${hostname}`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!response.ok) {
      console.warn("Radar API returned", response.status);
      return null;
    }
    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.warn("Radar API error:", error.message);
    return null;
  }
}
__name(getRadarData, "getRadarData");
async function storeAnalysis(kv, url, analysis, enrichment, turnstile_verified) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const entry = {
    url,
    analysis: analysis.analysis,
    reason: analysis.reason,
    next_steps: analysis.next_steps,
    timestamp,
    turnstile_verified,
    enrichment: {
      hostname: enrichment.hostname,
      https: enrichment.https,
      hsts_present: enrichment.hsts_present,
      is_cloudflare: enrichment.is_cloudflare
    }
  };
  let history = [];
  try {
    const existing = await kv.get("analysis_history", "json");
    if (existing) {
      history = existing;
    }
  } catch (e) {
    console.log("No existing history found, starting fresh");
  }
  history.unshift(entry);
  history = history.slice(0, 10);
  await kv.put("analysis_history", JSON.stringify(history));
}
__name(storeAnalysis, "storeAnalysis");
async function getAnalysisHistory(kv) {
  try {
    const history = await kv.get("analysis_history", "json");
    return history || [];
  } catch (e) {
    console.error("History retrieval error:", e);
    return [];
  }
}
__name(getAnalysisHistory, "getAnalysisHistory");
function getSystemPrompt(enrichment, isUrl, isFirstQuery = false) {
  let basePrompt = `You are Internet Guardian, an AI security expert for URL and internet safety analysis.

Your role: Analyze URLs for security threats and answer questions about internet security.
Your scope: URL safety, phishing, malware, security best practices, cyber threats.

Response format for URLs:
VERDICT: [SAFE | SUSPICIOUS | RISKY]
EXPLANATION: [2-line clear explanation for non-experts]
NEXT_STEPS: [Two recommended actions, separated by semicolon]

Response format for security questions:
ANSWER: [Clear, helpful answer about internet security]
SAFETY_TIP: [One practical security tip related to the question]

Out-of-scope handling:
If user asks about non-security topics (finance, weather, politics, etc.):
TYPE: OFF_TOPIC
RESPONSE: Politely explain you only handle internet security and URL safety topics`;
  if (isFirstQuery) {
    basePrompt += `

GREETING: Start with a friendly greeting like "\u{1F44B} Welcome to Internet Guardian! I'm here to help you stay safe online."`;
  }
  if (isUrl) {
    basePrompt += `

URL Analysis Context:
Enrichment Facts:
${JSON.stringify(enrichment, null, 2)}

Base assessment on:
1. Domain legitimacy and TLS status
2. Security headers and HSTS presence
3. Common phishing/malware patterns
4. URL structure and encoding anomalies`;
  }
  return basePrompt;
}
__name(getSystemPrompt, "getSystemPrompt");
async function analyzeURL(env, urlOrQuery, enrichment, isFirstQuery = false) {
  let isUrl = false;
  let hostname = "";
  try {
    new URL(urlOrQuery);
    isUrl = true;
    hostname = getHostname(urlOrQuery);
  } catch (e) {
    isUrl = false;
  }
  if (!isUrl && !enrichment) {
    enrichment = {
      hostname: "general_query",
      https: null,
      hsts_present: null,
      is_cloudflare: null,
      security_headers: []
    };
  }
  const systemPrompt = getSystemPrompt(enrichment, isUrl, isFirstQuery);
  const userPrompt = isUrl ? `Analyze this URL for security threats: ${urlOrQuery}` : `Answer this security-related question: ${urlOrQuery}`;
  try {
    const response = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ]
    });
    const aiResponse = response.response || "";
    if (aiResponse.match(/TYPE:\s*OFF_TOPIC/i)) {
      return {
        analysis: "OFF_TOPIC",
        reason: aiResponse.match(/RESPONSE:\s*(.+?)(?:\n|$)/i)?.[1] || "This question is outside my expertise. I focus on internet security and URL safety.",
        next_steps: "Please ask me about URLs, phishing, malware, or other internet security topics.",
        isOffTopic: true
      };
    }
    const greetingMatch = aiResponse.match(/GREETING:\s*(.+?)(?:\n|$)/i);
    if (isUrl) {
      const verdictMatch = aiResponse.match(/VERDICT:\s*(SAFE|SUSPICIOUS|RISKY)/i);
      const explanationMatch = aiResponse.match(/EXPLANATION:\s*(.+?)(?:NEXT_STEPS:|$)/is);
      const nextStepsMatch = aiResponse.match(/NEXT_STEPS:\s*(.+?)(?:\n|$)/);
      const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : "UNKNOWN";
      const explanation = explanationMatch ? explanationMatch[1].trim() : "Unable to determine safety status";
      const nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : "No recommendations available";
      return {
        analysis: verdict,
        reason: (greetingMatch ? greetingMatch[1] + "\n\n" : "") + explanation,
        next_steps: nextSteps,
        type: "URL_ANALYSIS",
        fullResponse: aiResponse
      };
    } else {
      const answerMatch = aiResponse.match(/ANSWER:\s*(.+?)(?:SAFETY_TIP:|$)/is);
      const tipMatch = aiResponse.match(/SAFETY_TIP:\s*(.+?)(?:\n|$)/);
      const answer = answerMatch ? answerMatch[1].trim() : aiResponse;
      const tip = tipMatch ? tipMatch[1].trim() : "";
      return {
        analysis: "QUESTION_ANSWERED",
        reason: (greetingMatch ? greetingMatch[1] + "\n\n" : "") + answer,
        next_steps: tip || "Stay vigilant about internet security!",
        type: "GENERAL_QUERY",
        fullResponse: aiResponse
      };
    }
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error("Failed to analyze: " + error.message);
  }
}
__name(analyzeURL, "analyzeURL");
function handleHealthCheck() {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "cf_ai_internet_guardian",
      version: "2.0",
      features: ["turnstile", "domain_enrichment", "workers_ai", "kv_history"]
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}
__name(handleHealthCheck, "handleHealthCheck");
async function handleAnalyze(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }
  try {
    const body = await request.json();
    const { url, turnstile_token, sessionId } = body;
    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    let isFirstQuery = false;
    let sessionVerified = false;
    if (sessionId) {
      const sessionKey = `session:${sessionId}`;
      const sessionMarker = await env.CHAT_MEMORY.get(sessionKey);
      if (!sessionMarker) {
        isFirstQuery = true;
      } else {
        sessionVerified = true;
      }
    }
    if (isFirstQuery) {
      if (!turnstile_token) {
        return new Response(
          JSON.stringify({ error: "Turnstile token is required for first query" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const turnstileSecret = env.TURNSTILE_SECRET;
      if (!turnstileSecret) {
        console.error("TURNSTILE_SECRET not configured");
        return new Response(
          JSON.stringify({ error: "Server misconfiguration" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      const turnstileResult = await verifyTurnstile(turnstile_token, turnstileSecret);
      if (!turnstileResult.success) {
        console.warn("Turnstile verification failed:", turnstileResult.error_codes);
        return new Response(
          JSON.stringify({
            error: "Turnstile verification failed",
            details: turnstileResult.error_codes
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      if (sessionId) {
        const sessionKey = `session:${sessionId}`;
        await env.CHAT_MEMORY.put(sessionKey, "verified", { expirationTtl: 3600 });
      }
    }
    let enrichment = null;
    let isUrl = false;
    try {
      new URL(url);
      isUrl = true;
      enrichment = await enrichDomain(url, env);
    } catch (e) {
      isUrl = false;
      enrichment = {
        hostname: "general_query",
        https: null,
        hsts_present: null,
        is_cloudflare: null,
        security_headers: []
      };
    }
    const analysis = await analyzeURL(env, url, enrichment, isFirstQuery);
    await storeAnalysis(env.CHAT_MEMORY, url, analysis, enrichment, true);
    const responseBody = {
      type: analysis.type || (isUrl ? "URL_ANALYSIS" : "GENERAL_QUERY"),
      analysis: analysis.analysis,
      reason: analysis.reason,
      next_steps: analysis.next_steps,
      isOffTopic: analysis.isOffTopic || false,
      enrichment: isUrl ? {
        https: enrichment.https,
        hsts_present: enrichment.hsts_present,
        is_cloudflare: enrichment.is_cloudflare
      } : null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return new Response(
      JSON.stringify(responseBody),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analyze endpoint error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
__name(handleAnalyze, "handleAnalyze");
async function handleHistory(env) {
  try {
    const history = await getAnalysisHistory(env.CHAT_MEMORY);
    return new Response(
      JSON.stringify({ history }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("History endpoint error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
__name(handleHistory, "handleHistory");
function handleTurnstileSiteKey(env) {
  const siteKey = env.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    return new Response(
      JSON.stringify({ error: "Turnstile site key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(
    JSON.stringify({ site_key: siteKey }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
__name(handleTurnstileSiteKey, "handleTurnstileSiteKey");
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const origin = request.headers.get("origin") || "";
  if (pathname === "/health") {
    return handleHealthCheck();
  } else if (pathname === "/api/analyze") {
    const response = await handleAnalyze(request, env);
    return addCORSHeaders(response, origin);
  } else if (pathname === "/api/history") {
    const response = await handleHistory(env);
    return addCORSHeaders(response, origin);
  } else if (pathname === "/api/turnstile-site-key") {
    const response = handleTurnstileSiteKey(env);
    return addCORSHeaders(response, origin);
  } else {
    return new Response(
      JSON.stringify({
        error: "Not found",
        endpoints: ["/health", "/api/analyze", "/api/history", "/api/turnstile-site-key"]
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
}
__name(handleRequest, "handleRequest");
var worker_default = {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("Unhandled error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-outqRx/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-outqRx/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
