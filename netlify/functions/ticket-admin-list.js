/**
 * ticket-admin-list.js
 * Netlify Function to get all tickets for admin panel
 * 
 * Endpoint: GET /.netlify/functions/ticket-admin-list
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
    const { status, type, priority, page = 1, limit = 50 } = event.queryStringParameters || {};

    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (type) {
      query = query.eq('type', type);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: tickets, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      throw new Error('Failed to fetch tickets');
    }

    const formattedTickets = (tickets || []).map(ticket => ({
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
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tickets: formattedTickets,
        count: formattedTickets.length,
        page: parseInt(page),
        limit: parseInt(limit)
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
