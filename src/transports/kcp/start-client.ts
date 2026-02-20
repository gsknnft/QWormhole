import { spawn } from "child_process";

export function startKcpClient(configPath: string) {
  const proc = spawn("./kcptun-client", ["-c", configPath]);
  proc.stdout.on("data", (data) => console.log("KCP Client:", data.toString()));
  proc.stderr.on("data", (data) => console.error("KCP Client Error:", data.toString()));
  proc.on("close", (code) => console.log("KCP Client exited with code", code));
  return proc;
}