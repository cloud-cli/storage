const API_URL = "https://__API_HOST__";

const u = (s) => new URL(s, API_URL);
const g = { method: "GET", mode: "cors" };
const p = { method: "POST", mode: "cors" };
const d = { method: "DELETE", mode: "cors" };

export async function createBin() {
  const req = await fetch(u("/bin"), p);

  return req.ok
    ? await req.json()
    : Promise.reject(new Error("Failed to create bin"));
}

export async function removeBin(bin) {
  const req = await fetch(u(`/bin/${bin}`), d);

  return req.ok || Promise.reject(new Error("Failed to remove bin"));
}

export async function listFiles(bin) {
  const req = await fetch(u(`/bin/${bin}`), g);

  return req.ok
    ? await req.json()
    : Promise.reject(new Error("Failed to fetch files in this bin"));
}

export async function createFile(bin) {
  const req = await fetch(u(`/f/${bin}`), p);

  return req.ok
    ? await req.json()
    : Promise.reject(new Error("Failed to create file"));
}

export async function removeFile(bin, file) {
  const req = await fetch(u(`/f/${bin}/${file}`), d);

  return req.ok || Promise.reject(new Error("Failed to remove file"));
}

export async function readFile(bin, file) {
  const req = await fetch(u(`/f/${bin}/${file}`), g);

  return req.ok
    ? req
    : Promise.reject(new Error("Failed to retrieve this file"));
}

export async function writeFile(bin, file, content) {
  const req = await fetch(u(`/f/${bin}/${file}`), {
    method: "PUT",
    mode: "cors",
    body: content,
  });
  return req.ok
    ? await req.json()
    : Promise.reject(new Error("Failed to update file"));
}
