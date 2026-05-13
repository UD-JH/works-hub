window.WorksHubModules = window.WorksHubModules || {};
window.WorksHubModules['image-select'] = {
  run: async (input, params) => {
    const exts = (params.extensions || 'jpg,png,webp,gif')
      .split(',').map(e => e.trim().toLowerCase());
    const files = (input.files || []).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return exts.includes(ext);
    });
    return { files, count: files.length };
  }
};
