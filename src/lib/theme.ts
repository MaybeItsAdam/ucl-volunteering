/** The saved appearance choice, per device. No saved value means light; "system" follows the device. */
export const THEME_STORAGE_KEY = "volsoc_theme";

export type ThemeChoice = "system" | "light" | "dark";

/**
 * Runs in <head> before first paint so a saved theme never flashes the other one.
 * The page is served light; "dark" switches it and "system" hands it to the device.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark")document.documentElement.setAttribute("data-theme","dark");else if(t==="system")document.documentElement.removeAttribute("data-theme")}catch(e){}})()`;
