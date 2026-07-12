import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

interface FooterProps {
  sessionId: string;
  cacheSize: string;
  status: string;
}

interface PricingInfoResponse {
  data: { asOf: string };
}

/**
 * Bottom strip. Anchored UI like the bloomberg terminal status bar.
 * Pulls the server's pricing-info endpoint so the user always sees
 * how fresh the cost rate table is — a quiet honesty signal that the
 * dollar numbers elsewhere are estimates against a snapshot, not a
 * live feed.
 */
export function Footer({ sessionId, cacheSize, status }: FooterProps) {
  const pricingInfo = useQuery({
    queryKey: ["usage-local", "pricing-info"] as const,
    queryFn: ({ signal }) =>
      apiGet<PricingInfoResponse>("/api/usage/local/pricing-info", { signal }),
    // Pricing rarely changes; once per session is plenty.
    staleTime: 60 * 60 * 1000,
  });
  const asOf = pricingInfo.data?.data.asOf;

  return (
    <footer className="h-6 bg-bg-inverse text-text-on-inverse text-[10px] flex items-center justify-between px-3 font-mono shrink-0">
      <div className="flex gap-4">
        <span>
          SESSION: <span className="text-accent-on-inverse">{sessionId}</span>
        </span>
        <span>DB_CACHE: {cacheSize}</span>
        <span className="text-warning-on-inverse">{status}</span>
      </div>
      <div className="flex gap-4">
        {asOf && (
          <span className="opacity-70" title="Anthropic public pricing date">
            PRICING: {asOf}
          </span>
        )}
        <span>TERM: UTF-8</span>
        <span className="opacity-60">HAE-TAE-DAE-SUNG</span>
      </div>
    </footer>
  );
}
