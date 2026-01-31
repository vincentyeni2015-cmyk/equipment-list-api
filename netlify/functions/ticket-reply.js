/**
 * ticket-reply.js
 * Netlify Function to add a reply/message to a ticket
 * Sends email notification when staff replies
 * Uses Supabase REST API directly (no SDK needed)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    const { ticketId, message, authorId, authorName, authorEmail, isStaff, isInternal, attachments } = body;

    // Validate required fields
    if (!ticketId || (!message && (!attachments || attachments.length === 0))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'ticketId and message (or attachments) are required' 
        })
      };
    }

    // Get ticket details
    const ticketResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const ticketData = await ticketResponse.json();
    
    if (!ticketData || ticketData.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Ticket not found' })
      };
    }

    const ticket = ticketData[0];

    // Create the message
    const messageData = {
      id: 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      ticket_id: ticketId,
      message: (message || '').trim() || '(Attachment)',
      author_id: authorId || null,
      author_name: authorName || 'Customer',
      author_email: authorEmail || null,
      is_staff: isStaff || false,
      is_internal: isInternal || false,
      attachments: attachments && attachments.length > 0 ? attachments : null,
      created_at: new Date().toISOString()
    };

    const messageResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/ticket_messages`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(messageData)
      }
    );

    if (!messageResponse.ok) {
      const errorData = await messageResponse.json();
      console.error('Supabase error:', errorData);
      throw new Error('Failed to create message');
    }

    const newMessage = await messageResponse.json();

    // Update ticket status
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // If staff replied, set to Pending; if customer replied, set to Open
    if (isStaff && !isInternal) {
      updateData.status = 'Pending';
    } else if (!isStaff) {
      updateData.status = 'Open';
    }

    await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      }
    );

    // Send email notification if staff replied (and not internal note)
    if (isStaff && !isInternal && ticket.customer_email) {
      try {
        const notifyUrl = process.env.URL 
          ? `${process.env.URL}/.netlify/functions/ticket-notify`
          : 'https://unrivaled-zuccutto-bdbd4b.netlify.app/.netlify/functions/ticket-notify';
        
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'admin_reply',
            customerEmail: ticket.customer_email,
            customerName: ticket.customer_name,
            ticketNumber: ticket.ticket_number,
            ticketSubject: ticket.subject,
            message: message.trim(),
            staffName: authorName || 'Support Team'
          })
        });
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: {
          id: newMessage[0].id,
          ticketId: newMessage[0].ticket_id,
          message: newMessage[0].message,
          authorName: newMessage[0].author_name,
          isStaff: newMessage[0].is_staff,
          isInternal: newMessage[0].is_internal,
          createdAt: newMessage[0].created_at
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
