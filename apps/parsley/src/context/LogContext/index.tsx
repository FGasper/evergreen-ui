import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Cookie from "js-cookie";
import { PaginatedVirtualListRef } from "components/PaginatedVirtualList/types";
import {
  CASE_SENSITIVE,
  EXPANDABLE_ROWS,
  FILTER_LOGIC,
  PRETTY_PRINT_BOOKMARKS,
  WRAP,
  WRAP_FORMAT,
  ZEBRA_STRIPING,
} from "constants/cookies";
import {
  FilterLogic,
  LogRenderingTypes,
  LogTypes,
  WordWrapFormat,
} from "constants/enums";
import { QueryParams } from "constants/queryParams";
import { useFilterParam } from "hooks/useFilterParam";
import { useQueryParam } from "hooks/useQueryParam";
import { ExpandedLines, ProcessedLogLines } from "types/logs";
import filterLogs from "utils/filterLogs";
import { getMatchingLines } from "utils/matchingLines";
import { getColorMapping } from "utils/resmoke";
import searchLogs from "utils/searchLogs";
import useLogState from "./state";
import { DIRECTION, LogMetadata, Preferences, SearchState } from "./types";
import { getNextPage } from "./utils";

interface LogContextState {
  expandedLines: ExpandedLines;
  failingLine: number | undefined;
  isUploadedLog: boolean;
  hasLogs: boolean | null;
  lineCount: number;
  listRef: React.RefObject<PaginatedVirtualListRef>;
  logMetadata?: LogMetadata;
  matchingLines: Set<number> | undefined;
  preferences: Preferences;
  processedLogLines: ProcessedLogLines;
  range: {
    lowerRange: number;
    upperRange?: number;
  };
  searchLine?: number;
  searchState: SearchState;

  clearExpandedLines: () => void;
  clearLogs: () => void;
  collapseLines: (idx: number) => void;
  expandLines: (expandedLines: ExpandedLines) => void;
  getLine: (lineNumber: number) => string | undefined;
  getResmokeLineColor: (lineNumber: number) => string | undefined;
  ingestLines: (
    logs: string[],
    renderingType: LogRenderingTypes,
    failingCommand?: string,
  ) => void;
  paginate: (dir: DIRECTION) => void;
  scrollToLine: (lineNumber: number) => void;
  setFileName: (fileName: string) => void;
  setLogMetadata: (logMetadata: LogMetadata) => void;
  setSearch: (search: string) => void;
}

const LogContext = createContext<LogContextState | null>(null);

const useLogContext = () => {
  const context = useContext(LogContext);
  if (context === undefined) {
    throw new Error("useLogContext must be used within a LogContextProvider");
  }
  return context as LogContextState;
};

interface LogContextProviderProps {
  children: React.ReactNode;
  initialLogLines?: string[];
}

const LogContextProvider: React.FC<LogContextProviderProps> = ({
  children,
  initialLogLines,
}) => {
  const [filters] = useFilterParam();
  const [bookmarks] = useQueryParam<number[]>(QueryParams.Bookmarks, []);
  const [shareLine] = useQueryParam<number | undefined>(
    QueryParams.ShareLine,
    undefined,
  );
  const [lowerRange] = useQueryParam(QueryParams.LowerRange, 0);
  const [upperRange] = useQueryParam<undefined | number>(
    QueryParams.UpperRange,
    undefined,
  );

  // Wrap settings are evaluated after the logs have initially rendered - see LogPane component.
  const [wrap, setWrap] = useState(false);
  const [filterLogic, setFilterLogic] = useQueryParam(
    QueryParams.FilterLogic,
    (Cookie.get(FILTER_LOGIC) as FilterLogic) ?? FilterLogic.And,
  );
  const [expandableRows, setExpandableRows] = useQueryParam(
    QueryParams.Expandable,
    Cookie.get(EXPANDABLE_ROWS) ? Cookie.get(EXPANDABLE_ROWS) === "true" : true,
  );
  const [prettyPrint, setPrettyPrint] = useState(
    Cookie.get(PRETTY_PRINT_BOOKMARKS) === "true",
  );
  const [zebraStriping, setZebraStriping] = useState(
    Cookie.get(ZEBRA_STRIPING) === "true",
  );
  const [wordWrapFormat, setWordWrapFormat] = useState(
    (Cookie.get(WRAP_FORMAT) as WordWrapFormat)
      ? (Cookie.get(WRAP_FORMAT) as WordWrapFormat)
      : WordWrapFormat.Standard,
  );

  const { dispatch, state } = useLogState(initialLogLines);
  const [processedLogLines, setProcessedLogLines] = useState<ProcessedLogLines>(
    [],
  );
  const listRef = useRef<PaginatedVirtualListRef>(null);

  const stringifiedFilters = JSON.stringify(filters);
  const stringifiedBookmarks = bookmarks.toString();
  const stringifiedExpandedLines = state.expandedLines.toString();

  const matchingLines = useMemo(
    () => getMatchingLines(state.logs, filters, filterLogic),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      stringifiedFilters,
      stringifiedExpandedLines,
      state.logs.length,
      filterLogic,
    ],
  );

  useEffect(
    () => {
      setProcessedLogLines(
        filterLogs({
          bookmarks,
          expandableRows,
          expandedLines: state.expandedLines,
          failingLine: state.failingLine,
          logLines: state.logs,
          matchingLines,
          shareLine,
        }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.logs.length,
      state.failingLine,
      matchingLines,
      stringifiedBookmarks,
      shareLine,
      stringifiedExpandedLines,
      expandableRows,
    ],
  );

  const getLine = useCallback(
    (lineNumber: number) => state.logs[lineNumber],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.logs.length],
  );

  const getResmokeLineColor = useCallback(
    (lineNumber: number) => {
      const lineContent = getLine(lineNumber);
      if (!state.colorMapping || !lineContent) {
        return undefined;
      }
      const colorMapping = getColorMapping(lineContent, state.colorMapping);
      return colorMapping !== undefined ? colorMapping.color : undefined;
    },
    [getLine, state.colorMapping],
  );

  const scrollToLine = useCallback((lineNumber: number) => {
    listRef.current?.scrollToIndex(lineNumber);
  }, []);

  const searchResults = useMemo(() => {
    const results = state.searchState.searchTerm
      ? searchLogs({
          getLine,
          lowerBound: lowerRange,
          processedLogLines,
          searchRegex: state.searchState.searchTerm,
          upperBound: upperRange,
        })
      : [];
    dispatch({
      matchCount: results.length,
      type: "SET_MATCH_COUNT",
    });

    return results;
  }, [
    state.searchState.searchTerm,
    processedLogLines,
    upperRange,
    lowerRange,
    getLine,
    dispatch,
  ]);

  const stringifiedSearchResults = searchResults.toString();
  useEffect(() => {
    if (searchResults.length > 0) {
      scrollToLine(searchResults[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stringifiedSearchResults, scrollToLine]);

  const searchLine =
    state.searchState.searchIndex !== undefined
      ? searchResults[state.searchState.searchIndex]
      : undefined;

  const ingestLines = useCallback(
    (
      lines: string[],
      renderingType: LogRenderingTypes,
      failingCommand?: string,
    ) => {
      dispatch({
        failingCommand: failingCommand ?? "",
        logs: lines,
        renderingType,
        type: "INGEST_LOGS",
      });
    },
    [dispatch],
  );

  const setLogMetadata = useCallback(
    (logMetadata: LogMetadata) => {
      dispatch({ logMetadata, type: "SET_LOG_METADATA" });
    },
    [dispatch],
  );
  const memoizedContext = useMemo(
    () => ({
      expandedLines: state.expandedLines,
      failingLine: state.failingLine,
      hasLogs: state.hasLogs,
      lineCount: state.logs.length,
      listRef,
      logMetadata: state.logMetadata,
      matchingLines,
      preferences: {
        caseSensitive: state.searchState.caseSensitive,
        expandableRows,
        filterLogic,
        prettyPrint,
        setCaseSensitive: (v: boolean) => {
          dispatch({ caseSensitive: v, type: "SET_CASE_SENSITIVE" });
          Cookie.set(CASE_SENSITIVE, v.toString(), { expires: 365 });
        },
        setExpandableRows: (v: boolean) => {
          setExpandableRows(v);
          Cookie.set(EXPANDABLE_ROWS, v.toString(), { expires: 365 });
        },
        setFilterLogic: (v: FilterLogic) => {
          setFilterLogic(v);
          Cookie.set(FILTER_LOGIC, v, { expires: 365 });
        },
        setPrettyPrint: (v: boolean) => {
          setPrettyPrint(v);
          Cookie.set(PRETTY_PRINT_BOOKMARKS, v.toString(), { expires: 365 });
        },
        setWordWrapFormat: (v: WordWrapFormat) => {
          setWordWrapFormat(v);
          Cookie.set(WRAP_FORMAT, v.toString(), { expires: 365 });
        },
        setWrap: (v: boolean) => {
          setWrap(v);
          Cookie.set(WRAP, v.toString(), { expires: 365 });
        },
        setZebraStriping: (v: boolean) => {
          setZebraStriping(v);
          Cookie.set(ZEBRA_STRIPING, v.toString(), { expires: 365 });
        },
        wordWrapFormat,
        wrap,
        zebraStriping,
      },
      processedLogLines,
      range: {
        lowerRange,
        upperRange,
      },
      searchLine,
      searchState: state.searchState,

      clearExpandedLines: () => dispatch({ type: "CLEAR_EXPANDED_LINES" }),
      clearLogs: () => dispatch({ type: "CLEAR_LOGS" }),
      collapseLines: (idx: number) => dispatch({ idx, type: "COLLAPSE_LINES" }),
      expandLines: (expandedLines: ExpandedLines) =>
        dispatch({ expandedLines, type: "EXPAND_LINES" }),
      getLine,
      getResmokeLineColor,
      ingestLines,
      isUploadedLog: state.logMetadata?.logType === LogTypes.LOCAL_UPLOAD,
      paginate: (direction: DIRECTION) => {
        const { searchIndex, searchRange } = state.searchState;
        if (searchIndex !== undefined && searchRange !== undefined) {
          const nextPage = getNextPage(searchIndex, searchRange, direction);
          dispatch({ nextPage, type: "PAGINATE" });
          scrollToLine(searchResults[nextPage]);
        }
      },
      scrollToLine,
      setFileName: (fileName: string) => {
        dispatch({ fileName, type: "SET_FILE_NAME" });
      },
      setLogMetadata,
      setSearch: (searchTerm: string) => {
        dispatch({ searchTerm, type: "SET_SEARCH_TERM" });
      },
    }),
    [
      expandableRows,
      filterLogic,
      lowerRange,
      matchingLines,
      prettyPrint,
      processedLogLines,
      searchLine,
      searchResults,
      zebraStriping,
      state.expandedLines,
      state.failingLine,
      state.hasLogs,
      state.logMetadata,
      state.logs.length,
      state.searchState,
      upperRange,
      wordWrapFormat,
      setWordWrapFormat,
      wrap,
      dispatch,
      getLine,
      getResmokeLineColor,
      ingestLines,
      scrollToLine,
      setExpandableRows,
      setFilterLogic,
      setLogMetadata,
    ],
  );

  return (
    <LogContext.Provider value={memoizedContext}>
      {children}
    </LogContext.Provider>
  );
};

export { LogContextProvider, useLogContext };
