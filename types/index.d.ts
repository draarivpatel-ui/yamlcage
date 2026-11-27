export const YAMLCAGE_VERSION: '1.0.0';

export interface YamlCageErrorCodes {
  readonly ALIAS_FORBIDDEN: 'YAMLCAGE_ALIAS_FORBIDDEN';
  readonly ANCHOR_FORBIDDEN: 'YAMLCAGE_ANCHOR_FORBIDDEN';
  readonly UNSAFE_TAG: 'YAMLCAGE_UNSAFE_TAG';
  readonly MERGE_KEY_FORBIDDEN: 'YAMLCAGE_MERGE_KEY_FORBIDDEN';
  readonly DUPLICATE_KEY: 'YAMLCAGE_DUPLICATE_KEY';
  readonly PROTOTYPE_KEY: 'YAMLCAGE_PROTOTYPE_KEY';
  readonly MULTI_DOCUMENT: 'YAMLCAGE_MULTI_DOCUMENT';
  readonly NON_FINITE_NUMBER: 'YAMLCAGE_NON_FINITE_NUMBER';
  readonly MAX_DEPTH: 'YAMLCAGE_MAX_DEPTH';
  readonly MAX_BYTES: 'YAMLCAGE_MAX_BYTES';
  readonly MAX_NODES: 'YAMLCAGE_MAX_NODES';
  readonly MAX_KEYS: 'YAMLCAGE_MAX_KEYS';
  readonly MAX_SEQUENCE_LENGTH: 'YAMLCAGE_MAX_SEQUENCE_LENGTH';
  readonly MAX_STRING_LENGTH: 'YAMLCAGE_MAX_STRING_LENGTH';
  readonly MAX_KEY_LENGTH: 'YAMLCAGE_MAX_KEY_LENGTH';
  readonly MAX_DOCUMENTS: 'YAMLCAGE_MAX_DOCUMENTS';
  readonly MAX_ALIASES: 'YAMLCAGE_MAX_ALIASES';
  readonly MAX_ALIAS_DEPTH: 'YAMLCAGE_MAX_ALIAS_DEPTH';
  readonly MAX_EXPANDED_NODES: 'YAMLCAGE_MAX_EXPANDED_NODES';
  readonly LONE_SURROGATE: 'YAMLCAGE_LONE_SURROGATE';
  readonly INVALID_UTF8: 'YAMLCAGE_INVALID_UTF8';
  readonly SYNTAX_ERROR: 'YAMLCAGE_SYNTAX_ERROR';
  readonly NORWAY_AMBIGUITY_WARN: 'YAMLCAGE_NORWAY_AMBIGUITY_WARN';
  readonly UNSAFE_INTEGER: 'YAMLCAGE_UNSAFE_INTEGER';
  readonly BOM_REJECTED: 'YAMLCAGE_BOM_REJECTED';
  readonly CONTROL_CHARACTER: 'YAMLCAGE_CONTROL_CHARACTER';
  readonly INVALID_INPUT: 'YAMLCAGE_INVALID_INPUT';
  readonly INVALID_OPTIONS: 'YAMLCAGE_INVALID_OPTIONS';
  readonly UNDEFINED_ALIAS: 'YAMLCAGE_UNDEFINED_ALIAS';
  readonly ALIAS_CYCLE: 'YAMLCAGE_ALIAS_CYCLE';
  readonly DUPLICATE_ANCHOR: 'YAMLCAGE_DUPLICATE_ANCHOR';
  readonly TAG_TYPE_MISMATCH: 'YAMLCAGE_TAG_TYPE_MISMATCH';
  readonly UNSUPPORTED_VALUE: 'YAMLCAGE_UNSUPPORTED_VALUE';
  readonly CYCLE_DETECTED: 'YAMLCAGE_CYCLE_DETECTED';
  readonly MAX_OUTPUT_BYTES: 'YAMLCAGE_MAX_OUTPUT_BYTES';
}

export const YAMLCAGE_ERROR_CODES: YamlCageErrorCodes;
export const CODE: YamlCageErrorCodes;

export type YamlCageErrorCode = YamlCageErrorCodes[keyof YamlCageErrorCodes];

export class YamlCageError extends Error {
  constructor(code: YamlCageErrorCode, message: string, details?: Record<string, unknown>);
  readonly name: 'YamlCageError';
  readonly code: YamlCageErrorCode;
  readonly reason: string;
  readonly position?: number;
  readonly line?: number;
  readonly column?: number;
  readonly key?: string;
  readonly anchor?: string;
  readonly alias?: string;
  readonly tag?: string;
  readonly limit?: number;
  readonly actual?: number | string;
  readonly depth?: number;
  readonly document?: number;
  readonly path?: string;
  toJSON(): Record<string, unknown>;
}

export interface YamlCageOptions {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxKeys?: number;
  readonly maxSequenceLength?: number;
  readonly maxNodes?: number;
  readonly maxStringLength?: number;
  readonly maxKeyLength?: number;
  readonly maxDocuments?: number;
  readonly maxAliases?: number;
  readonly maxAliasDepth?: number;
  readonly maxExpandedNodes?: number;
  readonly maxOutputBytes?: number;
  readonly allowAliases?: boolean;
  readonly allowMergeKeys?: boolean;
  readonly allowSafeTags?: boolean;
  readonly allowNonFinite?: boolean;
  readonly rejectUnsafeIntegers?: boolean;
  readonly rejectBom?: boolean;
  readonly warnNorwayScalars?: boolean;
  readonly strictNorwayScalars?: boolean;
  readonly allowMultiDocument?: boolean;
}

export interface ResolvedYamlCageOptions {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxKeys: number;
  readonly maxSequenceLength: number;
  readonly maxNodes: number;
  readonly maxStringLength: number;
  readonly maxKeyLength: number;
  readonly maxDocuments: number;
  readonly maxAliases: number;
  readonly maxAliasDepth: number;
  readonly maxExpandedNodes: number;
  readonly maxOutputBytes: number;
  readonly allowAliases: boolean;
  readonly allowMergeKeys: boolean;
  readonly allowSafeTags: boolean;
  readonly allowNonFinite: boolean;
  readonly rejectUnsafeIntegers: boolean;
  readonly rejectBom: boolean;
  readonly warnNorwayScalars: boolean;
  readonly strictNorwayScalars: boolean;
  readonly allowMultiDocument: boolean;
}

export const YAML_CAGE_DEFAULT_OPTIONS: ResolvedYamlCageOptions;

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlValue[] | YamlMapping;
export interface YamlMapping {
  [key: string]: YamlValue;
}

export type YamlBytesInput = Uint8Array | ArrayBuffer | SharedArrayBuffer | ArrayBufferView;
export type YamlInput = string | YamlBytesInput;

export interface YamlCageFinding {
  readonly code: YamlCageErrorCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly document?: number;
  readonly key?: string;
  readonly anchor?: string;
  readonly alias?: string;
  readonly tag?: string;
  readonly limit?: number;
  readonly actual?: number | string;
  readonly depth?: number;
  readonly value?: string;
}

export interface YamlCageAuditStats {
  readonly bytes: number;
  readonly documents: number;
  readonly nodes: number;
  readonly maxDepth: number;
  readonly aliases: number;
  readonly expandedNodes: number;
  readonly warnings: number;
  readonly parsedDocuments?: number;
}

export interface YamlCageAuditReport {
  readonly safe: boolean;
  readonly findings: readonly YamlCageFinding[];
  readonly stats: YamlCageAuditStats;
}

export function parseSafeYaml(input: YamlInput, options?: YamlCageOptions): YamlValue;
export function parseSafeYamlBytes(input: YamlBytesInput, options?: YamlCageOptions): YamlValue;
export function parseSafeYamlDocuments(input: YamlInput, options?: YamlCageOptions): YamlValue[];
export function auditYaml(input: YamlInput, options?: YamlCageOptions): YamlCageAuditReport;
export function stringifySafeYaml(value: unknown, options?: YamlCageOptions): string;

export interface YamlCageInstance {
  readonly options: ResolvedYamlCageOptions;
  parse(input: YamlInput, overrides?: YamlCageOptions): YamlValue;
  parseBytes(input: YamlBytesInput, overrides?: YamlCageOptions): YamlValue;
  parseDocuments(input: YamlInput, overrides?: YamlCageOptions): YamlValue[];
  audit(input: YamlInput, overrides?: YamlCageOptions): YamlCageAuditReport;
  stringify(input: unknown, overrides?: YamlCageOptions): string;
}

export function createYamlCage(options?: YamlCageOptions): YamlCageInstance;

declare const yamlcage: {
  readonly YAMLCAGE_VERSION: typeof YAMLCAGE_VERSION;
  readonly YAMLCAGE_ERROR_CODES: typeof YAMLCAGE_ERROR_CODES;
  readonly YAML_CAGE_DEFAULT_OPTIONS: typeof YAML_CAGE_DEFAULT_OPTIONS;
  readonly CODE: typeof CODE;
  readonly YamlCageError: typeof YamlCageError;
  readonly parseSafeYaml: typeof parseSafeYaml;
  readonly parseSafeYamlBytes: typeof parseSafeYamlBytes;
  readonly parseSafeYamlDocuments: typeof parseSafeYamlDocuments;
  readonly auditYaml: typeof auditYaml;
  readonly stringifySafeYaml: typeof stringifySafeYaml;
  readonly createYamlCage: typeof createYamlCage;
};

export default yamlcage;
