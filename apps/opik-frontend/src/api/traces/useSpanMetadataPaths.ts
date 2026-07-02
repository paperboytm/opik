import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, { QueryConfig, SPANS_REST_ENDPOINT } from "@/api/api";
import { LOGS_SOURCE } from "@/types/traces";

type UseSpanMetadataPathsParams = {
  projectId: string;
  fromTime?: string;
  toTime?: string;
  logsSource?: LOGS_SOURCE;
  limit?: number;
};

export type MetadataPathsResponse = {
  paths: string[];
};

const getSpanMetadataPaths = async (
  { signal }: QueryFunctionContext,
  {
    projectId,
    fromTime,
    toTime,
    logsSource,
    limit = 100,
  }: UseSpanMetadataPathsParams,
) => {
  const { data } = await api.get<MetadataPathsResponse>(
    `${SPANS_REST_ENDPOINT}metadata/paths`,
    {
      signal,
      params: {
        project_id: projectId,
        ...(fromTime && { from_time: fromTime }),
        ...(toTime && { to_time: toTime }),
        ...(logsSource && { source: logsSource }),
        limit,
      },
    },
  );

  return data;
};

export default function useSpanMetadataPaths(
  params: UseSpanMetadataPathsParams,
  options?: QueryConfig<MetadataPathsResponse>,
) {
  return useQuery({
    queryKey: ["span-metadata-paths", params],
    queryFn: (context) => getSpanMetadataPaths(context, params),
    ...options,
  });
}
