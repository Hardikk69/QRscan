/**
 * Camera QR scanning.
 * Fast path: native BarcodeDetector (Android Chrome, macOS Chrome, ChromeOS) decodes the
 * full-resolution video every frame and finds every QR code in view.
 * Fallback (iOS, Firefox, Windows Chrome): html5-qrcode, one code per scan.
 */
let detectorPromise = null;

// html5-qrcode is large (~375 KB) and only needed on the receiver, so it is loaded on demand
const loadHtml5Qrcode = () => import('html5-qrcode').then(m => m.Html5Qrcode);

/** Resolves to a BarcodeDetector, or null when the browser has none. */
export function getNativeDetector() {
  detectorPromise ??= (async () => {
    try {
      if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        return new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch {
      // Unsupported
    }
    return null;
  })();
  return detectorPromise;
}

export async function listCameras() {
  try {
    return await (await loadHtml5Qrcode()).getCameras();
  } catch (err) {
    console.warn('Unable to enumerate cameras:', err);
    return [];
  }
}

/**
 * Starts the camera inside `container` (an element with an id) and calls onText for every decoded QR.
 * @returns {Promise<{native: boolean, stop: () => Promise<void>}>}
 */
export async function startScanner(container, cameraId, onText) {
  const camera = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' };
  // Browsers default to ~640x480, too low for dense QR frames
  const hd = { ...camera, width: { ideal: 1920 }, height: { ideal: 1080 } };

  const detector = await getNativeDetector();
  if (detector) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: hd });
    stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});

    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    container.appendChild(video);
    await video.play();

    let running = true;
    const loop = async () => {
      if (!running) return;
      try {
        (await detector.detect(video)).forEach(code => onText(code.rawValue));
      } catch {
        // Frame not ready; try the next one
      }
      requestAnimationFrame(loop);
    };
    loop();

    return {
      native: true,
      stop: async () => {
        running = false;
        stream.getTracks().forEach(t => t.stop());
        video.remove();
      }
    };
  }

  const Html5Qrcode = await loadHtml5Qrcode();
  const scanner = new Html5Qrcode(container.id);
  await scanner.start(camera, {
    fps: 30,
    videoConstraints: hd,
    qrbox: (w, h) => {
      const edge = Math.floor(Math.min(w, h) * 0.85);
      return { width: edge, height: edge };
    },
    aspectRatio: 1.0
  }, onText, () => {});

  return { native: false, stop: () => scanner.stop() };
}
