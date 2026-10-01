import { z } from 'zod';
import type { ToolDefinition } from '../types';

/**
 * 天气查询工具的参数定义
 */
export const weatherParamsSchema = z.object({
  city: z.string().describe('城市名称，例如 "北京"、"上海"、"Tokyo"'),
  unit: z.enum(['celsius', 'fahrenheit']).describe('温度单位').default('celsius'),
});

export type WeatherParams = z.infer<typeof weatherParamsSchema>;

/**
 * 天气查询工具的返回结果定义
 */
export interface WeatherResult {
  city: string;
  temperature: number;
  unit: 'celsius' | 'fahrenheit';
  condition: string;
  humidity: number;
  windSpeed: number;
  updatedAt: string;
}

/**
 * 简单的字符串哈希函数，用于生成确定性的随机数种子
 * @param str 输入字符串
 * @returns 哈希数值
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为 32位整数
  }
  return Math.abs(hash);
}

/**
 * 使用种子生成随机数
 * @param seed 随机种子
 * @returns 0 到 1 之间的随机数
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

/**
 * 模拟的天气查询工具
 * 使用城市名作为种子，确保同一个城市每次查询返回相同的结果
 */
export const weatherTool: ToolDefinition<WeatherParams, WeatherResult> = {
  name: 'get_weather',
  description: '获取指定城市的当前天气信息（温度、天气状况、湿度、风速）',
  schema: weatherParamsSchema,
  execute: async (params: WeatherParams): Promise<WeatherResult> => {
    const { city, unit } = params;
    
    // 基于城市名称生成确定性的模拟数据
    const seed = hashString(city);
    
    // 生成天气状况
    const conditions = ['晴', '多云', '阴', '小雨', '大雨', '雷暴'];
    const conditionIndex = Math.floor(seededRandom(seed) * conditions.length);
    const condition = conditions[conditionIndex];
    
    // 生成温度 (Celsius 范围内 -10 到 40)
    const tempC = Math.floor(seededRandom(seed + 1) * 50) - 10;
    
    // 生成湿度 (60% - 95%)
    const humidity = Math.floor(seededRandom(seed + 2) * 35) + 60;
    
    // 生成风速 (1 - 30 km/h)
    const windSpeed = Math.floor(seededRandom(seed + 3) * 29) + 1;
    
    // 根据单位处理温度
    const temperature = unit === 'fahrenheit' 
      ? Number((tempC * 9 / 5 + 32).toFixed(1))
      : tempC;
      
    return {
      city,
      temperature,
      unit,
      condition,
      humidity,
      windSpeed,
      updatedAt: new Date().toISOString()
    };
  }
};
