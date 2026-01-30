const STORE = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Handle GET requests (for admin panel)
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    
    // List all customers with equipment
    if (params.action === 'list-customers') {
      return await listCustomersWithEquipment(headers, params);
    }
    
    // Get single customer equipment
    if (params.action === 'get-customer' && params.customerId) {
      return await getCustomerEquipment(headers, params.customerId);
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };
  }

  // Handle POST requests
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON' })
      };
    }

    const { customerId, equipmentData, action, equipment } = body;

    if (!customerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Customer ID required' })
      };
    }

    // Handle single item add
    if (action === 'add' && equipment) {
      return await addSingleEquipment(headers, customerId, equipment);
    }

    // Handle full save
    if (equipmentData) {
      return await saveEquipmentData(headers, customerId, equipmentData);
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request' })
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};

// Save full equipment data
async function saveEquipmentData(headers, customerId, equipmentData) {
  // Validate
  if (!equipmentData.machines || !Array.isArray(equipmentData.machines)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid equipment data format' })
    };
  }

  if (equipmentData.machines.length > 500) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Maximum 500 machines allowed' })
    };
  }

  const favorites = equipmentData.machines.filter(function(m) { return m.favorite; });
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
  const mutation = '                                                               \
    mutation customerUpdate($input: CustomerInput!) {                              \
      customerUpdate(input: $input) {                                              \
        customer { id }                                                            \
        userErrors { field message }                                               \
      }                                                                            \
    }                                                                              \
  ';

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
      body: JSON.stringify({ query: mutation, variables: variables })
    });

    const result = await response.json();

    if (result.errors || result.data?.customerUpdate?.userErrors?.length) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to save',
          details: result.errors || result.data?.customerUpdate?.userErrors
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: sanitized })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
}

// Add single equipment item
async function addSingleEquipment(headers, customerId, equipment) {
  // First get current data
  const currentData = await fetchCustomerEquipment(customerId);
  
  const machines = currentData.machines || [];
  machines.push(sanitizeMachine(equipment));

  return await saveEquipmentData(headers, customerId, { machines: machines });
}

// List customers with equipment (for admin)
async function listCustomersWithEquipment(headers, params) {
  const limit = parseInt(params.limit) || 50;
  const cursor = params.cursor || null;

  const query = '                                                                  \
    query customers($first: Int!, $after: String) {                                \
      customers(first: $first, after: $after) {                                    \
        pageInfo { hasNextPage endCursor }                                         \
        edges {                                                                    \
          node {                                                                   \
            id                                                                     \
            email                                                                  \
            firstName                                                              \
            lastName                                                               \
            metafield(namespace: "custom", key: "equipment_list") {                \
              value                                                                \
            }                                                                      \
          }                                                                        \
        }                                                                          \
      }                                                                            \
    }                                                                              \
  ';

  const variables = { first: limit, after: cursor };

  try {
    const response = await fetch("https://" + STORE + "/admin/api/2024-01/graphql.json", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query: query, variables: variables })
    });

    const result = await response.json();

    if (result.errors) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GraphQL error', details: result.errors })
      };
    }

    // Filter to only customers with equipment
    const customers = result.data.customers.edges
      .filter(function(edge) { 
        return edge.node.metafield && edge.node.metafield.value; 
      })
      .map(function(edge) {
        const equipmentData = JSON.parse(edge.node.metafield.value);
        return {
          id: edge.node.id.replace('gid://shopify/Customer/', ''),
          email: edge.node.email,
          firstName: edge.node.firstName,
          lastName: edge.node.lastName,
          equipmentCount: equipmentData.machines ? equipmentData.machines.length : 0
        };
      });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        customers: customers,
        pageInfo: result.data.customers.pageInfo
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
}

// Get single customer equipment
async function getCustomerEquipment(headers, customerId) {
  const data = await fetchCustomerEquipment(customerId);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(data)
  };
}

// Fetch customer equipment from Shopify
async function fetchCustomerEquipment(customerId) {
  const query = '                                                                  \
    query customer($id: ID!) {                                                     \
      customer(id: $id) {                                                          \
        id                                                                         \
        email                                                                      \
        firstName                                                                  \
        lastName                                                                   \
        metafield(namespace: "custom", key: "equipment_list") {                    \
          value                                                                    \
        }                                                                          \
      }                                                                            \
    }                                                                              \
  ';

  const variables = { id: "gid://shopify/Customer/" + customerId };

  try {
    const response = await fetch("https://" + STORE + "/admin/api/2024-01/graphql.json", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({ query: query, variables: variables })
    });

    const result = await response.json();

    if (result.data?.customer?.metafield?.value) {
      const data = JSON.parse(result.data.customer.metafield.value);
      data.customer = {
        id: customerId,
        email: result.data.customer.email,
        firstName: result.data.customer.firstName,
        lastName: result.data.customer.lastName
      };
      return data;
    }

    return { machines: [], customer: result.data?.customer || null };
  } catch (error) {
    return { machines: [], error: error.message };
  }
}

// Sanitize machine data
function sanitizeMachine(machine) {
  var sanitize = function(str) {
    if (!str) return '';
    return String(str)
      .replace(/[<>]/g, '')
      .substring(0, 200)
      .trim();
  };

  return {
    id: sanitize(machine.id) || ('eq_' + Date.now().toString(36)),
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
