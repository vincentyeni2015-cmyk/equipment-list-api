exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { customerId, equipmentData } = JSON.parse(event.body);

    if (!customerId || !equipmentData || !Array.isArray(equipmentData.machines)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid data' }) };
    }

    const result = await saveToShopify(customerId, validateData(equipmentData));
    
    return result.success 
      ? { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
      : { statusCode: 500, headers, body: JSON.stringify({ error: result.error }) };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};

function validateData(data) {
  let favoriteCount = 0;
  const machines = data.machines.slice(0, 500).map(m => {
    const isFavorite = m.favorite && favoriteCount < 4;
    if (isFavorite) favoriteCount++;
    return {
      id: s(m.id, 50), name: s(m.name, 100), category: s(m.category, 50),
      make: s(m.make, 50), type: s(m.type, 50), submodel: s(m.submodel, 50),
      model: s(m.model, 50), variant: s(m.variant, 50), year: s(m.year, 10),
      trim: s(m.trim, 50), engine: s(m.engine, 50), sku: s(m.sku, 50),
      favorite: isFavorite,
      createdAt: m.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
  return { machines };
}

function s(str, len) {
  return str ? String(str).trim().slice(0, len).replace(/[<>]/g, '') : '';
}

async function saveToShopify(customerId, equipmentData) {
  const STORE = process.env.SHOPIFY_STORE_DOMAIN;
  const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!STORE || !TOKEN) return { success: false, error: 'Config error' };

  const query = `mutation($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer { id }
      userErrors { field message }
    }
  }`;

  const variables = {
    input: {
      id: \`gid://shopify/Customer/\${customerId}\`,
      metafields: [{
        namespace: 'custom',
        key: 'equipment_list',
        type: 'json',
        value: JSON.stringify(equipmentData)
      }]
    }
  };

  try {
    const res = await fetch(\`https://\${STORE}/admin/api/2024-01/graphql.json\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables })
    });
    const data = await res.json();
    
    if (data.errors) return { success: false, error: data.errors[0]?.message };
    if (data.data?.customerUpdate?.userErrors?.length) 
      return { success: false, error: data.data.customerUpdate.userErrors[0].message };
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
