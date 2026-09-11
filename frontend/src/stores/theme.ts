export {};

type Theme = 'dark' | 'light';

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem('theme') as Theme | null;
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function saveTheme(t: Theme) {
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* ignore */
  }
}

export const themeState = {
  get: () => loadTheme(),
  set: (t: Theme) => {
    saveTheme(t);
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  },
};
