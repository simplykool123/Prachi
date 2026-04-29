import assert from 'node:assert/strict';

function getCustomerFileDeletePath(filePath, fileUrl) {
  if (filePath && filePath.trim()) return filePath;
  if (!fileUrl) return null;
  const marker = '/storage/v1/object/public/customer-files/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(fileUrl.slice(idx + marker.length));
}

assert.equal(getCustomerFileDeletePath('documents/a.pdf', 'https://example.com/x'), 'documents/a.pdf');
assert.equal(
  getCustomerFileDeletePath(undefined, 'https://abc.supabase.co/storage/v1/object/public/customer-files/documents/42/test%20file.pdf'),
  'documents/42/test file.pdf'
);
assert.equal(getCustomerFileDeletePath(undefined, 'https://example.com/file.pdf'), null);

console.log('storage-path tests passed');
