import { createSignal } from 'solid-js';
import type { PersistApi } from '@floegence/floe-webapp-core';

// 终端偏好是全局的：任何一个 TerminalPanel 的设置都应影响所有终端实例。
// 这里用模块级 signal 作为单例 store，并通过 Floe 的 persist 做持久化。

export const TERMINAL_THEME_PERSIST_KEY = 'terminal:theme';
export const TERMINAL_FONT_SIZE_PERSIST_KEY = 'terminal:font_size';
export const TERMINAL_FONT_FAMILY_PERSIST_KEY = 'terminal:font_family';

export const TERMINAL_MIN_FONT_SIZE = 10;
export const TERMINAL_MAX_FONT_SIZE = 20;

let initialized = false;
let persistRef: PersistApi | null = null;

const clampFontSize = (value: number) => {
  if (!Number.isFinite(value)) return 12;
  return Math.max(TERMINAL_MIN_FONT_SIZE, Math.min(TERMINAL_MAX_FONT_SIZE, Math.round(value)));
};

const [terminalUserTheme, setTerminalUserTheme] = createSignal<string>('system');
const [terminalFontSize, setTerminalFontSize] = createSignal<number>(12);
const [terminalFontFamilyId, setTerminalFontFamilyId] = createSignal<string>('iosevka');

export function ensureTerminalPreferencesInitialized(persist: PersistApi) {
  if (initialized) return;
  initialized = true;
  persistRef = persist;

  const loadedTheme = persist.load<string>(TERMINAL_THEME_PERSIST_KEY, 'system');
  setTerminalUserTheme((loadedTheme ?? '').trim() || 'system');

  const loadedSize = persist.load<number>(TERMINAL_FONT_SIZE_PERSIST_KEY, 12);
  setTerminalFontSize(clampFontSize(loadedSize));

  const loadedFamily = persist.load<string>(TERMINAL_FONT_FAMILY_PERSIST_KEY, 'iosevka');
  setTerminalFontFamilyId((loadedFamily ?? '').trim() || 'iosevka');
}

export function useTerminalPreferences() {
  const setUserTheme = (value: string) => {
    const next = (value ?? '').trim() || 'system';
    setTerminalUserTheme(next);
    persistRef?.debouncedSave(TERMINAL_THEME_PERSIST_KEY, next);
  };

  const setFontSize = (value: number) => {
    const next = clampFontSize(value);
    setTerminalFontSize(next);
    persistRef?.debouncedSave(TERMINAL_FONT_SIZE_PERSIST_KEY, next);
  };

  const setFontFamily = (id: string) => {
    const next = (id ?? '').trim() || 'iosevka';
    setTerminalFontFamilyId(next);
    persistRef?.debouncedSave(TERMINAL_FONT_FAMILY_PERSIST_KEY, next);
  };

  return {
    userTheme: terminalUserTheme,
    fontSize: terminalFontSize,
    fontFamilyId: terminalFontFamilyId,
    setUserTheme,
    setFontSize,
    setFontFamily,
  };
}

