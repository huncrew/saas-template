import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { priceId } = body;

    if (!priceId) {
      return NextResponse.json(
        { success: false, error: 'Price ID is required' },
        { status: 400 }
      );
    }

    // DEVELOPMENT MODE: Mock checkout for testing UI
    // TODO: Replace with actual Stripe integration when keys are configured
    const isDevelopment = process.env.NODE_ENV === 'development';
    const hasStripeKeys = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('placeholder');
    
    if (isDevelopment && !hasStripeKeys) {
      console.log('🧪 Development mode: Mocking Stripe checkout session');
      
      // Mock successful checkout session creation
      const mockResponse = {
        success: true,
        sessionId: 'cs_test_mock_session_id_12345',
        url: 'https://checkout.stripe.com/pay/cs_test_mock_session_id_12345#fidkdWxOYHwnPyd1blpxYHZxWjA0TDFKc2JhN19hZHV0fGhuVWE3S3NSa2Z3RGFDYWtEf1E3PGI3NDJUfGY9V0wxMWJOTDFmSUFGNn1UdWA8N2JrQ3VjYV9TQ2NGYnZPMnZLNEV1NURQY0JMV0FQTF1sVGhgUCcpJ2N3amhWYHdzYHcnP3F3cGApJ2lkfGpwcVF8dWAnPydocGlxbFpscWBoJyknYGtkZ2lgVWlkZmBtamlhYHd2Jz9xd3BgeCUl'
      };
      
      return NextResponse.json(mockResponse);
    }

    // Production or when Stripe keys are available: Call the backend Lambda function
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { success: false, error: 'Backend API URL not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/stripe/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: session.user.id,
        priceId,
        userEmail: session.user.email,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: errorData.message || 'Failed to create checkout session' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Checkout API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}