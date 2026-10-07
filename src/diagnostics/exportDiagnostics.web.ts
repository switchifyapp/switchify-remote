export async function exportDiagnostics(contents: string): Promise<void> {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'switchify-remote-diagnostics.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
