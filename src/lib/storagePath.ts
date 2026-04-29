export function getCustomerFileDeletePath(filePath?: string | null, fileUrl?: string | null): string | null {
  if (filePath && filePath.trim()) return filePath;
  if (!fileUrl) return null;

  // Fallback for legacy rows that may only have a public URL stored.
  // Expected URL pattern: .../storage/v1/object/public/customer-files/<path>
  const marker = '/storage/v1/object/public/customer-files/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(fileUrl.slice(idx + marker.length));
}
