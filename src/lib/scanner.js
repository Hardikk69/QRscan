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

/**
 * Lists video inputs. Labels are only filled in once camera permission has been granted,
 * so call this after the scanner has started: enumerating on page load would either
 * return unlabeled devices or force an extra permission prompt and camera grab.
 */
export async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch (err) {
    console.warn('Unable to enumerate cameras:', err);
    return [];
  }
}

/**
 * Camera constraints to try in order. Without an explicit device, `exact` forces a
 * rear-facing camera (phones list several cameras and would otherwise open the front one);
 * the looser attempts cover laptops that only have a front camera.
 * Browsers also default to ~640x480, too low for dense QR frames, hence the HD request.
 */
function cameraAttempts(cameraId) {
  // Each `camera` must stay a single-key object: that is all html5-qrcode accepts
  const cameras = cameraId
    ? [{ deviceId: { exact: cameraId } }]
    : [{ facingMode: { exact: 'environment' } }, { facingMode: 'environment' }];
  return cameras.map(camera => ({ camera, video: { ...camera, width: { ideal: 1920 }, height: { ideal: 1080 } } }));
}

/**
 * Starts the camera inside `container` (an element with an id) and calls onText for every decoded QR.
 * @returns {Promise<{native: boolean, label: string, stop: () => Promise<void>}>}
 */
export async function startScanner(container, cameraId, onText) {
  const attempts = cameraAttempts(cameraId);
  const detector = await getNativeDetector();

  if (detector) {
    let stream = null;
    let lastError = null;
    for (const attempt of [...attempts, { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } }]) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: attempt.video });
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!stream) throw lastError;

    const track = stream.getVideoTracks()[0];
    track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});

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
      label: track.label || track.getSettings().facingMode || 'camera',
      stop: async () => {
        running = false;
        stream.getTracks().forEach(t => t.stop());
        video.remove();
      }
    };
  }

  const Html5Qrcode = await loadHtml5Qrcode();
  let lastError = null;
  for (const { camera, video } of attempts) {
    // A fresh instance per attempt: a failed start leaves the old one mid-transition
    const scanner = new Html5Qrcode(container.id);
    try {
      await scanner.start(camera, {
        fps: 30,
        videoConstraints: video,
        qrbox: (w, h) => {
          const edge = Math.floor(Math.min(w, h) * 0.85);
          return { width: edge, height: edge };
        },
        aspectRatio: 1.0
      }, onText, () => {});
      return {
        native: false,
        label: container.querySelector('video')?.srcObject?.getVideoTracks?.()[0]?.label || 'camera',
        stop: () => scanner.stop()
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
