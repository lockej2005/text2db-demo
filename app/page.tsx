'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// Update imports for Next.js compatibility
import dynamic from 'next/dynamic';
import styles from './page.module.css';

// Dynamically import SyntaxHighlighter
const SyntaxHighlighter = dynamic(
  () => import('react-syntax-highlighter').then((mod) => mod.Prism),
  { 
    ssr: false,
    loading: () => <pre><code>Loading...</code></pre>
  }
);
// Dynamically import the style
import { dracula } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Define TypeScript interfaces
interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
}

interface OperationStatus {
  type: 'connected' | 'thinking' | 'querying' | 'results' | 'error';
  message?: string;
  query?: string;
  results?: any;
  error?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<OperationStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Function to initialize SSE connection
  const initializeSSE = () => {
    console.log('Initializing SSE connection...');
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/chat');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('open', () => {
      console.log('SSE connection opened');
    });

    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE message received:', data);
        setOperationStatus(prev => {
          // Don't override results with other statuses
          if (prev?.type === 'results' && data.type === 'thinking') {
            return prev;
          }
          return data;
        });
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    });

    eventSource.addEventListener('error', (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      setTimeout(initializeSSE, 5000);
    });
  };

  // Initialize SSE on component mount
  useEffect(() => {
    initializeSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Handle operation status updates
  useEffect(() => {
    if (operationStatus?.type === 'complete') {
      setIsLoading(false);
    }
  }, [operationStatus?.type]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const [lastQueryInfo, setLastQueryInfo] = useState<OperationStatus | null>(null);

  // Update lastQueryInfo when we get query results
  useEffect(() => {
    if (operationStatus?.type === 'results') {
      setLastQueryInfo(operationStatus);
    }
  }, [operationStatus]);

  // Clear lastQueryInfo when starting a new request
  useEffect(() => {
    if (isLoading) {
      setLastQueryInfo(null);
    }
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim()
    };

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      content: 'Thinking...',
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    setOperationStatus(null);

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

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.threadId) {
        setThreadId(data.threadId);
      }

      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id
          ? { 
              ...msg, 
              content: data.message, 
              isLoading: false
            }
          : msg
      ));

      scrollToBottom();

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id
          ? { 
              ...msg, 
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 
              isLoading: false 
            }
          : msg
      ));
    }
  };

  const renderOperationStatus = () => {
    if (!operationStatus) return null;

    const getContent = () => {
      switch (operationStatus.type) {
        case 'connected':
          return <div>Ready...</div>;
        case 'thinking':
          return <div>{operationStatus.message || 'Processing...'}</div>;
        case 'querying':
          return (
            <div className={styles.statusGroup}>
              <div className={styles.statusMessage}>{operationStatus.message}</div>
              <div className={styles.querySection}>
                <div className={styles.queryLabel}>Query:</div>
                <pre><code>{operationStatus.query}</code></pre>
              </div>
            </div>
          );
        case 'results':
          return (
            <div className={styles.statusGroup}>
              <div className={styles.statusMessage}>{operationStatus.message}</div>
              <div className={styles.querySection}>
                <div className={styles.queryLabel}>Last Query:</div>
                <pre><code>{operationStatus.query}</code></pre>
              </div>
              <div className={styles.resultsSection}>
                <div className={styles.resultsLabel}>Results:</div>
                <div className={styles.results}>
                  <pre><code>{JSON.stringify(operationStatus.results, null, 2)}</code></pre>
                </div>
              </div>
            </div>
          );
        case 'error':
          return (
            <div className={styles.error}>
              <div>{operationStatus.message}</div>
              {operationStatus.error && <div>{operationStatus.error}</div>}
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <div className={styles.statusContent}>
        {getContent()}
      </div>
    );
  };

  const components = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={dracula}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  };

  return (
    <>
      <div className={styles.functionPanel}>
        <h2>Current Operation</h2>
        <div className={styles.functionContent}>
          {isLoading && operationStatus && (
            <div className={styles.statusContent}>
              {renderOperationStatus()}
            </div>
          )}
          
          {!isLoading && lastQueryInfo && (
            <div className={styles.statusContent}>
              <div className={styles.querySection}>
                <div className={styles.queryLabel}>Last Query:</div>
                <pre><code>{lastQueryInfo.query}</code></pre>
              </div>
              <div className={styles.resultsSection}>
                <div className={styles.resultsLabel}>Results:</div>
                <div className={styles.results}>
                  <pre><code>{JSON.stringify(lastQueryInfo.results, null, 2)}</code></pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.chatPanel}>
        <div className={styles.messages}>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`${styles.message} ${styles[msg.type]}`}
            >
              <div className={`${styles.messageContent} ${msg.isLoading ? styles.loading : ''}`}>
                {msg.type === 'assistant' ? (
                  <ReactMarkdown 
                    components={components}
                    className={styles.markdown}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
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