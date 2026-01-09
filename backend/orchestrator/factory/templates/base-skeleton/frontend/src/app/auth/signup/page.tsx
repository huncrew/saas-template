"use client";

import dynamic from "next/dynamic";

const SignUp = dynamic(
  () => import("@clerk/clerk-react").then((m) => m.SignUp),
  { ssr: false }
);
const ClerkGate = dynamic(
  () => import("@/components/providers/clerk-gate").then((m) => m.ClerkGate),
  { ssr: false }
);

export default function Page() {
  return (
    <ClerkGate>
      <SignUp />
    </ClerkGate>
  );
}


