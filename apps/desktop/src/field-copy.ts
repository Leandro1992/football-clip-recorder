export type Screen = 'jogo' | 'lances' | 'cadastro' | 'ajustes';
export type AdjustSection = 'menu' | 'rede' | 'saude' | 'versao';

export function cameraLabel(status: string): string {
  if (status === 'online') {
    return 'Câmera pronta';
  }
  if (status === 'starting') {
    return 'Ligando a câmera';
  }
  if (status === 'error') {
    return 'Câmera com falha';
  }
  return 'Câmera sem imagem';
}

export function processingLabel(status: string): string {
  if (status === 'capturing-post-event') {
    return 'Gravando o lance';
  }
  if (status === 'building-clip') {
    return 'Montando o vídeo';
  }
  if (status === 'error') {
    return 'Falha ao gravar';
  }
  return 'Pronta para o lance';
}

export function uploadLabel(status: string): string {
  if (status === 'uploading') {
    return 'Enviando';
  }
  if (status === 'error') {
    return 'Envio parado';
  }
  return 'Envio em dia';
}

export function plainPreviewMessage(message?: string): string {
  if (!message) {
    return 'Aguardando a imagem...';
  }
  if (/process|error|code|ffmpeg/i.test(message)) {
    return 'A câmera não abriu.';
  }
  return message;
}

export function recordingTitle(name: string): { title: string; when: string } {
  const base = name.replace(/\.mp4$/i, '');
  const parts = base.split('__');
  const stamp = parts.length >= 4 ? parts[parts.length - 2] ?? '' : '';
  if (!/^\d{8}-\d{6}$/.test(stamp)) {
    return { title: name, when: '' };
  }
  const when = `${stamp.slice(6, 8)}/${stamp.slice(4, 6)}/${stamp.slice(0, 4)} ${stamp.slice(9, 11)}:${stamp.slice(11, 13)}`;
  const court = (parts[0] ?? '').replace(/-/g, ' ');
  const camera = parts.slice(1, -2).join(' ').replace(/-/g, ' ');
  return { title: `${court} · ${camera}`, when };
}
