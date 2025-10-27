import JSONBigInt from 'json-bigint';

export const safeParsedData = <T>(data: T): T => {
  const jsonString = JSONBigInt.stringify(data);
  const parsed: unknown = JSONBigInt.parse(jsonString);
  return parsed as T;
};

export const safeStringifyData = <T>(data: T): string => {
  return JSONBigInt.stringify(data);
};
