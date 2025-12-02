import { spawn } from "child_process";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

async function queryMLLayer(metrics: JsonValue): Promise<JsonValue> {
  const proc = spawn("python", ["-m", "vera_torch.adapter"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  proc.stdin.write(JSON.stringify(metrics));
  proc.stdin.end();
  const result = await new Promise<JsonValue>((resolve, reject) => {
    let data = "";
    proc.stdout.on("data", chunk => {
      data += chunk.toString();
    });
    proc.once("error", reject);
    proc.on("close", () => {
      try {
        resolve(JSON.parse(data) as JsonValue);
      } catch (err) {
        reject(err);
      }
    });
  });
  return result;
}
export { queryMLLayer };
