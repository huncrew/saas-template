import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // DEVELOPMENT MODE: Mock subscription status for testing
    // TODO: Replace with actual backend call when SST is running
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      // Mock response for development testing
      const mockSubscriptionStatus = {
        success: true,
        data: {
          hasActiveSubscription: false, // Set to true to test premium features
          stripePriceId: null,
          status: 'inactive',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false
        }
      };
      
      console.log('🧪 Development mode: Using mock subscription status');
      return NextResponse.json(mockSubscriptionStatus);
    }

    // Production: Call the backend Lambda function
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!backendUrl) {
      return NextResponse.json(
        { success: false, error: 'Backend API URL not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/subscription/status?userId=${session.user.id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: errorData.message || 'Failed to get subscription status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Subscription status API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}