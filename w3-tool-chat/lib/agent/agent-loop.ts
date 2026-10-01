import { AgentLoopOptions, AgentLoopResult, AgentMessage, AssembledToolCall } from './types';
import { ToolRegistry } from './tool-registry';

/**
 * Agent 执行循环引擎
 * 封装 Agent Loop 的状态机逻辑和并行工具调用
 * 
 * @param options 配置项
 * @returns 最终执行结果
 */
export async function createAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    messages: initialMessages,
    tools,
    callLLM,
    maxSteps = 5,
    signal,
    onToolCallStart,
    onToolCallEnd,
    onStepComplete,
  } = options;

  const messages = [...initialMessages];
  let stepCount = 0;

  // 初始化工具注册中心
  const registry = new ToolRegistry();
  tools.forEach((tool) => registry.register(tool));
  const openAiTools = registry.getOpenAITools();

  while (stepCount < maxSteps) {
    if (signal?.aborted) {
      throw new Error('Agent loop aborted');
    }

    stepCount++;

    // a. 调用 LLM
    const response = await callLLM(messages, openAiTools);

    // b. 解析响应
    if (response.tool_calls && response.tool_calls.length > 0) {
      // i. 将 assistant 消息（含 tool_calls）加入 messages
      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls.map((tc: AssembledToolCall) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
      
      messages.push(assistantMessage);

      // ii. 并行执行所有工具
      const toolPromises = response.tool_calls.map(async (toolCall: AssembledToolCall) => {
        let argsObj: Record<string, unknown> = {};
        try {
          argsObj = JSON.parse(toolCall.arguments || '{}');
        } catch {
          // JSON解析错误可以在execute中二次处理并由 schema 捕捉
        }

        if (onToolCallStart) {
          onToolCallStart(toolCall.name, argsObj);
        }

        const resultStr = await registry.execute(toolCall.name, toolCall.arguments);

        if (onToolCallEnd) {
          try {
            onToolCallEnd(toolCall.name, JSON.parse(resultStr));
          } catch {
            onToolCallEnd(toolCall.name, resultStr);
          }
        }

        // iii. 将每个工具结果作为 role: 'tool' 消息加入 messages
        const toolMessage: AgentMessage = {
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: resultStr,
        };

        return toolMessage;
      });

      const toolResults = await Promise.all(toolPromises);
      messages.push(...toolResults);

      // iv. 触发回调
      if (onStepComplete) {
        onStepComplete([...messages]);
      }
      
      // 继续下一轮循环
    } else {
      // 没有任何 tool_calls (可能给出了最终答案)，退出循环
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      if (onStepComplete) {
        onStepComplete([...messages]);
      }

      return {
        messages,
        finalContent: response.content || '',
        totalSteps: stepCount,
      };
    }
  }

  throw new Error(`Agent loop exceeded max steps (${maxSteps})`);
}
