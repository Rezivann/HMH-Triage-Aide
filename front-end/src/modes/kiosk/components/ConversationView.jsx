import { useState } from 'react';

export default function ConversationView({ messages, onSend, onContinue, sending }) {
  const [draft, setDraft] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  }

  return (
    <div>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role === 'patient' ? 'You' : 'Assistant'}:</strong> {message.text}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Describe what's wrong..."
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>

      <button type="button" onClick={onContinue} disabled={messages.length === 0}>
        Continue to photo
      </button>
    </div>
  );
}
