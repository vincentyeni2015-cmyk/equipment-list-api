/**
 * ticket-reply.js
 * Netlify Function to add a reply/message to a ticket
 * 
 * Endpoint: POST /.netlify/functions/ticket-reply
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { ticketId, message, authorId, authorName, authorEmail, isStaff, isInternal } = body;

    // Validate required fields
    if (!ticketId || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'ticketId and message are required' 
        })
      };
    }

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, status')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Ticket not found' })
      };
    }

    // Create the message
    const messageData = {
      id: generateId(),
      ticket_id: ticketId,
      message: message.trim(),
      author_id: authorId || null,
      author_name: authorName || 'Customer',
      author_email: authorEmail || null,
      is_staff: isStaff || false,
      is_internal: isInternal || false,
      created_at: new Date().toISOString()
    };

    const { data: newMessage, error: messageError } = await supabase
      .from('ticket_messages')
      .insert([messageData])
      .select()
      .single();

    if (messageError) {
      console.error('Supabase error:', messageError);
      throw new Error('Failed to create message');
    }

    // Update ticket's updated_at timestamp and status
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // If staff replied, set to Pending (waiting on customer)
    // If customer replied, set to Open (needs staff attention)
    if (isStaff && !isInternal) {
      updateData.status = 'Pending';
    } else if (!isStaff) {
      updateData.status = 'Open';
    }

    await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticketId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: {
          id: newMessage.id,
          ticketId: newMessage.ticket_id,
          message: newMessage.message,
          authorId: newMessage.author_id,
          authorName: newMessage.author_name,
          authorEmail: newMessage.author_email,
          isStaff: newMessage.is_staff,
          isInternal: newMessage.is_internal,
          createdAt: newMessage.created_at
        }
      })
    };

  } catch (error) {
    console.error('Error creating reply:', error);
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

function generateId() {
  return 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
