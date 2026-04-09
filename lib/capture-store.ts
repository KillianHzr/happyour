export type CaptureType = "photo" | "video";

let _capturedBase64: string | null = null;
let _capturedUri: string | null = null;
let _capturedType: CaptureType = "photo";
let _capturedRotation: number = 0; // degrees to rotate for display

export function setCaptureData(base64: string | null, uri: string, type: CaptureType = "photo", rotation: number = 0) {
  _capturedBase64 = base64;
  _capturedUri = uri;
  _capturedType = type;
  _capturedRotation = rotation;
}

export function getCaptureData() {
  return { base64: _capturedBase64, uri: _capturedUri, type: _capturedType, rotation: _capturedRotation };
}

export function clearCaptureData() {
  _capturedBase64 = null;
  _capturedUri = null;
  _capturedType = "photo";
  _capturedRotation = 0;
}
