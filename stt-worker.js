import {
  env,
  AutoTokenizer,
  AutoProcessor,
  WhisperForConditionalGeneration,
  TextStreamer,
  full,
} from "@huggingface/transformers";

const MAX_NEW_TOKENS = 64;
const isAndroid = /Android/i.test(navigator.userAgent || "");

// Configure backends for Android
env.backends ??= {};
env.backends.webgpu ??= {};
env.backends.onnx ??= {};
env.backends.onnx.webgpu ??= {};
env.backends.onnx.wasm ??= {};

if (isAndroid) {
  // transformers.js kernels
  env.backends.webgpu.preferFloat16 = false;
  // onnxruntime-web WebGPU EP
  env.backends.onnx.webgpu.enableMixedPrecision = false;
  env.backends.onnx.webgpu.preferredOutputType = 'float32';
  // WASM threads optimization
  env.backends.onnx.wasm.numThreads = Math.min(4, (navigator.hardwareConcurrency || 4));
}

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class AutomaticSpeechRecognitionPipeline {
  static model_id = "onnx-community/whisper-base"; // Use HF models for tokenizer/processor, local for model weights
  static tokenizer = null;
  static processor = null;
  static model = null;

  static async getInstance(progress_callback = null) {
    // Load tokenizer and processor from HF (these are small)
    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    });
    this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    });

    // Try to use local models if available, fallback to HF
    this.model ??= WhisperForConditionalGeneration.from_pretrained(
      this.model_id,
      {
        dtype: {
          encoder_model: "fp32",
          decoder_model_merged: "q4",
        },
        device: "webgpu",
        progress_callback,
      },
    );

    return Promise.all([this.tokenizer, this.processor, this.model]);
  }

  static dispose() {
    try { this.model?.dispose?.(); } catch {}
    this.model = null;
    this.tokenizer = null;
    this.processor = null;
  }
}

let processing = false;
async function generate({ audio, language }) {
  if (processing) return;
  processing = true;
  self.postMessage({ status: "start" });

  try {
    const [tokenizer, processor, model] =
      await AutomaticSpeechRecognitionPipeline.getInstance();

    let startTime;
    let numTokens = 0;
    let tps;
    const token_callback_function = () => {
      startTime ??= performance.now();

      if (numTokens++ > 0) {
        tps = (numTokens / (performance.now() - startTime)) * 1000;
      }
    };
    const callback_function = (output) => {
      self.postMessage({
        status: "update",
        output,
        tps,
        numTokens,
      });
    };

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function,
      token_callback_function,
    });

    const inputs = await processor(audio);
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: isAndroid ? 32 : MAX_NEW_TOKENS,
      language,
      streamer,
    });

    const decoded = tokenizer.batch_decode(outputs, {
      skip_special_tokens: true,
    });

    self.postMessage({ status: "complete", output: decoded });
  } catch (err) {
    console.error("STT generate error:", err);
    self.postMessage({ status: "error", data: String(err?.message || err) });
  } finally {
    processing = false;
  }
}

async function load() {
  self.postMessage({
    status: "loading",
    data: "Loading STT model...",
  });

  try {
    await AutomaticSpeechRecognitionPipeline.getInstance((x) => {
      self.postMessage(x);
    });

    self.postMessage({
      status: "loading",
      data: "Compiling shaders and warming up STT model...",
    });

    const [, , model] = await AutomaticSpeechRecognitionPipeline.getInstance();
    await model.generate({
      input_features: full([1, 80, 3000], 0.0),
      max_new_tokens: 1,
    });
    self.postMessage({ status: "ready" });
  } catch (e) {
    console.error("STT load error:", e);
    self.postMessage({ status: "error", data: String(e?.message || e) });
  }
}

async function warmup() {
  try {
    // Reset processing state first
    processing = false;
    
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();
    
    // Run model with dummy input to warm up again
    await model.generate({
      input_features: full([1, 80, 3000], 0.0),
      max_new_tokens: 1,
    });
    
    self.postMessage({ status: "ready" });
  } catch (error) {
    console.error('Warmup error:', error);
    self.postMessage({ status: "error", data: error.message });
  }
}

// Listen for messages from the main thread
self.addEventListener("message", async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case "load":
      load();
      break;

    case "generate":
      generate(data);
      break;

    case "reset":
      // Reset processing state to clear working memory
      console.log('Resetting STT worker...');
      processing = false;
      AutomaticSpeechRecognitionPipeline.dispose();
      break;
      
    case "warmup":
      warmup();
      break;
  }
});