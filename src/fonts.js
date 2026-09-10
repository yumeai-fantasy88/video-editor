export const extraFonts = ['M PLUS 1','Noto Sans JP','Noto Serif JP','Kaisei Decol','Shippori Mincho','Klee One','Yomogi','Reggae One','Zen Kaku Gothic New','Dela Gothic One','Jost','Josefin Slab','Special Elite','Orbitron'];
const sheets = new Map();
export async function ensureFonts(texts) {
  for (const t of texts) {
    const family = extraFonts.find(f => t.font === `"${f}", sans-serif`);
    if (!family) continue;
    if (!sheets.has(family)) {
      const promise = new Promise((resolve, reject) => {
        const link = document.createElement('link');
        const timer = setTimeout(() => { link.remove(); reject(Error('フォントの読み込みがタイムアウトしました：'+family)); }, 15000);
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family='+encodeURIComponent(family).replace(/%20/g,'+')+'&display=swap';
        link.onload = () => { clearTimeout(timer); resolve(); };
        link.onerror = () => { clearTimeout(timer); link.remove(); reject(Error('フォントを読み込めません：'+family)); };
        document.head.append(link);
      }).catch(e => { sheets.delete(family); throw e; });
      sheets.set(family,promise);
    }
    await sheets.get(family);
    await document.fonts.load(`${t.bold?'700':'400'} 32px "${family}"`,t.text || '日本語ABC');
  }
}
