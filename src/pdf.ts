// Convierte HTML a PDF y abre "Compartir" (WhatsApp, correo, Drive…)
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function sharePdf(html: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
  return true;
}
