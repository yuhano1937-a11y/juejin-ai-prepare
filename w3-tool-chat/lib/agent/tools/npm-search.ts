import { z } from 'zod';
import type { ToolDefinition } from '../types';

/**
 * NPM 包查询工具的参数定义
 */
export const npmSearchParamsSchema = z.object({
  packageName: z.string().describe('npm 包名，例如 "react"、"next"、"zod"'),
});

export type NpmSearchParams = z.infer<typeof npmSearchParamsSchema>;

/**
 * NPM 包查询工具的返回结果定义（已瘦身）
 */
export interface NpmSearchResult {
  name?: string;
  latestVersion?: string;
  description?: string;
  license?: string;
  weeklyDownloads?: number;
  dependencyCount?: number;
  homepage?: string | null;
  repository?: string | null;
  keywords?: string[];
  lastPublished?: string;
  error?: string;
}

/**
 * NPM 包信息查询工具
 * 调用真实 API 并提取关键字段以避免超出 LLM 上下文限制
 */
export const npmSearchTool: ToolDefinition<NpmSearchParams, NpmSearchResult> = {
  name: 'search_npm_package',
  description: '查询 npm 包的详细信息，包括最新版本、描述、周下载量、依赖数量、仓库地址等',
  schema: npmSearchParamsSchema,
  execute: async (params: NpmSearchParams): Promise<NpmSearchResult> => {
    const { packageName } = params;
    
    try {
      // 获取包基本元数据
      const registryRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
      
      if (!registryRes.ok) {
        if (registryRes.status === 404) {
          return { error: `未找到包名: ${packageName}` };
        }
        return { error: `请求 Registry API 失败: ${registryRes.statusText}` };
      }
      
      const registryData = await registryRes.json();
      
      // 获取最新版本标识
      const latestVersionString = registryData['dist-tags']?.latest;
      if (!latestVersionString) {
        return { error: `无法获取包 ${packageName} 的最新版本` };
      }
      
      // 获取最新版本的具体数据
      const latestVersionData = registryData.versions[latestVersionString] || {};
      
      // 获取周下载量
      let weeklyDownloads = 0;
      try {
        const downloadRes = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`);
        if (downloadRes.ok) {
          const downloadData = await downloadRes.json();
          weeklyDownloads = downloadData.downloads || 0;
        }
      } catch (err) {
        // 忽略下载量获取失败的情况，不影响主要数据的返回
        console.warn(`获取包 ${packageName} 下载量失败`, err);
      }
      
      // 解析仓库地址
      let repository = null;
      if (typeof latestVersionData.repository === 'string') {
        repository = latestVersionData.repository;
      } else if (latestVersionData.repository && typeof latestVersionData.repository.url === 'string') {
        repository = latestVersionData.repository.url;
      }
      
      // 计算依赖数量
      const dependencyCount = latestVersionData.dependencies 
        ? Object.keys(latestVersionData.dependencies).length 
        : 0;
      
      // 提取关键字（最多5个）
      const keywords = Array.isArray(latestVersionData.keywords) 
        ? latestVersionData.keywords.slice(0, 5) 
        : [];
        
      // 发布时间
      const lastPublished = registryData.time?.[latestVersionString] || new Date().toISOString();
      
      // 返回瘦身后的数据结构
      return {
        name: registryData.name,
        latestVersion: latestVersionString,
        description: registryData.description || latestVersionData.description || '',
        license: registryData.license || latestVersionData.license || 'Unknown',
        weeklyDownloads,
        dependencyCount,
        homepage: latestVersionData.homepage || registryData.homepage || null,
        repository,
        keywords,
        lastPublished
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { error: `查询失败: ${errorMessage}` };
    }
  }
};
