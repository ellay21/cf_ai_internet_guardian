import React, { useState, useRef, useEffect } from 'react';
import './app.css';
export default function URLAnalyzerApp() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isFirstQuery, setIsFirstQuery] = useState(true);
  const messagesEndRef = useRef(null);
  const turnstileRef = useRef(null);
  const recognitionRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || 'https://cf_ai_internet_guardian.asfawmesud.workers.dev';

  useEffect(() => {
    const generateSessionId = () => {
      const stored = sessionStorage.getItem('guardianSessionId');
      if (stored) {
        setSessionId(stored);
        return stored;
      }
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('guardianSessionId', newSessionId);
      setSessionId(newSessionId);
      return newSessionId;
    };

    generateSessionId();

    window.handleTurnstileCallback = (token) => {
      setTurnstileToken(token);
      console.log('✅ Turnstile verified with token');
    };

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    const fetchSiteKey = async () => {
      try {
        const response = await fetch(`${API_URL}/api/turnstile-site-key`);
        const data = await response.json();
        setTurnstileSiteKey(data.site_key);
        console.log('Site key fetched:', data.site_key.substring(0, 10) + '...');
      } catch (err) {
        console.error('Failed to fetch Turnstile site key:', err);
        setError('Failed to load security verification. Please refresh.');
      }
    };

    fetchSiteKey();

    return () => {
      delete window.handleTurnstileCallback;
      if (script.parentNode) {
        document.head.removeChild(script);
      }
    };
  }, []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTurnstileCallback = (token) => {
    console.log('handleTurnstileCallback called with token');
    setTurnstileToken(token);
  };

  const handleVoiceInput = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Voice input is not supported in your browser');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();

    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognitionRef.current.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        setInputValue(transcript);
      }
    };

    recognitionRef.current.onerror = (event) => {
      setError(`Voice error: ${event.error}`);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inputValue.trim()) {
      setError('Please enter a URL or question');
      return;
    }

    // On first query, require Turnstile
    if (isFirstQuery && !turnstileToken) {
      setError('Please complete the Turnstile verification');
      return;
    }

    const query = inputValue.trim();

    const userMessage = {
      type: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: query,
          turnstile_token: turnstileToken || null,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      let messageContent = '';
      let displayType = 'ai';

      if (data.isOffTopic) {
        messageContent = data.reason;
        displayType = 'off-topic';
      } else if (data.reason && data.reason.includes('Welcome') || data.reason && data.reason.includes('Hello')) {
        messageContent = data.reason;
        displayType = 'greeting';
      } else {
        messageContent = data.reason;
      }

      const aiMessage = {
        type: displayType,
        analysis: data.analysis,
        reason: messageContent,
        next_steps: data.next_steps,
        enrichment: data.enrichment,
        responseType: data.type,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (isFirstQuery) {
        setIsFirstQuery(false);
        console.log(' Session verified - Turnstile no longer required');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/api/history`);
      if (!response.ok) throw new Error('Failed to fetch history');

      const data = await response.json();
      const historyMessages = data.history.map((entry) => ({
        type: 'ai',
        content: entry.url,
        analysis: entry.analysis,
        reason: entry.reason,
        timestamp: new Date(entry.timestamp).toLocaleTimeString(),
        enrichment: entry.enrichment,
      }));

      setMessages(historyMessages);
      setShowHistory(false);
    } catch (err) {
      setError(`Failed to load history: ${err.message}`);
    }
  };

  const handleClearMessages = () => {
    setMessages([]);
    setError('');
  };

  const getSafetyColor = (analysis) => {
    switch (analysis) {
      case 'SAFE':
        return '#10b981';
      case 'RISKY':
        return '#ef4444';
      case 'SUSPICIOUS':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getSafetyText = (analysis) => {
    switch (analysis) {
      case 'SAFE':
        return '✓ SAFE';
      case 'RISKY':
        return '⚠ RISKY';
      case 'SUSPICIOUS':
        return '⚠ SUSPICIOUS';
      default:
        return '❓ UNKNOWN';
    }
  };

  return (
    <div className="container">
      <div className="app-card">
        {/* Header */}
        <div className="header">
          <div className="header-content">
            <h1 className="title">🛡️ Internet Guardian</h1>
            <p className="subtitle">AI-powered URL safety analysis with Turnstile protection</p>
          </div>
        </div>

        {/* Messages Container */}
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p className="empty-text">No URLs analyzed yet.</p>
              <p className="empty-subtext">Enter a URL above to get started!</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`message ${msg.type === 'user' ? 'user-message' : msg.type === 'greeting' ? 'greeting-message' : msg.type === 'off-topic' ? 'off-topic-message' : 'ai-message'}`}
              >
                {msg.type === 'user' ? (
                  <div className="message-content">
                    <p className="url-text">{msg.content}</p>
                    <span className="timestamp">{msg.timestamp}</span>
                  </div>
                ) : msg.type === 'greeting' ? (
                  <div className="message-content">
                    <div className="greeting-badge">👋 Welcome</div>
                    <p className="greeting-text">{msg.reason}</p>
                    <span className="timestamp">{msg.timestamp}</span>
                  </div>
                ) : msg.type === 'off-topic' ? (
                  <div className="message-content">
                    <div className="off-topic-badge">ℹ️ Info</div>
                    <p className="off-topic-text">{msg.reason}</p>
                    {msg.next_steps && (
                      <div className="next-steps">
                        <strong>💡 How I can help:</strong>
                        <p className="steps-text">{msg.next_steps}</p>
                      </div>
                    )}
                    <span className="timestamp">{msg.timestamp}</span>
                  </div>
                ) : (
                  <div className="message-content">
                    <div
                      className="safety-badge"
                      style={{
                        backgroundColor: getSafetyColor(msg.analysis),
                      }}
                    >
                      {getSafetyText(msg.analysis)}
                    </div>
                    <p className="reason-text">{msg.reason}</p>
                    {msg.next_steps && (
                      <div className="next-steps">
                        <strong>📋 Next Steps:</strong>
                        <p className="steps-text">{msg.next_steps}</p>
                      </div>
                    )}
                    {msg.enrichment && (
                      <div className="enrichment-info">
                        <strong>🔍 Domain Info:</strong>
                        <ul className="enrichment-list">
                          <li>HTTPS: {msg.enrichment.https ? '✓ Yes' : '✗ No'}</li>
                          <li>HSTS: {msg.enrichment.hsts_present ? '✓ Present' : '✗ Absent'}</li>
                          <li>Cloudflare: {msg.enrichment.is_cloudflare ? '✓ Yes' : '✗ No'}</li>
                        </ul>
                      </div>
                    )}
                    <span className="timestamp">{msg.timestamp}</span>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Analyzing URL...</p>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="input-form">
          <div className="input-wrapper">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter URL, question, or topic (e.g., 'Is example.com safe?' or 'Tell me about phishing')"
              className="url-input"
              disabled={loading}
              autoFocus
            />
            <button
              type="button"
              className="voice-button"
              onClick={handleVoiceInput}
              disabled={loading}
              title={isListening ? 'Listening...' : 'Click to speak'}
            >
              {isListening ? '🎙️ Listening...' : '🎤'}
            </button>
          </div>

          {/* Turnstile Widget - Only show on first query */}
          {turnstileSiteKey && isFirstQuery && (
            <div className="turnstile-wrapper">
              <div
                ref={turnstileRef}
                className="cf-turnstile"
                data-sitekey={turnstileSiteKey}
                data-callback="handleTurnstileCallback"
                data-theme="light"
              ></div>
            </div>
          )}

          <div className="button-group">
            <button
              type="submit"
              className="submit-button"
              disabled={loading || !inputValue.trim()}
            >
              {loading ? 'Analyzing...' : 'Analyze 🚀'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleLoadHistory}
            >
              📜 History
            </button>
            <button
              type="button"
              className="secondary-button danger"
              onClick={handleClearMessages}
            >
              🗑️ Clear
            </button>
          </div>
        </form>

        {}
        <div className="footer">
          <p className="footer-text">
            🚀 Powered by Cloudflare Workers, Workers AI, KV & Turnstile
          </p>
        </div>
      </div>
    </div>
  );
}
