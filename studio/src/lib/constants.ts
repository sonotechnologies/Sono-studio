export const SIDEBAR_COOKIE = 'sono-sidebar';
export const THEME_STORAGE_KEY = 'sono-theme';

/** Follows the device setting until the toggle is used, then remembers the choice. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;
