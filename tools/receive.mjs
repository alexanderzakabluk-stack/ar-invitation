import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";

const OUT = new URL("../assets/targets.mind", import.meta.url);

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return res.end("post the .mind buffer here");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  await writeFile(OUT, buffer);
  console.log(`saved ${buffer.length} bytes`);
  res.end("ok");
}).listen(5174, () => console.log("receiver on :5174"));
