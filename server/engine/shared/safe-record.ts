// 防御性对象守卫，应对可能含有恶意陷阱的值
/** 判断值是否为 record（非 null、对象、非数组），陷阱不抛错 */
export function isRecord(value: any): value is Record<string, any> {
  try {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  } catch {
    return false;
  }
}

/** 从 record-like 值读取一个属性，不让陷阱逃逸 */
export function readRecordValue(value: any, key: string): any {
  if (!isRecord(value)) {
    return undefined;
  }
  try {
    return value[key];
  } catch {
    return undefined;
  }
}

/** 防御性地复制数组项，应对可能在 length/index 访问上抛错的值 */
export function copyArrayEntries(value: any): any[] {
  let isArray: boolean;
  try {
    isArray = Array.isArray(value);
  } catch {
    return [];
  }
  if (!isArray) {
    return [];
  }

  const arrayValue = value as readonly any[];
  let length: number;
  try {
    length = arrayValue.length;
  } catch {
    return [];
  }

  const entries: any[] = [];
  for (let index = 0; index < length; index += 1) {
    try {
      entries.push(arrayValue[index]);
    } catch {
      continue;
    }
  }
  return entries;
}

/** 复制值也是 record 形态的 record 项 */
export function copyRecordEntries<T>(value: any): Array<[string, T]> {
  if (!isRecord(value)) {
    return [];
  }

  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return [];
  }

  const entries: Array<[string, T]> = [];
  for (const key of keys) {
    const entry = readRecordValue(value, key);
    // 调用方用于嵌套配置 map；非对象叶子被忽略，后续代码不需要重复 record 守卫
    if (isRecord(entry)) {
      entries.push([key, entry as T]);
    }
  }
  return entries;
}
