import JSONBigInt from 'json-bigint';

export const safeParsedData = <T>(data: T): T => {
  const jsonString = JSONBigInt.stringify(data);
  return JSONBigInt.parse(jsonString);
};

export const safeStringifyData = <T>(data: T): string => {
  return JSONBigInt.stringify(data);
};
