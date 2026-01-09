"use client";

import { useState } from "react";
import Image from "next/image";

interface LogoImageProps {
  company: string;
  alt: string;
  className?: string;
  fallbackText?: string;
}

// Reliable logo URLs for financial companies using multiple trusted sources
const logoMap: Record<string, string> = {
  "goldman-sachs": "https://upload.wikimedia.org/wikipedia/commons/6/61/Goldman_Sachs.svg",
  "jpmorgan": "https://upload.wikimedia.org/wikipedia/commons/2/25/JPMorgan_Chase_Logo_2008.svg",
  "morgan-stanley": "https://upload.wikimedia.org/wikipedia/commons/e/e9/Morgan_Stanley_Logo_2021.svg", 
  "blackrock": "https://upload.wikimedia.org/wikipedia/commons/e/e6/BlackRock_logo.svg",
  "vanguard": "https://upload.wikimedia.org/wikipedia/commons/8/8c/Vanguard_logo.svg",
  "fidelity": "https://upload.wikimedia.org/wikipedia/commons/f/f7/Fidelity_Investments_logo.svg"
};

export function LogoImage({ 
  company, 
  alt, 
  className = "", 
  fallbackText
}: LogoImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const logoUrl = logoMap[company];
  
  if (hasError || !logoUrl) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className="text-gray-500 font-medium text-sm">
          {fallbackText || alt}
        </span>
      </div>
    );
  }
  
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
        </div>
      )}
      <Image
        src={logoUrl}
        alt={alt}
        width={120}
        height={40}
        className={`transition-opacity duration-300 object-contain ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        unoptimized
      />
    </div>
  );
}