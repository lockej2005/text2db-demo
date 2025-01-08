// app/api/query/route.js
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req) {
  try {
    const { query, params } = await req.json();

    // Execute the query using Supabase
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: query,
      query_params: params
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Query execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute query', details: error.message },
      { status: 500 }
    );
  }
}