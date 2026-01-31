/**
 * ticket-create.js
 * Netlify Function to create a new support ticket
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
    const {
      customerId,
      customerEmail,
      customerName,
      type,
      priority = 'normal',
      subject,
      description,
      orderNumber,
      returnReason,
      equipmentId,
      equipmentName,
      partNumber,
      attachments
    } = body;

    // Validate required fields
    if (!customerId || !type || !subject || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: customerId, type, subject, description' 
        })
      };
    }

    // Get next ticket number
    const countResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?select=ticket_number&order=ticket_number.desc&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    
    const countData = await countResponse.json();
    const nextTicketNumber = countData.length > 0 ? countData[0].ticket_number + 1 : 1001;

    // Create ticket
    const ticketData = {
      id: 'tkt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      ticket_number: nextTicketNumber,
      customer_id: customerId.toString(),
      customer_email: customerEmail || null,
      customer_name: customerName || null,
      type: type,
      priority: priority,
      status: 'Open',
      subject: subject.trim(),
      description: description.trim(),
      order_number: orderNumber || null,
      return_reason: returnReason || null,
      equipment_id: equipmentId || null,
      equipment_name: equipmentName || null,
      part_number: partNumber || null,
      attachments: attachments ? JSON.stringify(attachments) : null,
      customer_archived: false,
      admin_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const createResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(ticketData)
      }
    );

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.error('Supabase error:', errorData);
      throw new Error(errorData.message || 'Failed to create ticket');
    }

    const newTicket = await createResponse.json();

    // Send email notification to customer (confirmation)
    try {
      const notifyUrl = process.env.URL 
        ? `${process.env.URL}/.netlify/functions/ticket-notify`
        : 'https://unrivaled-zuccutto-bdbd4b.netlify.app/.netlify/functions/ticket-notify';
      
      // Notify customer
      if (customerEmail) {
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ticket_created',
            customerEmail: customerEmail,
            customerName: customerName,
            ticketNumber: nextTicketNumber,
            ticketSubject: subject.trim()
          })
        });
      }

      // Notify admin(s)
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'new_ticket_admin',
            adminEmail: adminEmail,
            customerName: customerName || 'Customer',
            customerEmail: customerEmail,
            ticketNumber: nextTicketNumber,
            ticketSubject: subject.trim(),
            ticketType: type,
            ticketDescription: description.trim()
          })
        });
      }
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ticket: {
          id: newTicket[0].id,
          ticketNumber: newTicket[0].ticket_number,
          status: newTicket[0].status,
          subject: newTicket[0].subject,
          createdAt: newTicket[0].created_at
        }
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
