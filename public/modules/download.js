window.WorksHubModules = window.WorksHubModules || {};
window.WorksHubModules['download'] = {
  run: async (input, params) => {
    const files    = input.files || [];
    const zipName  = (params.filename || 'output') + '.zip';

    if (!files.length) throw new Error('다운로드할 파일이 없습니다');

    // JSZip 동적 로드
    if (typeof JSZip === 'undefined') {
      await new Promise((resolve, reject) => {
        const s  = document.createElement('script');
        s.src    = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const zip = new JSZip();
    for (const f of files) {
      const name = f.newName || f.name;
      zip.file(name, await f.file.arrayBuffer());
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(a.href);

    return { files, count: files.length };
  }
};
