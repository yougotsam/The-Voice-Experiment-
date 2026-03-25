class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions?.bufferSize || 1600;
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset >= this.bufferSize) {
        this.port.postMessage(this.buffer.slice());
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
