import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
export const keys = {
  households: ["households"],
  assets: ["assets"],
  asset: (id: string) => ["assets", id],
  cases: ["cases"],
  case: (id: string) => ["cases", id],
  providers: ["providers"],
  evidence: ["evidence"],
  decisions: ["decisions"],
  connectors: ["connectors"],
  notifications: ["notifications"],
  rails: ["rails"],
  partnerContracts: ["partner-rail-contracts"],
  prompt: ["system-prompt"],
  simulation: ["simulation"],
} as const;
export function useCases() {
  return useQuery({ queryKey: keys.cases, queryFn: api.cases });
}
export function useCase(id: string) {
  return useQuery({
    queryKey: keys.case(id),
    queryFn: () => api.case(id),
    enabled: Boolean(id),
  });
}
export function useAssets() {
  return useQuery({ queryKey: keys.assets, queryFn: api.assets });
}
export function useProviders() {
  return useQuery({ queryKey: keys.providers, queryFn: api.providers });
}
export function useApiMutation<T, V>(mutationFn: (variables: V) => Promise<T>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    retry: false,
    onSettled: async () => {
      await client.invalidateQueries();
    },
  });
}
