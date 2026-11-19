/**
 * Utilitários para processamento e otimização leve de imagens no navegador.
 * Redimensiona logomarcas para formato compacto (máx 240x240) em Base64,
 * garantindo carregamento instantâneo e economia de armazenamento (Firestore/localStorage).
 */

export const processLogoFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida. Escolha um arquivo PNG, JPG, WebP ou SVG.'));
      return;
    }

    // Se for SVG, lê como DataURL direto mantendo vetores intactos
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Erro ao ler arquivo SVG.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 240;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        const isPngOrWebp = file.type === 'image/png' || file.type === 'image/webp';
        if (isPngOrWebp) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.onerror = () => reject(new Error('Não foi possível carregar o arquivo de imagem.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Falha ao processar arquivo.'));
    reader.readAsDataURL(file);
  });
};
