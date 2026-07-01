import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, { PROJECTS_REST_ENDPOINT, QueryConfig } from "@/api/api";
import { LOGS_SOURCE, TRACE_VISIBILITY_MODE } from "@/types/traces";

type UseProjectLogsExistenceParams = {
  projectId: string;
  fromTime?: string;
  toTime?: string;
  logsSource?: LOGS_SOURCE;
  visibilityMode?: TRACE_VISIBILITY_MODE;
};

type UseProjectLogsExistenceResponse = {
  has_traces: boolean;
  has_spans: boolean;
};

const getProjectLogsExistence = async (
  { signal }: QueryFunctionContext,
  {
    projectId,
    fromTime,
    toTime,
    logsSource,
    visibilityMode = TRACE_VISIBILITY_MODE.default,
  }: UseProjectLogsExistenceParams,
) => {
  const { data } = await api.get<UseProjectLogsExistenceResponse>(
    `${PROJECTS_REST_ENDPOINT}${projectId}/logs/existence`,
    {
      signal,
      params: {
        ...(fromTime && { from_time: fromTime }),
        ...(toTime && { to_time: toTime }),
        ...(logsSource && { source: logsSource }),
        visibility_mode: visibilityMode,
      },
    },
  );

  return data;
};

export default function useProjectLogsExistence(
  params: UseProjectLogsExistenceParams,
  options?: QueryConfig<UseProjectLogsExistenceResponse>,
) {
  return useQuery({
    queryKey: ["project-logs-existence", params],
    queryFn: (context) => getProjectLogsExistence(context, params),
    ...options,
  });
}
