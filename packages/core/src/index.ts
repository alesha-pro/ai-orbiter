/**
 * @file Index of the @ai-orbiter/core package.
 * Exports the main public API for registry management and configuration patching.
 */

export const CORE_VERSION = '0.0.1';

export * from './events';
export * from './diff/calculator';
export * from './apply/dry-run';
export * from './apply/orchestrator';
export * from './registry/bindings';
export * from './registry/conflict-resolver';
