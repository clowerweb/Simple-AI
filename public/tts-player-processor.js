// public/tts-player-processor.js
// AudioWorkletProcessor that plays enqueued Float32Array PCM chunks with simple cross-fades
class TTSPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readIndex = 0;
    this.fadeMs = 20;
    this.fadeSamples = Math.floor((this.fadeMs * sampleRate) / 1000);
    this.wasEmpty = true;
    this.port.onmessage = (e) => {
      const { type, data } = e.data || {};
      if (type === 'enqueue') {
        // Expect data as Float32Array
        this.queue.push(data);
        this.wasEmpty = false;
      } else if (type === 'flush') {
        this.queue = [];
        this.readIndex = 0;
        this.wasEmpty = true;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    output.fill(0);

    let written = 0;
    while (written < output.length) {
      if (this.queue.length === 0) break;
      const cur = this.queue[0];
      const remainChunk = cur.length - this.readIndex;
      const remainOut = output.length - written;
      const toCopy = Math.min(remainChunk, remainOut);

      for (let i = 0; i < toCopy; i++) {
        let s = cur[this.readIndex + i] || 0;
        const globalIndex = this.readIndex + i;
        if (globalIndex < this.fadeSamples) {
          s *= globalIndex / this.fadeSamples;
        }
        const left = cur.length - (this.readIndex + i);
        if (left <= this.fadeSamples) {
          s *= left / this.fadeSamples;
        }
        output[written + i] += s;
      }

      written += toCopy;
      this.readIndex += toCopy;
      if (this.readIndex >= cur.length) {
        this.queue.shift();
        this.readIndex = 0;
      }
    }

    // Notify main thread when buffer drains (edge-triggered)
    if (this.queue.length === 0 && written === 0) {
      if (!this.wasEmpty) {
        this.port.postMessage({ type: 'drain' });
      }
      this.wasEmpty = true;
    } else {
      this.wasEmpty = false;
    }

    return true;
  }
}

registerProcessor('tts-player-processor', TTSPlayerProcessor);


