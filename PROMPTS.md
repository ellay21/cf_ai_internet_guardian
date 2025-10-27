# 🤖 AI Prompts Documentation v2.0

This document outlines the final system and user prompts used in **Internet Guardian v2.0** for Cloudflare Workers AI integration, including domain enrichment context and structured response formatting.

---

## Overview

The Internet Guardian v2.0 uses the **LLaMA 2 7B Chat** model (`@cf/meta/llama-2-7b-chat-int8`) with an advanced two-tier prompting strategy:

1. **System Prompt** - Defines role, task, and response format with enrichment facts
2. **User Prompt** - User's specific request with URL

This separation allows for:
- Consistent, structured responses
- Contextual security analysis using enrichment data
- Actionable "next steps" recommendations
- Support for three-tier safety classification (SAFE, SUSPICIOUS, RISKY)

---

## 📋 System Prompt (v2.0)

### Purpose
The system prompt establishes the AI model's expertise, provides enrichment facts, and defines the exact response format for reliable parsing.

### Current Implementation

Located in `src/worker.js` in the `getSystemPrompt()` function:

```javascript
function getSystemPrompt(enrichment) {
  return `You are an expert internet safety analyst specializing in URL security assessment.

Use the enrichment facts to explain whether the URL is safe, suspicious, or risky. Provide a short verdict, a 2-line explanation for non-experts, and 2 recommended next steps (e.g., check headers, blocklist check).

Provide your response in exactly this format:
VERDICT: [SAFE | SUSPICIOUS | RISKY]
EXPLANATION: [2-line clear explanation for non-experts]
NEXT_STEPS: [Two recommended actions, separated by semicolon]

Enrichment Facts:
${JSON.stringify(enrichment, null, 2)}

Base your assessment on:
1. Domain legitimacy and TLS status
2. Security headers and HSTS presence
3. Common phishing/malware patterns
4. URL structure and encoding anomalies`;
}
```

### Enrichment Facts Context

The system prompt receives real security data:

```json
{
  "url": "https://example.com",
  "hostname": "example.com",
  "https": true,
  "tls_verified": true,
  "hsts_present": true,
  "security_headers": {},
  "is_cloudflare": false,
  "dns_resolvable": true,
  "radar_data": null,
  "enrichment_timestamp": "2025-10-27T15:45:30.000Z"
}
```

---

## 🎯 User Prompt (v2.0)

### Purpose
The user prompt is simple and focused—it just provides the URL and asks for analysis. The system prompt handles all context and instructions.

### Current Implementation

Located in `src/worker.js` in the `analyzeURL()` function:

```javascript
const userPrompt = `Analyze this URL for security threats: ${url}`;
```

### Complete Prompt Flow

```javascript
const response = await env.AI.run('@cf/meta/llama-2-7b-instruct', {
  messages: [
    {
      role: 'system',
      content: systemPrompt,  // Full context + enrichment + format
    },
    {
      role: 'user',
      content: userPrompt,    // Simple: "Analyze this URL: https://..."
    },
  ],
});
```

---

## � Expected Response Format

### Example 1: Safe Website

**Input:**
```
URL: https://github.com
```

**AI Response:**
```
VERDICT: SAFE
EXPLANATION: GitHub is a legitimate open-source development platform run by Microsoft. It has valid HTTPS, HSTS headers, and strong security practices.
NEXT_STEPS: Verify you're accessing the official domain (github.com); Check browser URL bar matches exactly
```

### Example 2: Suspicious Website

**Input:**
```
URL: https://www-google.com.phishing-site.xyz
```

**AI Response:**
```
VERDICT: SUSPICIOUS
EXPLANATION: URL mimics Google domain but uses suspicious TLD (.xyz). TLS likely fails. High phishing risk.
NEXT_STEPS: Do NOT enter credentials; Check domain with whois lookup; Report to Google Phishing team
```

### Example 3: Risky Website

**Input:**
```
URL: http://totallylegitiminvestment-scam.club
```

**AI Response:**
```
VERDICT: RISKY
EXPLANATION: Unencrypted HTTP, no HSTS protection, suspicious domain structure. High credential theft risk.
NEXT_STEPS: Avoid this site entirely; Report to browser security team; Check for exposed accounts
```

---

## � Response Parsing

The backend parses AI responses using strict regex patterns:

```javascript
// Extract verdict (SAFE | SUSPICIOUS | RISKY)
const verdictMatch = aiResponse.match(/VERDICT:\s*(SAFE|SUSPICIOUS|RISKY)/i);
const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'UNKNOWN';

// Extract explanation (up to NEXT_STEPS line)
const explanationMatch = aiResponse.match(/EXPLANATION:\s*(.+?)(?:NEXT_STEPS:|$)/is);
const explanation = explanationMatch ? explanationMatch[1].trim() : 'Unable to determine';

// Extract next steps (rest of line after NEXT_STEPS:)
const nextStepsMatch = aiResponse.match(/NEXT_STEPS:\s*(.+?)(?:\n|$)/);
const nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : 'No recommendations';
```

---

## 🔐 Security Considerations

### What the Model Evaluates

✅ Domain reputation and legitimacy  
✅ URL structure and encoding  
✅ Known phishing patterns  
✅ Suspicious file extensions  
✅ Malware distribution indicators  
✅ Social engineering tactics  

### What the Model DOES NOT Evaluate

❌ Real-time threat intelligence feeds (no external API calls)  
❌ Advanced zero-day exploits  
❌ Content-based analysis (doesn't visit the URL)  
❌ SSL/TLS certificate validation  
❌ Dynamic behavior analysis  

### Limitations

⚠️ **False Positives**: Legitimate sites with unusual URL patterns may be flagged  
⚠️ **False Negatives**: Sophisticated phishing attempts may not be detected  
⚠️ **Latency**: First request ~5-10 seconds, subsequent requests ~2-3 seconds  
⚠️ **Context**: Model operates without real-time threat intelligence  

---

## 🚀 Enhanced Prompt Variants

### Alternative Prompt 1: Detailed Analysis

For future implementation requiring more detailed output:

```javascript
const detailedPrompt = `You are a cybersecurity professional analyzing URLs.

Analyze this URL for security threats:
URL: ${url}

Provide a comprehensive assessment including:
1. SAFETY_LEVEL: SAFE / SUSPICIOUS / RISKY
2. THREAT_TYPE: None / Phishing / Malware / Fraud / Unknown
3. CONFIDENCE: High / Medium / Low
4. INDICATORS: [List of suspicious indicators found, or "None"]
5. RECOMMENDATION: [Action user should take]

Format your response as:
SAFETY_LEVEL: [level]
THREAT_TYPE: [type]
CONFIDENCE: [confidence]
INDICATORS: [indicators]
RECOMMENDATION: [recommendation]`;
```

### Alternative Prompt 2: Multi-Language

For international deployment:

```javascript
const multiLangPrompt = `Vous êtes un expert en sécurité. Analysez cette URL:
URL: ${url}

Répondez en ce format:
SÉCURITÉ: [SÛR ou RISQUÉ]
RAISON: [Explication brève]`;
```

---

## 🧪 Testing Prompts

### Test Cases for QA

#### Test 1: Legitimate Site
```
URL: https://www.google.com
Expected: SAFETY: SAFE
```

#### Test 2: Known Phishing Pattern
```
URL: https://www-google.com.phishing-attack.xyz
Expected: SAFETY: RISKY
```

#### Test 3: URL Shortener
```
URL: https://bit.ly/abc123xyz
Expected: SAFETY: RISKY (or SUSPICIOUS due to redirect)
```

#### Test 4: Corporate Domain
```
URL: https://github.com/ellay21/cf_ai_internet_guardian
Expected: SAFETY: SAFE
```

#### Test 5: Suspicious Query Parameters
```
URL: https://legitimate-bank.com?redirect=malware.com&auth=steal
Expected: SAFETY: RISKY
```

---

## 📈 Prompt Engineering Best Practices

### Current Strengths ✅

1. **Clear Role Definition**: "You are a security expert"
2. **Structured Output**: Required format makes parsing reliable
3. **Specific Factors**: Lists evaluation criteria
4. **Case-Insensitive Parsing**: Handles variations in output

### Future Improvements 🔄

1. **Few-Shot Learning**: Include example analyses
2. **Temperature Control**: Adjust model randomness (0.2 = deterministic)
3. **System Message**: Separate system context from user prompt
4. **Confidence Scoring**: Include confidence levels in responses
5. **Multi-Factor Analysis**: Request reasoning for each factor
6. **Rate Limiting**: Implement token limits to ensure fast responses

---

## 🔌 Integration with Backend

### Code Location
File: `src/worker.js`  
Function: `analyzeURL(env, url)`  
Lines: ~75-135

### Usage Example

```javascript
const analysis = await analyzeURL(env, url);
await storeAnalysis(env.CHAT_MEMORY, url, analysis);
```

---

## 📝 Prompt Iteration Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-27 | Initial prompt with SAFETY/REASON format |
| - | - | - |

---

## 🎓 Resources

- [Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [LLaMA Model Documentation](https://huggingface.co/meta-llama/Llama-2-7b-chat)
- [Cloudflare Workers AI Prompts](https://developers.cloudflare.com/workers-ai/models/)
- [URL Security Analysis Techniques](https://owasp.org/www-community/attacks/URL_Traversal)

---

## 💡 Tips for Customization

1. **For Stricter Analysis**: Add "Be conservative and flag uncertain URLs" to prompt
2. **For Speed**: Remove detailed factor list, keep response format
3. **For Accuracy**: Include domain reputation databases in context
4. **For Compliance**: Add regulatory references (GDPR, CCPA) if needed

---

## 🔐 Privacy & Safety

- ✅ URLs are analyzed but not stored permanently (kept 10 max in KV)
- ✅ No URL data sent to external services
- ✅ AI model runs on Cloudflare's edge network
- ✅ Compliant with GDPR (no personal data collected)

---

**Last Updated**: October 27, 2025  
**Maintained By**: Internet Guardian Project Team  
**License**: MIT
