/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate after every migration:
 *   npm run types:generate
 *
 * Committed on purpose: it's the contract between the database and the app, and a diff here is
 * the clearest signal that a migration changed something the app depends on. Import table types
 * from this file; never redeclare a row shape by hand.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// Placeholder until the first migration exists. `npm run types:generate` replaces this file.
export interface Database {}
