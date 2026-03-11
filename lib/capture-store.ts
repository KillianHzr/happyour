export type CaptureType = "photo" | "video";

let _capturedBase64: string | null = null;
let _capturedUri: string | null = null;
let _capturedType: CaptureType = "photo";

export function setCaptureData(base64: string | null, uri: string, type: CaptureType = "photo") {
  _capturedBase64 = base64;
  _capturedUri = uri;
  _capturedType = type;
}

export function getCaptureData() {
  return { base64: _capturedBase64, uri: _capturedUri, type: _capturedType };
}

export function clearCaptureData() {
  _capturedBase64 = null;
  _capturedUri = null;
  _capturedType = "photo";
}
