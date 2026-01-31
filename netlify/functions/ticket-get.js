/**
 * ticket-get.js
 * Netlify Function to get tickets for a specific customer
 * 
 * Endpoint: GET /.netlify/functions/ticket-get?customerId=123&limit=10
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
    const { customerId, limit, status, ticketId } = event.queryStringParameters || {};

    // If specific ticket ID requested
    if (ticketId) {
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (error || !ticket) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Ticket not found' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          ticket: formatTicket(ticket) 
        })
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

    let query = supabase
      .from('support_tickets')
      .select('*')
      .eq('customer_id', customerId.toString())
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const { data: tickets, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      throw new Error('Failed to fetch tickets');
    }

    const formattedTickets = (tickets || []).map(formatTicket);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tickets: formattedTickets,
        count: formattedTickets.length
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
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at
  };
}
