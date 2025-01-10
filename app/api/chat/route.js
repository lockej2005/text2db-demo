// app/api/chat/route.js
import OpenAI from 'openai';
import pg from 'pg';
import { broadcastStatus } from './status/route.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export async function POST(req) {
  let thread = null;
  
  try {
    const { message, threadId } = await req.json();
    
    // Broadcast initial thinking state
    broadcastStatus({
      type: 'thinking',
      message: 'Starting to process your request...'
    });

    // Create a new thread if no threadId provided
    thread = threadId ? threadId : (await openai.beta.threads.create()).id;

    // Add the user's message to the thread
    await openai.beta.threads.messages.create(thread, {
      role: "user",
      content: message
    });

    // Define database query function
    const tools = [{
      type: "function",
      function: {
        name: "query_database",
        description: "Query the Australian tax database which includes: TaxPayers (basic info), ABNs (business numbers), IncomeStatements (yearly income), Deductions (claims), TaxAssessments (calculations), PaymentPlans (installments), GovernmentPrograms (funding), Allocations (program funding), and Audits (reviews). Use JOINs as needed to gather complete information.",
        parameters: {
          type: "object",
          properties: {
            sql_query: {
              type: "string",
              description: "The SQL query to execute. Write a proper SQL query to get the requested information. Use appropriate JOINs when combining data from multiple tables."
            }
          },
          required: ["sql_query"],
          additionalProperties: false
        },
        strict: true
      }
    }];

    // Create a run with specific instructions
    const run = await openai.beta.threads.runs.create(
      thread,
      {
        assistant_id: "asst_zO6D9MK8dsc4qVeCOUIQizL3",
        tools: tools,
        instructions: `You are a tax database assistant that helps analyze Australian tax-related data and provides insights.

        COMPLETE DATABASE SCHEMA:

        1. TaxPayers:
           - taxpayer_id (SERIAL PRIMARY KEY)
           - full_name (VARCHAR(100) NOT NULL)
           - date_of_birth (DATE)
           - is_business (BOOLEAN NOT NULL DEFAULT FALSE)
           - phone_number (VARCHAR(20))
           - email (VARCHAR(100) NOT NULL UNIQUE)
           - address (VARCHAR(255))
           - created_at (TIMESTAMP DEFAULT NOW())

        2. ABNs:
           - abn_id (SERIAL PRIMARY KEY)
           - taxpayer_id (INT NOT NULL REFERENCES TaxPayers)
           - abn_number (VARCHAR(11) NOT NULL)
           - business_name (VARCHAR(100))
           - registered_on (DATE DEFAULT CURRENT_DATE)

        3. IncomeStatements:
           - income_statement_id (SERIAL PRIMARY KEY)
           - taxpayer_id (INT NOT NULL REFERENCES TaxPayers)
           - financial_year (VARCHAR(9) NOT NULL)
           - gross_income (NUMERIC(15,2) NOT NULL)
           - tax_withheld (NUMERIC(15,2) DEFAULT 0)
           - super_contribution (NUMERIC(15,2) DEFAULT 0)
           - updated_at (TIMESTAMP DEFAULT NOW())

        4. Deductions:
           - deduction_id (SERIAL PRIMARY KEY)
           - taxpayer_id (INT NOT NULL REFERENCES TaxPayers)
           - financial_year (VARCHAR(9) NOT NULL)
           - description (VARCHAR(255) NOT NULL)
           - amount (NUMERIC(15,2) NOT NULL)
           - created_at (TIMESTAMP DEFAULT NOW())

        5. TaxAssessments:
           - assessment_id (SERIAL PRIMARY KEY)
           - taxpayer_id (INT NOT NULL REFERENCES TaxPayers)
           - financial_year (VARCHAR(9) NOT NULL)
           - total_taxable_income (NUMERIC(15,2) NOT NULL)
           - total_tax_owed (NUMERIC(15,2) NOT NULL)
           - tax_paid (NUMERIC(15,2) NOT NULL DEFAULT 0)
           - refund_amount (NUMERIC(15,2) NOT NULL DEFAULT 0)
           - issued_date (DATE NOT NULL DEFAULT CURRENT_DATE)

        6. PaymentPlans:
           - plan_id (SERIAL PRIMARY KEY)
           - taxpayer_id (INT NOT NULL REFERENCES TaxPayers)
           - assessment_id (INT NOT NULL REFERENCES TaxAssessments)
           - created_date (TIMESTAMP DEFAULT NOW())
           - status (VARCHAR(50) DEFAULT 'Active')

        7. PaymentPlanInstallments:
           - installment_id (SERIAL PRIMARY KEY)
           - plan_id (INT NOT NULL REFERENCES PaymentPlans)
           - due_date (DATE NOT NULL)
           - amount (NUMERIC(15,2) NOT NULL)
           - paid_date (DATE)

        8. GovernmentPrograms:
           - program_id (SERIAL PRIMARY KEY)
           - program_name (VARCHAR(100) NOT NULL)
           - description (TEXT)

        9. GovernmentAllocations:
           - allocation_id (SERIAL PRIMARY KEY)
           - program_id (INT NOT NULL REFERENCES GovernmentPrograms)
           - financial_year (VARCHAR(9) NOT NULL)
           - allocated_funds (NUMERIC(15,2) NOT NULL)

        10. Audits:
            - audit_id (SERIAL PRIMARY KEY)
            - taxpayer_id (INT NOT NULL REFERENCES TaxPayers)
            - start_date (DATE NOT NULL)
            - end_date (DATE)
            - status (VARCHAR(50) DEFAULT 'Open')
            - notes (TEXT)

        Guidelines for Querying and Responses:
        - Format all currency values with $ and commas (e.g., $1,234.56)
        - Use financial year format YYYY-YYYY (e.g., 2024-2025)
        - Handle taxpayer privacy appropriately (only include names when specifically requested)
        - When joining tables, always consider the relationships and use appropriate JOIN types
        - For financial analysis, consider both individual and aggregate data
        - When analyzing trends, consider multiple financial years where available
        - For business taxpayers (is_business = TRUE), include ABN information when relevant
        - Present calculations with clear explanations of the components
        - Use appropriate grouping and filtering based on financial years
        - Handle NULL values appropriately in calculations

        Always execute a query before responding, and base your response on the actual data returned.
        If a query fails, explain the error and what might have caused it.`
      }
    );

    // Poll for the run completion
    let runStatus = await pollRunStatus(thread, run.id);

    // Handle tool calls if any
    if (runStatus.status === 'requires_action' && 
        runStatus.required_action?.type === 'submit_tool_outputs') {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      const toolOutputs = await Promise.all(toolCalls.map(async (toolCall) => {
        if (toolCall.function.name === 'query_database') {
          const query = JSON.parse(toolCall.function.arguments).sql_query;
          console.log('Executing query:', query);
          
          // Broadcast query execution status
          broadcastStatus({
            type: 'querying',
            message: 'Executing database query...',
            query: query
          });
          
          try {
            // Execute query using the connection pool
            const client = await pool.connect();
            try {
              const result = await client.query(query);
              console.log('Query results:', result.rows);

              // Broadcast query results
              broadcastStatus({
                type: 'results',
                message: 'Processing query results...',
                query: query,
                results: result.rows
              });

              return {
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  rows: result.rows,
                  rowCount: result.rowCount,
                  fields: result.fields.map(f => ({
                    name: f.name,
                    dataType: f.dataTypeID
                  }))
                })
              };
            } finally {
              client.release();
            }
          } catch (error) {
            console.error('Database query error:', error);
            
            // Broadcast error status
            broadcastStatus({
              type: 'error',
              message: 'Query failed',
              error: error.message
            });

            return {
              tool_call_id: toolCall.id,
              output: JSON.stringify({ 
                error: error.message,
                details: "The query failed to execute. Please check the syntax and try again."
              })
            };
          }
        }
      }));

      // Broadcast thinking status while processing results
      broadcastStatus({
        type: 'thinking',
        message: 'Analyzing query results...'
      });

      // Submit tool outputs back to the assistant
      runStatus = await openai.beta.threads.runs.submitToolOutputs(
        thread,
        run.id,
        { tool_outputs: toolOutputs }
      );

      // Poll again for completion
      runStatus = await pollRunStatus(thread, run.id);
    }

    // Get the latest message from the assistant
    const messages = await openai.beta.threads.messages.list(thread);
    const lastMessage = messages.data[0];

    // More robust message content extraction
    let messageContent = null;
    if (lastMessage?.content) {
      for (const content of lastMessage.content) {
        if (content.type === 'text') {
          messageContent = content.text.value;
          break;
        }
      }
    }

    if (!messageContent) {
      throw new Error('No valid response was generated by the assistant');
    }

    // Clear status when complete
    broadcastStatus({
      type: 'complete',
      message: 'Response ready'
    });

    return new Response(JSON.stringify({ 
      message: messageContent,
      threadId: thread
    }));

  } catch (error) {
    console.error('Error:', error);
    
    // Broadcast error status
    broadcastStatus({
      type: 'error',
      message: 'An error occurred',
      error: error.message
    });

    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred',
      threadId: thread
    }), { 
      status: 500 
    });
  }
}

async function pollRunStatus(threadId, runId) {
  let run;
  let attempts = 0;
  const maxAttempts = 60; // Maximum 60 seconds of polling

  do {
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
    if (['completed', 'requires_action', 'failed', 'expired'].includes(run.status)) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  } while (attempts < maxAttempts);

  if (run.status === 'failed') {
    throw new Error(`Assistant run failed: ${run.last_error?.message || 'Unknown error'}`);
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Assistant run timed out after 60 seconds');
  }

  return run;
}