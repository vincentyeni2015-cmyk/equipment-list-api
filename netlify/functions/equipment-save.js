const STORE = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // GET requests (Admin API)
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    
    if (params.action === 'list-customers') {
      return await listCustomersWithEquipment(headers, params);
    }
    
    if (params.action === 'get-customer' && params.customerId) {
      return await getCustomerEquipment(headers, params.customerId);
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action. Use action=list-customers or action=get-customer&customerId=ID' })
    };
  }

  // POST requests
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { customerId, equipmentData, action, equipment } = body;

    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'customerId is required' })
      };
    }

    // Add single item
    if (action === 'add' && equipment) {
      return await addSingleEquipment(headers, customerId, equipment);
    }

    // Full save/replace
    if (equipmentData) {
      return await saveEquipmentData(headers, customerId, equipmentData);
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request. Provide equipmentData or action=add with equipment.' })
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};

// ============================================
// LIST CUSTOMERS WITH EQUIPMENT
// ============================================
async function listCustomersWithEquipment(headers, params) {
  const limit = Math.min(parseInt(params.limit) || 50, 250);
  const cursor = params.cursor || null;

  const query = `
    query customers($first: Int!, $after: String) {
      customers(first: $first, after: $after, query: "metafields.custom.equipment_list:*") {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            email
            firstName
            lastName
            metafield(namespace: "custom", key: "equipment_list") {
              value
            }
          }
        }
      }
    }
  `;

  const variables = { first: limit };
  if (cursor) variables.after = cursor;

  try {
    const response = await fetch("https://" + STORE + "/admin/api/2024-01/graphql.json", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GraphQL error', details: result.errors })
      };
    }

    const customers = result.data.customers.edges
      .filter(edge => edge.node.metafield && edge.node.metafield.value)
      .map(edge => {
        let equipmentCount = 0;
        try {
          const data = JSON.parse(edge.node.metafield.value);
          equipmentCount = data.machines ? data.machines.length : 0;
        } catch (e) {}
        
        return {
          id: edge.node.id.replace('gid://shopify/Customer/', ''),
          email: edge.node.email,
          firstName: edge.node.firstName,
          lastName: edge.node.lastName,
          equipmentCount: equipmentCount
        };
      });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        customers: customers,
        pageInfo: result.data.customers.pageInfo
      })
    };
  } catch (error) {
    console.error('List customers error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
}

// ============================================
// GET SINGLE CUSTOMER EQUIPMENT
// ============================================
async function getCustomerEquipment(headers, customerId) {
  const query = `
    query customer($id: ID!) {
      customer(id: $id) {
        id
        email
        firstName
        lastName
        phone
        createdAt
        metafield(namespace: "custom", key: "equipment_list") {
          value
          updatedAt
        }
      }
    }
  `;

  const variables = { id: "gid://shopify/Customer/" + customerId };

  try {
    const response = await fetch("https://" + STORE + "/admin/api/2024-01/graphql.json", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if (result.errors) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GraphQL error', details: result.errors })
      };
    }

    if (!result.data.customer) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    const customer = result.data.customer;
    let machines = [];
    let updatedAt = null;

    if (customer.metafield && customer.metafield.value) {
      try {
        const data = JSON.parse(customer.metafield.value);
        machines = data.machines || [];
        updatedAt = data.updatedAt || customer.metafield.updatedAt;
      } catch (e) {}
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        customer: {
          id: customerId,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          createdAt: customer.createdAt
        },
        machines: machines,
        updatedAt: updatedAt
      })
    };
  } catch (error) {
    console.error('Get customer error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
}

// ============================================
// SAVE EQUIPMENT DATA (FULL REPLACE)
// ============================================
async function saveEquipmentData(headers, customerId, equipmentData) {
  // Validate
  if (!equipmentData.machines || !Array.isArray(equipmentData.machines)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'equipmentData.machines must be an array' })
    };
  }

  if (equipmentData.machines.length > 500) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Maximum 500 equipment items allowed' })
    };
  }

  const favorites = equipmentData.machines.filter(m => m.favorite);
  if (favorites.length > 4) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Maximum 4 favorites allowed' })
    };
  }

  // Sanitize
  const sanitized = {
    machines: equipmentData.machines.map(sanitizeMachine),
    updatedAt: new Date().toISOString()
  };

  // Save to Shopify
  const mutation = `
    mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: "gid://shopify/Customer/" + customerId,
      metafields: [{
        namespace: "custom",
        key: "equipment_list",
        value: JSON.stringify(sanitized),
        type: "json"
      }]
    }
  };

  try {
    const response = await fetch("https://" + STORE + "/admin/api/2024-01/graphql.json", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GraphQL error', details: result.errors })
      };
    }

    if (result.data?.customerUpdate?.userErrors?.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Validation error', details: result.data.customerUpdate.userErrors })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: sanitized })
    };
  } catch (error) {
    console.error('Save error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
}

// ============================================
// ADD SINGLE EQUIPMENT ITEM
// ============================================
async function addSingleEquipment(headers, customerId, equipment) {
  // First, get current equipment
  const getResult = await getCustomerEquipment(headers, customerId);
  const getData = JSON.parse(getResult.body);
  
  let machines = [];
  if (getData.success && getData.machines) {
    machines = getData.machines;
  }

  // Add new item
  machines.push(sanitizeMachine(equipment));

  // Save
  return await saveEquipmentData(headers, customerId, { machines });
}

// ============================================
// SANITIZE MACHINE DATA
// ============================================
function sanitizeMachine(machine) {
  const sanitize = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/[<>]/g, '')
      .substring(0, 200)
      .trim();
  };

  return {
    id: sanitize(machine.id) || ('eq_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)),
    name: sanitize(machine.name),
    category: sanitize(machine.category),
    make: sanitize(machine.make),
    type: sanitize(machine.type),
    submodel: sanitize(machine.submodel),
    model: sanitize(machine.model),
    variant: sanitize(machine.variant),
    year: sanitize(machine.year),
    trim: sanitize(machine.trim),
    engine: sanitize(machine.engine),
    serial: sanitize(machine.serial),
    favorite: Boolean(machine.favorite),
    createdAt: machine.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
