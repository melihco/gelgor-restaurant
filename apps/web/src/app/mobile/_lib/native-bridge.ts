'use client';
/**
 * Native WebView bridge — minimal postMessage contract with the host app.
 *
 * Web → host messages (JSON string `{ type, payload }`):
 *   - `ready`             — web app mounted; host may reply with `pushToken`
 *   - `haptic`            — { style: HapticStyle }
 *   - `setStatusBarStyle` — { style: 'light' | 'dark', background: string }
 *   - `exitApp`           — hardware back pressed at root; host may close/minimize
 *
 * Host → web messages (same JSON shape), delivered via either
 * `window.__saNativeMessage(json)` or a `message` event on window/document:
 *   - `hardwareBack`      — Android back button pressed
 *   - `pushToken`         — { token: string, platform?: 'ios' | 'android' }
 *
 * Every call is a safe no-op in a plain browser, so the same bundle runs
 * standalone and embedded.
 */

export type HapticStyle =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

type BridgeMessage = { type: string; payload?: Record<string, unknown> };

declare global {
  interface Window {
    /** React Native WebView */
    ReactNativeWebView?: { postMessage: (message: string) => void };
    /** Native iOS WKWebView script message handler */
    webkit?: { messageHandlers?: { smartAgency?: { postMessage: (message: unknown) => void } } };
    /** Android JavascriptInterface (`addJavascriptInterface(..., "SmartAgencyAndroid")`) */
    SmartAgencyAndroid?: { postMessage: (message: string) => void };
    /** Direct entry point the host can evaluate to deliver a message. */
    __saNativeMessage?: (json: string) => void;
  }
}

function postToHost(message: BridgeMessage): boolean {
  if (typeof window === 'undefined') return false;
  const json = JSON.stringify(message);
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(json);
      return true;
    }
    if (window.webkit?.messageHandlers?.smartAgency) {
      window.webkit.messageHandlers.smartAgency.postMessage(message);
      return true;
    }
    if (window.SmartAgencyAndroid) {
      window.SmartAgencyAndroid.postMessage(json);
      return true;
    }
  } catch {
    // Host handler threw — treat as not embedded.
  }
  return false;
}

let latestPushToken: { token: string; platform?: string } | null = null;
const pushTokenListeners = new Set<(token: { token: string; platform?: string }) => void>();

export const nativeBridge = {
  /** True when running inside a known native WebView shell. */
  isEmbedded(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.ReactNativeWebView
      || window.webkit?.messageHandlers?.smartAgency
      || window.SmartAgencyAndroid,
    );
  },

  /** Trigger native haptic feedback; falls back to `navigator.vibrate` where available. */
  haptic(style: HapticStyle = 'light') {
    if (postToHost({ type: 'haptic', payload: { style } })) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'error' || style === 'heavy' ? 30 : 10);
    }
  },

  /** Sync the native status bar with the current theme. */
  setStatusBarStyle(style: 'light' | 'dark', background: string) {
    postToHost({ type: 'setStatusBarStyle', payload: { style, background } });
  },

  /** Announce that the web app finished mounting (host may reply with pushToken). */
  notifyReady() {
    postToHost({ type: 'ready' });
  },

  /** Ask the host to close/minimize (hardware back at navigation root). */
  requestExitApp() {
    postToHost({ type: 'exitApp' });
  },

  /** Latest push token delivered by the host, if any. */
  getPushToken() {
    return latestPushToken;
  },

  /** Subscribe to push tokens from the host. Returns an unsubscribe function. */
  onPushToken(listener: (token: { token: string; platform?: string }) => void) {
    pushTokenListeners.add(listener);
    if (latestPushToken) listener(latestPushToken);
    return () => pushTokenListeners.delete(listener);
  },
};

export interface NativeBridgeHandlers {
  /** Return true if the back press was handled in-app; false lets the host exit. */
  onHardwareBack: () => boolean;
}

/**
 * Install host → web message listeners. Call once from the app shell;
 * returns a cleanup function.
 */
export function initNativeBridge(handlers: NativeBridgeHandlers): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleMessage = (raw: unknown) => {
    let msg: BridgeMessage | null = null;
    if (typeof raw === 'string') {
      try { msg = JSON.parse(raw) as BridgeMessage; } catch { return; }
    } else if (raw && typeof raw === 'object' && 'type' in raw) {
      msg = raw as BridgeMessage;
    }
    if (!msg?.type) return;

    switch (msg.type) {
      case 'hardwareBack': {
        if (!handlers.onHardwareBack()) nativeBridge.requestExitApp();
        break;
      }
      case 'pushToken': {
        const token = msg.payload?.token;
        if (typeof token !== 'string' || !token) break;
        latestPushToken = {
          token,
          platform: typeof msg.payload?.platform === 'string' ? msg.payload.platform : undefined,
        };
        pushTokenListeners.forEach((l) => l(latestPushToken!));
        break;
      }
      default:
        break;
    }
  };

  const onMessageEvent = (event: Event) => {
    handleMessage((event as MessageEvent).data);
  };

  window.__saNativeMessage = handleMessage;
  // RN WebView delivers to `window` on Android and `document` on iOS.
  window.addEventListener('message', onMessageEvent);
  document.addEventListener('message', onMessageEvent as EventListener);

  nativeBridge.notifyReady();

  return () => {
    delete window.__saNativeMessage;
    window.removeEventListener('message', onMessageEvent);
    document.removeEventListener('message', onMessageEvent as EventListener);
  };
}
