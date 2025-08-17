import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBService } from '../lib/dynamodb';
import { APIResponse } from '../types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const pathParameters = event.pathParameters || {};
    const queryParameters = event.queryStringParameters || {};
    const userId = pathParameters.userId || queryParameters.userId;

    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_TABLE_NAME: process.env.DATABASE_TABLE_NAME,
      AWS_REGION: process.env.AWS_REGION,
      userId: userId
    });

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'User ID is required',
        }),
      };
    }

    // For testing - return mock data without DB call
    if (!process.env.DATABASE_TABLE_NAME) {
      console.log('DATABASE_TABLE_NAME not found, returning mock data');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            subscription: null,
            subscriptionStatus: 'inactive',
            hasActiveSubscription: false,
          },
        }),
      };
    }

    // Get subscription status for user
    const subscription = await DynamoDBService.getSubscription(userId);
    const user = await DynamoDBService.getUser(userId);

    const response: APIResponse = {
      success: true,
      data: {
        subscription,
        subscriptionStatus: user?.subscriptionStatus || 'inactive',
        hasActiveSubscription: user?.subscriptionStatus === 'active',
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Subscription handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        debug: process.env.NODE_ENV === 'development' ? error.message : undefined
      }),
    };
  }
};