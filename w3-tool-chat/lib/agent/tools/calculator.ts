import { z } from 'zod';
import type { ToolDefinition } from '../types';

/**
 * 计算器工具的参数定义
 */
export const calculatorParamsSchema = z.object({
  expression: z.string().describe('数学表达式，例如 "123 * 456"、"Math.sqrt(144)"、"Math.PI * 2"'),
});

export type CalculatorParams = z.infer<typeof calculatorParamsSchema>;

/**
 * 计算器工具的返回结果定义
 */
export interface CalculatorResult {
  expression?: string;
  result?: number;
  formattedResult?: string;
  error?: string;
}

/**
 * 计算器工具
 * 安全地执行数学计算表达式
 */
export const calculatorTool: ToolDefinition<CalculatorParams, CalculatorResult> = {
  name: 'calculate',
  description: '执行数学计算表达式。支持加减乘除、幂运算、三角函数、对数等',
  schema: calculatorParamsSchema,
  execute: async (params: CalculatorParams): Promise<CalculatorResult> => {
    const { expression } = params;
    
    // 1. 长度限制 (最长 200 字符)
    if (expression.length > 200) {
      return { error: '表达式过长，最长允许 200 个字符' };
    }
    
    // 2. 移除所有的空格用于正则校验，但不修改原表达式以便后续可能需要的显示
    const noSpaceExp = expression.replace(/\s+/g, '');
    
    // 3. 安全检查: 只允许合法的数学字符和 Math 方法
    // 允许: 数字, 小数点, 基本运算符(+-*/%), 幂运算(**), 括号, 以及 Math.xxx
    const validMathRegex = /^([0-9+\-*/%.()=]|Math\.[a-zA-Z0-9_]+|(?:\*\*))+$/;
    
    if (!validMathRegex.test(noSpaceExp)) {
      return { 
        error: '包含非法字符或不安全的调用。只允许数字、运算符、括号和 Math 对象的属性/方法' 
      };
    }
    
    // 进一步防范关键词
    const forbiddenKeywords = ['import', 'require', 'fetch', 'eval', 'process', 'window', 'document', 'global'];
    if (forbiddenKeywords.some(keyword => expression.includes(keyword))) {
      return { error: '表达式中包含禁止的关键词' };
    }
    
    try {
      // 4. 使用 Function 构造函数安全执行
      // 虽然前面的正则已经做了限制，我们仍确保执行环境的隔离
      const result = new Function('return ' + expression)();
      
      if (typeof result !== 'number' || isNaN(result)) {
        return { error: '表达式的计算结果不是一个有效的数字' };
      }
      
      return {
        expression,
        result,
        formattedResult: Number.isInteger(result) ? result.toString() : result.toFixed(4).replace(/\.?0+$/, '')
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { error: `计算出错: ${errorMessage}` };
    }
  }
};
