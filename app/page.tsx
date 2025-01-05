// app/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './page.module.css';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  functionCall?: string;
  isLoading?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim()
    };

    // Create loading message immediately
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      content: 'Thinking...',
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          threadId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const newThreadId = response.headers.get('X-Thread-ID');
      if (newThreadId) {
        setThreadId(newThreadId);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let currentContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        if (currentContent === '') {
          currentContent = chunk.trimStart();
        } else {
          currentContent += chunk;
        }

        // Update the existing assistant message
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id
            ? { ...msg, content: currentContent, isLoading: false }
            : msg
        ));
      }
    } catch (error) {
      console.error('Error:', error);
      // Update the loading message to show the error
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id
          ? { ...msg, content: 'Sorry, I encountered an error processing your request.', isLoading: false }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={styles.functionPanel}>
        <h2>Function Display</h2>
        <div className={styles.functionContent}>
          {messages
            .filter(msg => msg.functionCall)
            .map(msg => (
              <pre key={msg.id}>
                <code>{msg.functionCall}</code>
              </pre>
            ))}
        </div>
      </div>

      <div className={styles.chatPanel}>
        <div className={styles.messages}>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`${styles.message} ${msg.type === 'user' ? styles.user : styles.assistant}`}
            >
              <div className={`${styles.messageContent} ${msg.isLoading ? styles.loading : ''}`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className={styles.inputForm}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}