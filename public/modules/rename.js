window.WorksHubModules = window.WorksHubModules || {};
window.WorksHubModules['rename'] = {
  run: async (input, params) => {
    const pattern = params.pattern || 'IMG_{n}';
    const start   = parseInt(params.start)   || 1;
    const padding = parseInt(params.padding) || 3;

    const files = (input.files || []).map((f, i) => {
      const n       = String(start + i).padStart(padding, '0');
      const ext     = f.name.split('.').pop();
      const newName = pattern.replace('{n}', n) + '.' + ext;
      return { ...f, newName };
    });

    return { files, count: files.length };
  }
};
