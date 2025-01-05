// app/api/chat/route.js
import { headers } from 'next/headers';
import OpenAI from 'openai';

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

    // Stream the run using the SDK's stream helper
    await openai.beta.threads.runs.stream(
      thread.id, 
      {
        assistant_id: ASSISTANT_ID,
        instructions: "You are continuing a conversation. Make sure to give new and relevant responses."
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