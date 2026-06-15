export interface Theme {
  bg: string;
  border: string;
  divider: string;
  card: string; // inner panel (cache badge)
  text: string; // primary
  dim: string; // secondary
  accent: string; // the big total number
  good: string; // positive / green
  warn: string; // attention / amber
  bad: string; // negative / red
  info: string; // blue tag
}

export const THEMES: Record<string, Theme> = {
  // GitHub dark — the default
  dark: {
    bg: "#0d1117",
    border: "#30363d",
    divider: "#21262d",
    card: "#161b22",
    text: "#e6edf3",
    dim: "#8b949e",
    accent: "#d2a8ff",
    good: "#3fb950",
    warn: "#d29922",
    bad: "#f85149",
    info: "#58a6ff",
  },
  // Deep indigo / midnight
  midnight: {
    bg: "#12111f",
    border: "#2d2b42",
    divider: "#221f33",
    card: "#1b1930",
    text: "#ece9ff",
    dim: "#9a95c0",
    accent: "#b794ff",
    good: "#5ce6a8",
    warn: "#ffcb6b",
    bad: "#ff6b81",
    info: "#7aa2ff",
  },
  // Clean light
  light: {
    bg: "#ffffff",
    border: "#d0d7de",
    divider: "#eaeef2",
    card: "#f6f8fa",
    text: "#1f2328",
    dim: "#656d76",
    accent: "#8250df",
    good: "#1a7f37",
    warn: "#9a6700",
    bad: "#cf222e",
    info: "#0969da",
  },
};

export function getTheme(name?: string): Theme {
  return (name && THEMES[name]) || THEMES.dark;
}
