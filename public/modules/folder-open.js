const FolderOpen = {
  id: 'folder-open',
  name: '폴더 열기',
  type: 'input',
  color: '#6c63ff',

  // 실행 로직
  run: async (input, params) => {
    return new Promise((resolve) => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.accept = params.accept || '*';
      fileInput.webkitdirectory = true;

      fileInput.onchange = (e) => {
        const files = Array.from(e.target.files).map(file => ({
          name: file.name,
          size: file.size,
          type: file.type,
          file: file
        }));
        resolve({ files, count: files.length });
      };

      fileInput.click();
    });
  }
};