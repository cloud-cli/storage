# File storage service

## API

See `api.yaml` for API specification.

## Usage

Starting a server:

```ts
import start from '@cloud-cli/storage';

start({ rootDir: './data', port: 1234 });
```

Consuming it as an ES module: if the server is running at `https://bin.example.com`, import it
as a module in a project:

```ts
import { createBin, createFile, writeFile } from 'https://bin.example.com/index.mjs';

async function save(content) {
  const binId = await createBin();
  const fileId = await createFile(binId);
  await writeFile(binId, fileId, content);
  
}

```