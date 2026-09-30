export type Theme = 'light' | 'dark';
export const themeStorageKey = 'housemate.theme';

// Static application code only; runs before paint, without interpolating user data.
export const themeInitScript = `(() => {
  let preference;
  try { preference = localStorage.getItem('housemate.theme'); } catch {}
  const dark = preference === 'dark' ||
    (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();`;
