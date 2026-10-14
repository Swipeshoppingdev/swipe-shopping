import { useEffect, useState } from "react";
import {
  CAPTCHA_ORIGIN,
  captchaOn,
  captchaUrl,
  onCaptchaReset,
  setCaptchaToken,
} from "../lib/captcha";

/**
 * Controllo anti-bot nel modulo di accesso. Di solito invisibile: compare la casella di Cloudflare
 * solo se Cloudflare ha dei dubbi. Il token va in src/lib/captcha.ts.
 */
export function Captcha() {
  const [round, setRound] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!captchaOn) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== CAPTCHA_ORIGIN) return;
      const d = e.data as {
        type?: string;
        token?: string;
        show?: boolean;
        expired?: boolean;
        error?: string;
      };
      if (d?.type !== "turnstile") return;
      if (typeof d.token === "string") setCaptchaToken(d.token);
      if (d.expired || d.error) setCaptchaToken(undefined);
      if (typeof d.show === "boolean") setShow(d.show);
    };
    window.addEventListener("message", onMessage);
    const off = onCaptchaReset(() => {
      setShow(false);
      setRound((r) => r + 1);
    });
    return () => {
      window.removeEventListener("message", onMessage);
      off();
      setCaptchaToken(undefined);
    };
  }, []);

  if (!captchaOn) return null;
  return (
    <iframe
      key={round}
      src={captchaUrl()}
      title="Verifica anti-bot"
      className={
        show
          ? "mx-auto block h-[70px] w-[310px] max-w-full border-0"
          : "pointer-events-none absolute size-px border-0 opacity-0"
      }
    />
  );
}
