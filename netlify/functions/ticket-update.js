/**
 * ticket-update.js
 * Netlify Function to update ticket status, priority, or other fields
 * 
 * Endpoint: POST /.netlify/functions/ticket-update
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
    const { ticketId, status, priority, assignedTo, assignedName } = body;

    if (!ticketId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'ticketId is required' })
      };
    }

    // Verify ticket exists
    const { data: existingTicket, error: fetchError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (fetchError || !existingTicket) {
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

      // Set resolved_at timestamp when marking as resolved
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

    // Update the ticket
    const { data: updatedTicket, error: updateError } = await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticketId)
      .select()
      .single();

    if (updateError) {
      console.error('Supabase error:', updateError);
      throw new Error('Failed to update ticket');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ticket: {
          id: updatedTicket.id,
          ticketNumber: updatedTicket.ticket_number,
          status: updatedTicket.status,
          priority: updatedTicket.priority,
          assignedTo: updatedTicket.assigned_to,
          assignedName: updatedTicket.assigned_name,
          updatedAt: updatedTicket.updated_at,
          resolvedAt: updatedTicket.resolved_at
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
