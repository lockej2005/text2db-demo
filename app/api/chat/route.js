// app/api/chat/route.js

import OpenAI from 'openai';
import { Pool } from 'pg';

// Postgres pool to your Supabase DB
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL, 
});

const queryDatabaseTool = {
  type: 'function',
  function: {
    name: 'query_database',
    description: 'Executes a SQL query with placeholders ($1, $2, etc.) plus parameter values on the deliveries DB.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'Full SQL statement with placeholders ($1, $2, etc.).',
        },
        values: {
          type: 'array',
          items: { type: 'string' },
          description: 'Parameter values to fill in for $1, $2, etc.',
        },
      },
      required: ['sql', 'values'],
      additionalProperties: false,
    },
  },
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// No 'edge' runtime!

export async function POST(req) {
  console.log('--- Entering POST handler for /api/chat ---');
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  let functionArgsBuffer = '';
  let currentFunctionName = null; // We'll store the function name if/when we see it

  try {
    const { message, threadId } = await req.json();
    console.log('Received request JSON:', { message, threadId });

    // Create or retrieve a thread
    let thread;
    if (threadId) {
      console.log('Retrieving existing thread:', threadId);
      thread = await openai.beta.threads.retrieve(threadId);
      console.log('Thread retrieved:', thread.id);
    } else {
      console.log('Creating new thread...');
      thread = await openai.beta.threads.create();
      console.log('New thread created:', thread.id);
    }

    // Add user message
    console.log('Adding user message to thread...');
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message,
    });
    console.log('User message added. Now starting to stream from OpenAI...');

    // Start streaming
    await openai.beta.threads.runs
      .stream(thread.id, {
        assistant_id: 'asst_zO6D9MK8dsc4qVeCOUIQizL3',
        instructions: `
You have access to a 'deliveries' database (tables: customers, drivers, deliveries).
Use "query_database" to read or write data, with parameterized queries ($1, $2...).
Output final answers in plain text.
`,
        tools: [queryDatabaseTool],
      })
      .on('textDelta', (textDelta) => {
        // Normal text partial
        console.log('Assistant partial text:', textDelta.value);
        writer.write(encoder.encode(textDelta.value));
      })
      .on('toolCallDelta', (toolCallDelta) => {
        console.log('--- toolCallDelta event triggered ---');
        console.log('toolCallDelta detail:', toolCallDelta);

        // The function name might be missing in partial deltas
        let fnName = toolCallDelta.function.name;
        const partialArgs = toolCallDelta.function.arguments ?? '';

        if (!fnName || !fnName.trim()) {
          // If the model didn't provide a function name in this chunk,
          // assume we're continuing the same function as before.
          console.log('No function name found in this chunk. Using currentFunctionName:', currentFunctionName);
          if (!currentFunctionName) {
            // Fallback if we never got a name (like you only have one function)
            console.log("We've never got a function name yet, defaulting to 'query_database'");
            currentFunctionName = 'query_database';
          }
          fnName = currentFunctionName; 
        } else if (fnName !== currentFunctionName) {
          // If the model explicitly gave a new name
          console.log('New function call started:', fnName);
          functionArgsBuffer = '';
          currentFunctionName = fnName;
        }

        // Accumulate partial JSON
        console.log('Accumulating chunk:', partialArgs);
        functionArgsBuffer += partialArgs;
      })
      .on('end', async () => {
        console.log('--- Streaming ended ---');
        console.log('functionArgsBuffer at end:', functionArgsBuffer);

        // If the final function name is 'query_database' and we have a buffer:
        if (currentFunctionName === 'query_database' && functionArgsBuffer.trim()) {
          console.log('We have a query_database call to parse...');
          try {
            console.log('Attempting to parse JSON from functionArgsBuffer...');
            const parsed = JSON.parse(functionArgsBuffer); 
            const { sql, values } = parsed;
            console.log('Parsed final arguments for query_database:', { sql, values });

            if (!sql) {
              console.log('No SQL found, skipping query...');
            } else {
              console.log('About to run query against Supabase...');
              try {
                const dbRes = await pool.query(sql, values);
                const results = dbRes.rows;
                console.log('Query successful! Results:', results);

                // Return them to the stream
                writer.write(
                  encoder.encode(`
Executing query: ${JSON.stringify(sql)}
Values: ${JSON.stringify(values)}
Results: ${JSON.stringify(results)}
`)
                );
              } catch (dbError) {
                console.log(process.env.SUPABASE_DB_URL)
                console.log('Query failed with error:', dbError.message);
                writer.write(encoder.encode(`Database error: ${dbError.message}\n`));
              }
            }
          } catch (err) {
            console.error('Error parsing final function arguments:', err);
            writer.write(encoder.encode(`Error: could not parse tool arguments => ${err}\n`));
          }
        } else {
          console.log('No recognized function call to parse or functionArgsBuffer is empty.');
        }

        console.log('Closing the writer now...');
        writer.close();
      })
      .on('error', (error) => {
        console.error('--- Streaming error event triggered ---', error);
        writer.write(encoder.encode(`Error: ${error.message}`));
        writer.close();
      });

    console.log('Returning streaming response to client now...');
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Thread-ID': thread.id,
      },
    });
  } catch (error) {
    console.error('--- Caught top-level error in /api/chat POST ---', error);
    if (writer) {
      writer.write(encoder.encode(`Error: ${error.message}`));
      writer.close();
    }
    return new Response(
      JSON.stringify({ error: 'Failed to process request', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
