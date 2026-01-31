/**
 * ticket-admin-list.js
 * Netlify Function to get all tickets for admin panel
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
    const { status, type, priority, page = 1, limit = 50 } = event.queryStringParameters || {};

    let url = `${SUPABASE_URL}/rest/v1/support_tickets?order=created_at.desc`;

    // Apply filters
    if (status) {
      url += `&status=eq.${encodeURIComponent(status)}`;
    }
    if (type) {
      url += `&type=eq.${encodeURIComponent(type)}`;
    }
    if (priority) {
      url += `&priority=eq.${encodeURIComponent(priority)}`;
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    url += `&offset=${offset}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact'
      }
    });

    const tickets = await response.json();
    const totalCount = response.headers.get('content-range')?.split('/')[1] || tickets.length;

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
        total: parseInt(totalCount),
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
