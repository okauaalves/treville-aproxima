import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Web: Print.printAsync imprimiria a página atual, então o HTML vai num iframe oculto ("Salvar como PDF"). */
function printHtmlOnWeb(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) {
        frame.remove();
        reject(new Error('Não foi possível abrir a impressão.'));
        return;
      }
      view.focus();
      view.print();
      setTimeout(() => frame.remove(), 1000);
      resolve();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** A4 a 72 ppi. Nativo: gera o arquivo e abre o compartilhamento. */
export async function exportHtmlAsPdf(html: string, dialogTitle = 'Exportar PDF'): Promise<void> {
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle });
    return;
  }
  await Print.printAsync({ uri });
}
