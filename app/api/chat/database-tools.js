const dbSchema = {
    tables: {
      customers: {
        columns: {
          customer_id: { type: 'UUID', isPrimary: true },
          name: { type: 'VARCHAR(100)', isRequired: true },
          email: { type: 'VARCHAR(255)', isRequired: true, isUnique: true },
          phone: { type: 'VARCHAR(20)' },
          address: { type: 'TEXT', isRequired: true },
          created_at: { type: 'TIMESTAMP WITH TIME ZONE' }
        }
      },
      drivers: {
        columns: {
          driver_id: { type: 'UUID', isPrimary: true },
          name: { type: 'VARCHAR(100)', isRequired: true },
          email: { type: 'VARCHAR(255)', isRequired: true, isUnique: true },
          phone: { type: 'VARCHAR(20)', isRequired: true },
          vehicle_type: { type: 'VARCHAR(50)' },
          license_number: { type: 'VARCHAR(50)', isRequired: true },
          status: { 
            type: 'VARCHAR(20)', 
            enum: ['available', 'busy', 'offline']
          },
          created_at: { type: 'TIMESTAMP WITH TIME ZONE' }
        }
      },
      deliveries: {
        columns: {
          delivery_id: { type: 'UUID', isPrimary: true },
          customer_id: { 
            type: 'UUID', 
            isRequired: true,
            references: {
              table: 'customers',
              column: 'customer_id'
            }
          },
          driver_id: { 
            type: 'UUID', 
            references: {
              table: 'drivers',
              column: 'driver_id'
            }
          },
          pickup_address: { type: 'TEXT', isRequired: true },
          delivery_address: { type: 'TEXT', isRequired: true },
          status: { 
            type: 'VARCHAR(20)', 
            enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled']
          },
          created_at: { type: 'TIMESTAMP WITH TIME ZONE' },
          pickup_time: { type: 'TIMESTAMP WITH TIME ZONE' },
          delivered_time: { type: 'TIMESTAMP WITH TIME ZONE' },
          package_description: { type: 'TEXT' },
          delivery_notes: { type: 'TEXT' }
        }
      }
    }
  };
  
  const databaseTools = [
    {
      type: "function",
      function: {
        name: "query_database",
        description: "Executes a parameterized SQL query against the delivery management database. Always use :param syntax for parameters to prevent SQL injection.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The SQL query to execute. Must use :param syntax for parameters (e.g., WHERE customer_id = :customerId)"
            },
            parameters: {
              type: "object",
              description: "Object containing parameter values that match the :param placeholders in the query",
              patternProperties: {
                "^[a-zA-Z0-9_]+$": {
                  anyOf: [
                    { type: "string" },
                    { type: "number" },
                    { type: "boolean" },
                    { type: "null" }
                  ]
                }
              }
            }
          },
          required: ["query", "parameters"],
          additionalProperties: false
        }
      }
    }
  ];
  
  // Example system message addition:
  const systemMessage = `
  You have access to a delivery management database with the following schema:
  ${JSON.stringify(dbSchema, null, 2)}
  
  When using the query_database function:
  1. Always use parameterized queries with :param syntax
  2. Include proper JOIN conditions when querying across tables
  3. Handle NULL values appropriately
  4. Use appropriate WHERE clauses and ORDER BY when needed
  5. Never concatenate user input directly into queries
  
  Example valid queries:
  - SELECT * FROM customers WHERE customer_id = :customerId
  - SELECT d.*, c.name as customer_name 
    FROM deliveries d 
    JOIN customers c ON d.customer_id = c.customer_id 
    WHERE d.status = :status
  `;
  
  export { databaseTools, systemMessage };