/**
 * Renders text with basic formatting:
 * - Splits numbered lists ("1. foo 2. bar") into <ol>
 * - Splits bullet lists ("- foo\n- bar") into <ul>
 * - Preserves newlines as line breaks
 */
export default function FormattedProse({ text }: { text: string }): JSX.Element {
  // Detect numbered list: "1. ... 2. ... 3. ..."
  // Pattern: digit(s) followed by a period and a space, appearing inline or after newline
  const numberedPattern = /(?:^|\s)(\d+)\.\s/;
  if (numberedPattern.test(text)) {
    // Split on "N. " boundaries — look for "1." to start, then split on subsequent "N."
    const items = text
      .split(/(?:^|(?<=\s))(?=\d+\.\s)/)
      .map((s) => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);

    if (items.length > 1) {
      // Check if there's a prefix before the first numbered item
      const prefixMatch = text.match(/^(.*?)(?=\d+\.\s)/s);
      const prefix = prefixMatch?.[1]?.trim();

      return (
        <>
          {prefix ? <p style={{ marginBottom: 8 }}>{prefix}</p> : null}
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </>
      );
    }
  }

  // Detect bullet list: lines starting with "- " or "• "
  const lines = text.split("\n");
  const bulletLines = lines.filter((l) => /^\s*[-•]\s/.test(l));
  if (bulletLines.length > 1 && bulletLines.length >= lines.filter(Boolean).length * 0.5) {
    const nonBulletPrefix = [];
    const bullets = [];
    let inBullets = false;

    for (const line of lines) {
      if (/^\s*[-•]\s/.test(line)) {
        inBullets = true;
        bullets.push(line.replace(/^\s*[-•]\s*/, "").trim());
      } else if (!inBullets && line.trim()) {
        nonBulletPrefix.push(line.trim());
      }
    }

    return (
      <>
        {nonBulletPrefix.length > 0 ? (
          <p style={{ marginBottom: 8 }}>{nonBulletPrefix.join(" ")}</p>
        ) : null}
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {bullets.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </>
    );
  }

  // Plain text with newline preservation
  if (text.includes("\n")) {
    return (
      <>
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </>
    );
  }

  return <>{text}</>;
}
