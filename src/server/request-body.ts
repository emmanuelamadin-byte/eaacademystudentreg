import { ApiError } from "./policy";
export async function readLimitedBody(
  request: Request,
  maximum: number,
): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maximum) throw new ApiError(413, "This request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new ApiError(413, "This request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
