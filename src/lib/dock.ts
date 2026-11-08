/** Sidebar dock preference (per browser). Shared by the layout's pre-paint script and AppShell. */
export const DOCK_KEY = 'rx-dock';

/** Runs in <head> before first paint so a collapsed dock never flashes open. */
export const DOCK_BOOT_SCRIPT = `try{if(localStorage.getItem('${DOCK_KEY}')==='collapsed')document.documentElement.dataset.dock='collapsed'}catch(e){}`;
