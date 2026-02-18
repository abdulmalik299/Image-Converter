import { useEffect, useState } from "react";
import { loadJson, saveJson } from "./storage";

export function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => loadJson(key, fallback));
  useEffect(() => saveJson(key, value), [key, value]);
  return [value, setValue] as const;
}
