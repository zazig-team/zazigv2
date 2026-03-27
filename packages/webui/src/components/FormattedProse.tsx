interface FormattedProseProps {
  text: string;
  preformatted?: boolean;
}

export default function FormattedProse({ text, preformatted }: FormattedProseProps): JSX.Element {
  if (preformatted) {
    return <div className="detail-prose detail-prose--pre">{text}</div>;
  }

  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  let listType: "ol" | "ul" | null = null;
  let key = 0;

  function flushList(): void {
    if (listItems.length === 0 || !listType) {
      return;
    }

    const Tag = listType;
    elements.push(
      <Tag key={key++} className="detail-prose-list">
        {listItems.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </Tag>,
    );
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    const olMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
    if (olMatch) {
      if (listType === "ul") {
        flushList();
      }
      listType = "ol";
      listItems.push(olMatch[1]!);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (listType === "ol") {
        flushList();
      }
      listType = "ul";
      listItems.push(ulMatch[1]!);
      continue;
    }

    flushList();

    if (!trimmed) {
      elements.push(<br key={key++} />);
    } else {
      elements.push(
        <p key={key++} className="detail-prose-p">
          {trimmed}
        </p>,
      );
    }
  }

  flushList();

  return <div className="detail-prose">{elements}</div>;
}
