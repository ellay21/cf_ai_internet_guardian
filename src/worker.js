/**
 * @param {Env} env 
 * @returns {string[]} 
 */
function getAllowedOrigins(env) {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }

  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];
}

/**
 * @param {Response} response 
 * @param {string} origin 
 * @param {string[]} allowedOrigins 
 * @returns {Response} 
 */
function addCORSHeaders(response, origin, allowedOrigins) {
  const isAllowedOrigin = allowedOrigins.includes(origin);

  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '3600');
  }

  return response;
}
/**
 * @param {string} token 
 * @param {string} secret 
 * @returns {Promise<{success: boolean, error_codes?: string[]}>}
 */
async function verifyTurnstile(token, secret) {
  if (!token || !secret) {
    return { success: false, error_codes: ['missing_token_or_secret'] };
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secret,
        response: token,
      }),
    });

    if (!response.ok) {
      throw new Error(`Turnstile API returned ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return { success: false, error_codes: ['verification_error'] };
  }
}

/**
 * @param {string} url 
 * @returns {string} 
 */
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

/**
 * Perform lightweight domain enrichment
 * - Check TLS/HTTPS availability
 * - Extract security headers
 * - Call Cloudflare Radar API 
 * @param {string} url 
 * @param {Env} env 
 * @returns {Promise<Object>} 
 */
async function enrichDomain(url, env) {
  const enrichment = {
    url: url,
    hostname: getHostname(url),
    https: url.startsWith('https://'),
    tls_verified: false,
    hsts_present: false,
    security_headers: {},
    is_cloudflare: false,
    dns_resolvable: false,
    radar_data: null,
    enrichment_timestamp: new Date().toISOString(),
  };

  try {
    // Attempt HEAD request to gather security headers and TLS info
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    }).catch(() => null);

    if (headResponse) {
      enrichment.tls_verified = headResponse.ok || headResponse.status < 500;
      enrichment.is_cloudflare =
        headResponse.headers.get('Server')?.toLowerCase().includes('cloudflare') ||
        headResponse.headers.get('CF-RAY') !== null;

      // Extract security headers
      const hsts = headResponse.headers.get('Strict-Transport-Security');
      const csp = headResponse.headers.get('Content-Security-Policy');
      const xframe = headResponse.headers.get('X-Frame-Options');

      enrichment.hsts_present = !!hsts;
      if (csp) enrichment.security_headers.csp = csp.substring(0, 100);
      if (xframe) enrichment.security_headers.x_frame_options = xframe;
    }

    if (env.RADAR_API_KEY) {
      enrichment.radar_data = await getRadarData(enrichment.hostname, env.RADAR_API_KEY);
    }

    enrichment.dns_resolvable = enrichment.tls_verified;
  } catch (error) {
    console.warn('Domain enrichment warning:', error.message);
  }

  return enrichment;
}

/**
 * @param {string} hostname 
 * @param {string} apiKey 
 * @returns {Promise<Object|null>} 
 */
async function getRadarData(hostname, apiKey) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/radar/domain?domain=${hostname}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn('Radar API returned', response.status);
      return null;
    }

    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.warn('Radar API error:', error.message);
    return null;
  }
}

/**
 * Store URL analysis in KV with enrichment data
 * @param {KVNamespace} kv 
 * @param {string} url 
 * @param {Object} analysis 
 * @param {Object} enrichment 
 * @param {boolean} turnstile_verified 
 * @returns {Promise<void>}
 */
async function storeAnalysis(kv, url, analysis, enrichment, turnstile_verified) {
  const timestamp = new Date().toISOString();
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
      is_cloudflare: enrichment.is_cloudflare,
    },
  };
  let history = [];
  try {
    const existing = await kv.get('analysis_history', 'json');
    if (existing) {
      history = existing;
    }
  } catch (e) {
    console.log('No existing history found, starting fresh');
  }

  history.unshift(entry);
  history = history.slice(0, 10);

  await kv.put('analysis_history', JSON.stringify(history));
}

/**
 * @param {KVNamespace} kv 
 * @returns {Promise<Array>} 
 */
async function getAnalysisHistory(kv) {
  try {
    const history = await kv.get('analysis_history', 'json');
    return history || [];
  } catch (e) {
    console.error('History retrieval error:', e);
    return [];
  }
}

/**
 * Construct system prompt with context awareness
 * @param {Object} enrichment 
 * @param {boolean} isUrl 
 * @param {boolean} isFirstQuery 
 * @returns {string} 
 */
function getSystemPrompt(enrichment, isUrl, isFirstQuery = false) {
  let basePrompt = `You are Internet Guardian, an AI security expert for URL and internet safety analysis.

Your role: Analyze URLs for security threats and answer questions about internet security.
Your scope: URL safety, phishing, malware, security best practices, cyber threats.

CRITICAL: Always use these exact formats in your response. Do not deviate.

Response format for URLs:
VERDICT: [SAFE | SUSPICIOUS | RISKY]
EXPLANATION: [2-3 sentence clear explanation for non-experts]
NEXT_STEPS: [Two recommended actions, separated by semicolon]

IMPORTANT VERDICT RULES:
- SAFE: Legitimate domain, proper security headers, no malware indicators
- SUSPICIOUS: Some security concerns but not fully malicious
- RISKY: High probability of phishing, malware, or other threats

Response format for security questions:
ANSWER: [Clear, helpful answer about internet security]
SAFETY_TIP: [One practical security tip related to the question]

Out-of-scope handling:
If user asks about non-security topics (finance, weather, politics, weather, cooking, etc.):
TYPE: OFF_TOPIC
RESPONSE: Politely explain you only handle internet security and URL safety topics`;

  if (isFirstQuery) {
    basePrompt += `

GREETING: Start with: " Welcome to Internet Guardian! I'm here to help you stay safe online."`;
  }

  if (isUrl) {
    basePrompt += `

URL Analysis Context:
Domain: ${enrichment.hostname}
TLS/HTTPS: ${enrichment.https ? 'Enabled' : 'Not Found'}
HSTS Header: ${enrichment.hsts_present ? 'Present' : 'Not Present'}
Cloudflare Protected: ${enrichment.is_cloudflare ? 'Yes' : 'No'}

Guidelines:
1. Always start response with VERDICT: (SAFE, SUSPICIOUS, or RISKY)
2. Follow with EXPLANATION
3. End with NEXT_STEPS (two actions separated by semicolon)
4. Be specific about what you found`;
  }

  return basePrompt;
}

/**
 * Analyze URL safety or general query using Cloudflare Workers AI with context awareness
 * @param {Env} env 
 * @param {string} urlOrQuery 
 * @param {Object} enrichment 
 * @param {boolean} isFirstQuery 
 * @returns {Promise<Object>} 
 */
async function analyzeURL(env, urlOrQuery, enrichment, isFirstQuery = false) {
  let isUrl = false;
  let hostname = '';
  
  try {
    new URL(urlOrQuery);
    isUrl = true;
    hostname = getHostname(urlOrQuery);
  } catch (e) {
    isUrl = false;
  }

  // For non-URLs, use minimal enrichment
  if (!isUrl && !enrichment) {
    enrichment = {
      hostname: 'general_query',
      https: null,
      hsts_present: null,
      is_cloudflare: null,
      security_headers: [],
    };
  }

  const systemPrompt = getSystemPrompt(enrichment, isUrl, isFirstQuery);
  const userPrompt = isUrl 
    ? `Analyze this URL for security threats: ${urlOrQuery}`
    : `Answer this security-related question: ${urlOrQuery}`;

  try {
    // Call Cloudflare Workers AI
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const aiResponse = response.response || '';

    if (aiResponse.match(/TYPE:\s*OFF_TOPIC/i)) {
      return {
        analysis: 'OFF_TOPIC',
        reason: aiResponse.match(/RESPONSE:\s*(.+?)(?:\n|$)/i)?.[1] || 'This question is outside my expertise. I focus on internet security and URL safety.',
        next_steps: 'Please ask me about URLs, phishing, malware, or other internet security topics.',
        isOffTopic: true,
      };
    }

    const greetingMatch = aiResponse.match(/GREETING:\s*(.+?)(?:\n|$)/i);

    if (isUrl) {
      let verdictMatch = aiResponse.match(/VERDICT:\s*(SAFE|SUSPICIOUS|RISKY)/i);
      
      if (!verdictMatch) {
        if (aiResponse.match(/\bSAFE\b/i)) verdictMatch = ['', 'SAFE'];
        else if (aiResponse.match(/\bRISKY\b/i)) verdictMatch = ['', 'RISKY'];
        else if (aiResponse.match(/\bSUSPICIOUS\b/i)) verdictMatch = ['', 'SUSPICIOUS'];
      }

      const explanationMatch = aiResponse.match(/EXPLANATION:\s*(.+?)(?:NEXT_STEPS:|$)/is);
      const nextStepsMatch = aiResponse.match(/NEXT_STEPS:\s*(.+?)(?:\n|$)/);

      const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN';
      const explanation = explanationMatch ? explanationMatch[1].trim() : 'Unable to determine safety status';
      const nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : 'No recommendations available';

      return {
        analysis: verdict,
        reason: (greetingMatch ? greetingMatch[1] + '\n\n' : '') + explanation,
        next_steps: nextSteps,
        type: 'URL_ANALYSIS',
        fullResponse: aiResponse,
      };
    } else {
      const answerMatch = aiResponse.match(/ANSWER:\s*(.+?)(?:SAFETY_TIP:|$)/is);
      const tipMatch = aiResponse.match(/SAFETY_TIP:\s*(.+?)(?:\n|$)/);

      const answer = answerMatch ? answerMatch[1].trim() : aiResponse;
      const tip = tipMatch ? tipMatch[1].trim() : '';

      return {
        analysis: 'QUESTION_ANSWERED',
        reason: (greetingMatch ? greetingMatch[1] + '\n\n' : '') + answer,
        next_steps: tip || 'Stay vigilant about internet security!',
        type: 'GENERAL_QUERY',
        fullResponse: aiResponse,
      };
    }
  } catch (error) {
    console.error('AI Analysis Error:', error);
    throw new Error('Failed to analyze: ' + error.message);
  }
}

/**
 * @returns {Response} 
 */
function handleHealthCheck() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'cf_ai_internet_guardian',
      version: '2.0',
      features: ['turnstile', 'domain_enrichment', 'workers_ai', 'kv_history'],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle URL analysis endpoint with Turnstile verification
 * @param {Request} request 
 * @param {Env} env 
 * @returns {Promise<Response>} 
 */
async function handleAnalyze(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { url, turnstile_token, sessionId } = body;

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let turnstileVerified = false;
    let isFirstQuery = false;

    if (sessionId) {
      const sessionKey = `session:${sessionId}`;
      const sessionMarker = await env.CHAT_MEMORY.get(sessionKey);
      
      if (!sessionMarker) {
        isFirstQuery = true;
        
        if (!turnstile_token) {
          return new Response(
            JSON.stringify({ error: 'Turnstile token is required for first query' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const turnstileSecret = env.TURNSTILE_SECRET;
        if (!turnstileSecret) {
          console.error('TURNSTILE_SECRET not configured');
          return new Response(
            JSON.stringify({ error: 'Server misconfiguration' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const turnstileResult = await verifyTurnstile(turnstile_token, turnstileSecret);
        if (!turnstileResult.success) {
          console.warn('Turnstile verification failed:', turnstileResult.error_codes);
          return new Response(
            JSON.stringify({
              error: 'Turnstile verification failed',
              details: turnstileResult.error_codes,
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }

        turnstileVerified = true;
        await env.CHAT_MEMORY.put(sessionKey, 'verified', { expirationTtl: 3600 }); // 1 hour session
      }
    } else if (turnstile_token) {
      const turnstileSecret = env.TURNSTILE_SECRET;
      if (turnstileSecret) {
        const turnstileResult = await verifyTurnstile(turnstile_token, turnstileSecret);
        turnstileVerified = turnstileResult.success;
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
        hostname: 'general_query',
        https: null,
        hsts_present: null,
        is_cloudflare: null,
        security_headers: [],
      };
    }

    const analysis = await analyzeURL(env, url, enrichment, isFirstQuery);

    await storeAnalysis(env.CHAT_MEMORY, url, analysis, enrichment, true);

    const responseBody = {
      type: analysis.type || (isUrl ? 'URL_ANALYSIS' : 'GENERAL_QUERY'),
      analysis: analysis.analysis,
      reason: analysis.reason,
      next_steps: analysis.next_steps,
      isOffTopic: analysis.isOffTopic || false,
      enrichment: isUrl ? {
        https: enrichment.https,
        hsts_present: enrichment.hsts_present,
        is_cloudflare: enrichment.is_cloudflare,
      } : null,
      timestamp: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(responseBody),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Analyze endpoint error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * @param {Env} env 
 * @returns {Promise<Response>} 
 */
async function handleHistory(env) {
  try {
    const history = await getAnalysisHistory(env.CHAT_MEMORY);
    return new Response(
      JSON.stringify({ history }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('History endpoint error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle Turnstile site key retrieval (public endpoint)
 * @param {Env} env 
 * @returns {Response} 
 */
function handleTurnstileSiteKey(env) {
  const siteKey = env.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    return new Response(
      JSON.stringify({ error: 'Turnstile site key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ site_key: siteKey }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * @param {Request} request 
 * @param {Env} env 
 * @returns {Promise<Response>} 
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = getAllowedOrigins(env);

  if (pathname === '/health') {
    return handleHealthCheck();
  } else if (pathname === '/api/analyze') {
    const response = await handleAnalyze(request, env);
    return addCORSHeaders(response, origin, allowedOrigins);
  } else if (pathname === '/api/history') {
    const response = await handleHistory(env);
    return addCORSHeaders(response, origin, allowedOrigins);
  } else if (pathname === '/api/turnstile-site-key') {
    const response = handleTurnstileSiteKey(env);
    return addCORSHeaders(response, origin, allowedOrigins);
  } else {
    return new Response(
      JSON.stringify({
        error: 'Not found',
        endpoints: ['/health', '/api/analyze', '/api/history', '/api/turnstile-site-key'],
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
