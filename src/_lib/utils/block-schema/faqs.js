/* jscpd:ignore-start -- block schema declaration data */
import {
  INTRO_CONTENT_FIELD,
  md,
  objectList,
  str,
} from "#utils/block-schema/shared.js";

export const type = "faqs";

export const fields = {
  items: {
    ...objectList("FAQs", {
      question: str("Question", { required: true }),
      answer: md("Answer (Markdown)"),
    }),
    description:
      "FAQ question/answer pairs. Answers support markdown formatting. Falls back to page-level `faqs` array if omitted.",
  },
  intro_content: INTRO_CONTENT_FIELD,
};

export const docs = {
  summary:
    "Renders question/answer pairs as a definition list. Available on all page types.",
  notes:
    "Define FAQs inline via `items`, or omit to fall back to the page-level `faqs` array (useful for pages and guide pages that declare FAQs in frontmatter). Answers are rendered as markdown.",
};

export const example = {
  type: "faqs",
  intro_content: "## Frequently asked questions",
  items: [
    {
      question: "How are FAQ answers formatted?",
      answer: "Answers support **markdown**, including links and lists.",
    },
    {
      question: "Where else can FAQs come from?",
      answer:
        "Omit `items` and the block falls back to the page-level `faqs` array.",
    },
  ],
};
/* jscpd:ignore-end */
