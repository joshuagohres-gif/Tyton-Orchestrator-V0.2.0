/**
 * Executor - Main entry point for shape operations
 * 
 * This module exports the robust executor as the default implementation.
 * Can be switched to OCC WASM implementation when needed.
 */

export { applyOperationsRobust as applyOperations } from "./executor-robust";
export type { Mesh, OperationEnvelope, Operation } from "./shape-operations";
