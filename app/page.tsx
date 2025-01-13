'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './page.module.css';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [operationStatus, setOperationStatus] = useState(null);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Function to initialize SSE connection
  const initializeSSE = () => {
    console.log('Initializing SSE connection...');
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Updated path to use the GET handler in the chat route
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
      // Attempt to reconnect after 5 seconds
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
      }, 100); // Small delay to ensure content is rendered
    }
  };

  const [lastQueryInfo, setLastQueryInfo] = useState(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim()
    };

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      content: 'Thinking...',
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);
    // Clear operation status for new request
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

      // Scroll to bottom after new message
      scrollToBottom();

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id
          ? { 
              ...msg, 
              content: `Error: ${error.message}`, 
              isLoading: false 
            }
          : msg
      ));
    } finally {
      // Don't clear loading state until we get the complete status
      if (operationStatus?.type === 'complete') {
        setIsLoading(false);
      }
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
    code({ node, inline, className, children, ...props }) {
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
          {/* Show current operation status if loading */}
          {isLoading && operationStatus && (
            <div className={styles.statusContent}>
              {renderOperationStatus()}
            </div>
          )}
          
          {/* Show last query info when not loading */}
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