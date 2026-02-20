import { describe, expect, it } from "vitest";
import { formatTestingMessage } from "./slack.js";

describe("formatTestingMessage", () => {
  it("contains feature title, URL, and checklist items", () => {
    const message = formatTestingMessage({
      featureTitle: "Pipeline status dashboard",
      testUrl: "https://preview.example.com/pipeline-status",
      humanChecklist: [
        "Verify card counts match API responses",
        "Confirm table sorting works on mobile",
      ],
    });

    expect(message).toContain('*Feature ready for testing: "Pipeline status dashboard"*');
    expect(message).toContain("Deployed to: https://preview.example.com/pipeline-status");
    expect(message).toContain("- [ ] Verify card counts match API responses");
    expect(message).toContain("- [ ] Confirm table sorting works on mobile");
  });
});
