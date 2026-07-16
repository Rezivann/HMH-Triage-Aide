import { useState } from 'react';
import MotionButton from './MotionButton';

// Read-only, easily copyable rendering of a URL - the fallback next to a QR
// code for anyone who can't scan it (or wants to paste the link into a
// different device). Tapping the field selects all of it even without
// clipboard API support; the button covers the common case with one tap.
export default function CopyableLink({ url }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err.message);
    }
  }

  return (
    <div
      className="row"
      style={{
        alignItems: 'center',
        gap: 'var(--space-2)',
        width: '100%',
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <input
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      />
      <MotionButton type="button" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </MotionButton>
    </div>
  );
}
