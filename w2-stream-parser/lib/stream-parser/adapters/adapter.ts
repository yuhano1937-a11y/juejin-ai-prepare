/**
 * @file adapter.ts
 * @description 大模型厂商协议适配器接口定义与基础工具函数
 */

import type { ProviderAdapter } from '../core/types';

export type { ProviderAdapter };

/**
 * 安全地解析 JSON 字符串，解析失败返回 null 而不是抛出异常崩溃
 *
 * @param jsonString 待解析的 JSON 字符串
 * @returns 解析后的泛型对象或 null
 */
export function safeJsonParse<T = unknown>(jsonString: string): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return null;
  }
}
