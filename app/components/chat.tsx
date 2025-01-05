// app/components/Chat.tsx
'use client';

import { useState, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [functionDisplay, setFunctionDisplay] = useState<string | null>(null);

  // Extract function blocks from message
  const extractFunctionBlock = (message: string) => {
    const regex = /```(?:[\w-]*\n)?([\s\S]*?)```/;
    const match = message.match(regex);
    return match ? match[1].trim() : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          threadId
        })
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      setThreadId(data.threadId);

      // Extract function block if present
      const functionBlock = extractFunctionBlock(data.message);
      if (functionBlock) {
        setFunctionDisplay(functionBlock);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="function-panel">
        <h2>Function Display</h2>
        {functionDisplay && (
          <pre className="function-content">
            <code>{functionDisplay}</code>
          </pre>
        )}
      </div>

      <div className="chat-panel">
        <div className="messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="message-content">
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="message-content loading">
                Thinking...
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you want to do with the database..."
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Send
          </button>
        </form>
      </div>

      <style jsx>{`
        .app-container {
          display: flex;
          height: 100vh;
          width: 100vw;
        }

        .function-panel {
          width: 33.333%;
          padding: 1rem;
          border-right: 1px solid #e2e8f0;
          background-color: #1e293b;
          color: #e2e8f0;
        }

        .chat-panel {
          width: 66.666%;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          background-color: #f8fafc;
        }

        .messages {
          flex-grow: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .message {
          max-width: 80%;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          white-space: pre-wrap;
        }

        .message.user {
          align-self: flex-end;
          background-color: #2563eb;
          color: white;
        }

        .message.assistant {
          align-self: flex-start;
          background-color: #e2e8f0;
          color: #1e293b;
        }

        .message-content {
          line-height: 1.5;
        }

        .loading {
          opacity: 0.7;
        }

        .input-form {
          display: flex;
          gap: 0.5rem;
          padding: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .input-form input {
          flex-grow: 1;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          font-size: 1rem;
        }

        .input-form button {
          padding: 0.75rem 1.5rem;
          background-color: #2563eb;
          color: white;
          border: none;
          border-radius: 0.375rem;
          cursor: pointer;
          font-size: 1rem;
        }

        .input-form button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .function-content {
          background-color: #2d3748;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          font-family: monospace;
          margin-top: 1rem;
        }

        @media (max-width: 768px) {
          .app-container {
            flex-direction: column;
          }

          .function-panel,
          .chat-panel {
            width: 100%;
            height: 50vh;
          }

          .function-panel {
            border-right: none;
            border-bottom: 1px solid #e2e8f0;
          }
        }
      `}</style>
    </div>
  );
}