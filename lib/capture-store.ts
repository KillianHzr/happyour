let _capturedBase64: string | null = null;
let _capturedUri: string | null = null;

export function setCaptureData(base64: string, uri: string) {
  _capturedBase64 = base64;
  _capturedUri = uri;
}

export function getCaptureData() {
  return { base64: _capturedBase64, uri: _capturedUri };
}

export function clearCaptureData() {
  _capturedBase64 = null;
  _capturedUri = null;
}
