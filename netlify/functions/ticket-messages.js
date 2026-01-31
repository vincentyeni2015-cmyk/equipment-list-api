/**
 * ticket-messages.js
 * Netlify Function to get messages for a ticket
 * Uses Supabase REST API directly (no SDK needed)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

    let url = `${SUPABASE_URL}/rest/v1/ticket_messages?ticket_id=eq.${ticketId}&order=created_at.asc`;

    // Only include internal notes if specifically requested (for staff)
    if (includeInternal !== 'true') {
      url += '&is_internal=eq.false';
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const messages = await response.json();

    const formattedMessages = (messages || []).map(msg => {
      let attachments = null;
      if (msg.attachments) {
        try {
          attachments = typeof msg.attachments === 'string' 
            ? JSON.parse(msg.attachments) 
            : msg.attachments;
        } catch (e) {
          console.error('Error parsing attachments:', e);
        }
      }
      
      return {
        id: msg.id,
        ticketId: msg.ticket_id,
        message: msg.message,
        authorId: msg.author_id,
        authorName: msg.author_name,
        authorEmail: msg.author_email,
        isStaff: msg.is_staff,
        isInternal: msg.is_internal,
        attachments: attachments,
        createdAt: msg.created_at
      };
    });

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
