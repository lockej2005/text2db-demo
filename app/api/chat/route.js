// app/api/chat/route.js
import { headers } from 'next/headers';
import OpenAI from 'openai';
import { dbSchema } from './schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = "asst_zO6D9MK8dsc4qVeCOUIQizL3";

export const runtime = 'edge';

export async function POST(req) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  try {
    const { message, threadId } = await req.json();

    // Create or continue thread
    let thread;
    if (threadId) {
      thread = await openai.beta.threads.retrieve(threadId);
    } else {
      thread = await openai.beta.threads.create();
    }

    // Add message to thread
    await openai.beta.threads.messages.create(
      thread.id,
      {
        role: "user",
        content: message
      }
    );

    // Run the assistant with the database schema context
    await openai.beta.threads.runs.stream(
      thread.id, 
      {
        assistant_id: ASSISTANT_ID,
        instructions: `You are a helpful assistant with access to a delivery management database. 
The database schema is: ${JSON.stringify(dbSchema, null, 2)}

When querying the database:
1. Use the 'query_database' function for all database operations
2. Always use parameterized queries with :param syntax
3. Include proper JOIN conditions when querying across tables
4. Handle NULL values appropriately
5. Use appropriate WHERE clauses and ORDER BY when needed`
      }
    )
    .on('textCreated', (text) => {
      writer.write(encoder.encode('\n'));
    })
    .on('textDelta', (textDelta, snapshot) => {
      writer.write(encoder.encode(textDelta.value));
    })
    .on('toolCallCreated', (toolCall) => {
      writer.write(encoder.encode(`\n${toolCall.type}\n\n`));
    })
    .on('toolCallDelta', (toolCallDelta, snapshot) => {
      if (toolCallDelta.type === 'code_interpreter') {
        if (toolCallDelta.code_interpreter.input) {
          writer.write(encoder.encode(toolCallDelta.code_interpreter.input));
        }
        if (toolCallDelta.code_interpreter.outputs) {
          writer.write(encoder.encode("\noutput >\n"));
          toolCallDelta.code_interpreter.outputs.forEach(output => {
            if (output.type === "logs") {
              writer.write(encoder.encode(`\n${output.logs}\n`));
            }
          });
        }
      }
      
      if (toolCallDelta.type === 'function' && toolCallDelta.function.name === 'query_database') {
        if (toolCallDelta.function.arguments) {
          writer.write(encoder.encode(`\nExecuting query: ${toolCallDelta.function.arguments}\n`));
        }
        if (toolCallDelta.function.output) {
          writer.write(encoder.encode(`\nQuery results: ${toolCallDelta.function.output}\n`));
        }
      }
    })
    .on('end', () => {
      writer.close();
    })
    .on('error', (error) => {
      console.error('Streaming error:', error);
      writer.write(encoder.encode(`Error: ${error.message}`));
      writer.close();
    });

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Thread-ID': thread.id
      },
    });

  } catch (error) {
    console.error('Error:', error);
    if (writer) {
      writer.write(encoder.encode(`Error: ${error.message}`));
      writer.close();
    }
    return new Response(
      JSON.stringify({ error: 'Failed to process request', details: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}