# File storage service

## API

See `api.yaml` for API specification.

## Usage

### As a server

```ts
import start from '@cloud-cli/storage';

start({ rootDir: './data', port: 1234 });
```


### As an ES Module

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

## Environment variables

| env | description |
|-|-|
|ROOT_DIR| String. Path to a folder where all data is stored |
|PORT| Number. HTTP port |
