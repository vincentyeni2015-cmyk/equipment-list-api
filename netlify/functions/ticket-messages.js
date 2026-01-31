/**
 * ticket-messages.js
 * Netlify Function to get messages for a specific ticket
 * 
 * Endpoint: GET /.netlify/functions/ticket-messages?ticketId=xxx
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const { ticketId, includeInternal } = event.queryStringParameters || {};

    if (!ticketId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'ticketId is required' })
      };
    }

    // Build query
    let query = supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    // Only include internal notes if specifically requested (for staff)
    if (includeInternal !== 'true') {
      query = query.eq('is_internal', false);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      throw new Error('Failed to fetch messages');
    }

    const formattedMessages = (messages || []).map(msg => ({
      id: msg.id,
      ticketId: msg.ticket_id,
      message: msg.message,
      authorId: msg.author_id,
      authorName: msg.author_name,
      authorEmail: msg.author_email,
      isStaff: msg.is_staff,
      isInternal: msg.is_internal,
      createdAt: msg.created_at
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messages: formattedMessages,
        count: formattedMessages.length
      })
    };

  } catch (error) {
    console.error('Error fetching messages:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      })
    };
  }
};
