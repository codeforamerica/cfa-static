/**
 * Shared collection utilities for common patterns across collection types.
 */

import { groupByWithCache } from "#utils/fp/memoize.js";
import { normaliseSlug } from "#utils/slug-utils.js";

/** @typedef {import("#lib/types").EleventyCollectionItem} EleventyCollectionItem */

/**
 * Create an indexer that groups items by a scalar data field (one-to-many).
 * Normalizes slug references so "events/foo.md", "events/foo", and "foo" all match.
 *
 * @param {string} field - The data field name (e.g., "parent", "parentLocation")
 * @returns {(items: any[]) => Record<string, any[]>} Memoized indexer function
 */
export const createFieldIndexer = (field) =>
  groupByWithCache((item) => {
    const value = item.data[field];
    return value ? [normaliseSlug(value)] : [];
  });

/**
 * Create a collection builder that filters by tag, excludes items where a
 * boolean field is true, and sorts. Used by news, etc.
 * @param {string} tag - Eleventy tag to filter by
 * @param {string} hideField - Boolean data field; items where it is true are excluded
 * @param {(a: any, b: any) => number} sortFn - Sort comparator
 * @returns {(collectionApi: import("#lib/types").EleventyCollectionApi) => any[]}
 */
export const createTagCollection = (tag, hideField, sortFn) => (api) =>
  api
    .getFilteredByTag(tag)
    .filter((item) => item.data[hideField] !== true)
    .sort(sortFn);
