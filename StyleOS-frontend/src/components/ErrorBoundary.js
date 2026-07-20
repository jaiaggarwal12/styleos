import React from 'react';

// Without this, any uncaught error during render (a race condition, a
// malformed API response, anything) unmounts the ENTIRE app — genuinely
// blank, no navbar, nothing — until the user manually refreshes. This
// turns that into a recoverable screen instead of a silent dead end.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    this.setState({ error, info });
  }

  render() {
    if (this.state.hasError) {
      const { error, info } = this.state;
      // Surfacing the real message + stack right on the screen (not just the
      // console) so a screenshot of a crash is enough to pinpoint the exact
      // failing line, instead of guessing at what went wrong.
      const detail = [
        error && (error.message || String(error)),
        error && error.stack,
        info && info.componentStack,
      ].filter(Boolean).join('\n\n');
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#1F1F1F', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#6B7280', marginBottom: 20 }}>This page hit an unexpected error.</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null, info: null }); window.location.href = '/'; }}
            style={{ background: '#FF3F6C', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, cursor: 'pointer' }}
          >
            Back to Home
          </button>
          {detail && (
            <details style={{ marginTop: 24, maxWidth: 720, width: '100%', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: '#6B7280', fontSize: 13 }}>Show technical details</summary>
              <pre style={{ marginTop: 8, padding: 12, background: '#F4F1FF', color: '#1F1F1F', borderRadius: 8, fontSize: 11, lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
