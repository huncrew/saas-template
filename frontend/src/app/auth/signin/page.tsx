"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignIn() {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Sign in</CardTitle>
        <CardDescription className="text-center">
          Sign in with your Google account to get started
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={() => router.push("/dashboard")}
          className="w-full" 
          variant="outline"
        >
          Continue to Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}