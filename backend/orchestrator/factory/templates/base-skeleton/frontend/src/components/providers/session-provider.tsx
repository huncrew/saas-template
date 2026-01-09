"use client";

import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function AuthProvider({ children }: Props) {
  // Intentionally a no-op provider.
  // Auth is handled inside client-only routes/components so the template can be
  // statically exported (S3/CloudFront) even before auth is configured.
  return <>{children}</>;
}