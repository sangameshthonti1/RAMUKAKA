export function formText(data: FormData, key: string): string {
  return String(data.get(key) ?? "").trim();
}
