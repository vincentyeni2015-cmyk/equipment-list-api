/**
 * ticket-update.js
 * Netlify Function to update ticket status/priority
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

const VALID_STATUSES = ['Open', 'Pending', 'Resolved', 'Closed'];
const VALID_PRIORITIES = ['normal', 'high', 'urgent'];

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
    const { ticketId, status, priority, assignedTo, assignedName, customerArchived, adminArchived } = body;

    if (!ticketId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'ticketId is required' })
      };
    }

    // Verify ticket exists
    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const existingTicket = await checkResponse.json();
    
    if (!existingTicket || existingTicket.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Ticket not found' })
      };
    }

    // Build update object
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Validate and set status
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` 
          })
        };
      }
      updateData.status = status;

      if (status === 'Resolved' || status === 'Closed') {
        updateData.resolved_at = new Date().toISOString();
      }
    }

    // Validate and set priority
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` 
          })
        };
      }
      updateData.priority = priority;
    }

    // Set assignment
    if (assignedTo !== undefined) {
      updateData.assigned_to = assignedTo;
      updateData.assigned_name = assignedName || null;
    }

    // Set archived status (separate for customer and admin)
    if (customerArchived !== undefined) {
      updateData.customer_archived = customerArchived;
    }
    if (adminArchived !== undefined) {
      updateData.admin_archived = adminArchived;
    }

    // Update the ticket
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${ticketId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('Supabase error:', errorData);
      throw new Error('Failed to update ticket');
    }

    const updatedTicket = await updateResponse.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ticket: {
          id: updatedTicket[0].id,
          ticketNumber: updatedTicket[0].ticket_number,
          status: updatedTicket[0].status,
          priority: updatedTicket[0].priority,
          updatedAt: updatedTicket[0].updated_at
        }
      })
    };

  } catch (error) {
    console.error('Error updating ticket:', error);
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
