#!/usr/bin/env node

/**
 * Backend Testing Script
 * Tests all backend endpoints to verify they're properly set up
 */

const API_BASE = process.env.API_BASE || 'https://replace-with-api-url';

async function testEndpoint(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.text();
    
    return {
      endpoint,
      method,
      status: response.status,
      response: data,
      success: response.status < 500, // 4xx is expected without proper keys
    };
  } catch (error) {
    return {
      endpoint,
      method,
      status: 'ERROR',
      response: error.message,
      success: false,
    };
  }
}

async function runTests() {
  console.log('🧪 Testing Backend Infrastructure...\n');
  
  const tests = [
    // AI Endpoints
    {
      name: 'AI Generate',
      test: () => testEndpoint('/ai/generate', 'POST', { prompt: 'Hello test' })
    },
    {
      name: 'AI History',
      test: () => testEndpoint('/ai/history?userId=test-user', 'GET')
    },
    
    // Stripe Endpoints
    {
      name: 'Stripe Checkout',
      test: () => testEndpoint('/stripe/checkout', 'POST', { priceId: 'price_test', userId: 'test' })
    },
    {
      name: 'Stripe Webhook',
      test: () => testEndpoint('/stripe/webhook', 'POST', { type: 'test' })
    },
    
    // Subscription Endpoints
    {
      name: 'Subscription Status',
      test: () => testEndpoint('/subscription/status?userId=test-user', 'GET')
    },
    
    // Auth Endpoints
    {
      name: 'Auth Session',
      test: () => testEndpoint('/auth/session', 'POST', { userId: 'test' })
    },
  ];
  
  const results = [];
  
  for (const { name, test } of tests) {
    console.log(`Testing ${name}...`);
    const result = await test();
    results.push({ name, ...result });
    
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${name}: ${result.status}`);
  }
  
  console.log('\n📊 Test Summary:');
  console.log('================');
  
  const successful = results.filter(r => r.success).length;
  const total = results.length;
  
  console.log(`✅ Endpoints responding: ${successful}/${total}`);
  console.log(`🔗 API Base URL: ${API_BASE}`);
  
  console.log('\n📋 Detailed Results:');
  console.log('====================');
  
  results.forEach(result => {
    console.log(`\n${result.name}:`);
    console.log(`  Method: ${result.method}`);
    console.log(`  Endpoint: ${result.endpoint}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Response: ${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}`);
  });
  
  console.log('\n🔧 Next Steps:');
  console.log('===============');
  console.log('1. Add your Stripe API keys to SSM + .env.local (public key).');
  console.log('2. Configure AWS Bedrock permissions for AI features.');
  console.log('3. Test with real API keys.');
  console.log('4. Deploy with: terraform apply -var "project_name=..." -var "stage=..."');
  
  return results;
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testEndpoint };
