import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@apollo/client";
import {
  ColumnFiltering,
  ColumnFiltersState,
  RowSorting,
  SortingState,
  useLeafyGreenTable,
} from "@leafygreen-ui/table";
import { useLocation } from "react-router-dom";
import { useTaskAnalytics } from "analytics";
import { BaseTable } from "components/Table/BaseTable";
import TableControl from "components/Table/TableControl";
import TableWrapper from "components/Table/TableWrapper";
import { onChangeHandler } from "components/Table/utils";
import { DEFAULT_POLL_INTERVAL } from "constants/index";
import { PaginationQueryParams, TableQueryParams } from "constants/queryParams";
import {
  TaskTestsQuery,
  TaskTestsQueryVariables,
  SortDirection,
  TestSortCategory,
  TestResult,
  TaskQuery,
} from "gql/generated/types";
import { TASK_TESTS } from "gql/queries";
import { useTableSort, useUpdateURLQueryParams, usePolling } from "hooks";
import { useQueryParams } from "hooks/useQueryParam";
import {
  RequiredQueryParams,
  mapFilterParamToId,
  mapIdToFilterParam,
} from "types/task";
import { TestStatus } from "types/test";
import { queryString } from "utils";
import { getColumnsTemplate } from "./testsTable/getColumnsTemplate";

const { getLimit, getPage, getString, parseSortString, queryParamAsNumber } =
  queryString;
const { getDefaultOptions: getDefaultFiltering } = ColumnFiltering;
const { getDefaultOptions: getDefaultSorting } = RowSorting;

interface TestsTableProps {
  task: TaskQuery["task"];
}

export const TestsTable: React.FC<TestsTableProps> = ({ task }) => {
  const { pathname } = useLocation();
  const updateQueryParams = useUpdateURLQueryParams();
  const { sendEvent } = useTaskAnalytics();

  const [queryParams, setQueryParams] = useQueryParams();
  const queryVariables = getQueryVariables(queryParams, task.id);
  const { execution, limitNum, pageNum, sort } = queryVariables;
  const sortBy = sort?.[0]?.sortBy;

  const appliedDefaultSort = useRef(null);
  useEffect(() => {
    // Avoid race condition where this hook overwrites TaskTabs setting a default execution.
    if (execution == null) {
      return;
    }

    if (
      sortBy === undefined &&
      updateQueryParams &&
      appliedDefaultSort.current !== pathname
    ) {
      appliedDefaultSort.current = pathname;
      updateQueryParams({
        [TableQueryParams.SortBy]: TestSortCategory.Status,
        [TableQueryParams.SortDir]: SortDirection.Asc,
      });
    }
  }, [pathname, updateQueryParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, refetch, startPolling, stopPolling } = useQuery<
    TaskTestsQuery,
    TaskTestsQueryVariables
  >(TASK_TESTS, {
    variables: queryVariables,
    skip: queryVariables.execution === null,
    pollInterval: DEFAULT_POLL_INTERVAL,
  });
  usePolling({ startPolling, stopPolling, refetch });

  const clearQueryParams = () => {
    table.resetColumnFilters(true);
  };

  const updateFilters = (filterState: ColumnFiltersState) => {
    const updatedParams = {
      ...queryParams,
      page: "0",
      ...emptyFilterQueryParams,
    };

    filterState.forEach(({ id, value }) => {
      const key = mapIdToFilterParam[id];
      updatedParams[key] = value;
    });

    setQueryParams(updatedParams);
    sendEvent({ name: "Filter Tests", filterBy: Object.keys(filterState) });
  };

  const tableSortHandler = useTableSort({
    sendAnalyticsEvents: (sorter: SortingState) =>
      sendEvent({
        name: "Sort Tests Table",
        sortBy: sorter.map(({ id }) => id as TestSortCategory),
      }),
  });

  const { task: taskData } = data ?? {};
  const { tests } = taskData ?? {};
  const { filteredTestCount, testResults, totalTestCount } = tests ?? {};

  const { initialFilters, initialSorting } = useMemo(
    () => getInitialState(queryParams),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setSorting = (s: SortingState) =>
    getDefaultSorting(table).onSortingChange(s);

  const setFilters = (f: ColumnFiltersState) =>
    getDefaultFiltering(table).onColumnFiltersChange(f);

  const columns = useMemo(() => getColumnsTemplate({ task }), [task]);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const table = useLeafyGreenTable<TestResult>({
    columns,
    containerRef: tableContainerRef,
    data: testResults ?? [],
    defaultColumn: {
      enableColumnFilter: false,
      enableMultiSort: true,
      enableSorting: false,
      size: "auto" as unknown as number,
      // Handle bug in sorting order
      // https://github.com/TanStack/table/issues/4289
      sortDescFirst: false,
    },
    initialState: {
      columnFilters: initialFilters,
      sorting: initialSorting,
    },
    // Override default requirement for shift-click to multisort.
    isMultiSortEvent: () => true,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    maxMultiSortColCount: 2,
    onColumnFiltersChange: onChangeHandler<ColumnFiltersState>(
      setFilters,
      updateFilters,
    ),
    onSortingChange: onChangeHandler<SortingState>(
      setSorting,
      tableSortHandler,
    ),
  });

  return (
    <TableWrapper
      controls={
        <TableControl
          filteredCount={filteredTestCount}
          totalCount={totalTestCount}
          limit={limitNum}
          page={pageNum}
          label="tests"
          onClear={clearQueryParams}
          onPageSizeChange={() => {
            sendEvent({ name: "Change Page Size" });
          }}
        />
      }
      shouldShowBottomTableControl={filteredTestCount > 10}
    >
      <BaseTable
        data-cy="tests-table"
        data-loading={loading}
        loading={loading}
        loadingRows={limitNum}
        shouldAlternateRowColor
        table={table}
      />
    </TableWrapper>
  );
};

const emptyFilterQueryParams = {
  [RequiredQueryParams.TestName]: undefined,
  [RequiredQueryParams.Statuses]: undefined,
};

const getInitialState = (queryParams: {
  [key: string]: any;
}): {
  initialFilters: ColumnFiltersState;
  initialSorting: SortingState;
} => {
  const {
    [TableQueryParams.SortBy]: sortBy,
    [TableQueryParams.SortDir]: sortDir,
  } = queryParams;

  return {
    initialSorting:
      sortBy && sortDir
        ? [{ id: sortBy, desc: sortDir === SortDirection.Desc }]
        : [{ id: TestSortCategory.Status, desc: false }],
    initialFilters: Object.entries(mapFilterParamToId).reduce(
      (accum, [param, id]) => {
        if (queryParams[param]?.length) {
          return [...accum, { id, value: queryParams[param] }];
        }
        return accum;
      },
      [],
    ),
  };
};

const getQueryVariables = (
  queryParams: { [key: string]: any },
  taskId: string,
): TaskTestsQueryVariables => {
  // Detemining sort category
  const parsedSortBy = getString(queryParams[TableQueryParams.SortBy]);
  const testSortCategories: string[] = Object.values(TestSortCategory);
  const sortBy = testSortCategories.includes(parsedSortBy)
    ? (parsedSortBy as TestSortCategory)
    : undefined;
  const sorts = queryParams[TableQueryParams.Sorts];

  // Determining sort direction
  const parsedDirection = getString(queryParams[TableQueryParams.SortDir]);
  const direction =
    parsedDirection === SortDirection.Desc
      ? SortDirection.Desc
      : SortDirection.Asc;

  let sort = [];
  if (sortBy && direction) {
    sort = [{ sortBy, direction }];
  } else if (sorts) {
    sort = parseSortString(sorts, {
      sortByKey: "sortBy",
      sortDirKey: "direction",
    });
  }

  const testName = getString(queryParams[RequiredQueryParams.TestName]);
  const rawStatuses = queryParams[RequiredQueryParams.Statuses];
  const statusList = (
    Array.isArray(rawStatuses) ? rawStatuses : [rawStatuses]
  ).filter((v) => v && v !== TestStatus.All);
  const execution = queryParams[RequiredQueryParams.Execution];
  return {
    id: taskId,
    execution: queryParamAsNumber(execution),
    sort,
    limitNum: getLimit(queryParams[PaginationQueryParams.Limit]),
    statusList,
    testName,
    pageNum: getPage(queryParams[PaginationQueryParams.Page]),
  };
};
