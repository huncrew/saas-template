"use client";

import dynamic from "next/dynamic";

const SignIn = dynamic(
  () => import("@clerk/clerk-react").then((m) => m.SignIn),
  { ssr: false }
);
const ClerkGate = dynamic(
  () => import("@/components/providers/clerk-gate").then((m) => m.ClerkGate),
  { ssr: false }
);

export default function Page() {
  return (
    <ClerkGate>
      <SignIn />
    </ClerkGate>
  );
}


