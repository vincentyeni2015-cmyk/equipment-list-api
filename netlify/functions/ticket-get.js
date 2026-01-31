/**
 * ticket-get.js
 * Netlify Function to get tickets for a customer
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
    const { customerId, limit, status, ticketId } = event.queryStringParameters || {};

    // If specific ticket ID requested
    if (ticketId) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const data = await response.json();
      
      if (!data || data.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Ticket not found' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, ticket: formatTicket(data[0]) })
      };
    }

    // Get tickets for customer
    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'customerId is required' })
      };
    }

    let url = `${SUPABASE_URL}/rest/v1/support_tickets?customer_id=eq.${customerId}&order=created_at.desc`;
    
    if (status) {
      url += `&status=eq.${status}`;
    }
    
    if (limit) {
      url += `&limit=${limit}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const tickets = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tickets: (tickets || []).map(formatTicket),
        count: tickets.length
      })
    };

  } catch (error) {
    console.error('Error fetching tickets:', error);
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

function formatTicket(ticket) {
  let attachments = null;
  if (ticket.attachments) {
    try {
      attachments = typeof ticket.attachments === 'string' 
        ? JSON.parse(ticket.attachments) 
        : ticket.attachments;
    } catch (e) {
      attachments = null;
    }
  }
  
  return {
    id: ticket.id,
    ticketNumber: ticket.ticket_number,
    customerId: ticket.customer_id,
    customerEmail: ticket.customer_email,
    customerName: ticket.customer_name,
    type: ticket.type,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
    description: ticket.description,
    orderNumber: ticket.order_number,
    returnReason: ticket.return_reason,
    equipmentId: ticket.equipment_id,
    equipmentName: ticket.equipment_name,
    partNumber: ticket.part_number,
    attachments: attachments,
    customerArchived: ticket.customer_archived || false,
    adminArchived: ticket.admin_archived || false,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at
  };
}

