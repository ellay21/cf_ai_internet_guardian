var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var MAX_HISTORY_LENGTH = 10;
var AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // In production, restrict this to your frontend's domain
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function handleOptionsRequest() {
  return new Response(null, {
    headers: corsHeaders
  });
}
__name(handleOptionsRequest, "handleOptionsRequest");
function jsonError(message, status = 400) {
  const error = {
    error: message
  };
  return new Response(JSON.stringify(error), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}
__name(jsonError, "jsonError");
async function updateChatHistory(url, aiResponse, env) {
  const historyKey = "chat_history";
  let history = [];
  try {
    const existingHistory = await env.CHAT_MEMORY.get(historyKey, { type: "json" });
    if (Array.isArray(existingHistory)) {
      history = existingHistory;
    }
  } catch (e) {
    console.error("Failed to retrieve or parse chat history from KV:", e);
    history = [];
  }
  history.unshift({
    query: url,
    response: aiResponse,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (history.length > MAX_HISTORY_LENGTH) {
    history = history.slice(0, MAX_HISTORY_LENGTH);
  }
  await env.CHAT_MEMORY.put(historyKey, JSON.stringify(history));
}
__name(updateChatHistory, "updateChatHistory");
async function analyzeUrlWithAI(url, env) {
  const prompt = `
    Analyze the safety of the URL: "${url}".
    Your task is to determine if the URL is safe or risky.
    Provide your response as a JSON object with two keys:
    1. "analysis": A single word, either "safe" or "risky".
    2. "reason": A concise, one-sentence explanation for your analysis.
    Do not include any other text or formatting in your response.
  `;
  const aiResponse = await env.AI.run(AI_MODEL, {
    prompt,
    stream: false
  });
  try {
    return JSON.parse(aiResponse.response);
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", aiResponse.response);
    return {
      analysis: "unknown",
      reason: "The AI response was not in the expected format. The raw response was: " + aiResponse.response
    };
  }
}
__name(analyzeUrlWithAI, "analyzeUrlWithAI");
async function handleApiAnalyzeRequest(request, env) {
  if (request.method !== "POST") {
    return jsonError("Method Not Allowed. Please use POST.", 405);
  }
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    return jsonError("Invalid JSON in request body.", 400);
  }
  const { url } = requestBody;
  if (!url || typeof url !== "string") {
    return jsonError('Missing or invalid "url" in request body.', 400);
  }
  try {
    const aiAnalysis = await analyzeUrlWithAI(url, env);
    await updateChatHistory(url, aiAnalysis, env);
    return new Response(JSON.stringify(aiAnalysis), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (e) {
    console.error("Error during AI analysis or KV operation:", e);
    return jsonError("An internal error occurred while analyzing the URL.", 500);
  }
}
__name(handleApiAnalyzeRequest, "handleApiAnalyzeRequest");
var worker_default = {
  /**
   * The main fetch handler for the worker.
   * @param {Request} request - The incoming request.
   * @param {object} env - The worker's environment variables.
   * @param {object} ctx - The execution context.
   * @returns {Promise<Response>} A promise that resolves to the response.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return handleOptionsRequest();
    }
    if (url.pathname === "/api/analyze") {
      return handleApiAnalyzeRequest(request, env);
    }
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders
    });
  }
};

// ../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
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

// ../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
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
var middleware_miniflare3_json_error_default = jsonError2;

// .wrangler/tmp/bundle-3FRZiT/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
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

// .wrangler/tmp/bundle-3FRZiT/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
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
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
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
