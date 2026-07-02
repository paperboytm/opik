import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, { QueryConfig, TRACES_REST_ENDPOINT } from "@/api/api";
import { LOGS_SOURCE, TRACE_VISIBILITY_MODE } from "@/types/traces";

type UseTraceMetadataPathsParams = {
  projectId: string;
  fromTime?: string;
  toTime?: string;
  logsSource?: LOGS_SOURCE;
  visibilityMode?: TRACE_VISIBILITY_MODE;
  limit?: number;
};

export type MetadataPathsResponse = {
  paths: string[];
};

const getTraceMetadataPaths = async (
  { signal }: QueryFunctionContext,
  {
    projectId,
    fromTime,
    toTime,
    logsSource,
    visibilityMode = TRACE_VISIBILITY_MODE.default,
    limit = 100,
  }: UseTraceMetadataPathsParams,
) => {
  const { data } = await api.get<MetadataPathsResponse>(
    `${TRACES_REST_ENDPOINT}metadata/paths`,
    {
      signal,
      params: {
        project_id: projectId,
        ...(fromTime && { from_time: fromTime }),
        ...(toTime && { to_time: toTime }),
        ...(logsSource && { source: logsSource }),
        visibility_mode: visibilityMode,
        limit,
      },
    },
  );

  return data;
};

export default function useTraceMetadataPaths(
  params: UseTraceMetadataPathsParams,
  options?: QueryConfig<MetadataPathsResponse>,
) {
  return useQuery({
    queryKey: ["trace-metadata-paths", params],
    queryFn: (context) => getTraceMetadataPaths(context, params),
    ...options,
  });
}
