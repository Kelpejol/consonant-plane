
/**
 * YAML Parser Utility
 * 
 * Enhanced YAML parsing with validation and error handling.
 * Used for loading agent manifests from .yaml files.
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

// // ============================================================================
// // YAML PARSER
// // ============================================================================

export class YAMLParser {
  /**
   * Parse YAML string to object
   */
  parse<T = any>(yamlString: string): T {
    try {
      // Use loadAll to support files that accidentally contain multiple documents.
      // If multiple documents are present, pick the first one and warn the user.
      const docs: any[] = [];
      yaml.loadAll(yamlString, (doc: any) => docs.push(doc), {
        filename: 'input.yaml',
        onWarning: (warning) => {
          logger.warn({
            message: (warning as any).message,
            line: (warning as any).mark?.line,
            column: (warning as any).mark?.column
          },'YAML parsing warning');
        }
      });

      if (docs.length === 0 || docs[0] === null || docs[0] === undefined) {
        throw new Error('YAML document is empty');
      }

      if (docs.length > 1) {
        logger.warn({ total: docs.length }, 'YAML contains multiple documents; using the first document');
      }

      return docs[0] as T;
    } catch (error) {
      // js-yaml may throw objects with a `mark` property. Build a helpful message when available.
      const e = error as any;
      if (e && (e.mark || e.reason || e.message)) {
        const line = e.mark?.line != null ? e.mark.line : e.mark?.line;
        const column = e.mark?.column != null ? e.mark.column : e.mark?.column;
        const reason = e.reason || e.message || String(e);
        throw new Error(`YAML syntax error at line ${line ?? 'unknown'}, column ${column ?? 'unknown'}: ${reason}`);
      }
      throw error;
    }
  }

  /**
   * Parse YAML file
   */
  async parseFile<T = any>(filePath: string): Promise<T> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse<T>(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Stringify object to YAML
   */
  stringify(obj: any, options: StringifyOptions = {}): string {
    const {
      indent = 2,
      lineWidth = 120,
      noRefs = true,
      sortKeys = false
    } = options;

    try {
      return yaml.dump(obj, {
        indent,
        lineWidth,
        noRefs,
        sortKeys
      });
    } catch (error) {
      throw new Error(`Failed to stringify YAML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Write object to YAML file
   */
  async writeFile(
    filePath: string,
    obj: any,
    options: StringifyOptions = {}
  ): Promise<void> {
    try {
      const yamlString = this.stringify(obj, options);
      await fs.writeFile(filePath, yamlString, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write YAML file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate YAML structure without parsing
   */
  validate(yamlString: string): ValidationResult {
    try {
      this.parse(yamlString);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }

  /**
   * Load all YAML files from directory
   */
  async loadDirectory<T = any>(
    dirPath: string,
    pattern: RegExp = /\.ya?ml$/i
  ): Promise<LoadedFile<T>[]> {
    try {
      const files = await fs.readdir(dirPath);
      const yamlFiles = files.filter(file => pattern.test(file));

      const results = await Promise.allSettled(
        yamlFiles.map(async (file) => {
          const fullPath = path.join(dirPath, file);
          const content = await this.parseFile<T>(fullPath);
          return {
            path: fullPath,
            filename: file,
            content
          };
        })
      );

      const loaded: LoadedFile<T>[] = [];
      const errors: Array<{ file: string; error: string }> = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          loaded.push(result.value);
        } else {
          errors.push({
            file: yamlFiles[index],
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });

      if (errors.length > 0) {
        logger.warn({ errors },'Some YAML files failed to load');
      }

      return loaded;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw error;
    }
  }

  /**
   * Merge multiple YAML objects
   */
  merge(...objects: any[]): any {
    return objects.reduce((merged, obj) => {
      return this.deepMerge(merged, obj);
    }, {});
  }

  /**
   * Deep merge helper
   */
  private deepMerge(target: any, source: any): any {
    if (!this.isObject(source)) {
      return source;
    }

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (this.isObject(source[key]) && this.isObject(result[key])) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Check if value is plain object
   */
  private isObject(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface StringifyOptions {
  indent?: number;
  lineWidth?: number;
  noRefs?: boolean;
  sortKeys?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface LoadedFile<T = any> {
  path: string;
  filename: string;
  content: T;
}

// // ============================================================================
// // SINGLETON INSTANCE
// // ============================================================================

export const yamlParser = new YAMLParser();

// /**
//  * Convenience functions
//  */
export const parseYAML = <T = any>(yamlString: string): T => 
  yamlParser.parse<T>(yamlString);

export const parseYAMLFile = <T = any>(filePath: string): Promise<T> => 
  yamlParser.parseFile<T>(filePath);

export const stringifyYAML = (obj: any, options?: StringifyOptions): string => 
  yamlParser.stringify(obj, options);

