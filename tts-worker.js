// tts-worker.js (classic worker)
// Runs ONNX Kitten TTS off the main thread and streams back Float32 PCM
// Load onnxruntime-web classic build via importScripts to avoid dynamic import issues
/* eslint-disable no-undef */
importScripts('/onnx/ort.min.js');

async function ensureOrtLoaded() {
  return self.ort && self.ort.InferenceSession ? true : false;
}

// Configure ORT
if (self.ort && self.ort.env && self.ort.env.wasm) {
  self.ort.env.wasm.simd = true;
  // Use 1 thread unless crossOriginIsolated to avoid warnings
  self.ort.env.wasm.numThreads = (self.crossOriginIsolated ? Math.min(4, self.navigator?.hardwareConcurrency || 4) : 1);
  // Ensure runtime files resolve from our static path
  self.ort.env.wasm.wasmPaths = '/onnx/';
}

let session = null;
let voices = null;

self.onmessage = async (e) => {
  const { type, data } = e.data || {};
  try {
    if (type === 'load') {
      if (!(await ensureOrtLoaded())) {
        postMessage({ type: 'error', error: 'onnxruntime-web not loaded in worker.' });
        return;
      }
      const { modelUrl, voicesJsonUrl } = data;
      session = await self.ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      const res = await fetch(voicesJsonUrl);
      const json = await res.json();
      voices = {};
      for (const [name, arr] of Object.entries(json)) {
        const flat = Array.isArray(arr?.[0]) ? arr.flat() : arr;
        voices[name] = new Float32Array(flat);
      }
      postMessage({ type: 'ready', voices: Object.keys(voices) });
    } else if (type === 'synthesize') {
      const { tokenIds, voiceName, speed, modelSampleRate, outSampleRate } = data;
      if (!session || !voices) throw new Error('TTS not loaded');
      const inputIds = new self.ort.Tensor(
        'int64',
        BigInt64Array.from(tokenIds.map((x) => BigInt(x))),
        [1, tokenIds.length]
      );
      const styleEmbedding = voices[voiceName] || Object.values(voices)[0];
      if (!styleEmbedding) throw new Error('No voices available');
      const style = new self.ort.Tensor('float32', styleEmbedding, [1, styleEmbedding.length]);
      const speedT = new self.ort.Tensor('float32', new Float32Array([speed || 1.0]), [1]);
      const feeds = { input_ids: inputIds, style, speed: speedT };

      const results = await session.run(feeds);
      const firstKey = Object.keys(results)[0];
      let pcm = results[firstKey].data;
      if (!(pcm instanceof Float32Array)) pcm = new Float32Array(pcm);

      pcm = trimSilence(pcm, 0.002, Math.floor(modelSampleRate * 0.02));

      const outPcm = modelSampleRate === outSampleRate ? pcm : resampleLinear(pcm, modelSampleRate, outSampleRate);

      normalizePeak(outPcm, 0.9);

      postMessage({ type: 'pcm', pcm: outPcm.buffer, sampleRate: outSampleRate }, [outPcm.buffer]);
    } else if (type === 'dispose') {
      session?.release?.();
      session = null;
      voices = null;
    }
  } catch (err) {
    postMessage({ type: 'error', error: String(err?.message || err) });
  }
};

function normalizePeak(f32, target = 0.9) {
  if (!f32?.length) return;
  let max = 1e-9;
  for (let i = 0; i < f32.length; i++) max = Math.max(max, Math.abs(f32[i]));
  const g = Math.min(4, target / max);
  if (g < 1) {
    for (let i = 0; i < f32.length; i++) f32[i] *= g;
  }
}

function trimSilence(f32, thresh = 0.002, minSamples = 480) {
  let s = 0,
    e = f32.length - 1;
  while (s < e && Math.abs(f32[s]) < thresh) s++;
  while (e > s && Math.abs(f32[e]) < thresh) e--;
  s = Math.max(0, s - minSamples);
  e = Math.min(f32.length, e + minSamples);
  return f32.slice(s, e);
}

function resampleLinear(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = outRate / inRate;
  const outLen = Math.floor(input.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = pos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}


