'use client';

import { useEffect, useState } from 'react';
import { rememberInstallPrompt, useInstallPrompt } from '@/lib/install-prompt';
import { Button } from './ui/button';

export function InstallApp() {
  const prompt = useInstallPrompt();
  const [installed, setInstalled] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const check = () =>
      setInstalled(
        mode.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    const done = () => {
      setInstalled(true);
      rememberInstallPrompt(null);
    };
    check();
    mode.addEventListener('change', check);
    window.addEventListener('appinstalled', done);
    return () => {
      mode.removeEventListener('change', check);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setNotice(
        choice.outcome === 'accepted'
          ? 'Installation requested. Your browser will finish adding HouseMate.'
          : 'Installation dismissed. You can still use HouseMate in your browser.',
      );
    } catch {
      setNotice('Use your browser’s Install or Add to Home Screen menu.');
    } finally {
      rememberInstallPrompt(null);
      setBusy(false);
    }
  }
  return (
    <section aria-label="Install HouseMate" className="install-app">
      <h2 className="text-base font-semibold">HouseMate on your home screen</h2>
      {installed ? (
        <p>HouseMate is available from your home screen.</p>
      ) : (
        <>
          <p>
            Open your household quickly from an app icon. Your account and
            household stay the same.
          </p>
          {prompt && (
            <Button onClick={() => void install()} disabled={busy}>
              {busy ? 'Opening installer…' : 'Install HouseMate'}
            </Button>
          )}
          <details>
            <summary>How to install on your phone</summary>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>Android Chrome:</strong> open the browser menu, then
                choose Install app or Add to Home screen.
              </li>
              <li>
                <strong>iPhone Safari:</strong> open Share, choose Add to Home
                Screen, and confirm Add.
              </li>
            </ul>
            <p className="mt-2">
              If the option is unavailable, open HouseMate directly in your
              browser on HTTPS. Installation does not enable notifications; push
              requires separate opt-in.
            </p>
          </details>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
