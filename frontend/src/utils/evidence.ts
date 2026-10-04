export async function fileEvidenceReceipt(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    proof_file_name: file.name,
    proof_media_type: file.type || "application/octet-stream",
    proof_size_bytes: file.size,
    proof_sha256: hash,
    proof_captured_at: new Date().toISOString(),
  };
}
