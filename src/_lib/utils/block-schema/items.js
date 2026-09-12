import {
  collectionField,
  ITEMS_FILTERABLE_FIELDS,
} from "#utils/block-schema/shared.js";

export const type = "items";

export const fields = {
  collection: collectionField(
    'Name of an Eleventy collection (e.g. `"news"`, `"guideCategories"`).',
  ),
  ...ITEMS_FILTERABLE_FIELDS,
};

export const docs = {
  summary:
    "Displays an Eleventy collection as a card grid or horizontal slider.",
  scss: "src/css/design-system/_items.scss",
};

export const example = {
  type: "items",
  collection: "news",
  intro_content:
    "## A collection as cards\n\nThis example renders the `news` collection.",
};
