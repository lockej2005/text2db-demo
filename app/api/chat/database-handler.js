import { sql } from '@vercel/postgres';

/**
 * Executes a parameterized query against the database
 * @param {string} query - The SQL query with :param placeholders
 * @param {Object} parameters - Object containing parameter values
 * @returns {Promise<Array>} Query results
 */
async function executeQuery(queryText, parameters) {
  // Convert named parameters from :param style to $1 style
  let paramCount = 1;
  const paramMap = {};
  const processedQuery = queryText.replace(/:([\w]+)/g, (_, paramName) => {
    if (!paramMap[paramName]) {
      paramMap[paramName] = `$${paramCount}`;
      paramCount++;
    }
    return paramMap[paramName];
  });

  // Create ordered parameter array
  const paramValues = Object.keys(parameters).map(param => parameters[param]);

  try {
    const result = await sql.query(processedQuery, paramValues);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Handler for the query_database function
 */
export async function queryDatabase(args) {
  const { query, parameters } = args;
  
  // Validate query contains only allowed operations
  const normalizedQuery = query.toLowerCase();
  if (normalizedQuery.includes('drop') || 
      normalizedQuery.includes('truncate') || 
      normalizedQuery.includes('delete') ||
      normalizedQuery.includes('update') ||
      normalizedQuery.includes('insert')) {
    throw new Error('Only SELECT operations are allowed');
  }

  try {
    const results = await executeQuery(query, parameters);
    return JSON.stringify(results);
  } catch (error) {
    throw new Error(`Query execution failed: ${error.message}`);
  }
}