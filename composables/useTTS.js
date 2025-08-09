// composables/useTTS.js
// Manages a single AudioContext + AudioWorkletNode and a TTS worker for streaming playback
import { ref } from 'vue';

let audioContext = null;
let workletNode = null;
let ttsWorker = null;
const isReady = ref(false);
const isSpeaking = ref(false);
const selectedVoice = ref('default');
const availableVoices = ref([]);

const MODEL_SAMPLE_RATE = 24000; // Kitten TTS default; allow overrides via init

export function useTTS() {
  async function ensureAudio() {
    if (!audioContext || audioContext.state === 'closed') {
      // create suspended; do not resume here (autoplay policies)
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  async function init({ modelUrl = '/tts-model/kitten_tts_nano_v0_1.onnx', voicesJsonUrl = '/tts-model/voices.json', wasmPaths = '/onnx/' } = {}) {
    if (ttsWorker) return isReady.value;
    // Use classic worker (not module) to allow importScripts in worker
    ttsWorker = new Worker(new URL('../tts-worker.js', import.meta.url));
    ttsWorker.onmessage = (e) => {
      const { type, pcm, sampleRate, error, voices } = e.data || {};
      if (type === 'ready') {
        isReady.value = true;
        if (Array.isArray(voices)) {
          availableVoices.value = voices;
          if (voices.length && selectedVoice.value === 'default') selectedVoice.value = voices[0];
        }
      } else if (type === 'pcm') {
        const f32 = new Float32Array(pcm);
        isSpeaking.value = true;
        if (workletNode) {
          workletNode.port.postMessage({ type: 'enqueue', data: f32 }, [f32.buffer]);
        }
      } else if (type === 'error') {
        console.error('TTS worker error:', error);
        isSpeaking.value = false;
      }
    };
    ttsWorker.postMessage({ type: 'load', data: { modelUrl, voicesJsonUrl } });
    return true;
  }

  async function unlock() {
    await ensureAudio();
    if (!workletNode) {
      await audioContext.audioWorklet.addModule('/tts-player-processor.js');
      workletNode = new AudioWorkletNode(audioContext, 'tts-player-processor');
      workletNode.connect(audioContext.destination);
      workletNode.port.onmessage = (e) => {
        if (e.data?.type === 'drain') {
          isSpeaking.value = false;
        }
      };
    }
    if (audioContext.state !== 'running') {
      await audioContext.resume();
      const b = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      const s = audioContext.createBufferSource();
      s.buffer = b; s.connect(audioContext.destination); s.start();
    }
  }

  function flush() {
    if (workletNode) workletNode.port.postMessage({ type: 'flush' });
    isSpeaking.value = false;
  }

  function enqueueSilence(ms) {
    if (!audioContext || !workletNode) return;
    const len = Math.max(0, Math.floor((audioContext.sampleRate * (ms || 0)) / 1000));
    if (len === 0) return;
    const silence = new Float32Array(len);
    workletNode.port.postMessage({ type: 'enqueue', data: silence }, [silence.buffer]);
  }

  function enqueuePcm(float32) {
    if (!workletNode || !float32?.length) return;
    const f32 = float32.buffer ? new Float32Array(float32.buffer) : new Float32Array(float32);
    workletNode.port.postMessage({ type: 'enqueue', data: f32 }, [f32.buffer]);
  }

  function setVoice(name) {
    selectedVoice.value = name;
  }

  function speakTokenIds(tokenIds, { speed = 1.0, modelSampleRate = MODEL_SAMPLE_RATE } = {}) {
    if (!ttsWorker) return;
    ttsWorker.postMessage({
      type: 'synthesize',
      data: {
        tokenIds,
        voiceName: selectedVoice.value,
        speed,
        modelSampleRate,
        outSampleRate: audioContext.sampleRate,
      },
    });
  }

  return {
    init,
    unlock,
    flush,
    enqueueSilence,
    enqueuePcm,
    speakTokenIds,
    isReady,
    isSpeaking,
    availableVoices,
    setVoice,
    audioContextRef: () => audioContext,
  };
}


