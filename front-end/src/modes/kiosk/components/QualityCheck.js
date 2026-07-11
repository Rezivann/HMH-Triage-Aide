// Stub for the on-device TensorFlow.js blur/lighting quality check
// (MobileNetV2-style, same approach as Google DermAssist). Always passes for
// now - swap the body for a real TF.js inference call without touching
// PhotoCaptureFallback, which only calls this function.
export async function checkPhotoQuality(imageBlob) {
  return { passed: true, reasons: [] };
}
