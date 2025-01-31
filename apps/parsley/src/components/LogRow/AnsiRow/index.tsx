import { AnsiUp } from "ansi_up";
import linkifyHtml from "linkify-html";
import BaseRow from "components/LogRow/BaseRow";
import { trimSeverity } from "utils/string";
import { LogRowProps } from "../types";
import { getSeverityMapping, mapLogLevelToColor } from "./utils";

interface AnsiRowProps extends LogRowProps {}

const AnsiRow: React.FC<AnsiRowProps> = ({ getLine, lineNumber, ...rest }) => {
  const ansiUp = new AnsiUp();

  let lineContent = getLine(lineNumber);

  if (lineContent === undefined) {
    return null;
  }

  const severity = lineContent.startsWith("[P: ")
    ? getSeverityMapping(Number(lineContent.substring(3, 6)))
    : null;

  if (severity) {
    // Trim "[P: NN] " priority prefix
    lineContent = trimSeverity(lineContent);
  }

  const linkifiedLine = linkifyHtml(ansiUp.ansi_to_html(lineContent ?? ""), {
    validate: {
      url: (value: string) => /^(http)s?:\/\//.test(value),
    },
  });

  return (
    <BaseRow
      color={severity ? mapLogLevelToColor[severity] : undefined}
      data-cy="ansi-row"
      lineNumber={lineNumber}
      {...rest}
    >
      {linkifiedLine}
    </BaseRow>
  );
};

AnsiRow.displayName = "AnsiRow";

export default AnsiRow;
