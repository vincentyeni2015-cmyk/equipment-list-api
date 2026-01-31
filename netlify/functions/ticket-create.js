/**
 * ticket-create.js
 * Netlify Function to create new support tickets
 * 
 * Endpoint: POST /.netlify/functions/ticket-create
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
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
    const data = JSON.parse(event.body);
    
    // Validate required fields
    if (!data.customerId || !data.type || !data.subject || !data.description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: customerId, type, subject, description' 
        })
      };
    }

    // Generate ticket number (sequential, based on count)
    const { count } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true });
    
    const ticketNumber = 1001 + (count || 0);

    // Create ticket record
    const ticketData = {
      id: generateId(),
      ticket_number: ticketNumber,
      customer_id: data.customerId.toString(),
      customer_email: data.customerEmail || null,
      customer_name: data.customerName || null,
      type: data.type,
      priority: data.priority || 'normal',
      status: 'Open',
      subject: data.subject,
      description: data.description,
      order_number: data.orderNumber || null,
      return_reason: data.returnReason || null,
      equipment_id: data.equipmentId || null,
      equipment_name: data.equipmentName || null,
      part_number: data.partNumber || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert([ticketData])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw new Error('Failed to create ticket');
    }

    // Format response
    const responseTicket = {
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
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ticket: responseTicket,
        message: `Ticket #${ticketNumber} created successfully`
      })
    };

  } catch (error) {
    console.error('Error creating ticket:', error);
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

// Generate unique ID
function generateId() {
  return 'tkt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
