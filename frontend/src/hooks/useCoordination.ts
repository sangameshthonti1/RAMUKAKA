import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { coordinationApi } from "../services/coordination";
import { keys } from "./useApi";

export function useCoordination(caseId: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["coordination", caseId],
    queryFn: () => coordinationApi.get(caseId),
    enabled: Boolean(caseId),
    refetchInterval: 3000,
    retry: false,
  });
  const status = query.data?.state.status;
  useEffect(() => {
    if (!status) return;
    void client.invalidateQueries({ queryKey: keys.case(caseId) });
    void client.invalidateQueries({ queryKey: keys.notifications });
    void client.invalidateQueries({ queryKey: ["provider-queue"] });
  }, [caseId, client, status]);
  return query;
}
