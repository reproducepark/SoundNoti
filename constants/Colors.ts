/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#2563EB'; // indigo-600
const tintColorDark = '#60A5FA'; // blue-400

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    tint: tintColorLight,
    icon: '#94A3B8',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    border: '#E2E8F0',
    muted: '#64748B',
  },
  dark: {
    text: '#E5E7EB',
    background: '#0B1220',
    tint: tintColorDark,
    icon: '#94A3B8',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorDark,
    card: '#111827',
    border: '#1F2937',
    muted: '#94A3B8',
  },
};
