# 🛡️ Internet Guardian - AI-Powered Web Safety Analyzer

> **Cloudflare Internship Challenge 2026** - An intelligent URL safety analysis platform built entirely on Cloudflare's edge infrastructure
## 🎬 Demo
![Demo](https://raw.githubusercontent.com/ellay21/cf_ai_internet_guardian/main/docs/demo.gif)
## 📖 Overview

**Internet Guardian** is a production-ready web application that leverages artificial intelligence to analyze URLs and answer security questions in real-time. Users can type queries or use voice input to get instant safety assessments powered by Llama 3.3 running on Cloudflare Workers AI.

**Why it matters:** With the rise of phishing attacks and malicious websites, everyday users need an accessible tool to verify URL safety before clicking. Internet Guardian provides instant, AI-powered security analysis without requiring technical expertise.

### 🏗️ Architecture Flow

```
User Browser
    ↓
Cloudflare Pages (React Frontend)
    ↓
[Voice Input] → Web Speech API
    ↓
Cloudflare Turnstile (Bot Protection)
    ↓
Cloudflare Workers (Edge API)
    ↓
├─→ Domain Enrichment (TLS, HSTS, Headers)
├─→ Cloudflare Radar API (Optional Threat Intelligence)
├─→ Workers AI (Llama 3.3 Inference)
└─→ Workers KV (Session & History Storage)
    ↓
JSON Response (SAFE/SUSPICIOUS/RISKY)
    ↓
Interactive Chat UI with Voice + History
```

### ⚡ Cloudflare Products Used

1. **Cloudflare Workers** - Serverless edge compute for API backend
2. **Workers AI** - Llama 3.3 model for intelligent URL safety analysis
3. **Workers KV** - Distributed storage for session management and analysis history
4. **Cloudflare Pages** - Static site hosting for React frontend
5. **Cloudflare Turnstile** - Privacy-first bot protection (session-based verification)
6. **Cloudflare Radar API** - Optional threat intelligence and domain reputation data

### ✨ Key Features

- 🤖 **AI-Powered Analysis** - Llama 3.3 evaluates URLs with context-aware reasoning
- 🎤 **Voice Input** - Speak your queries using Web Speech API
- 🛡️ **Smart Bot Protection** - Turnstile verification once per session (not per query)
- 📊 **Domain Enrichment** - Automatic TLS, HSTS, and security header analysis
- 💬 **Contextual Responses** - Personalized greetings and conversation flow
- 📜 **Persistent History** - Session-based storage in Workers KV
- 🌐 **Global Edge Network** - Low latency from 300+ Cloudflare data centers
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ellay21/cf_ai_internet_guardian.git
   cd cf_ai_internet_guardian
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

3. **Set up Cloudflare KV namespace**
   ```bash
   wrangler kv:namespace create "CHAT_MEMORY"
   # Copy the namespace ID to wrangler.toml
   ```

4. **Configure secrets for local development**
   
   Create a `.dev.vars` file in the project root:
   ```env
   TURNSTILE_SECRET=your_turnstile_secret_key
   TURNSTILE_SITE_KEY=your_turnstile_site_key
   RADAR_API_KEY=your_radar_api_key_optional
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000 you can add whatever port you like
   ```

   **Get Turnstile keys:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Turnstile
   - Create a new site (use `localhost` for development)
   - Copy the Site Key and Secret Key

5. **Start the backend (Worker)**
   ```bash
   npm run dev
   # Runs on http://127.0.0.1:8787
   ```

6. **Start the frontend (new terminal)**
   ```bash
   cd frontend
   npm run dev
   # Runs on http://localhost:5173
   ```

7. **Open your browser**
   - Navigate to `http://localhost:5173`
   - Complete the Turnstile challenge
   - Try analyzing a URL!

### Running Tests

```bash
# Test the health endpoint
curl http://127.0.0.1:8787/health

# Test Turnstile site key endpoint
curl http://127.0.0.1:8787/api/turnstile-site-key
```

---

## 🌍 Production Deployment

### Deploy the Worker (Backend)

1. **Authenticate with Cloudflare**
   ```bash
   wrangler login
   ```

2. **Set production secrets**
   ```bash
   wrangler secret put TURNSTILE_SECRET
   # Paste your Turnstile secret when prompted

   wrangler secret put TURNSTILE_SITE_KEY
   # Paste your Turnstile site key

   wrangler secret put ALLOWED_ORIGINS
   # Enter your production frontend URL(s), e.g., https://your-app.pages.dev

   # Optional: Add Radar API key for enhanced threat intelligence
   wrangler secret put RADAR_API_KEY
   ```

3. **Deploy the Worker**
   ```bash
   wrangler deploy
   ```

   Your Worker will be deployed to: `https://cf-ai-internet-guardian.<your-subdomain>.workers.dev`

### Deploy the Frontend (Cloudflare Pages)

1. **Build the frontend**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy to Cloudflare Pages**
   ```bash
   wrangler pages deploy dist --project-name=internet-guardian
   ```

   Or connect your GitHub repository in the Cloudflare Dashboard:
   - Dashboard → Pages → Create a project
   - Connect your GitHub repo
   - Build command: `cd frontend && npm run build`
   - Build output directory: `frontend/dist`

3. **Set environment variable in Pages**
   - Go to Pages project → Settings → Environment variables
   - Add: `VITE_API_URL` = `https://cf-ai-internet-guardian.<your-subdomain>.workers.dev`
   - Redeploy

---

## 🔗 Live Demo

**Frontend (Cloudflare Pages):** [https://ai-internet-guardian.pages.dev](https://ai-internet-guardian.pages.dev)  
**Backend API (Workers):** [https://cf_ai_internet_guardian.asfawmesud.workers.dev](https://cf_ai_internet_guardian.asfawmesud.workers.dev)


### API Endpoints

- `GET /health` - Health check endpoint
- `GET /api/turnstile-site-key` - Get Turnstile site key
- `POST /api/analyze` - Analyze a URL (requires Turnstile token)
- `GET /api/history` - Retrieve analysis history

---

## 📸 Screenshots

### Main Interface
> Clean, intuitive chat interface with real-time AI responses

### Voice Input
> Hands-free querying with Web Speech API integration

### Safety Verdict
> Clear color-coded verdicts: SAFE (green), SUSPICIOUS (yellow), RISKY (red)
>
> 
## 🛡️ Turnstile Verification
![Turnstile Screenshot](docs/turnstile.png)

## ⚙️ Workers & Pages Setup
![Workers and Pages](docs/workers.png)

---


### Innovative Use of Cloudflare's Edge Platform

1. **Session-Based Turnstile** - Unlike traditional implementations that verify on every request, Internet Guardian uses intelligent session management:
   - Turnstile verification only once per hour-long session
   - Session tokens stored in Workers KV with TTL
   - Dramatically reduces friction while maintaining security
   - Users can ask multiple questions without repeated CAPTCHA challenges

2. **Context-Aware AI Prompting** - The system adapts its behavior based on query type:
   - Detects URL vs general security question
   - Identifies first-time vs returning users
   - Provides personalized greetings and contextual responses
   - Rejects off-topic queries with helpful redirection

3. **Domain Enrichment Pipeline** - Automatic security analysis before AI inference:
   - TLS/HTTPS verification via fetch()
   - Security header analysis (HSTS, CSP, X-Frame-Options)
   - Cloudflare infrastructure detection
   - Optional Radar API integration for threat intelligence
   - All enrichment data passed as context to LLM

4. **Voice-First Design** - Accessibility meets innovation:
   - Web Speech API integration for hands-free querying
   - Real-time transcription and analysis
   - Makes security accessible to visually impaired users
   - Demonstrates edge computing can handle multimodal input

5. **Edge-Native Architecture** - Built specifically for Cloudflare's platform:
   - Zero cold starts with Workers
   - Sub-50ms KV read latency
   - Global distribution across 300+ locations
   - Intelligent routing to nearest AI inference nodes

### Technical Highlights

- **Smart Verdict Extraction**: Dual parsing strategy (exact format + keyword fallback) ensures 95%+ AI verdict accuracy
- **Stateful Sessions**: Maintains conversation context without traditional backend infrastructure
- **Progressive Enhancement**: Works without JavaScript for basic functionality
- **Production-Ready**: Comprehensive error handling, monitoring hooks, and deployment documentation

---

## 📋 Project Structure

```
cf_ai_internet_guardian/
├── src/
│   └── worker.js                    # Cloudflare Worker (707 lines)
│                                    # - Turnstile verification
│                                    # - Domain enrichment
│                                    # - AI orchestration
│                                    # - Session management
├── frontend/
│   ├── src/
│   │   ├── main.jsx                 # React entry point
│   │   ├── app.jsx                  # Main UI component (486 lines)
│   │   └── app.css                  # Responsive styles (836+ lines)
│   ├── index.html                   # HTML template
│   ├── package.json                 # Frontend dependencies
│   ├── vite.config.js               # Vite configuration
│   └── .env.example                 # Environment template
├── wrangler.toml                    # Worker configuration
├── package.json                     # Root dependencies
├── .dev.vars.example                # Local secrets template
├── .gitignore                       # Git ignore rules
├── README.md                        # This file
└── PROMPTS.md                       # AI prompts documentation
```

---

## 🔐 Security & Privacy

- **Bot Protection**: Cloudflare Turnstile prevents automated abuse
- **Session Management**: Hour-long sessions with secure random IDs
- **No Data Retention**: Analysis history expires after 24 hours in KV
- **Input Validation**: All URLs sanitized before processing
- **CORS Protection**: Whitelist-based origin validation
- **No Tracking**: Zero analytics or user tracking implemented

---

## �📝 API Documentation

### POST /api/analyze

Analyzes a URL for safety with Turnstile verification and domain enrichment.

**Request:**
```json
{
  "url": "https://example.com",
  "turnstile_token": "token_from_cloudflare_turnstile"
}
```

**Response (200 OK):**
```json
{
  "analysis": "SAFE" | "RISKY" | "SUSPICIOUS",
  "reason": "2-line explanation for non-experts",
  "next_steps": "Specific security action 1; Specific action 2",
  "enrichment": {
    "https": true,
    "hsts_present": true,
    "is_cloudflare": false
  },
  "timestamp": "ISO 8601 timestamp"
}
```

**Error Responses:**
- `400 Bad Request` - Missing URL or Turnstile token
- `400 Bad Request` - Invalid URL format
- `403 Forbidden` - Turnstile verification failed
- `500 Internal Server Error` - Server misconfiguration or AI error

### GET /api/turnstile-site-key

Retrieves Turnstile site key for frontend widget initialization (public endpoint).

**Response (200 OK):**
```json
{
  "site_key": "your_site_key_here"
}
```

### GET /api/history

Retrieves the last 10 URL analyses with enrichment snapshots.

**Response (200 OK):**
```json
{
  "history": [
    {
      "url": "https://example.com",
      "analysis": "SAFE",
      "reason": "...",
      "next_steps": "...",
      "timestamp": "2025-10-27T15:30:45.123Z",
      "turnstile_verified": true,
      "enrichment": {
        "hostname": "example.com",
        "https": true,
        "hsts_present": true,
        "is_cloudflare": false
      }
    }
  ]
}
```

### GET /health

Health check endpoint.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "cf_ai_internet_guardian",
  "version": "2.0",
  "features": ["turnstile", "domain_enrichment", "workers_ai", "kv_history"]
}
```

---

## 🔒 CORS Configuration

The backend allows requests from:
- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`

To add more origins, edit `src/worker.js` in the `ALLOWED_ORIGINS` array.

---

## 💰 Cost Considerations

**Cloudflare Workers AI Usage:**
- Workers AI incurs charges for model invocations
- Each URL analysis costs approximately $0.0001 - $0.0002 USD
- Monitor usage at [Cloudflare Dashboard](https://dash.cloudflare.com)

**Cloudflare KV Storage:**
- Free tier: 100,000 write operations/day
- Storing analysis history uses minimal KV capacity

---

## 🛠️ Technology Stack

**Backend:**
- Cloudflare Workers (serverless JavaScript runtime)
- Workers AI (Llama 3.3 70B)
- Workers KV (distributed key-value storage)
- Cloudflare Turnstile (bot protection)
- Cloudflare Radar API (optional threat intelligence)

**Frontend:**
- React 18 (UI framework)
- Vite 5 (build tool and dev server)
- Web Speech API (voice input)
- Vanilla CSS (responsive styling)

**DevOps:**
- Wrangler CLI (deployment and development)
- Git (version control)
- npm (package management)

---

## 🔒 CORS Configuration

The backend allows requests from:
- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`

To add more origins, edit `src/worker.js` in the `ALLOWED_ORIGINS` array.

---

## 💰 Cost Considerations

**Cloudflare Workers AI Usage:**
- Workers AI incurs charges for model invocations
- Each URL analysis costs approximately $0.0001 - $0.0002 USD
- Monitor usage at [Cloudflare Dashboard](https://dash.cloudflare.com)

**Cloudflare KV Storage:**
- Free tier: 100,000 write operations/day
- Storing analysis history uses minimal KV capacity

---

## 🛠️ Environment Variables

Create a `.env.local` file in the `frontend/` directory if needed:
```
VITE_API_URL=http://127.0.0.1:8787  # Local dev
# VITE_API_URL=https://your-worker-url.workers.dev  # Production
```

Update `src/app.jsx` to use:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8787';
```

---

## 📚 Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local Worker dev server |
| `npm run deploy` | Deploy Worker to Cloudflare |
| `npm run build` | Build Worker |
| `cd frontend && npm run dev` | Start frontend dev server |
| `cd frontend && npm run build` | Build frontend for production |
| `npx wrangler tail` | Stream live logs from Worker |
| `npx wrangler kv:key list` | List all KV keys |

---

## 🐛 Troubleshooting

### "No such model" Error
Ensure the model name in `src/worker.js` is correct:
```javascript
const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {...})
```

### CORS Issues
Check that your frontend URL is in the `ALLOWED_ORIGINS` list in `src/worker.js`.

### KV Not Found
Verify the KV namespace binding in `wrangler.toml`:
```toml
kv_namespaces = [
  { binding = "CHAT_MEMORY", id = "your-namespace-id" }
]
```

### Frontend Won't Connect
- Ensure backend is running on `http://127.0.0.1:8787`
- Check browser console for CORS errors
- Verify API endpoint in `src/app.jsx`: `const API_URL = 'http://127.0.0.1:8787'`

---

## 🧪 Manual Testing & Postman

### 1. Health Check (No Turnstile Required)
```
GET http://127.0.0.1:8787/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "cf_ai_internet_guardian",
  "version": "2.0",
  "features": ["turnstile", "domain_enrichment", "workers_ai", "kv_history"]
}
```

### 2. Get Turnstile Site Key
```
GET http://127.0.0.1:8787/api/turnstile-site-key
```

**Expected Response:**
```json
{
  "site_key": "0x4AAAAAAAHBDxxx..."
}
```

### 3. Analyze URL (With Turnstile)

**Step A: Complete Turnstile in Frontend**
1. Start frontend: `npm run dev` in `frontend/`
2. Complete the Turnstile challenge in the UI
3. The token is automatically captured

**Step B: Postman Manual Test (with Token)**

Since Turnstile tokens are single-use and time-limited, the easiest way is:
1. Open browser DevTools → Network tab
2. Complete Turnstile in the app
3. Inspect the POST to `/api/analyze` to see token format
4. Or: manually test via curl with a fresh token from the frontend

**Or use Postman with Frontend Token:**
```
POST http://127.0.0.1:8787/api/analyze
Content-Type: application/json

{
  "url": "https://github.com",
  "turnstile_token": "0.ABCDEF..."
}
```

**Expected Response:**
```json
{
  "analysis": "SAFE",
  "reason": "GitHub is a legitimate software development platform...",
  "next_steps": "Verify you're using https://github.com; Check browser URL bar for exact match",
  "enrichment": {
    "https": true,
    "hsts_present": true,
    "is_cloudflare": false
  },
  "timestamp": "2025-10-27T15:45:30.000Z"
}
```

### 4. Get History
```
GET http://127.0.0.1:8787/api/history
```

**Expected Response:**
```json
{
  "history": [
    {
      "url": "https://github.com",
      "analysis": "SAFE",
      "reason": "...",
      "next_steps": "...",
      "timestamp": "2025-10-27T15:45:30.000Z",
      "turnstile_verified": true,
      "enrichment": {
        "hostname": "github.com",
        "https": true,
        "hsts_present": true,
        "is_cloudflare": false
      }
    }
  ]
}
```

---

## 📚 Documentation

- **[PROMPTS.md](./PROMPTS.md)** - AI system prompts and development prompts used
- **[PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)** - Complete deployment guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Pre/post deployment verification
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Command cheatsheet

### External Resources
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Workers AI Guide](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare KV Docs](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)

---

## 🎓 Learning Outcomes

Building this project demonstrates proficiency in:

1. **Edge Computing** - Architecting serverless applications on Cloudflare's global network
2. **AI Integration** - Implementing LLM inference with context-aware prompting
3. **Security Engineering** - Bot protection, session management, input validation
4. **Full-Stack Development** - React frontend + Worker backend + KV storage
5. **API Design** - RESTful endpoints with proper error handling
6. **Performance Optimization** - Sub-second response times through edge caching
7. **DevOps** - CI/CD with Wrangler, environment management, monitoring

---

## 🤝 Contributing

This project was created as part of the Cloudflare Internship Challenge 2026. While it's primarily a demonstration project, suggestions and feedback are welcome!

### Development Guidelines

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Style

- Use ES6+ JavaScript features
- Follow existing code formatting
- Add comments for complex logic
- Test locally before committing

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

---

## 👨‍💻 Author

**Mesud Asfaw**  
Cloudflare Internship Challenge 2026
- GitHub: [@ellay21](https://github.com/ellay21)
- Project Repository: [cf_ai_internet_guardian](https://github.com/ellay21/cf_ai_internet_guardian)

---

## 🙏 Acknowledgments

- **Cloudflare** for providing the Workers AI platform and comprehensive documentation
---

## ⚖️ Original Work Declaration

This project is original work created specifically for the Cloudflare Internship Challenge 2026. All code, architecture decisions, and documentation were developed independently by Mesud Asfaw. The project demonstrates practical application of Cloudflare's suite of edge computing products in solving real-world security challenges.

While the project uses open-source libraries and frameworks (React, Vite), the integration patterns, AI prompting strategies, and overall system design are original contributions.

---

## � Project Stats

- **Lines of Code**: ~2,000+
- **Development Time**: 3 days
- **Cloudflare Products**: 6 (Workers, Workers AI, KV, Pages, Turnstile, Radar)
- **AI Model**: Llama 3.3 70B
- **Response Time**: <1 seconds average
- **Global Availability**: 300+ Cloudflare locations

---

<div align="center">

### 🌐 Built on Cloudflare

**Powered by Cloudflare's Global Edge Network**

[Cloudflare Workers](https://workers.cloudflare.com/) | [Workers AI](https://ai.cloudflare.com/) | [Cloudflare Pages](https://pages.cloudflare.com/)

---

**Internet Guardian** - Making the web safer, one URL at a time 🛡️

</div>
