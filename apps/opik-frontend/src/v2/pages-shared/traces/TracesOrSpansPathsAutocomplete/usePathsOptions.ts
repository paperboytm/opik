import { useMemo } from "react";
import uniq from "lodash/uniq";
import isObject from "lodash/isObject";
import isArray from "lodash/isArray";

import { getJSONPaths } from "@/lib/utils";
import useTracesOrSpansList, {
  TRACE_DATA_TYPE,
} from "@/hooks/useTracesOrSpansList";
import { LOGS_SOURCE } from "@/types/traces";
import { ChipOptionsResult } from "@/shared/filter-chips/types";
import useTraceMetadataPaths from "@/api/traces/useTraceMetadataPaths";
import useSpanMetadataPaths from "@/api/traces/useSpanMetadataPaths";

export type TRACE_AUTOCOMPLETE_ROOT_KEY = "input" | "output" | "metadata";

interface UsePathsOptionsArgs {
  projectId: string;
  type: TRACE_DATA_TYPE;
  rootKeys: TRACE_AUTOCOMPLETE_ROOT_KEY[];
  excludeRoot?: boolean;
  includeIntermediateNodes?: boolean;
  datasetColumnNames?: string[];
  logsSource?: LOGS_SOURCE;
  fromTime?: string;
  toTime?: string;
}

export const usePathsOptions = (
  args: UsePathsOptionsArgs,
): ChipOptionsResult => {
  const {
    projectId,
    type,
    rootKeys,
    excludeRoot = false,
    includeIntermediateNodes = false,
    datasetColumnNames,
    logsSource,
    fromTime,
    toTime,
  } = args;
  const hasProjectId = Boolean(projectId);
  const useMetadataPathsEndpoint =
    rootKeys.length === 1 &&
    rootKeys[0] === "metadata" &&
    excludeRoot &&
    !includeIntermediateNodes;

  const { data: traceMetadataPaths, isPending: isTraceMetadataPathsPending } =
    useTraceMetadataPaths(
      {
        projectId,
        fromTime,
        toTime,
        logsSource,
      },
      {
        enabled:
          hasProjectId &&
          useMetadataPathsEndpoint &&
          type === TRACE_DATA_TYPE.traces,
      } as never,
    );

  const { data: spanMetadataPaths, isPending: isSpanMetadataPathsPending } =
    useSpanMetadataPaths(
      {
        projectId,
        fromTime,
        toTime,
        logsSource,
      },
      {
        enabled:
          hasProjectId &&
          useMetadataPathsEndpoint &&
          type === TRACE_DATA_TYPE.spans,
      } as never,
    );

  const { data, isPending } = useTracesOrSpansList(
    {
      projectId,
      type,
      page: 1,
      size: 100,
      truncate: true,
      stripAttachments: true,
      logsSource,
    },
    { enabled: hasProjectId && !useMetadataPathsEndpoint },
  );

  const { data: dataNonTruncated, isPending: isPendingNonTruncated } =
    useTracesOrSpansList(
      {
        projectId,
        type,
        page: 1,
        size: 10,
        truncate: false,
        stripAttachments: true,
        logsSource,
      },
      { enabled: hasProjectId && !useMetadataPathsEndpoint },
    );

  const items = useMemo(() => {
    const metadataPathSuggestions =
      type === TRACE_DATA_TYPE.traces
        ? traceMetadataPaths?.paths || []
        : spanMetadataPaths?.paths || [];

    const truncated = data?.content || [];
    const nonTruncated = dataNonTruncated?.content || [];
    const all = [...truncated, ...nonTruncated];
    const baseSuggestions = all.reduce<string[]>((acc, d) => {
      return acc.concat(
        rootKeys.reduce<string[]>(
          (internalAcc, key) =>
            internalAcc.concat(
              isObject(d[key]) || isArray(d[key])
                ? getJSONPaths(d[key], key, [], includeIntermediateNodes).map(
                    (path) =>
                      excludeRoot
                        ? path.substring(path.indexOf(".") + 1)
                        : path,
                  )
                : [],
            ),
          [],
        ),
      );
    }, []);

    const rootObjectSuggestions: string[] =
      includeIntermediateNodes && !excludeRoot ? [...rootKeys] : [];

    const datasetSuggestions =
      datasetColumnNames?.map(
        (columnName) => `metadata.dataset_item_data.${columnName}`,
      ) || [];

    return uniq([
      ...rootObjectSuggestions,
      ...(useMetadataPathsEndpoint ? metadataPathSuggestions : []),
      ...baseSuggestions,
      ...datasetSuggestions,
    ]).sort();
  }, [
    data?.content,
    dataNonTruncated?.content,
    traceMetadataPaths?.paths,
    spanMetadataPaths?.paths,
    rootKeys,
    excludeRoot,
    includeIntermediateNodes,
    datasetColumnNames,
    type,
    useMetadataPathsEndpoint,
  ]);

  const metadataPathsPending =
    type === TRACE_DATA_TYPE.traces
      ? isTraceMetadataPathsPending
      : isSpanMetadataPathsPending;
  const effectiveLoading =
    hasProjectId &&
    (useMetadataPathsEndpoint
      ? metadataPathsPending
      : isPending || isPendingNonTruncated);

  return useMemo(
    () => ({ items, isLoading: effectiveLoading }),
    [items, effectiveLoading],
  );
};
