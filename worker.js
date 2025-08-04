import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from '@huggingface/transformers';

/**
 * Helper function to perform feature detection for WebGPU
 */
async function check() {
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('WebGPU is not supported (no adapter found)');
    }
  } catch (e) {
    self.postMessage({
      status: 'error',
      data: e.toString(),
    });
  }
}

/**
 * This class uses the Singleton pattern to enable lazy-loading of the pipeline
 */
class TextGenerationPipeline {
  static model_id = 'onnx-community/Qwen3-4B-ONNX';
  static tokenizer = null;
  static model = null;

  static setModelId(modelId) {
    // If model changes, reset the cached instances
    if (this.model_id !== modelId) {
      this.model_id = modelId;
      this.tokenizer = null;
      this.model = null;
    }
  }

  static async getInstance(progress_callback = null) {
    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    });

    this.model ??= AutoModelForCausalLM.from_pretrained(this.model_id, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback,
    });

    return Promise.all([this.tokenizer, this.model]);
  }
}

const stopping_criteria = new InterruptableStoppingCriteria();
let currentSystemPrompt = null;

async function generate(messages) {
  // Retrieve the text-generation pipeline.
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();
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
  if (currentSystemPrompt && currentSystemPrompt.content) {
    basePrompt = currentSystemPrompt.content;
  }
  
  const system_prompt = basePrompt + platformPrompt;

  messages.unshift({
    role: 'system',
    content: system_prompt,
  });

  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
  });

  const [START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID] = tokenizer.encode(
    '<think></think>',
    { add_special_tokens: false },
  );

  let state = 'thinking'; // 'thinking' or 'answering'
  let startTime;
  let numTokens = 0;
  let tps;
  const token_callback_function = (tokens) => {
    startTime ??= performance.now();

    if (numTokens++ > 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
    }
    if (parseInt(tokens[0]) === END_THINKING_TOKEN_ID) {
      state = 'answering';
    }
  };

  const callback_function = (output) => {
    self.postMessage({
      status: 'update',
      output,
      tps,
      numTokens,
      state,
    });
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function,
    token_callback_function,
  });

  // Tell the main thread we are starting
  self.postMessage({ status: 'start' });

  const { past_key_values, sequences } = await model.generate({
    ...inputs,

    // Sampling
    do_sample: true,
    repetition_penalty: 1.2,
    top_k: 20,
    top_p: 0.8,
    min_p: 0,
    temperature: 0.7,
    max_new_tokens: 2048,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  });

  const decoded = tokenizer.batch_decode(sequences, {
    skip_special_tokens: true,
  });

  // Send the output back to the main thread
  self.postMessage({
    status: 'complete',
    output: decoded,
  });
}

async function load(modelId = null) {
  if (modelId) {
    TextGenerationPipeline.setModelId(modelId);
  }

  self.postMessage({
    status: 'loading',
    data: `Loading model ${TextGenerationPipeline.model_id}...`,
  });

  // Load the pipeline and save it for future use.
  const [tokenizer, model] = await TextGenerationPipeline.getInstance((x) => {
    // We also add a progress callback to the pipeline so that we can
    // track model loading.
    self.postMessage(x);
  });

  self.postMessage({
    status: 'loading',
    data: 'Compiling shaders and warming up model...',
  });

  // Run model with dummy input to compile shaders
  const inputs = tokenizer('a');
  await model.generate({ ...inputs, max_new_tokens: 1 });
  self.postMessage({ status: 'ready' });
}

// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
  const { type, data, systemPrompt } = e.data;

  switch (type) {
    case 'check':
      check();
      break;

    case 'load':
      // Store the system prompt if provided
      if (systemPrompt) {
        currentSystemPrompt = systemPrompt;
      }
      load(data);
      break;

    case 'generate':
      stopping_criteria.reset();
      generate(data);
      break;

    case 'interrupt':
      stopping_criteria.interrupt();
      break;

    case 'reset':
      stopping_criteria.reset();
      break;
  }
});
