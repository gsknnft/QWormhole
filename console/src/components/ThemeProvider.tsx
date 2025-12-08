'use client'


import * as React from "react";
import {LocalStorage} from "../hooks/use-local-storage";

interface ThemeProps {
  themeMode: string;
  onChangeThemeConfig: (mode?: string) => void;
  toggleTheme: () => void;
}

interface Props {
  children: React.ReactNode;
}

const ThemeContext = React.createContext<ThemeProps | undefined>(undefined);

export const ThemeProvider: React.FC<Props> = ({ children }) => {
  const { value: themeMode, setValue: setThemeMode } = LocalStorage.use<string>("theme", "light");

  const toggleMode = React.useCallback(() => {
    const html = document.querySelector<HTMLHtmlElement>("html")!;
    if (themeMode === "dark") {
      html.classList.remove("dark");
      document.body.style.backgroundColor = "#ffffff";
      document.body.classList.remove("dark");
    } else {
      html.classList.add("dark");
      document.body.style.backgroundColor = "#111827";
      document.body.classList.add("dark");
    }
  }, [themeMode]);

  const onChangeThemeConfig = (mode?: string) => {
    if (mode === undefined) {
      setThemeMode(themeMode === "light" ? "dark" : "light");
      return;
    }
    setThemeMode(mode);
  };

  const toggleTheme = () => {
    setThemeMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
  };

  React.useEffect(() => {
    toggleMode();
  }, [themeMode, toggleMode]);

  const providerValue = {
    themeMode,
    onChangeThemeConfig,
    toggleTheme,
  };

  return <ThemeContext.Provider value={providerValue}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};