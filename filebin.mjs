const API_URL = '__API_HOST__';

const u = (s) => new URL(s, API_URL);
const g = { method: 'GET', mode: 'cors' };
const p = { method: 'POST', mode: 'cors' };
const d = { method: 'DELETE', mode: 'cors' };

/**
 * @returns {Promise<{ binId: string }>}
 */
export async function createBin() {
  const req = await fetch(u('/bin'), p);

  return req.ok ? await req.json() : Promise.reject(new Error('Failed to create bin'));
}

/**
 * @param {string} bin
 * @returns {Promise<boolean>} OK
 */
export async function removeBin(bin) {
  const req = await fetch(u(`/bin/${bin}`), d);

  return req.ok || Promise.reject(new Error('Failed to remove bin'));
}

/**
 * @param {string} bin
 * @returns {Promise<string[]>} file ids
 */
export async function listFiles(bin) {
  const req = await fetch(u(`/bin/${bin}`), g);

  return req.ok ? await req.json() : Promise.reject(new Error('Failed to fetch files in this bin'));
}

/**
 * @param {string} bin
 * @returns {Promise<ArrayBuffer>} zip file
 */
export async function downloadZip(bin) {
  const req = await fetch(u(`/zip/${bin}`), g);

  return req.ok ? await req : Promise.reject(new Error('Failed to generate a zip for this bin'));
}

/**
 * @param {string} bin
 * @returns {Promise<{ fileId: string }>}
 */
export async function createFile(bin) {
  const req = await fetch(u(`/f/${bin}`), p);

  return req.ok ? await req.json() : Promise.reject(new Error('Failed to create file'));
}

/**
 * @param {string} bin
 * @param {string} file
 * @returns {Promise<boolean>} OK
 */
export async function removeFile(bin, file) {
  const req = await fetch(u(`/f/${bin}/${file}`), d);

  return req.ok || Promise.reject(new Error('Failed to remove file'));
}

/**
 * @param {string} bin
 * @param {string} file
 * @returns {Promise<Response>} OK
 */
export async function readFile(bin, file) {
  const req = await fetch(u(`/f/${bin}/${file}`), g);

  return req.ok ? req : Promise.reject(new Error('Failed to retrieve this file'));
}

/**
 * @param {string} bin
 * @param {string} file
 * @param {BodyInit} content
 * @returns {Promise<{ binId: string, fileId: string, url: string }>}
 */
export async function writeFile(bin, file, content) {
  const req = await fetch(u(`/f/${bin}/${file}`), {
    method: 'PUT',
    mode: 'cors',
    body: content,
  });
  return req.ok ? await req.json() : Promise.reject(new Error('Failed to update file'));
}

/**
 * @param {string} bin
 * @param {string} file
 * @param {Object} metadata
 * @returns {Promise<boolean>}
 */
export async function writeMetadata(bin, file, content) {
  const req = await fetch(u(`/meta/${bin}/${file}`), {
    method: 'PUT',
    mode: 'cors',
    body: JSON.stringify(content),
  });
  return req.ok || Promise.reject(new Error('Failed to update file metadata'));
}

/**
 * @param {string} bin
 * @param {string} file
 * @returns {Promise<Object>}
 */
export async function readMetadata(bin, file) {
  const req = await fetch(u(`/meta/${bin}/${file}`), g);
  return req.ok ? await req.json() : Promise.reject(new Error('Failed to fetch file metadata'));
}
