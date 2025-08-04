/**
 * API Worker for handling external API providers (OpenRouter, llama.cpp, custom APIs)
 */

class ApiProvider {
  constructor(settings) {
    this.settings = settings;
  }

  async generateCompletion(messages) {
    throw new Error('generateCompletion must be implemented by subclass');
  }
}


class CustomApiProvider extends ApiProvider {
  async generateCompletion(messages) {
    // Get the selected custom API configuration
    const apiConfig = this.getSelectedApiConfig();
    if (!apiConfig) {
      throw new Error('No custom API selected');
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    // Add API key if provided
    if (apiConfig.apiKey) {
      headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
    }

    const apiUrl = apiConfig.apiUrl;

    const body = {
      messages: messages,
      stream: true,
      max_tokens: apiConfig.maxTokens || 2048,
      // Use the custom API's parameters
      temperature: apiConfig.temperature || 0.7,
      top_p: apiConfig.topP || 0.9,
      min_p: apiConfig.minP || 0.0,
      top_k: apiConfig.topK || 50,
      repetition_penalty: apiConfig.repetitionPenalty || 1.1,
      presence_penalty: apiConfig.presencePenalty || 0.0,
      frequency_penalty: apiConfig.frequencyPenalty || 0.0
    };

    // Add model if specified
    if (apiConfig.modelName) {
      body.model = apiConfig.modelName;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let errorMessage = `API Error (${response.status}): ${response.statusText}`;
      let errorDetails = null;
      
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error.message || errorMessage;
          errorDetails = errorData.error;
        }
      } catch (e) {
        // Could not parse error response
      }
      
      const error = new Error(errorMessage);
      error.status = response.status;
      error.details = errorDetails;
      throw error;
    }

    return response;
  }

  getSelectedApiConfig() {
    if (!this.settings.customApis || !Array.isArray(this.settings.customApis)) {
      return null;
    }
    
    const selectedIndex = this.settings.selectedCustomApi;
    if (selectedIndex === null || selectedIndex === undefined || selectedIndex < 0) {
      return null;
    }
    
    const apiConfig = this.settings.customApis[selectedIndex];
    if (!apiConfig) {
      return null;
    }

    // Find the associated provider
    const provider = this.getProviderById(apiConfig.providerId);
    if (!provider) {
      return null; // Provider not found
    }

    // Find the selected API key
    const selectedKey = provider.apiKeys.find(key => key.name === apiConfig.keyId);
    if (!selectedKey) {
      // Fallback to default key if selected key not found
      const defaultKey = provider.apiKeys.find(key => key.isDefault);
      if (!defaultKey) {
        return null; // No usable key found
      }
      apiConfig.keyId = defaultKey.name;
    }

    // Return enhanced config with provider details
    return {
      ...apiConfig,
      apiUrl: provider.apiUrl,
      apiKey: selectedKey ? selectedKey.key : (provider.apiKeys.find(key => key.isDefault)?.key || '')
    };
  }

  getProviderById(providerId) {
    if (!this.settings.providers || !Array.isArray(this.settings.providers)) {
      return null;
    }
    return this.settings.providers.find(p => p.id === providerId);
  }
}

// Current provider instance
let currentProvider = null;
let currentSettings = null;

async function initializeProvider(settings) {
  currentSettings = settings;
  
  switch (settings.provider) {
    case 'custom':
      currentProvider = new CustomApiProvider(settings);
      break;
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}

async function processStreamResponse(response, onUpdate, onComplete) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponse = '';
  let fullReasoning = '';
  
  const startTime = performance.now();
  let tokenCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });

      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            onComplete(fullResponse, fullReasoning, tokenCount, startTime);
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            // Try different content paths for different providers
            let content = null;
            let reasoning = null;
            
            // Check for reasoning content (CoT models)
            if (parsed.choices?.[0]?.delta?.reasoning) {
              reasoning = parsed.choices[0].delta.reasoning;
            }
            
            // OpenAI/OpenRouter format
            if (parsed.choices?.[0]?.delta?.content) {
              content = parsed.choices[0].delta.content;
            }
            // llama.cpp format (might be different)
            else if (parsed.choices?.[0]?.text) {
              content = parsed.choices[0].text;
            }
            // Alternative llama.cpp format
            else if (parsed.content) {
              content = parsed.content;
            }
            // Another possible format
            else if (parsed.message?.content) {
              content = parsed.message.content;
            }
            // Check if this is a final completion chunk with finish_reason
            else if (parsed.choices?.[0]?.finish_reason === 'stop' && !fullResponse) {
              // This might be a non-streaming response or final chunk
              // Let's try to get the full message content if available
              if (parsed.choices[0].message?.content) {
                content = parsed.choices[0].message.content;
              }
            }
            
            // Handle reasoning updates
            if (reasoning) {
              fullReasoning += reasoning;
            }
            
            if (content || reasoning) {
              if (content) {
                fullResponse += content;
              }
              
              // Estimate tokens (include reasoning in token count)
              tokenCount = Math.ceil((fullResponse.length + fullReasoning.length) / 4);
              
              const tps = tokenCount > 0 ? (tokenCount / (performance.now() - startTime)) * 1000 : 0;
              
              onUpdate(content || '', reasoning || '', tps, tokenCount, fullReasoning);
            }
          } catch (e) {
            // Skip malformed JSON lines
            console.warn('Failed to parse streaming response:', data, e);
          }
        }
      }
    }
    
    // If we reach here without a [DONE] marker, complete anyway
    if (fullResponse || fullReasoning) {
      onComplete(fullResponse, fullReasoning, tokenCount, startTime);
    }
  } catch (error) {
    throw new Error(`Stream processing error: ${error.message}`);
  }
}

async function generate(messages) {
  if (!currentProvider) {
    throw new Error('No provider initialized');
  }

  // Add system prompt from settings
  const systemPrompt = currentProvider.settings.currentSystemPrompt;
  const platformPrompt = `
---
When writing any mathematical expression, equation, or formula, always use LaTeX syntax inside math delimiters:
Inline math: $...$
Display math: $$...$$
Use proper LaTeX commands for symbols, operators, and formatting.
Do not output plain text approximations of math (e.g., "sqrt(x)" or "x^2").
Assume all environments support LaTeX rendering via KaTeX.`;
  
  // Use the system prompt content, with fallback to default only if no system prompt is provided at all
  let basePrompt = 'Be a helpful assistant'; // Default fallback
  if (systemPrompt && systemPrompt.content) {
    basePrompt = systemPrompt.content;
  }
  
  const system_prompt = basePrompt + platformPrompt;

  // Create a copy of messages and add system prompt if not present
  const processedMessages = [...messages];
  if (processedMessages[0]?.role !== 'system') {
    processedMessages.unshift({
      role: 'system',
      content: system_prompt
    });
  }

  // Tell the main thread we are starting
  self.postMessage({ status: 'start' });

  try {
    const response = await currentProvider.generateCompletion(processedMessages);
    
    await processStreamResponse(
      response,
      (content, reasoning, tps, numTokens, fullReasoning) => {
        self.postMessage({
          status: 'update',
          output: content,
          reasoning: reasoning,
          fullReasoning: fullReasoning,
          tps,
          numTokens,
          state: reasoning ? 'thinking' : 'answering'
        });
      },
      (fullResponse, fullReasoning, numTokens, startTime) => {
        const totalTime = (performance.now() - startTime) / 1000;
        const avgTps = numTokens / totalTime;
        
        self.postMessage({
          status: 'complete',
          output: fullResponse,
          reasoning: fullReasoning,
          tps: avgTps,
          numTokens
        });
      }
    );
    
  } catch (error) {
    console.error('Generation error:', error);
    
    // Create structured error response
    const errorResponse = {
      status: 'error',
      data: {
        message: error.message,
        isRetryable: true,
        errorType: 'api_error'
      }
    };

    // Add additional details if available
    if (error.status) {
      errorResponse.data.httpStatus = error.status;
      errorResponse.data.isRetryable = error.status >= 500 || error.status === 429; // Server errors and rate limits are retryable
    }

    if (error.details) {
      errorResponse.data.details = error.details;
      
      // Check for specific error patterns that might indicate retry-ability
      if (error.details.code === 429 || error.message.includes('rate-limited')) {
        errorResponse.data.isRetryable = true;
        errorResponse.data.errorType = 'rate_limit';
      }
    }

    self.postMessage(errorResponse);
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      try {
        await initializeProvider(data);
        self.postMessage({ status: 'ready' });
      } catch (error) {
        self.postMessage({ status: 'error', data: error.message });
      }
      break;

    case 'generate':
      await generate(data);
      break;

    case 'interrupt':
      // For API providers, we can't really interrupt mid-stream easily
      // This would require AbortController support
      break;

    case 'reset':
      // Nothing to reset for API providers
      break;
  }
});