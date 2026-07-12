import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

export function HaetaeLogo({ className, size = 32 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-text-main", className)}
    >
      <path
        d="M16 4 Q 17 7 18 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M11 11 Q 13 9 18 10 Q 22 11 23 14 Q 24 18 22 22 Q 20 26 16 27 Q 12 27 10 24 Q 8 20 9 16 Q 10 13 11 11 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="14" cy="15" r="0.8" fill="currentColor" />
      <path
        d="M8 27 L 24 27"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
