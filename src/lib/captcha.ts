import { CAPTCHA_SITE_KEY } from "../config/app";

// Controllo anti-bot (Cloudflare Turnstile) per Supabase: ogni accesso, registrazione o "Password dimenticata"
// manda un token nuovo (si usa una volta sola). Il widget è <Captcha/> nel modulo di accesso; qui c'è solo il token.

export const captchaOn = !!CAPTCHA_SITE_KEY;
export const CAPTCHA_ORIGIN = "https://swipeshopping.app";
export const captchaUrl = () =>
  `${CAPTCHA_ORIGIN}/verifica.html?k=${encodeURIComponent(CAPTCHA_SITE_KEY)}`;

let token: string | undefined;
const waiting = new Set<(t: string) => void>();
const resets = new Set<() => void>();

export function setCaptchaToken(t: string | undefined) {
  token = t;
  if (!t) return;
  for (const w of waiting) w(t);
  waiting.clear();
}

/** Il widget si ricarica per preparare il token della prossima volta. */
export function onCaptchaReset(fn: () => void) {
  resets.add(fn);
  return () => void resets.delete(fn);
}

/**
 * Le opzioni da passare a Supabase ({ captchaToken }) e consuma il token. Se il token non c'è ancora aspetta
 * il widget fino a `waitMs` (0 = non aspettare: per i tentativi automatici).
 */
export async function captchaOptions(
  waitMs = 15_000,
): Promise<{ captchaToken?: string }> {
  if (!captchaOn) return {};
  let t = token;
  if (!t && waitMs > 0) {
    t = await new Promise<string | undefined>((resolve) => {
      const done = (v: string | undefined) => {
        waiting.delete(done);
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => done(undefined), waitMs);
      waiting.add(done);
    });
  }
  if (!t) return {};
  token = undefined;
  for (const r of resets) r();
  return { captchaToken: t };
}
