declare const process: {
  env: Record<string, string | undefined>;
};

interface Buffer extends Uint8Array {}

declare const Buffer: {
  from(value: string | ArrayBuffer | ArrayBufferView): Buffer;
};
