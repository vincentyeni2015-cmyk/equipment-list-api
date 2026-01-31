/**
 * ticket-notify.js
 * Netlify Function to send email notifications
 * Uses Resend API (no SDK needed)
 * 
 * Environment variables needed:
 * - RESEND_API_KEY
 * - NOTIFICATION_FROM_EMAIL (optional, defaults to onboarding@resend.dev)
 * - STORE_NAME (optional, defaults to "Union Filters")
 * - STORE_URL (optional)
 */

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
    const { 
      type,
      customerEmail,
      customerName,
      ticketNumber,
      ticketSubject,
      message,
      newStatus,
      staffName,
      adminEmail,
      ticketType,
      ticketDescription
    } = JSON.parse(event.body);

    if ((!customerEmail && !adminEmail) || !ticketNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing required fields' })
      };
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'onboarding@resend.dev';
    const STORE_NAME = process.env.STORE_NAME || 'Union Filters';
    const STORE_URL = process.env.STORE_URL || '';

    if (!RESEND_API_KEY) {
      console.log('RESEND_API_KEY not configured, skipping email');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, warning: 'Email not configured' })
      };
    }

    let subject, htmlContent, toEmail;

    switch (type) {
      case 'admin_reply':
        toEmail = customerEmail;
        subject = `Re: Ticket #${ticketNumber} - ${ticketSubject}`;
        htmlContent = generateReplyEmail({ customerName, ticketNumber, ticketSubject, message, staffName, STORE_NAME, STORE_URL });
        break;

      case 'status_changed':
        toEmail = customerEmail;
        subject = `Ticket #${ticketNumber} - Status Updated to ${newStatus}`;
        htmlContent = generateStatusEmail({ customerName, ticketNumber, ticketSubject, newStatus, STORE_NAME, STORE_URL });
        break;

      case 'ticket_created':
        toEmail = customerEmail;
        subject = `Ticket #${ticketNumber} Received - ${ticketSubject}`;
        htmlContent = generateConfirmationEmail({ customerName, ticketNumber, ticketSubject, STORE_NAME, STORE_URL });
        break;

      case 'new_ticket_admin':
        toEmail = adminEmail;
        subject = `🎫 New Ticket #${ticketNumber} - ${ticketSubject}`;
        htmlContent = generateAdminNotificationEmail({ customerName, customerEmail, ticketNumber, ticketSubject, ticketType, ticketDescription, STORE_NAME, STORE_URL });
        break;

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Invalid notification type' })
        };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${STORE_NAME} Support <${FROM_EMAIL}>`,
        to: toEmail,
        subject: subject,
        html: htmlContent
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      throw new Error(result.message || 'Failed to send email');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, emailId: result.id })
    };

  } catch (error) {
    console.error('Error sending notification:', error);
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

function generateReplyEmail({ customerName, ticketNumber, ticketSubject, message, staffName, STORE_NAME, STORE_URL }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#000;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;color:#F7B910;font-size:24px;">${STORE_NAME}</h1>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <p style="color:#374151;font-size:16px;margin-bottom:8px;">Hi ${customerName || 'there'},</p>
      <p style="color:#374151;font-size:16px;margin-bottom:24px;">
        ${staffName ? staffName + ' from our team' : 'Our support team'} has replied to your ticket:
      </p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;border-left:4px solid #F7B910;">
        <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong>Ticket #${ticketNumber}</strong></p>
        <p style="margin:0;font-size:16px;color:#1f2937;font-weight:600;">${ticketSubject}</p>
      </div>
      <div style="background:#fefce8;border-radius:8px;padding:20px;margin-bottom:24px;">
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message}</p>
      </div>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${STORE_URL}/pages/support-tickets" style="display:inline-block;background:#F7B910;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">View Ticket & Reply</a>
      </div>
    </div>
    <div style="text-align:center;padding:24px;">
      <p style="color:#9ca3af;font-size:13px;margin:0;">${STORE_NAME} Support</p>
    </div>
  </div>
</body>
</html>`;
}

function generateStatusEmail({ customerName, ticketNumber, ticketSubject, newStatus, STORE_NAME, STORE_URL }) {
  const colors = { 'Open': '#F7B910', 'Pending': '#3b82f6', 'Resolved': '#22c55e', 'Closed': '#6b7280' };
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#000;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;color:#F7B910;font-size:24px;">${STORE_NAME}</h1>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <p style="color:#374151;font-size:16px;margin-bottom:24px;">Hi ${customerName || 'there'},</p>
      <p style="color:#374151;font-size:16px;margin-bottom:24px;">Your ticket <strong>#${ticketNumber}</strong> status has been updated.</p>
      <div style="text-align:center;margin-bottom:24px;">
        <span style="display:inline-block;background:${colors[newStatus] || '#6b7280'};color:${newStatus === 'Open' ? '#000' : '#fff'};padding:8px 24px;border-radius:20px;font-weight:600;font-size:14px;">${newStatus}</span>
      </div>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong>Ticket #${ticketNumber}</strong></p>
        <p style="margin:0;font-size:16px;color:#1f2937;">${ticketSubject}</p>
      </div>
      <div style="text-align:center;">
        <a href="${STORE_URL}/pages/support-tickets" style="display:inline-block;background:#F7B910;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">View Ticket</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateConfirmationEmail({ customerName, ticketNumber, ticketSubject, STORE_NAME, STORE_URL }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#000;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;color:#F7B910;font-size:24px;">${STORE_NAME}</h1>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:48px;height:48px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:#22c55e;font-size:24px;">✓</span>
        </div>
      </div>
      <h2 style="text-align:center;color:#1f2937;font-size:20px;margin-bottom:16px;">We've Received Your Request</h2>
      <p style="color:#374151;font-size:16px;margin-bottom:24px;text-align:center;">
        Hi ${customerName || 'there'}, your support ticket has been created. Our team will get back to you shortly.
      </p>
      <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;border-left:4px solid #F7B910;">
        <p style="margin:0 0 8px;font-size:14px;color:#6b7280;"><strong>Ticket Number</strong></p>
        <p style="margin:0 0 16px;font-size:24px;color:#1f2937;font-weight:700;">#${ticketNumber}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#6b7280;"><strong>Subject</strong></p>
        <p style="margin:0;font-size:16px;color:#1f2937;">${ticketSubject}</p>
      </div>
      <div style="text-align:center;">
        <a href="${STORE_URL}/pages/support-tickets" style="display:inline-block;background:#F7B910;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">View Your Tickets</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateAdminNotificationEmail({ customerName, customerEmail, ticketNumber, ticketSubject, ticketType, ticketDescription, STORE_NAME, STORE_URL }) {
  const typeLabels = {
    'return': 'Return Request',
    'parts': 'Parts Request', 
    'equipment-help': 'Equipment Help',
    'order-issue': 'Order Issue',
    'general': 'General Inquiry'
  };
  
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#1e293b;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
      <h1 style="margin:0;color:#F7B910;font-size:24px;">🎫 New Support Ticket</h1>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:24px;border-left:4px solid #F7B910;">
        <p style="margin:0 0 4px;font-size:14px;color:#92400e;font-weight:600;">New ticket submitted</p>
        <p style="margin:0;font-size:24px;color:#1f2937;font-weight:700;">#${ticketNumber}</p>
      </div>
      
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;">Customer:</td>
          <td style="padding:8px 0;color:#1f2937;font-size:14px;font-weight:500;">${customerName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Email:</td>
          <td style="padding:8px 0;color:#1f2937;font-size:14px;">${customerEmail || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;">Type:</td>
          <td style="padding:8px 0;color:#1f2937;font-size:14px;">
            <span style="background:#F7B910;color:#000;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${typeLabels[ticketType] || ticketType}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top;">Subject:</td>
          <td style="padding:8px 0;color:#1f2937;font-size:14px;font-weight:600;">${ticketSubject}</td>
        </tr>
      </table>
      
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;text-transform:uppercase;font-weight:600;">Message</p>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${ticketDescription}</p>
      </div>
      
      <div style="text-align:center;">
        <a href="${STORE_URL}/pages/support-admin" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">View in Admin Panel</a>
      </div>
    </div>
    <div style="text-align:center;padding:24px;">
      <p style="color:#9ca3af;font-size:13px;margin:0;">${STORE_NAME} Support System</p>
    </div>
  </div>
</body>
</html>`;
}
