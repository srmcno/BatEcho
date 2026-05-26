// WAV decoder/encoder that PRESERVES the true sample rate (critical for
// full-spectrum bat recordings at 192/256/384 kHz) and parses GUANO metadata.
// Reads PCM samples directly rather than relying on AudioContext.decodeAudioData,
// which would resample to the audio hardware rate (~48 kHz) and destroy ultrasound.

function readString(view, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

// Parse a GUANO metadata block (UTF-8 "key: value" lines) into an object.
export function parseGuano(text) {
  const meta = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) meta[key] = val;
  }
  return meta;
}

/**
 * Decode a WAV ArrayBuffer.
 * @returns {{
 *   sampleRate:number, channels:number, bitDepth:number, format:string,
 *   samples:Float32Array, duration:number, guano:object|null, raw:object
 * }}
 */
export function decodeWav(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (readString(view, 0, 4) !== 'RIFF' || readString(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a valid RIFF/WAVE file');
  }

  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  let guano = null;

  while (offset + 8 <= view.byteLength) {
    const id = readString(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      const audioFormat = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      let subFormat = audioFormat;
      if (audioFormat === 0xfffe && size >= 24) {
        // WAVE_FORMAT_EXTENSIBLE — real format in the GUID's first 2 bytes
        subFormat = view.getUint16(body + 24, true);
      }
      fmt = { audioFormat: subFormat, channels, sampleRate, bitsPerSample };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    } else if (id === 'guan') {
      // GUANO metadata chunk
      const bytes = new Uint8Array(arrayBuffer, body, size);
      try {
        guano = parseGuano(new TextDecoder('utf-8').decode(bytes));
      } catch { guano = null; }
    }
    // chunks are word-aligned
    offset = body + size + (size % 2);
  }

  if (!fmt) throw new Error('Missing fmt chunk');
  if (dataOffset < 0) throw new Error('Missing data chunk');

  const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataLength / bytesPerSample);
  const frames = Math.floor(totalSamples / channels);
  const out = new Float32Array(frames);

  // Mix down to mono (most bat detectors are mono; if stereo, average).
  const readSample = makeSampleReader(view, audioFormat, bitsPerSample);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const pos = dataOffset + (f * channels + c) * bytesPerSample;
      acc += readSample(pos);
    }
    out[f] = acc / channels;
  }

  let formatName = 'PCM';
  if (audioFormat === 3) formatName = 'IEEE float';
  else if (audioFormat === 1) formatName = `PCM ${bitsPerSample}-bit`;

  return {
    sampleRate,
    channels,
    bitDepth: bitsPerSample,
    format: formatName,
    samples: out,
    duration: frames / sampleRate,
    guano,
    raw: fmt,
  };
}

function makeSampleReader(view, audioFormat, bits) {
  if (audioFormat === 3) {
    if (bits === 32) return (p) => view.getFloat32(p, true);
    if (bits === 64) return (p) => view.getFloat64(p, true);
  }
  // integer PCM
  if (bits === 8) return (p) => (view.getUint8(p) - 128) / 128; // unsigned
  if (bits === 16) return (p) => view.getInt16(p, true) / 32768;
  if (bits === 24) {
    return (p) => {
      const b0 = view.getUint8(p);
      const b1 = view.getUint8(p + 1);
      const b2 = view.getUint8(p + 2);
      let val = (b2 << 16) | (b1 << 8) | b0;
      if (val & 0x800000) val |= ~0xffffff; // sign extend
      return val / 8388608;
    };
  }
  if (bits === 32) return (p) => view.getInt32(p, true) / 2147483648;
  throw new Error(`Unsupported bit depth: ${bits}`);
}

/**
 * Encode mono Float32 samples to a 16-bit PCM WAV ArrayBuffer.
 * Used for exporting synthesized recordings / clips.
 */
export function encodeWav(samples, sampleRate, guanoMeta = null) {
  let guanoBytes = null;
  if (guanoMeta) {
    const text = Object.entries(guanoMeta).map(([k, v]) => `${k}: ${v}`).join('\n');
    guanoBytes = new TextEncoder().encode(text);
  }
  const dataBytes = samples.length * 2;
  const guanoChunkSize = guanoBytes ? 8 + guanoBytes.length + (guanoBytes.length % 2) : 0;
  const buffer = new ArrayBuffer(44 + dataBytes + guanoChunkSize);
  const view = new DataView(buffer);

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes + guanoChunkSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
    off += 2;
  }
  if (guanoBytes) {
    writeStr(off, 'guan');
    view.setUint32(off + 4, guanoBytes.length, true);
    for (let i = 0; i < guanoBytes.length; i++) view.setUint8(off + 8 + i, guanoBytes[i]);
  }
  return buffer;
}
