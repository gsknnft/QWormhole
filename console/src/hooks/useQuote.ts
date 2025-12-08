// app/lib/hooks/useQuote.ts
import { useMutation } from "@tanstack/react-query";

export type QuoteArgs = {
  inputMint: string;
  outputMint: string;
  totalAmount: string | bigint; // raw units
  slippageBps: number;          // integer bps
};

export function useQuote() {
  return useMutation({
    mutationFn: async (args: QuoteArgs) => {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}
